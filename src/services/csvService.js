/**
 * Construye el texto CSV a partir del análisis del calendario
 * y la lista de calendarios que fallaron.
 *
 * @param {Array} analysis - salida de analyzeCalendar()
 * @param {Array} failures - [{ calendarId, status, reason, message }]
 * @returns {string} CSV text
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
 * Dispara la descarga del CSV usando un data URL (compatible con MV3).
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

function escapeCsvField(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ----------------- CRITERIA REPORT -----------------

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
    // igual podemos registrar solo los failures
  }

  // Ordenar días: menor → day1 (30%), mayor → day2 (70%)
  const datesSorted =
    Array.isArray(selectedDates) && selectedDates.length === 2
      ? [...selectedDates].sort()
      : [null, null];

  const day1 = datesSorted[0];
  const day2 = datesSorted[1];

  const TOTAL_MIN = 540; // 9 horas * 60
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

function sumBusyMinutesForDate(entries, dateStr) {
  if (!dateStr) return 0;
  const dayEntry = entries.find((e) => e.date === dateStr);
  if (!dayEntry || !Array.isArray(dayEntry.blocks)) return 0;

  return dayEntry.blocks
    .filter((b) => b.type === "busy")
    .reduce((acc, b) => acc + (b.duration || 0), 0);
}

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

function buildSlackMessage(c1, c2, c3) {
  // Cadenas según los casos que me diste
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
