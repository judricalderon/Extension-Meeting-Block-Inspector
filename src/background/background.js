// src/background/background.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GENERATE_REPORT") {
    console.log("[Calendar-Analytics] GENERATE_REPORT payload:", message.payload);

    // TODO: aquí irá:
    // 1) leer config (workday, min/max block, clientId)
    // 2) obtener token de Google
    // 3) llamar a Calendar API
    // 4) analizar bloques
    // 5) generar CSV y descargar

    // De momento respondemos ok para que el popup no muera
    sendResponse({ ok: true });
    return true; // indicate async (aunque ahora no hagamos nada async serio)
  }

  return false;
});
