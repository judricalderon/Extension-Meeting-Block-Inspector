// src/services/csvService.js
/**
 * CSV Service for Calendar-Analytics
 *
 * Responsibilities:
 * - Convert calendar analysis results into CSV text.
 * - Include error rows for calendars that could not be read.
 * - Trigger CSV downloads using data URLs (MV3-compatible).
 * - Generate a criteria-based CSV report and Slack-ready messages.
 */

/* =========================================================
 * STANDARD REPORT
 * ======================================================= */

/**
 * Builds the standard (blocks) CSV.
 *
 * Columns:
 * - email
 * - date
 * - type: busy | free | error
 * - title: busy title or error message
 * - from
 * - to
 * - duration_minutes
 * - is_long
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

  // 1) Normal blocks (busy/free)
  for (const dayEntry of Array.isArray(analysis) ? analysis : []) {
    const { email, date, blocks } = dayEntry || {};
    if (!email || !date || !Array.isArray(blocks)) continue;

    for (const block of blocks) {
      if (block?.type === "busy") {
        rows.push([
          email,
          date,
          "busy",
          block.title || "",
          block.from || "",
          block.to || "",
          String(block.duration ?? ""),
          block.isLong ? "true" : ""
        ]);
      } else if (block?.type === "free") {
        rows.push([
          email,
          date,
          "free",
          "",
          block.from || "",
          block.to || "",
          String(block.duration ?? ""),
          ""
        ]);
      }
    }
  }

  // 2) Failures
  for (const failure of Array.isArray(failures) ? failures : []) {
    rows.push([
      failure?.calendarId || "",
      "", // date empty
      "error",
      failure?.message ||
        (failure?.reason === "not_found_or_no_access"
          ? "Calendar not found or not accessible"
          : "Calendar could not be read"),
      "",
      "",
      "",
      ""
    ]);
  }

  return rows.map(toCsvRow).join("\n");
}

export function downloadCsvFromAnalysis(
  analysis,
  failures = [],
  filename = "calendar-report.csv"
) {
  const csvText = buildCsvFromAnalysis(analysis, failures);
  return triggerCsvDownload(csvText, filename);
}

/* =========================================================
 * CRITERIA REPORT (ONE DAY / TWO CRITERIA)
 * ======================================================= */

/**
 * Criteria:
 *  1) No busy blocks longer than maxStandardBlockMinutes (default 60).
 *  2) Busy percentage for the selected day must be >= 85%.
 *
 * Notes:
 * - We evaluate ONE selected date only.
 * - We compute busy% over the configured workday duration (derived from workdayStart/workdayEnd).
 *
 * Output columns (ORDER REQUIRED BY USER):
 *  1) email
 *  2) passed
 *  3) criteria_passed
 *  4) criteria_failed
 *  5) slack_message
 *  6) date
 *  7) busy_minutes
 *  8) busy_percent
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
    "date",
    "busy_minutes",
    "busy_percent"
  ];

  const rows = [header];

  const day =
    Array.isArray(selectedDates) && selectedDates.length > 0
      ? selectedDates[0]
      : null;

  const maxBlock = config?.maxStandardBlockMinutes || 60;
  const TOTAL_MIN =540; // fallback if config missing

  // Group analysis by email
  const byEmail = new Map();
  for (const entry of Array.isArray(analysis) ? analysis : []) {
    if (!entry?.email) continue;
    if (!byEmail.has(entry.email)) byEmail.set(entry.email, []);
    byEmail.get(entry.email).push(entry); // { email, date, blocks }
  }

  // Build rows for each email
  for (const [email, entries] of byEmail.entries()) {
    const busyMin = day ? sumBusyMinutesForDate(entries, day) : 0;
    const busyPercent = TOTAL_MIN > 0 ? (busyMin / TOTAL_MIN) * 100 : 0;

    // C1: no long blocks (for selected day only)
    const hasLongBlocks = day
      ? hasLongBlocksForDate(entries, day, maxBlock)
      : false;
    const c1 = !hasLongBlocks;

    // C2: busy >= 85%
    const c2 = busyPercent >= 85;

    const passed = c1 && c2;

    const ok = [];
    const fail = [];

    if (c1) ok.push(`Bloques <= ${maxBlock} min`);
    else fail.push(`Bloques > ${maxBlock} min`);

    if (c2) ok.push("Busy >= 85%");
    else fail.push("Busy < 85%");

    rows.push([
      email,
      passed ? "true" : "false",
      ok.join(" | "),
      fail.join(" | "),
      buildSlackMessageOneDay({ c1, c2, maxBlock }),
      day || "",
      String(busyMin),
      busyPercent.toFixed(2)
    ]);
  }

  // Failures (same column order)
  for (const failure of Array.isArray(failures) ? failures : []) {
    rows.push([
      failure?.calendarId || "",
      "error",
      "",
      "",
      failure?.message ||
        (failure?.reason === "not_found_or_no_access"
          ? "Calendar not found or not accessible"
          : "Calendar could not be read"),
      day || "",
      "",
      ""
    ]);
  }

  return rows.map(toCsvRow).join("\n");
}

/**
 * ✅ EXPORT: Criteria CSV download
 */
export function downloadCriteriaCsv(
  analysis,
  failures = [],
  selectedDates = [],
  config = {},
  filename = "calendar-criteria-report.csv"
) {
  const csvText = buildCriteriaCsv(analysis, failures, selectedDates, config);
  return triggerCsvDownload(csvText, filename);
}

/* =========================================================
 * HELPERS
 * ======================================================= */

function triggerCsvDownload(csvText, filename) {
  // ✅ BOM so Excel reads UTF-8 correctly (tildes, ñ, etc.)
  const BOM = "\ufeff";
  const content = BOM + csvText;

  const url = "data:text/csv;charset=utf-8," + encodeURIComponent(content);

  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (id) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(id);
    });
  });
}

function toCsvRow(cols) {
  return cols.map(escapeCsv).join(",");
}

function escapeCsv(value) {
  if (value == null) return "";
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function sumBusyMinutesForDate(entries, dateStr) {
  const dayEntry = entries.find((e) => e?.date === dateStr);
  if (!dayEntry || !Array.isArray(dayEntry.blocks)) return 0;

  return dayEntry.blocks
    .filter((b) => b?.type === "busy")
    .reduce((acc, b) => acc + (b?.duration || 0), 0);
}

function hasLongBlocksForDate(entries, dateStr, maxBlock) {
  const dayEntry = entries.find((e) => e?.date === dateStr);
  if (!dayEntry || !Array.isArray(dayEntry.blocks)) return false;

  return dayEntry.blocks.some(
    (b) => b?.type === "busy" && (b?.duration || 0) > maxBlock
  );
}

function buildSlackMessageOneDay({ c1, c2, maxBlock }) {
  if (c1 && c2) {
    return (
      "hola, muchas gracias por mantener tu calendario actualizado y dentro de los criterios establecidos.\n" +
      "muchas gracias !"
    );
  }

  const parts = [];

  if (!c1) {
    parts.push(
      `veo que tienes bloques mayores a ${maxBlock} min, porfa modifícalos para que sean de ${maxBlock} min o menos`
    );
  }

  if (!c2) {
    parts.push(
      "veo que tu calendario tiene unos espacios vacios, porfa agrega las actividades que tengas"
    );
  }

  return "hola, " + parts.join(" y ") + "\nmuchas gracias !";
}

function hhmmToMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}
