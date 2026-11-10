/* Descriptive market statistics only. This module does not generate trade recommendations or forecasts. */
(() => {
  const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  function analyze(bars) {
    if (!Array.isArray(bars) || bars.length < 20) throw new Error("At least 20 valid OHLCV observations are required.");
    const closes = bars.map(row => Number(row.close));
    if (closes.some(value => !Number.isFinite(value) || value <= 0)) throw new Error("Dataset contains an invalid close value.");
    const returns = closes.slice(1).map((value, index) => value / closes[index] - 1);
    const sma = period => average(closes.slice(-period));
    const last = closes.at(-1), fast = sma(10), slow = sma(20);
    const mean = average(returns), variance = average(returns.map(value => (value - mean) ** 2));
    let gainTotal = 0, lossTotal = 0;
    for (let i = Math.max(1, closes.length - 14); i < closes.length; i++) {
      const delta = closes[i] - closes[i - 1];
      if (delta > 0) gainTotal += delta; else lossTotal -= delta;
    }
    const avgGain = gainTotal / 14, avgLoss = lossTotal / 14;
    const rsi14 = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
    const trend = last > fast && fast > slow ? "Above short and medium averages" : last < fast && fast < slow ? "Below short and medium averages" : "Mixed moving-average structure";
    return Object.freeze({ observations: bars.length, latestClose: last, sma10: fast, sma20: slow, rsi14, meanDailyReturnPct: mean * 100, dailyVolatilityPct: Math.sqrt(variance) * 100, trend, disclaimer: "Descriptive historical statistics only. Not a forecast, signal, or recommendation." });
  }
  window.BosleyMarketIntelligence = Object.freeze({ analyze });
})();
