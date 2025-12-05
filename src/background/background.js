// src/background/background.js

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
  const { emails, dateRange, selectedDates } = payload;

  if (!Array.isArray(emails) || emails.length === 0) {
    throw new Error("No emails provided.");
  }

  const [token, config] = await Promise.all([getAccessToken(), getConfig()]);

  console.log("[Calendar-Analytics] Using config:", config);
  console.log("[Calendar-Analytics] Fetching events for:", emails);
  console.log("[Calendar-Analytics] Date range (label):", dateRange);
  console.log("[Calendar-Analytics] Selected dates:", selectedDates);

  let allEvents = [];
  let allFailures = [];

  // 🔹 NUEVA LÓGICA:
  // Si tenemos selectedDates, SOLO pedimos esos días, uno por uno.
  if (Array.isArray(selectedDates) && selectedDates.length > 0) {
    for (const dateStr of selectedDates) {
      const dayStart = new Date(`${dateStr}T00:00:00`);
      const dayEnd = new Date(`${dateStr}T23:59:59`);

      const dayRange = {
        start: dayStart.toISOString(),
        end: dayEnd.toISOString()
      };

      console.log(
        "[Calendar-Analytics] Fetching day:",
        dateStr,
        "range:",
        dayRange
      );

      const { events, failures } = await fetchEventsForUsers(
        emails,
        dayRange,
        token
      );

      allEvents = allEvents.concat(events);
      allFailures = allFailures.concat(failures);
    }
  } else {
    // 🔹 Modo retrocompatible: si no hay selectedDates, usamos dateRange tal cual
    const { events, failures } = await fetchEventsForUsers(
      emails,
      dateRange,
      token
    );

    allEvents = events;
    allFailures = failures;
  }

  console.log("[Calendar-Analytics] Total events fetched:", allEvents.length);
  console.log("[Calendar-Analytics] Failures:", allFailures);

  // Aquí ya SOLO hay eventos de los días deseados
  const analysis = analyzeCalendar(allEvents, config);
  console.log("[Calendar-Analytics] Analysis result:", analysis);

  await downloadCsvFromAnalysis(
    analysis,
    allFailures,
    buildFilename(dateRange)
  );
}

function buildFilename(dateRange) {
  const label = dateRange?.label || "report";
  const date = new Date().toISOString().split("T")[0];
  return `calendar-analytics-${label}-${date}.csv`;
}
