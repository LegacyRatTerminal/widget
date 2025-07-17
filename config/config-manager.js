const fs = require("fs");
const path = require("path");
const CryptoJS = require("crypto-js");

class ConfigManager {
  constructor() {
    this.configDir = path.join(__dirname);
    this.settingsFile = path.join(this.configDir, "settings.json");
    this.keysFile = path.join(this.configDir, "keys.encrypted");
    this.encryptionKey = "binance-widget-secret-key-2024"; // In production, use a more secure key

    this.defaultSettings = {
      appearance: {
        backgroundColor: "rgb(0, 0, 0)",
        transparency: 100,
        borderColor: "rgba(255, 166, 0, 0.555)",
      },
      sounds: {
        masterMute: false,
        trade: true,
        tp: true,
        sl: true,
        volume: {
          trade: 80,
          tp: 80,
          sl: 80,
        },
      },
      system: {
        refreshDuration: 5000, // 5 seconds default
        autoRefresh: true,
      },
    };

    this.ensureConfigDir();
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  // Settings management
  loadSettings() {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const data = fs.readFileSync(this.settingsFile, "utf8");
        const settings = JSON.parse(data);
        return { ...this.defaultSettings, ...settings };
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
    return this.defaultSettings;
  }

  saveSettings(settings) {
    try {
      const mergedSettings = { ...this.defaultSettings, ...settings };
      fs.writeFileSync(
        this.settingsFile,
        JSON.stringify(mergedSettings, null, 2)
      );
      return true;
    } catch (error) {
      console.error("Error saving settings:", error);
      return false;
    }
  }

  // API Keys management (encrypted)
  loadApiKeys() {
    try {
      if (fs.existsSync(this.keysFile)) {
        const encryptedData = fs.readFileSync(this.keysFile, "utf8");
        const decryptedData = CryptoJS.AES.decrypt(
          encryptedData,
          this.encryptionKey
        ).toString(CryptoJS.enc.Utf8);
        return JSON.parse(decryptedData);
      }
    } catch (error) {
      console.error("Error loading API keys:", error);
    }
    return null;
  }

  saveApiKeys(apiKey, apiSecret) {
    try {
      const keyData = {
        apiKey: apiKey,
        apiSecret: apiSecret,
        savedAt: new Date().toISOString(),
      };

      const encryptedData = CryptoJS.AES.encrypt(
        JSON.stringify(keyData),
        this.encryptionKey
      ).toString();
      fs.writeFileSync(this.keysFile, encryptedData);
      return true;
    } catch (error) {
      console.error("Error saving API keys:", error);
      return false;
    }
  }

  hasApiKeys() {
    return fs.existsSync(this.keysFile);
  }

  // Test API keys
  async testApiKeys(apiKey, apiSecret) {
    try {
      const axios = require("axios");
      const crypto = require("crypto");

      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto
        .createHmac("sha256", apiSecret)
        .update(queryString)
        .digest("hex");

      const response = await axios.get(
        `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`,
        {
          headers: {
            "X-MBX-APIKEY": apiKey,
          },
          timeout: 10000,
        }
      );

      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.msg || error.message,
      };
    }
  }
}

module.exports = ConfigManager;
