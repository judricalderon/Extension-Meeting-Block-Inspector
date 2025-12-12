// src/background/background.js

import { getAccessToken } from "../services/googleAuth.js";
import { fetchEventsForUsers } from "../services/calendarApi.js";
import { analyzeCalendar } from "../services/calendarAnalyzer.js";
import {
  downloadCsvFromAnalysis,
  downloadCriteriaCsv
} from "../services/csvService.js";
import { getConfig } from "../storage/storage.js";

/**
 * Background message listener for the Calendar Analytics extension.
 *
 * Supported message types:
 * - "GENERATE_REPORT": generates a standard availability CSV report.
 * - "GENERATE_CRITERIA_REPORT": generates a criteria-based CSV report (single day).
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GENERATE_REPORT") {
    handleGenerateReport(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error("[Calendar-Analytics] GENERATE_REPORT failed:", err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      });
    return true; // keep channel open
  }

  if (message?.type === "GENERATE_CRITERIA_REPORT") {
    handleGenerateCriteriaReport(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error("[Calendar-Analytics] GENERATE_CRITERIA_REPORT failed:", err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      });
    return true; // keep channel open
  }

  return false;
});

/**
 * Handles the generation of the standard calendar analytics report.
 *
 * Flow:
 * 1. Validates payload.
 * 2. Retrieves token + config.
 * 3. Fetches calendar events for the selected single day.
 * 4. Runs analysis.
 * 5. Downloads CSV.
 */
async function handleGenerateReport(payload) {
  const { emails, dateRange, selectedDates } = payload || {};

  if (!Array.isArray(emails) || emails.length === 0) {
    throw new Error("No emails provided.");
  }

  const [token, config] = await Promise.all([getAccessToken(), getConfig()]);

  console.log("[Calendar-Analytics] Using config:", config);
  console.log("[Calendar-Analytics] Fetching events for:", emails);
  console.log("[Calendar-Analytics] Selected dates:", selectedDates);

  const { allEvents, allFailures } = await fetchAllEventsForPayload(
    emails,
    dateRange,
    selectedDates,
    token
  );

  const analysis = analyzeCalendar(allEvents, config);

  await downloadCsvFromAnalysis(analysis, allFailures, buildFilename(dateRange, selectedDates));
}

/**
 * Handles the generation of the criteria-based report (single day, 2 criteria).
 *
 * Criteria:
 * 1) Busy >= 70% for the selected day.
 * 2) No busy blocks > maxStandardBlockMinutes (default 60).
 */
async function handleGenerateCriteriaReport(payload) {
  const { emails, dateRange, selectedDates } = payload || {};

  if (!Array.isArray(emails) || emails.length === 0) {
    throw new Error("No emails provided.");
  }

  const [token, config] = await Promise.all([getAccessToken(), getConfig()]);

  console.log("[Calendar-Analytics] [CRITERIA] Using config:", config);
  console.log("[Calendar-Analytics] [CRITERIA] Fetching events for:", emails);
  console.log("[Calendar-Analytics] [CRITERIA] Selected dates:", selectedDates);

  const { allEvents, allFailures } = await fetchAllEventsForPayload(
    emails,
    dateRange,
    selectedDates,
    token
  );

  const analysis = analyzeCalendar(allEvents, config);

  await downloadCriteriaCsv(
    analysis,
    allFailures,
    selectedDates, // debe ser [YYYY-MM-DD]
    config,
    buildCriteriaFilename(dateRange, selectedDates)
  );
}

/**
 * Fetches calendar events for one or more users for a single day.
 *
 * Expected behavior:
 * - selectedDates must contain exactly one date (YYYY-MM-DD).
 * - Builds [00:00:00, 23:59:59] local window, converts to ISO, and fetches.
 */
async function fetchAllEventsForPayload(emails, dateRange, selectedDates, token) {
  const dateStr =
    Array.isArray(selectedDates) && selectedDates.length > 0
      ? selectedDates[0]
      : null;

  if (!dateStr) {
    throw new Error("No selected date provided.");
  }

  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59`);

  const dayRange = {
    start: dayStart.toISOString(),
    end: dayEnd.toISOString()
  };

  console.log("[Calendar-Analytics] Fetching day:", dateStr, "range:", dayRange);

  const { events, failures } = await fetchEventsForUsers(emails, dayRange, token);

  return { allEvents: events, allFailures: failures };
}

/**
 * Builds a filename for the standard report CSV.
 *
 * Format: "calendar-analytics-{label}-{YYYY-MM-DD}.csv"
 */
function buildFilename(dateRange, selectedDates) {
  const label =
    (Array.isArray(selectedDates) && selectedDates[0]) ||
    dateRange?.label ||
    "report";
  const today = new Date().toISOString().split("T")[0];
  return `calendar-analytics-${label}-${today}.csv`;
}

/**
 * Builds a filename for the criteria-based report CSV.
 *
 * Format: "calendar-criteria-{label}-{YYYY-MM-DD}.csv"
 */
function buildCriteriaFilename(dateRange, selectedDates) {
  const label =
    (Array.isArray(selectedDates) && selectedDates[0]) ||
    dateRange?.label ||
    "criteria-report";
  const today = new Date().toISOString().split("T")[0];
  return `calendar-criteria-${label}-${today}.csv`;
}
