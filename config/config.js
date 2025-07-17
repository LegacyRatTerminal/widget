const ConfigManager = require("./config-manager");

// Create a function to get fresh config each time
function getConfig() {
  const configManager = new ConfigManager();
  const apiKeys = configManager.loadApiKeys();

  if (!apiKeys) {
    console.log("No API keys found. Please configure them in settings.");
  }

  return {
    binance: {
      apiKey: apiKeys?.apiKey || "",
      apiSecret: apiKeys?.apiSecret || "",
      baseURL: "https://fapi.binance.com",
    },
  };
}

// Export the function instead of static config
module.exports = getConfig();

// Also export the function for dynamic reloading
module.exports.getConfig = getConfig;
