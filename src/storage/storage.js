// src/storage/storage.js

export const DEFAULT_CONFIG = {
  workdayStart: "07:00",
  workdayEnd: "17:00",
  minBlockMinutes: 30,
  maxStandardBlockMinutes: 60,
  googleClientId: "" // si está vacío, luego podemos usar uno por defecto en googleAuth.js
};

const CONFIG_KEY = "calenlytics_config";

export function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG_KEY], (result) => {
      const stored = result[CONFIG_KEY] || {};
      // merge con defaults
      const config = { ...DEFAULT_CONFIG, ...stored };
      resolve(config);
    });
  });
}

export function saveConfig(partialConfig) {
  return new Promise(async (resolve) => {
    const current = await getConfig();
    const newConfig = { ...current, ...partialConfig };

    chrome.storage.local.set({ [CONFIG_KEY]: newConfig }, () => {
      resolve(newConfig);
    });
  });
}

export function resetConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CONFIG_KEY]: { ...DEFAULT_CONFIG } }, () => {
      resolve({ ...DEFAULT_CONFIG });
    });
  });
}
