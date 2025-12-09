// src/storage/storage.js
/**
 * Storage Service
 *
 * This module provides a simple wrapper around chrome.storage.local
 * for managing the extension's configuration. It exposes helpers to:
 *
 * - Retrieve the current configuration (merged with defaults).
 * - Save partial updates to the configuration.
 * - Reset the configuration back to default values.
 *
 * The stored configuration is fully replaceable and automatically merged
 * with DEFAULT_CONFIG to ensure backward compatibility.
 */
export const DEFAULT_CONFIG = {
  /**
   * Workday start time used when generating free/busy blocks.
   * Format: "HH:MM"
   */
  workdayStart: "07:00",
  /**
   * Workday end time used when generating free/busy blocks.
   * Format: "HH:MM"
   */
  workdayEnd: "17:00",
  /**
   * Minimum duration required for a block to be considered valid.
   * Currently used by analyzers or future processors.
   */
  minBlockMinutes: 30,
  /**
   * Maximum duration allowed for a block before being marked as "long".
   * Controls reporting and criteria evaluation.
   */
  maxStandardBlockMinutes: 60,
   /**
   * Optional Google OAuth client ID defined by the user.
   * If empty, the system will fall back to a built-in default ID
   * inside googleAuth.js.
   */
  googleClientId: "" 
};

const CONFIG_KEY = "calendar-analytics_config";

/**
 * Retrieves the configuration stored in chrome.storage.local.
 *
 * This function automatically merges the stored values with DEFAULT_CONFIG
 * so the extension always has complete and consistent settings even after updates.
 *
 * @returns {Promise<Object>} The resolved configuration object.
 */
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

/**
 * Saves a partial configuration update.
 *
 * Flow:
 * 1. Loads the current configuration.
 * 2. Merges the provided `partialConfig` into the existing settings.
 * 3. Stores the result back into chrome.storage.local.
 *
 * @param {Object} partialConfig - Subset of configuration keys to update.
 * @returns {Promise<Object>} The new, fully merged configuration.
 */
export function saveConfig(partialConfig) {
  return new Promise(async (resolve) => {
    const current = await getConfig();
    const newConfig = { ...current, ...partialConfig };

    chrome.storage.local.set({ [CONFIG_KEY]: newConfig }, () => {
      resolve(newConfig);
    });
  });
}

/**
 * Resets the configuration to DEFAULT_CONFIG.
 *
 * Useful when users click "Reset to defaults" in the options page.
 *
 * @returns {Promise<Object>} The restored default configuration.
 */
export function resetConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CONFIG_KEY]: { ...DEFAULT_CONFIG } }, () => {
      resolve({ ...DEFAULT_CONFIG });
    });
  });
}
