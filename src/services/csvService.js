// src/services/csvService.js
/**
 * CSV Service for Calendar-Analytics
 *
 * This module is responsible for:
 * - Converting calendar analysis results into CSV text.
 * - Including error rows for calendars that could not be read.
 * - Triggering CSV downloads using data URLs (MV3-compatible).
 * - Generating a criteria-based CSV report and associated Slack messages.
 */

/**
 * Builds the CSV text from the calendar analysis output and the list of
 * calendars that failed to be read.
 *
 * The generated CSV has the following columns:
 * - email: calendar owner identifier (usually user email)
 * - date: day in YYYY-MM-DD format
 * - type: "busy", "free", or "error"
 * - title: event title or error description
 * - from: start time of the block (HH:MM)
 * - to: end time of the block (HH:MM)
 * - duration_minutes: block duration in minutes
 * - is_long: "true" if the busy block exceeds the configured threshold, otherwise empty
 *
 * @param {Array<{
 *   email: string;
 *   date: string;
 *   blocks: Array<{
 *     type: "busy" | "free";
 *     title?: string;
 *     from: string;
 *     to: string;
 *     duration: number;
 *     isLong?: boolean;
 *   }>;
 * }>} analysis - Output of analyzeCalendar(), grouped by user and day.
 * @param {Array<{
 *   calendarId: string;
 *   status?: number | null;
 *   reason?: string;
 *   message?: string;
 * }>} [failures=[]] - List of calendars that could not be read.
 * @returns {string} CSV text representation of the analysis and failures.
 */
export function buildCsvFromAnalysis(analysis, failures = []) {
  const header = [
    "email",
    "date",
    "type", // busy | free | error
    "title",
    "from",
    "to",
    "duration_minutes",
    "is_long"
  ];

  const rows = [header];

  // 1) Bloques normales (busy/free)
  for (const dayEntry of analysis) {
    const { email, date, blocks } = dayEntry;

    for (const block of blocks) {
      if (block.type === "busy") {
        rows.push([
          email,
          date,
          "busy",
          block.title || "",
          block.from,
          block.to,
          String(block.duration),
          block.isLong ? "true" : "false"
        ]);
      } else {
        rows.push([
          email,
          date,
          "free",
          "",
          block.from,
          block.to,
          String(block.duration),
          ""
        ]);
      }
    }
  }

  // 2) Filas para calendarios que NO se pudieron leer
  for (const failure of failures) {
    rows.push([
      failure.calendarId || "",
      "", // date vacío
      "error",
      failure.message ||
        (failure.reason === "not_found_or_no_access"
          ? "Calendar not found or not accessible"
          : "Calendar could not be read"),
      "",
      "",
      "",
      ""
    ]);
  }

  return rows
    .map((cols) => cols.map(escapeCsvField).join(","))
    .join("\n");
}

/**
 * Triggers a CSV download built from the analysis and failures using a data URL.
 * This approach is compatible with Manifest V3 in Chrome extensions.
 *
 * @param {Array} analysis - Output of analyzeCalendar().
 * @param {Array} [failures=[]] - List of calendars that could not be read.
 * @param {string} [filename="calendar-report.csv"] - Desired filename for the download.
 * @returns {Promise<number>} A promise that resolves with the Chrome download ID.
 */
export function downloadCsvFromAnalysis(
  analysis,
  failures = [],
  filename = "calendar-report.csv"
) {
  const csvText = buildCsvFromAnalysis(analysis, failures);

  const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csvText);

  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Calendar-Analytics] Download error:",
            chrome.runtime.lastError
          );
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(downloadId);
      }
    );
  });
}

/**
 * Escapes a single CSV field value.
 * - Wraps the value in double quotes if it contains quotes, commas or newlines.
 * - Doubles internal quotes when quoted.
 *
 * @param {any} value - Value to be encoded as a CSV field.
 * @returns {string} Escaped CSV-safe field string.
 */
function escapeCsvField(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ----------------- CRITERIA REPORT -----------------
/**
 * Builds the criteria-based CSV report.
 *
 * The resulting CSV has the following columns:
 * - email: calendar owner identifier.
 * - passed: "true", "false", or "error".
 * - criteria_passed: human-readable description of passed criteria.
 * - criteria_failed: human-readable description of failed criteria.
 * - slack_message: pre-built Slack message text, based on which criteria passed/failed.
 * - day1: first date used in the criteria evaluation (YYYY-MM-DD).
 * - day2: second date used in the criteria evaluation (YYYY-MM-DD).
 *
 * Criteria (assuming a 9-hour workday = 540 minutes):
 *  1) No busy blocks longer than `maxStandardBlockMinutes` (default 60).
 *  2) Day with lower availability (day1) must have <= 30% availability.
 *  3) Day with higher availability (day2) must have <= 70% availability.
 *
 * @param {Array<{
 *   email: string;
 *   date: string;
 *   blocks: Array<{
 *     type: "busy" | "free";
 *     duration: number;
 *   }>;
 * }>} analysis - Calendar analysis grouped by user and date.
 * @param {Array<{
 *   calendarId: string;
 *   status?: number | null;
 *   reason?: string;
 *   message?: string;
 * }>} [failures=[]] - Calendars that could not be read.
 * @param {string[]} [selectedDates=[]] - Array of two dates (YYYY-MM-DD) used as reference.
 * @param {{ maxStandardBlockMinutes?: number }} [config={}] - Configuration with the maximum standard block length.
 * @returns {string} CSV text representing the criteria evaluation.
 */
export function buildCriteriaCsv(
  analysis,
  failures = [],
  selectedDates = [],
  config = {}
) {
  const header = [
    "email",
    "passed",
    "criteria_passed",
    "criteria_failed",
    "slack_message",
    "day1",
    "day2"
  ];

  const rows = [header];

  if (!Array.isArray(analysis) || analysis.length === 0) {
  }

  // Ordenar días: menor a day1 (30%), mayor a day2 (70%)
  const datesSorted =
    Array.isArray(selectedDates) && selectedDates.length === 2
      ? [...selectedDates].sort()
      : [null, null];

  const day1 = datesSorted[0];
  const day2 = datesSorted[1];

  const TOTAL_MIN = 540; // 9 horas * 60 incluye hora de almuerzo
  const maxBlock = config?.maxStandardBlockMinutes || 60;

  // Agrupar analysis por email
  const byEmail = new Map();
  for (const entry of analysis) {
    if (!entry.email) continue;
    if (!byEmail.has(entry.email)) {
      byEmail.set(entry.email, []);
    }
    byEmail.get(entry.email).push(entry); // { email, date, blocks }
  }

  for (const [email, entries] of byEmail.entries()) {
    const busyDay1 = sumBusyMinutesForDate(entries, day1);
    const busyDay2 = sumBusyMinutesForDate(entries, day2);

    const freeDay1 = Math.max(0, TOTAL_MIN - busyDay1);
    const freeDay2 = Math.max(0, TOTAL_MIN - busyDay2);

    const availabilityDay1 = (freeDay1 / TOTAL_MIN) * 100;
    const availabilityDay2 = (freeDay2 / TOTAL_MIN) * 100;

    const hasLongBlocks = checkHasLongBlocks(entries, maxBlock);

    // Criterios:
    // 1) Bloques máximos de 60 minutos
    const c1 = !hasLongBlocks;

    // 2) Día menor → 30%
    const c2 = availabilityDay1 <= 30;

    // 3) Día mayor → 70%
    const c3 = availabilityDay2 <= 70;

    const passed = c1 && c2 && c3;

    const criteriaPassed = [];
    const criteriaFailed = [];

    if (c1) {
      criteriaPassed.push("Bloques máximos de 60 minutos");
    } else {
      criteriaFailed.push("Bloques mayores a 60 minutos");
    }

    if (c2) {
      criteriaPassed.push("Disponibilidad día 1 menor o igual al 30%");
    } else {
      criteriaFailed.push("Disponibilidad día 1 mayor al 30%");
    }

    if (c3) {
      criteriaPassed.push("Disponibilidad día 2 menor o igual al 70%");
    } else {
      criteriaFailed.push("Disponibilidad día 2 mayor al 70%");
    }

    const slackMessage = buildSlackMessage(c1, c2, c3);

    rows.push([
      email,
      passed ? "true" : "false",
      criteriaPassed.join(" | "),
      criteriaFailed.join(" | "),
      slackMessage,
      day1 || "",
      day2 || ""
    ]);
  }

  // Agregar filas para calendars que no se pudieron leer
  for (const failure of failures) {
    rows.push([
      failure.calendarId || "",
      "error",
      "",
      "",
      failure.message ||
        (failure.reason === "not_found_or_no_access"
          ? "Calendar not found or not accessible"
          : "Calendar could not be read"),
      day1 || "",
      day2 || ""
    ]);

  }

  return rows
    .map((cols) => cols.map(escapeCsvField).join(","))
    .join("\n");
}

/**
 * Sums the total busy minutes for a given date within a list of analysis entries.
 *
 * @param {Array<{ date: string; blocks: Array<{ type: string; duration: number }> }>} entries
 * @param {string | null} dateStr - Target date in YYYY-MM-DD format.
 * @returns {number} Total busy time in minutes.
 */
function sumBusyMinutesForDate(entries, dateStr) {
  if (!dateStr) return 0;
  const dayEntry = entries.find((e) => e.date === dateStr);
  if (!dayEntry || !Array.isArray(dayEntry.blocks)) return 0;

  return dayEntry.blocks
    .filter((b) => b.type === "busy")
    .reduce((acc, b) => acc + (b.duration || 0), 0);
}

/**
 * Checks whether any busy block across all entries exceeds the maximum duration.
 *
 * @param {Array<{ blocks: Array<{ type: string; duration?: number }> }>} entries
 * @param {number} maxBlock - Maximum allowed block duration in minutes.
 * @returns {boolean} True if at least one block is longer than maxBlock.
 */
function checkHasLongBlocks(entries, maxBlock) {
  for (const e of entries) {
    if (!Array.isArray(e.blocks)) continue;
    for (const b of e.blocks) {
      if (b.type === "busy" && (b.duration || 0) > maxBlock) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Builds a Slack message in Spanish based on which criteria passed or failed.
 *
 * The message is intended for direct communication with users,
 * explaining what needs to be adjusted in their calendar.
 *
 * @param {boolean} c1 - Criteria 1 (maximum block length) passed.
 * @param {boolean} c2 - Criteria 2 (day 1 availability) passed.
 * @param {boolean} c3 - Criteria 3 (day 2 availability) passed.
 * @returns {string} A Slack-ready message.
 */
function buildSlackMessage(c1, c2, c3) {
  if (c1 && c2 && c3) {
    return (
      "hola, muchas gracias por mantener tu calendario actualizado y dentro de los criterios establecidos.\n" +
      "muchas gracias !"
    );
  }

  const parts = [];

  if (!c1) {
    parts.push(
      "veo que tienes bloques mayores a 60 min, porfa modifícalos para que sean de 60 min o menos"
    );
  }

  if (!c2 && !c3) {
    parts.push(
      "veo que el día de hoy presentas una disponibilidad de más del 30%, y mañana mayor del 70% porfa arregla el calendario y agrega las actividades que tengas"
    );
  } else if (!c2) {
    parts.push(
      "veo que el día de hoy presentas una disponibilidad de más del 30%, porfa arregla el calendario y agrega las actividades que tengas"
    );
  } else if (!c3) {
    parts.push(
      "veo que el día de mañana presentas una disponibilidad de más del 70%, porfa arregla el calendario y agrega las actividades que tengas"
    );
  }

  if (parts.length === 0) {
    return (
      "hola, hemos detectado algunas inconsistencias en tu calendario, porfa revísalo y ajusta los bloques y actividades según las políticas.\n" +
      "muchas gracias !"
    );
  }

  return "hola, " + parts.join(" y ") + "\nmuchas gracias !";
}

/**
 * Triggers a CSV download for the criteria report using a data URL.
 *
 * @param {Array} analysis - Calendar analysis data.
 * @param {Array} [failures=[]] - Calendars that could not be read.
 * @param {string[]} [selectedDates=[]] - Dates used to evaluate criteria.
 * @param {{ maxStandardBlockMinutes?: number }} [config={}] - Criteria configuration.
 * @param {string} [filename="calendar-criteria-report.csv"] - Desired filename.
 * @returns {Promise<number>} A promise that resolves with the Chrome download ID.
 */
export function downloadCriteriaCsv(
  analysis,
  failures = [],
  selectedDates = [],
  config = {},
  filename = "calendar-criteria-report.csv"
) {
  const csvText = buildCriteriaCsv(analysis, failures, selectedDates, config);

  const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csvText);

  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Calendar-Analytics] Criteria download error:",
            chrome.runtime.lastError
          );
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(downloadId);
      }
    );
  });
}
