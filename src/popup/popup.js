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
const criteriaBtn = document.getElementById("criteriaBtn");

// Nuevos elementos para manejo de 2 días
const reportDateInput = document.getElementById("reportDate");       // día principal
const customSecondDayCheckbox = document.getElementById("customSecondDay"); // checkbox festivo / custom
const secondDateInput = document.getElementById("secondDate");       // segundo día manual (opcional)

function updateGenerateButtonState() {
  // Depende de: CSV + auth
  const canGenerate = emailsFromCsv.length > 0 && isAuthenticated;
  generateBtn.disabled = !canGenerate;
  if (criteriaBtn) criteriaBtn.disabled = !canGenerate;
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

  // Set default date: today para el día principal
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  if (reportDateInput) reportDateInput.value = todayStr;

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

/**
 * Construye:
 *  - selectedDates: ["YYYY-MM-DD", "YYYY-MM-DD"]
 *  - dateRange: { label, start, end } con min/max de esas fechas
 *
 * Regresa { error } si algo está mal.
 */
function buildDateSelectionPayload() {
  const mainValue = reportDateInput?.value;

  if (!mainValue) {
    return { error: "Please select the main date." };
  }

  const mainDate = new Date(mainValue + "T00:00:00");
  if (isNaN(mainDate.getTime())) {
    return { error: "Invalid main date." };
  }

  let secondDateStr;
  let secondDateObj;

  // ¿Usar segundo día personalizado (festivo, etc.)?
  const useCustomSecond =
    !!customSecondDayCheckbox && customSecondDayCheckbox.checked;

  if (useCustomSecond) {
    const secondValue = secondDateInput?.value;
    if (!secondValue) {
      return { error: "Please select the second date." };
    }

    const parsedSecond = new Date(secondValue + "T00:00:00");
    if (isNaN(parsedSecond.getTime())) {
      return { error: "Invalid second date." };
    }

    secondDateStr = secondValue;
    secondDateObj = parsedSecond;
  } else {
    // Lógica automática:
    // - Lunes a jueves → siguiente día
    // - Viernes → lunes (sumar 3 días)
    const weekday = mainDate.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
    const autoSecond = new Date(mainDate);

    if (weekday === 5) {
      // Viernes → +3 días (lunes)
      autoSecond.setDate(autoSecond.getDate() + 3);
    } else {
      // Cualquier otro día → +1 día
      autoSecond.setDate(autoSecond.getDate() + 1);
    }

    secondDateObj = autoSecond;

    const yyyy = secondDateObj.getFullYear();
    const mm = String(secondDateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(secondDateObj.getDate()).padStart(2, "0");
    secondDateStr = `${yyyy}-${mm}-${dd}`;
  }

  const mainDateStr = mainValue;
  const selectedDates = [mainDateStr, secondDateStr];

  // Determinar min/max para construir dateRange
  const firstTime = mainDate.getTime();
  const secondTime = secondDateObj.getTime();

  const minTime = Math.min(firstTime, secondTime);
  const maxTime = Math.max(firstTime, secondTime);

  const minDateObj = new Date(minTime);
  const maxDateObj = new Date(maxTime);

  const rangeStart = new Date(
    minDateObj.getFullYear(),
    minDateObj.getMonth(),
    minDateObj.getDate(),
    0,
    0,
    0
  );
  const rangeEnd = new Date(
    maxDateObj.getFullYear(),
    maxDateObj.getMonth(),
    maxDateObj.getDate(),
    23,
    59,
    59
  );

  const label = `${mainDateStr}__${secondDateStr}`;

  return {
    selectedDates,
    dateRange: {
      label,
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString()
    }
  };
}

generateBtn.addEventListener("click", () => {
  generateStatusEl.textContent = "";

  if (emailsFromCsv.length === 0) {
    generateStatusEl.textContent =
      "Please upload a CSV file with at least one email.";
    generateStatusEl.style.color = "#f97316";
    return;
  }

  if (!isAuthenticated) {
    generateStatusEl.textContent = "Please connect to Google Calendar first.";
    generateStatusEl.style.color = "#f97316";
    return;
  }

  const datePayload = buildDateSelectionPayload();

  if (datePayload.error) {
    generateStatusEl.textContent = datePayload.error;
    generateStatusEl.style.color = "#f97316";
    return;
  }

  const { dateRange, selectedDates } = datePayload;

  generateBtn.disabled = true;
  generateStatusEl.textContent = "Generating report...";
  generateStatusEl.style.color = "#a5b4fc";

  chrome.runtime.sendMessage(
    {
      type: "GENERATE_REPORT",
      payload: {
        emails: emailsFromCsv,
        dateRange,
        selectedDates
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

      generateStatusEl.textContent =
        "Report generated. Your CSV download should start soon.";
      generateStatusEl.style.color = "#22c55e";
    }
  );
});

criteriaBtn.addEventListener("click", () => {
  generateStatusEl.textContent = "";

  if (emailsFromCsv.length === 0) {
    generateStatusEl.textContent =
      "Please upload a CSV file with at least one email.";
    generateStatusEl.style.color = "#f97316";
    return;
  }

  if (!isAuthenticated) {
    generateStatusEl.textContent = "Please connect to Google Calendar first.";
    generateStatusEl.style.color = "#f97316";
    return;
  }

  const datePayload = buildDateSelectionPayload();

  if (datePayload.error) {
    generateStatusEl.textContent = datePayload.error;
    generateStatusEl.style.color = "#f97316";
    return;
  }

  const { dateRange, selectedDates } = datePayload;

  criteriaBtn.disabled = true;
  generateStatusEl.textContent = "Generating criteria report...";
  generateStatusEl.style.color = "#a5b4fc";

  chrome.runtime.sendMessage(
    {
      type: "GENERATE_CRITERIA_REPORT",
      payload: {
        emails: emailsFromCsv,
        dateRange,
        selectedDates
      }
    },
    (response) => {
      criteriaBtn.disabled = false;

      if (chrome.runtime.lastError) {
        generateStatusEl.textContent = `Error: ${chrome.runtime.lastError.message}`;
        generateStatusEl.style.color = "#f97316";
        return;
      }

      if (!response || !response.ok) {
        generateStatusEl.textContent =
          "The criteria report could not be generated.";
        generateStatusEl.style.color = "#f97316";
        return;
      }

      generateStatusEl.textContent =
        "Criteria report generated. Your CSV download should start soon.";
      generateStatusEl.style.color = "#22c55e";
    }
  );
});

