import { getAccessToken } from "../services/googleAuth.js";
import { fetchEventsForUsers } from "../services/calendarApi.js";
import { analyzeCalendar } from "../services/calendarAnalyzer.js";
import { downloadCsvFromAnalysis } from "../services/csvService.js";
import { getConfig } from "../storage/storage.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GENERATE_REPORT") {
    handleGenerateReport(message.payload)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((err) => {
        console.error("[Calendar-Analytics] GENERATE_REPORT failed:", err);
        sendResponse({ ok: false, error: err.message });
      });

    return true; // respuesta async
  }

  return false;
});

async function handleGenerateReport(payload) {
  const { emails, dateRange } = payload;

  if (!Array.isArray(emails) || emails.length === 0) {
    throw new Error("No emails provided.");
  }

  const [token, config] = await Promise.all([getAccessToken(), getConfig()]);

  console.log("[Calendar-Analytics] Using config:", config);
  console.log("[Calendar-Analytics] Fetching events for:", emails);

  const { events, failures } = await fetchEventsForUsers(
    emails,
    dateRange,
    token
  );

  console.log("[Calendar-Analytics] Total events fetched:", events.length);
  console.log("[Calendar-Analytics] Failures:", failures);

  const analysis = analyzeCalendar(events, config);
  console.log("[Calendar-Analytics] Analysis result:", analysis);

  await downloadCsvFromAnalysis(analysis, failures, buildFilename(dateRange));
}

function buildFilename(dateRange) {
  const label = dateRange?.label || "report";
  const date = new Date().toISOString().split("T")[0];
  return `calendar-analytics-${label}-${date}.csv`;
}
