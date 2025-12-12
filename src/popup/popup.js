// src/popup/popup.js
/**
 * Popup Script for Calendar-Analytics Extension
 *
 * Responsibilities:
 * - Authenticate the user with Google (OAuth) to access Calendar data.
 * - Parse and validate a CSV file containing user email addresses.
 * - Manage a single-day date selection for reports.
 * - Enable/disable report generation buttons based on state (auth + CSV).
 * - Send messages to the background script to trigger:
 *    - Standard CSV report
 *    - Criteria-based CSV report
 *
 * UI elements are defined in popup.html and styled via popup.css.
 */

import { authenticateUser, hasValidToken } from "../services/googleAuth.js";

/** -------------------- STATE -------------------- **/
let emailsFromCsv = [];
let isAuthenticated = false;

/** -------------------- DOM ELEMENTS -------------------- **/
const connectBtn = document.getElementById("connectBtn");
const authStatusEl = document.getElementById("authStatus");

const csvInput = document.getElementById("csvInput");
const csvInfoEl = document.getElementById("csvInfo");

const reportDateInput = document.getElementById("reportDate");

const generateBtn = document.getElementById("generateBtn");
const criteriaBtn = document.getElementById("criteriaBtn");
const generateStatusEl = document.getElementById("generateStatus");

/** -------------------- UI HELPERS -------------------- **/
/**
 * Updates the enabled/disabled state of the report buttons
 * based on authentication status and CSV upload state.
 */
function updateGenerateButtonState() {
  const canGenerate = isAuthenticated && emailsFromCsv.length > 0;
  generateBtn.disabled = !canGenerate;
  if (criteriaBtn) criteriaBtn.disabled = !canGenerate;
}

/**
 * Sets a small status message in the popup UI.
 * @param {string} text
 * @param {string} color
 */
function setStatus(text, color = "#a5b4fc") {
  generateStatusEl.textContent = text;
  generateStatusEl.style.color = color;
}

/** -------------------- INIT -------------------- **/
/**
 * On popup open:
 * - Check if a valid token exists.
 * - Set the default date input to "today".
 * - Update button states.
 */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const valid = await hasValidToken();
    if (valid) {
      isAuthenticated = true;
      authStatusEl.textContent = "Connected to Google Calendar ✔";
      authStatusEl.style.color = "#22c55e";
    }
  } catch (e) {
    console.error("[Calendar-Analytics] Error checking token:", e);
  }

  // Default date = today (YYYY-MM-DD)
  if (reportDateInput) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    reportDateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  updateGenerateButtonState();
});

/** -------------------- AUTH -------------------- **/
/**
 * Connect with Google via OAuth.
 */
connectBtn.addEventListener("click", async () => {
  try {
    await authenticateUser();
    authStatusEl.textContent = "Connected to Google Calendar ✔";
    authStatusEl.style.color = "#22c55e";
    isAuthenticated = true;
    updateGenerateButtonState();
  } catch (err) {
    authStatusEl.textContent = "Authentication failed.";
    authStatusEl.style.color = "#f87171";
    console.error("[Calendar-Analytics] Authentication failed:", err);
  }
});

/** -------------------- CSV PARSING -------------------- **/
/**
 * Handles CSV upload and extracts a list of emails.
 */
csvInput.addEventListener("change", () => {
  const file = csvInput.files?.[0];

  emailsFromCsv = [];
  csvInfoEl.textContent = "";
  setStatus("");

  if (!file) {
    updateGenerateButtonState();
    return;
  }

  const reader = new FileReader();

  reader.onload = (e) => {
    const text = String(e.target?.result || "");
    const emails = parseEmailsFromCsvText(text);

    emailsFromCsv = emails;

    if (emails.length === 0) {
      csvInfoEl.textContent = "No valid emails found in the CSV file.";
      csvInfoEl.style.color = "#f97316";
    } else {
      csvInfoEl.textContent = `Loaded ${emails.length} email(s) from CSV.`;
      csvInfoEl.style.color = "#a5b4fc";
    }

    updateGenerateButtonState();
  };

  reader.onerror = () => {
    emailsFromCsv = [];
    csvInfoEl.textContent = "Error reading CSV file.";
    csvInfoEl.style.color = "#f97316";
    updateGenerateButtonState();
  };

  reader.readAsText(file);
});

/**
 * Parses email addresses from a CSV text input.
 *
 * Supported formats:
 * - Header-based: a header row with an "email" column (case-insensitive).
 * - No header: one email per non-empty line.
 *
 * @param {string} text - Raw CSV file content.
 * @returns {string[]} De-duplicated list of email addresses.
 */
function parseEmailsFromCsvText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const firstLineLower = lines[0].toLowerCase();
  const hasHeader = firstLineLower.includes("email");

  let emails = [];

  if (hasHeader) {
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const emailIndex = headers.indexOf("email");
    if (emailIndex === -1) return [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const email = (cols[emailIndex] || "").trim();
      if (email) emails.push(email);
    }
  } else {
    emails = lines;
  }

  return Array.from(new Set(emails));
}

/** -------------------- DATE PAYLOAD (1 DAY) -------------------- **/
/**
 * Builds the date payload used when requesting reports from the background script.
 *
 * Returns:
 * - selectedDates: ["YYYY-MM-DD"] (single day)
 * - dateRange:
 *    - label: "YYYY-MM-DD"
 *    - start: ISO string at 00:00:00 for that day (local)
 *    - end: ISO string at 23:59:59 for that day (local)
 *
 * If validation fails, returns an object with an `error` property.
 *
 * @returns {{
 *   selectedDates?: string[],
 *   dateRange?: { label: string; start: string; end: string },
 *   error?: string
 * }}
 */
function buildDateSelectionPayload() {
  const value = reportDateInput?.value;

  if (!value) return { error: "Please select a date." };

  const dateObj = new Date(value + "T00:00:00");
  if (isNaN(dateObj.getTime())) return { error: "Invalid date." };

  const start = new Date(
    dateObj.getFullYear(),
    dateObj.getMonth(),
    dateObj.getDate(),
    0,
    0,
    0
  );

  const end = new Date(
    dateObj.getFullYear(),
    dateObj.getMonth(),
    dateObj.getDate(),
    23,
    59,
    59
  );

  return {
    selectedDates: [value],
    dateRange: {
      label: value,
      start: start.toISOString(),
      end: end.toISOString()
    }
  };
}

/** -------------------- MESSAGE SENDER -------------------- **/
/**
 * Sends a report request to the background script.
 *
 * @param {"GENERATE_REPORT" | "GENERATE_CRITERIA_REPORT"} type
 */
function sendReportRequest(type) {
  setStatus("");

  if (emailsFromCsv.length === 0) {
    setStatus("Please upload a CSV file with at least one email.", "#f97316");
    return;
  }

  if (!isAuthenticated) {
    setStatus("Please connect to Google Calendar first.", "#f97316");
    return;
  }

  const datePayload = buildDateSelectionPayload();
  if (datePayload.error) {
    setStatus(datePayload.error, "#f97316");
    return;
  }

  const { dateRange, selectedDates } = datePayload;

  // Disable only the button being used
  const btn = type === "GENERATE_REPORT" ? generateBtn : criteriaBtn;
  if (btn) btn.disabled = true;

  setStatus(
    type === "GENERATE_REPORT"
      ? "Generating report..."
      : "Generating criteria report..."
  );

  chrome.runtime.sendMessage(
    {
      type,
      payload: {
        emails: emailsFromCsv,
        dateRange,
        selectedDates
      }
    },
    (response) => {
      if (btn) btn.disabled = false;

      if (chrome.runtime.lastError) {
        setStatus(`Error: ${chrome.runtime.lastError.message}`, "#f97316");
        return;
      }

      if (!response || !response.ok) {
        setStatus(
          type === "GENERATE_REPORT"
            ? "The report could not be generated."
            : "The criteria report could not be generated.",
          "#f97316"
        );
        return;
      }

      setStatus(
        type === "GENERATE_REPORT"
          ? "Report generated. Your CSV download should start soon."
          : "Criteria report generated. Your CSV download should start soon.",
        "#22c55e"
      );
    }
  );
}

/** -------------------- BUTTON HANDLERS -------------------- **/
generateBtn.addEventListener("click", () => sendReportRequest("GENERATE_REPORT"));
criteriaBtn.addEventListener("click", () =>
  sendReportRequest("GENERATE_CRITERIA_REPORT")
);
