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