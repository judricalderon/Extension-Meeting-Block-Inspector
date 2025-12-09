// src/options/options.js

/**
 * Options Page Logic for Calendar-Analytics Extension
 *
 * This script:
 * - Loads the saved configuration into the settings form
 * - Saves user updates back into storage
 * - Resets configuration to default values
 *
 * The UI is defined in options.html and styled by options.css.
 * Storage operations are handled through ../storage/storage.js.
 */
import { getConfig, saveConfig, resetConfig } from "../storage/storage.js";

const workdayStartInput = document.getElementById("workdayStart");
const workdayEndInput = document.getElementById("workdayEnd");
const minBlockInput = document.getElementById("minBlockMinutes");
const maxBlockInput = document.getElementById("maxStandardBlockMinutes");
const googleClientIdInput = document.getElementById("googleClientId");

const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");

/**
 * Loads the saved configuration values into the form fields.
 * Called on DOMContentLoaded.
 *
 * @returns {Promise<void>}
 */
async function loadConfigIntoForm() {
  const config = await getConfig();

  workdayStartInput.value = config.workdayStart;
  workdayEndInput.value = config.workdayEnd;
  minBlockInput.value = config.minBlockMinutes;
  maxBlockInput.value = config.maxStandardBlockMinutes;
  googleClientIdInput.value = config.googleClientId || "";
  statusEl.textContent = "Settings loaded.";
}
/**
 * Handles saving user-defined configuration values.
 * Values are validated and falls back to defaults when needed.
 *
 * @returns {Promise<void>}
 */
async function handleSave() {
  const updates = {
    workdayStart: workdayStartInput.value || "07:00",
    workdayEnd: workdayEndInput.value || "17:00",
    minBlockMinutes: parseInt(minBlockInput.value, 10) || 30,
    maxStandardBlockMinutes: parseInt(maxBlockInput.value, 10) || 60,
    googleClientId: googleClientIdInput.value.trim()
  };

  await saveConfig(updates);
  statusEl.textContent = "Settings saved.";
  setTimeout(() => (statusEl.textContent = ""), 2000);
}
/**
 * Restores default configuration values and updates the form accordingly.
 *
 * @returns {Promise<void>}
 */
async function handleReset() {
  const newConfig = await resetConfig();
  workdayStartInput.value = newConfig.workdayStart;
  workdayEndInput.value = newConfig.workdayEnd;
  minBlockInput.value = newConfig.minBlockMinutes;
  maxBlockInput.value = newConfig.maxStandardBlockMinutes;
  googleClientIdInput.value = newConfig.googleClientId || "";
  statusEl.textContent = "Settings reset to defaults.";
  setTimeout(() => (statusEl.textContent = ""), 2000);
}

document.addEventListener("DOMContentLoaded", loadConfigIntoForm);
saveBtn.addEventListener("click", handleSave);
resetBtn.addEventListener("click", handleReset);
