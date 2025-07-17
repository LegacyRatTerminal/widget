const axios = require("axios");
const crypto = require("crypto");
const { getConfig } = require("./config/config");


class BinanceAPI {
  constructor() {
    this.loadConfig();
    this.previousPositions = [];
  }

  loadConfig() {
    const config = getConfig();
    this.apiKey = config.binance.apiKey;
    this.apiSecret = config.binance.apiSecret;
    this.baseURL = config.binance.baseURL;
  } // Create signature for authenticated requests

  // Add a method to reload config
  reloadConfig() {
    this.loadConfig();
  }

  createSignature(queryString) {
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(queryString)
      .digest("hex");
  } // Make authenticated request

  async makeRequest(endpoint, params = {}) {
    try {
      const timestamp = Date.now();
      const queryString = new URLSearchParams({
        ...params,
        timestamp: timestamp,
      }).toString();

      const signature = this.createSignature(queryString);
      const finalQueryString = `${queryString}&signature=${signature}`;

      const response = await axios.get(
        `${this.baseURL}${endpoint}?${finalQueryString}`,
        {
          headers: {
            "X-MBX-APIKEY": this.apiKey,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error(
        "API Request Error:",
        error.response?.data || error.message
      );
      throw error;
    }
  } // Get account information

  async getAccountInfo() {
    return await this.makeRequest("/fapi/v2/account");
  } // Get all positions

  async getPositions() {
    return await this.makeRequest("/fapi/v2/positionRisk");
  } // Get 24hr ticker price change statistics

  async get24hrStats() {
    try {
      const response = await axios.get(`${this.baseURL}/fapi/v1/ticker/24hr`);
      return response.data;
    } catch (error) {
      console.error("24hr Stats Error:", error.message);
      throw error;
    }
  } // Get current prices for all symbols

  async getCurrentPrices() {
    try {
      const response = await axios.get(`${this.baseURL}/fapi/v1/ticker/price`);
      return response.data;
    } catch (error) {
      console.error("Current Prices Error:", error.message);
      throw error;
    }
  } // Format account data for widget

  formatAccountData(accountData) {
    const totalWalletBalance = parseFloat(accountData.totalWalletBalance);
    const totalUnrealizedProfit = parseFloat(accountData.totalUnrealizedProfit);
    const totalMarginBalance = parseFloat(accountData.totalMarginBalance);

    return {
      marginBalance: totalMarginBalance,
      walletBalance: totalWalletBalance,
      unrealizedPnl: totalUnrealizedProfit,
      availableBalance: parseFloat(accountData.availableBalance),
      totalInitialMargin: parseFloat(accountData.totalInitialMargin),
    };
  } // Format positions data for widget

  formatPositionsData(positionsData) {
    return positionsData
      .filter((position) => parseFloat(position.positionAmt) !== 0)
      .map((position) => {
        const positionAmt = parseFloat(position.positionAmt);
        const entryPrice = parseFloat(position.entryPrice);
        const markPrice = parseFloat(position.markPrice);
        const unRealizedProfit = parseFloat(position.unRealizedProfit);
        const notional = parseFloat(position.notional); // Try different field names for initial margin

        let initialMargin =
          parseFloat(position.initialMargin) ||
          parseFloat(position.initMargin) ||
          parseFloat(position.margin) ||
          0; // If still no margin, calculate it from notional and leverage

        if (initialMargin === 0 && notional > 0) {
          const leverage = parseFloat(position.leverage) || 1;
          initialMargin = Math.abs(notional) / leverage;
        } // If still no margin, calculate from position size and entry price

        if (initialMargin === 0 && entryPrice > 0) {
          const positionValue = Math.abs(positionAmt) * entryPrice;
          const estimatedLeverage =
            notional > 0 ? Math.abs(notional) / positionValue : 1;
          initialMargin = positionValue / (estimatedLeverage || 1);
        } // Calculate ROI: (unrealized PnL / initial margin) * 100

        const roi =
          initialMargin > 0 ? (unRealizedProfit / initialMargin) * 100 : 0; // Calculate margin ratio: (initial margin / notional) * 100

        const marginRatio =
          Math.abs(notional) > 0
            ? (initialMargin / Math.abs(notional)) * 100
            : 0; // Alternative ROI calculation based on price difference and leverage

        const priceRoi =
          entryPrice > 0
            ? ((markPrice - entryPrice) / entryPrice) *
              100 *
              (positionAmt > 0 ? 1 : -1)
            : 0;

        return {
          symbol: position.symbol,
          side: positionAmt > 0 ? "Long" : "Short",
          size: Math.abs(positionAmt),
          entryPrice: entryPrice,
          markPrice: markPrice,
          liquidationPrice: parseFloat(position.liquidationPrice),
          unrealizedPnl: unRealizedProfit,
          roi: roi,
          priceRoi: priceRoi,
          initialMargin: initialMargin,
          notional: notional,
          marginRatio: marginRatio,
          percentage: position.percentage
            ? parseFloat(position.percentage)
            : roi,
          leverage: parseFloat(position.leverage) || "N/A",
        };
      });
  } // Detect position changes for sound alerts

  detectPositionChanges(currentPositions) {
    const alerts = []; // Create maps for easier comparison

    const currentMap = new Map();
    const previousMap = new Map();

    currentPositions.forEach((pos) => currentMap.set(pos.symbol, pos));
    this.previousPositions.forEach((pos) => previousMap.set(pos.symbol, pos)); // Check for new positions (new trades)

    currentPositions.forEach((currentPos) => {
      if (!previousMap.has(currentPos.symbol)) {
        alerts.push({
          type: "trade",
          symbol: currentPos.symbol,
          side: currentPos.side,
        });
      }
    }); // Check for closed positions (TP/SL)

    this.previousPositions.forEach((prevPos) => {
      if (!currentMap.has(prevPos.symbol)) {
        // Position was closed
        if (prevPos.unrealizedPnl > 0) {
          alerts.push({
            type: "tp",
            symbol: prevPos.symbol,
            pnl: prevPos.unrealizedPnl,
          });
        } else if (prevPos.unrealizedPnl < 0) {
          alerts.push({
            type: "sl",
            symbol: prevPos.symbol,
            pnl: prevPos.unrealizedPnl,
          });
        }
      }
    });

    return alerts;
  } // Get all data needed for widget

  async getAllData() {
    try {
      console.log("Fetching account info and positions...");
      const [accountInfo, positions] = await Promise.all([
        this.getAccountInfo(),
        this.getPositions(),
      ]);

      if (positions.length > 0) {
        console.log(
          "Sample position data:",
          JSON.stringify(positions[0], null, 2)
        );
        console.log("Available fields:", Object.keys(positions[0]));
        console.log("initialMargin value:", positions[0].initialMargin);
        console.log("notional value:", positions[0].notional);
        console.log("leverage value:", positions[0].leverage);
      }

      const formattedAccount = this.formatAccountData(accountInfo);
      const formattedPositions = this.formatPositionsData(positions); // Detect position changes for sound alerts

      const alerts = this.detectPositionChanges(formattedPositions); // Update previous positions for next comparison

      this.previousPositions = [...formattedPositions];

      console.log(
        "Formatted positions:",
        JSON.stringify(formattedPositions, null, 2)
      );

      return {
        account: formattedAccount,
        positions: formattedPositions,
        alerts: alerts, // Include alerts in the response
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error getting all data:", error.message);
      throw error;
    }
  }
}

module.exports = BinanceAPI;
