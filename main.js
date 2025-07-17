const { app, BrowserWindow, ipcMain, Tray, Menu } = require("electron");
const path = require("path");
const BinanceAPI = require("./binance");
const ConfigManager = require("./config/config-manager");

let mainWindow;
let tray = null;
let binanceAPI;
let settingsWindow = null; // Add this line
let configManager; // Add this line

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 350,
    height: 600,
    frame: false,
    transparent: true,
    resizable: false,
    backgroundColor: "#00000000",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }, // Add these properties for better transparency handling
    alwaysOnTop: false,
    skipTaskbar: false,
    hasShadow: false, // Remove system shadow
    thickFrame: false, // Remove thick frame on Windows
  });

  mainWindow.loadFile("widget.html");
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setPosition(50, 50); // Set the window to be click-through for areas outside the content

  mainWindow.setIgnoreMouseEvents(false); // Wait for the page to load, then set the window shape

  mainWindow.webContents.once("did-finish-load", () => {
    // Set window shape to match rounded rectangle
    setWindowShape();
  });

  // Prevent window from closing, just hide to tray
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
      // Also close settings window if open
      if (settingsWindow) {
        settingsWindow.close();
      }
    }
  });

  // Initialize Binance API
  configManager = new ConfigManager();
  binanceAPI = new BinanceAPI();
  setInterval(fetchAndSendData, 5000);
  fetchAndSendData();
}

function setWindowShape() {
  // Create a rounded rectangle region
  const { width, height } = mainWindow.getBounds(); // For Windows, we can use win.setShape() if available

  if (process.platform === "win32" && mainWindow.setShape) {
    const borderRadius = 12; // Create a rounded rectangle path // This creates a shape that matches your CSS border-radius

    const shape = {
      type: "roundedRect",
      x: 0,
      y: 0,
      width: width,
      height: height,
      radius: borderRadius,
    };

    try {
      mainWindow.setShape([shape]);
    } catch (error) {
      console.log("Shape setting not supported on this platform");
    }
  }
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 350,
    height: 500,
    frame: false,
    transparent: true,
    resizable: false,
    backgroundColor: "#00000000",
    parent: mainWindow,
    modal: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  settingsWindow.loadFile("settings/settings.html");
  settingsWindow.setMenuBarVisibility(false);

  // Position settings window next to main window
  const mainBounds = mainWindow.getBounds();
  settingsWindow.setPosition(
    mainBounds.x + mainBounds.width + 10,
    mainBounds.y
  );

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}


async function fetchAndSendData() {
  try {
    const data = await binanceAPI.getAllData();
    mainWindow.webContents.send("binance-data", data);
  } catch (error) {
    console.error("Error fetching Binance data:", error.message);
    mainWindow.webContents.send("binance-error", error.message);
  }
}

// Handle window resize for collapse/expand
ipcMain.on("resize-window", (event, dimensions) => {
  const { width, height } = dimensions;
  mainWindow.setSize(width, height); // Update window shape when resizing

  setTimeout(() => {
    setWindowShape();
  }, 100);
});

// Handle mouse events for custom hit testing
ipcMain.on("set-mouse-events", (event, ignore) => {
  mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
});

// Refresh data from renderer
ipcMain.on("refresh-data", () => {
  fetchAndSendData();
});

// Handle sound playing
ipcMain.on("play-sound", (event, soundFile) => {
  // Send back to renderer to play sound (HTML5 audio works better in renderer)
  mainWindow.webContents.send("play-sound-file", soundFile);
});

// Settings window management
ipcMain.on("open-settings", () => {
  createSettingsWindow();
});

ipcMain.on("close-settings", () => {
  if (settingsWindow) {
    settingsWindow.close();
  }
});

// Settings data management
ipcMain.on("get-settings", (event) => {
  const settings = configManager.loadSettings();
  event.reply("settings-data", settings);
});

ipcMain.on("save-settings", (event, settings) => {
  const success = configManager.saveSettings(settings);
  event.reply("settings-saved", success);
});

ipcMain.on("get-api-keys", (event) => {
  const hasKeys = configManager.hasApiKeys();
  event.reply("api-keys-status", hasKeys);
});

ipcMain.on("save-api-keys", async (event, { apiKey, apiSecret }) => {
  const success = configManager.saveApiKeys(apiKey, apiSecret);
  if (success) {
    // Reload the config in binance API
    if (binanceAPI && binanceAPI.reloadConfig) {
      binanceAPI.reloadConfig();
    } else {
      // Fallback: create new instance
      binanceAPI = new BinanceAPI();
    }

    // Force refresh data immediately with new keys
    setTimeout(() => {
      fetchAndSendData();
    }, 1000);

    event.reply("api-keys-saved", { success: true });
  } else {
    event.reply("api-keys-saved", {
      success: false,
      error: "Failed to save API keys",
    });
  }
});



ipcMain.on("test-api-keys", async (event, { apiKey, apiSecret }) => {
  const result = await configManager.testApiKeys(apiKey, apiSecret);
  event.reply("api-keys-tested", result);
});


app.whenReady().then(() => {
  createWindow(); // Setup Tray

  tray = new Tray(path.join(__dirname, "icon.png"));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Widget",
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Binance Futures Widget");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
