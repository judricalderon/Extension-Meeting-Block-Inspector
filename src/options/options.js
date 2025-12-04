import { getConfig, saveConfig, resetConfig } from "../storage/storage.js";

const workdayStartInput = document.getElementById("workdayStart");
const workdayEndInput = document.getElementById("workdayEnd");
const minBlockInput = document.getElementById("minBlockMinutes");
const maxBlockInput = document.getElementById("maxStandardBlockMinutes");
const googleClientIdInput = document.getElementById("googleClientId");

const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");

async function loadConfigIntoForm() {
  const config = await getConfig();

  workdayStartInput.value = config.workdayStart;
  workdayEndInput.value = config.workdayEnd;
  minBlockInput.value = config.minBlockMinutes;
  maxBlockInput.value = config.maxStandardBlockMinutes;
  googleClientIdInput.value = config.googleClientId || "";
  statusEl.textContent = "Settings loaded.";
}

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
