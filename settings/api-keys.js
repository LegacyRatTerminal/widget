const { ipcRenderer } = require("electron");

let currentSettings = null;

function closeSettings() {
  ipcRenderer.send("close-settings");
}

function openApiKeysSettings() {
  console.log("Opening API Keys settings...");
  window.location.href = "api-keys.html"; // Add this line
}

function openCustomizationSettings() {
  console.log("Opening Customization settings...");
  // TODO: Will implement in next step
}

function openSoundSettings() {
  console.log("Opening Sound settings...");
  window.location.href = "sound.html";

function openSystemSettings() {
  console.log("Opening System settings...");
  window.location.href = "system.html";
}

function updateApiKeysStatus(hasKeys) {
  const statusElement = document.getElementById("apiKeysStatus");
  if (hasKeys) {
    statusElement.textContent = "Configured";
    statusElement.classList.add("configured");
  } else {
    statusElement.textContent = "Not configured";
    statusElement.classList.remove("configured");
  }
}

// Initialize when window loads
document.addEventListener("DOMContentLoaded", () => {
  console.log("Settings window loaded");

  // Check API keys status
  ipcRenderer.send("get-api-keys");

  // Load current settings
  ipcRenderer.send("get-settings");
});

// Listen for API keys status
ipcRenderer.on("api-keys-status", (event, hasKeys) => {
  updateApiKeysStatus(hasKeys);
});

// Listen for settings data
ipcRenderer.on("settings-data", (event, settings) => {
  currentSettings = settings;
  console.log("Current settings:", settings);
});
