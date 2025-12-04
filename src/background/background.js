// src/background/background.js

import { getAccessToken } from "../services/googleAuth.js";
import { fetchEventsForUsers } from "../services/calendarApi.js";
import { getConfig } from "../storage/storage.js";
// más adelante importaremos analyzer y csvService

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

    // Indica que vamos a responder de forma async
    return true;
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

  const events = await fetchEventsForUsers(emails, dateRange, token);

  console.log("[Calendar-Analytics] Total events fetched:", events.length);

  // TODO:
  // 1) Pasar events + config a calendarAnalyzer
  // 2) Generar estructura de bloques (busy/free, duraciones)
  // 3) Pasar el resultado a csvService para crear el CSV
  // 4) Disparar la descarga

  // Por ahora solo log, para que puedas ver que ya funciona la llamada a la API
}
