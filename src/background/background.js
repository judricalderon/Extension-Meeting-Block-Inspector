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
 * - "GENERATE_CRITERIA_REPORT": generates a criteria-based CSV report.
 */
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
    // Keep the message channel open for asynchronous response
    return true; 
  }

  if (message?.type === "GENERATE_CRITERIA_REPORT") {
    handleGenerateCriteriaReport(message.payload)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((err) => {
        console.error(
          "[Calendar-Analytics] GENERATE_CRITERIA_REPORT failed:",
          err
        );
        sendResponse({ ok: false, error: err.message });
      });
    // Keep the message channel open for asynchronous response
    return true; 
  }

  return false;
});

/**
 * Handles the generation of the standard calendar analytics report.
 *
 * Flow:
 * 1. Validates the incoming payload (emails, dateRange, selectedDates).
 * 2. Retrieves the Google access token and local configuration in parallel.
 * 3. Fetches calendar events for the target users and date selection.
 * 4. Runs the calendar analysis.
 * 5. Triggers a CSV download for the analyzed data.
 *
 * @param {Object} payload - Message payload from the UI.
 * @param {string[]} payload.emails - List of user email addresses to analyze.
 * @param {Object} payload.dateRange - Date range descriptor (may contain label, start, end).
 * @param {string[]} [payload.selectedDates] - Optional list of specific dates (YYYY-MM-DD) to restrict the analysis.
 * @returns {Promise<void>}
 * @throws {Error} If no emails are provided or any step in the process fails.
 */

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

  const { allEvents, allFailures } = await fetchAllEventsForPayload(
    emails,
    dateRange,
    selectedDates,
    token
  );

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

/**
 * Handles the generation of the criteria-based calendar analytics report.
 *
 * Flow:
 * 1. Validates the incoming payload (emails, dateRange, selectedDates).
 * 2. Retrieves the Google access token and local configuration in parallel.
 * 3. Fetches calendar events for the target users and date selection.
 * 4. Runs the calendar analysis.
 * 5. Triggers a criteria-specific CSV download using the configured rules.
 *
 * @param {Object} payload - Message payload from the UI.
 * @param {string[]} payload.emails - List of user email addresses to analyze.
 * @param {Object} payload.dateRange - Date range descriptor (may contain label, start, end).
 * @param {string[]} [payload.selectedDates] - Optional list of specific dates (YYYY-MM-DD) to restrict the analysis.
 * @returns {Promise<void>}
 * @throws {Error} If no emails are provided or any step in the process fails.
 */

async function handleGenerateCriteriaReport(payload) {
  const { emails, dateRange, selectedDates } = payload;

  if (!Array.isArray(emails) || emails.length === 0) {
    throw new Error("No emails provided.");
  }

  const [token, config] = await Promise.all([getAccessToken(), getConfig()]);

  console.log("[Calendar-Analytics] [CRITERIA] Using config:", config);
  console.log("[Calendar-Analytics] [CRITERIA] Fetching events for:", emails);
  console.log("[Calendar-Analytics] [CRITERIA] Date range (label):", dateRange);
  console.log("[Calendar-Analytics] [CRITERIA] Selected dates:", selectedDates);

  const { allEvents, allFailures } = await fetchAllEventsForPayload(
    emails,
    dateRange,
    selectedDates,
    token
  );

  console.log(
    "[Calendar-Analytics] [CRITERIA] Total events fetched:",
    allEvents.length
  );
  console.log("[Calendar-Analytics] [CRITERIA] Failures:", allFailures);

  const analysis = analyzeCalendar(allEvents, config);

  await downloadCriteriaCsv(
    analysis,
    allFailures,
    selectedDates,
    config,
    buildCriteriaFilename(dateRange)
  );
}

/**
 * Fetches calendar events for one or more users based on either:
 * - a list of specific dates (selectedDates), requesting each date individually; or
 * - a single dateRange object (retro-compatible behavior).
 *
 * When selectedDates is provided and non-empty:
 *   - For each date (YYYY-MM-DD), the function builds a [00:00:00, 23:59:59] window in local time,
 *     converts it to ISO, and fetches events for that day.
 *
 * When selectedDates is not provided or empty:
 *   - The function uses dateRange directly when calling fetchEventsForUsers.
 *
 * @param {string[]} emails - List of user email addresses whose calendars will be queried.
 * @param {Object} dateRange - Date range descriptor used when selectedDates is not provided.
 * @param {string[]} [selectedDates] - Optional list of dates (YYYY-MM-DD) to fetch one by one.
 * @param {string} token - OAuth access token used to call the Google Calendar API.
 * @returns {Promise<{ allEvents: any[], allFailures: any[] }>} An object containing all aggregated events and failures.
 */
async function fetchAllEventsForPayload(
  emails,
  dateRange,
  selectedDates,
  token
) {
  let allEvents = [];
  let allFailures = [];

  
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
    const { events, failures } = await fetchEventsForUsers(
      emails,
      dateRange,
      token
    );

    allEvents = events;
    allFailures = failures;
  }

  return { allEvents, allFailures };
}

/**
 * Builds a filename for the standard report CSV.
 *
 * Format: "calendar-analytics-{label}-{YYYY-MM-DD}.csv"
 *
 * @param {Object} dateRange - Date range descriptor that may include a label.
 * @param {string} [dateRange.label] - Optional label used to identify the report (e.g., "this-week").
 * @returns {string} The generated filename for the report.
 */
function buildFilename(dateRange) {
  const label = dateRange?.label || "report";
  const date = new Date().toISOString().split("T")[0];
  return `calendar-analytics-${label}-${date}.csv`;
}


/**
 * Builds a filename for the criteria-based report CSV.
 *
 * Format: "calendar-criteria-{label}-{YYYY-MM-DD}.csv"
 *
 * @param {Object} dateRange - Date range descriptor that may include a label.
 * @param {string} [dateRange.label] - Optional label used to identify the criteria report.
 * @returns {string} The generated filename for the criteria report.
 */
function buildCriteriaFilename(dateRange) {
  const label = dateRange?.label || "criteria-report";
  const date = new Date().toISOString().split("T")[0];
  return `calendar-criteria-${label}-${date}.csv`;
}
