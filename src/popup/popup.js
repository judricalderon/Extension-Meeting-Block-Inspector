// src/popup/popup.js

import { authenticateUser, hasValidToken } from "../services/googleAuth.js";

let emailsFromCsv = [];
let isAuthenticated = false;

const connectBtn = document.getElementById("connectBtn");
const authStatusEl = document.getElementById("authStatus");
const csvInput = document.getElementById("csvInput");
const csvInfoEl = document.getElementById("csvInfo");
const generateBtn = document.getElementById("generateBtn");
const generateStatusEl = document.getElementById("generateStatus");

function updateGenerateButtonState() {
  const canGenerate = emailsFromCsv.length > 0 && isAuthenticated;
  generateBtn.disabled = !canGenerate;
}

// Al abrir el popup, revisar si ya hay token válido
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const valid = await hasValidToken();
    if (valid) {
      isAuthenticated = true;
      authStatusEl.textContent = "Connected to Google Calendar ✔";
      authStatusEl.style.color = "#22c55e";
    }
  } catch (e) {
    console.error("Error checking token", e);
  }
  updateGenerateButtonState();
});

// Botón: Connect with Google
connectBtn.addEventListener("click", async () => {
  try {
    const token = await authenticateUser();
    console.log("Got token:", token);
    authStatusEl.textContent = "Connected to Google Calendar ✔";
    authStatusEl.style.color = "#22c55e";
    isAuthenticated = true;
    updateGenerateButtonState();
  } catch (err) {
    authStatusEl.textContent = "Authentication failed.";
    authStatusEl.style.color = "#f87171";
    console.error(err);
  }
});

// Manejo del CSV
csvInput.addEventListener("change", () => {
  const file = csvInput.files?.[0];
  emailsFromCsv = [];
  csvInfoEl.textContent = "";
  generateStatusEl.textContent = "";

  if (!file) {
    updateGenerateButtonState();
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const emails = parseEmailsFromCsvText(String(text));

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
 * Very simple CSV parser for a single "email" column.
 * - Supports a header row containing "email" (case-insensitive) OR no header (one email per line).
 */
function parseEmailsFromCsvText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  let emails = [];

  // Detect header
  const firstLine = lines[0];
  const firstLineLower = firstLine.toLowerCase();
  const hasHeader = firstLineLower.includes("email");

  if (hasHeader) {
    const headers = firstLine.split(",").map((h) => h.trim().toLowerCase());
    const emailIndex = headers.indexOf("email");

    if (emailIndex === -1) return [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const email = (cols[emailIndex] || "").trim();
      if (email) emails.push(email);
    }
  } else {
    // No header: assume each line is one email
    emails = lines;
  }

  // Eliminar duplicados
  const unique = Array.from(new Set(emails));
  return unique;
}

function getSelectedDateRange() {
  const checked = document.querySelector('input[name="range"]:checked');
  const value = checked ? checked.value : "today";

  const now = new Date();

  if (value === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { label: "today", start: start.toISOString(), end: end.toISOString() };
  }

  if (value === "tomorrow") {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const start = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0);
    const end = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59);
    return { label: "tomorrow", start: start.toISOString(), end: end.toISOString() };
  }

  // this week: from Monday to Sunday of current week
  const day = now.getDay(); // 0 (Sun) - 6 (Sat)
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0);
  const end = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59);

  return { label: "week", start: start.toISOString(), end: end.toISOString() };
}

generateBtn.addEventListener("click", () => {
  generateStatusEl.textContent = "";

  if (emailsFromCsv.length === 0) {
    generateStatusEl.textContent = "Please upload a CSV file with at least one email.";
    generateStatusEl.style.color = "#f97316";
    return;
  }

  if (!isAuthenticated) {
    generateStatusEl.textContent = "Please connect to Google Calendar first.";
    generateStatusEl.style.color = "#f97316";
    return;
  }

  const range = getSelectedDateRange();

  generateBtn.disabled = true;
  generateStatusEl.textContent = "Generating report...";
  generateStatusEl.style.color = "#a5b4fc";

  chrome.runtime.sendMessage(
    {
      type: "GENERATE_REPORT",
      payload: {
        emails: emailsFromCsv,
        dateRange: range
      }
    },
    (response) => {
      generateBtn.disabled = false;

      if (chrome.runtime.lastError) {
        generateStatusEl.textContent = `Error: ${chrome.runtime.lastError.message}`;
        generateStatusEl.style.color = "#f97316";
        return;
      }

      if (!response || !response.ok) {
        generateStatusEl.textContent = "The report could not be generated.";
        generateStatusEl.style.color = "#f97316";
        return;
      }

      generateStatusEl.textContent = "Report generated. Your CSV download should start soon.";
      generateStatusEl.style.color = "#22c55e";
    }
  );
});
