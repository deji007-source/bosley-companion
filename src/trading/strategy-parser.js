export function parseStrategy(raw) {
  const text = String(raw || "").toLowerCase().replace(/\s+/g, " ").trim();
  const fail = () => ({ ok: false, message: "I could not safely map the full rule into the backtest engine yet. Supported rules are SMA/EMA crossovers, RSI threshold rules, MACD signal-line crossovers and Bollinger upper-band breakouts. Entry and exit conditions must be explicit; pasted code is never executed." });

  const rsiMatch = text.match(/\brsi\s*\(?\s*(\d{1,3})?/);
  if (rsiMatch) {
    const period = Number(rsiMatch[1] || 14);
    const rsiConditions = [...text.matchAll(/\brsi\b[^.]{0,160}/g)].map(match => match[0]).join(" ");
    const entry = rsiConditions.match(/cross(?:es|ing)?\s+(?:above|over)\s*(\d{1,2})/);
    const exit = rsiConditions.match(/cross(?:es|ing)?\s+(?:below|under)\s*(\d{1,2})/);
    if (period < 2 || period > 100 || !entry || !exit || Number(entry[1]) !== Number(exit[1]) || Number(entry[1]) < 1 || Number(entry[1]) > 99) return fail();
    return { ok: true, fast: period, slow: period, threshold: Number(entry[1]), description: "Long-only RSI(" + period + ") threshold crossover · enter above " + entry[1] + " and exit below it", mode: "rsi", warmupBars: period };
  }

  const bollingerMatch = text.match(/bollinger(?: bands?)?\s*\(?\s*(\d{1,3})?\s*[,/ ]*\s*(\d+(?:\.\d+)?)?/);
  if (bollingerMatch) {
    const period = Number(bollingerMatch[1] || 20), multiplier = Number(bollingerMatch[2] || 2);
    const entry = /(?:cross(?:es|ing)?\s+above|break(?:s|out)?\s+above|above)[^.]{0,45}upper band/.test(text);
    const exit = /exit[^.]{0,140}(?:below|under)|closes? back below/.test(text);
    if (period < 2 || period > 250 || multiplier < 0.5 || multiplier > 4 || !entry || !exit) return fail();
    return { ok: true, fast: period, slow: period, bandMultiplier: multiplier, description: "Long-only Bollinger upper-band breakout (" + period + ", " + multiplier + ") · enter above the upper band and exit below it", mode: "bollinger", warmupBars: period };
  }

  const macdMatch = text.match(/macd\s*\(?\s*(\d{1,2})?\s*[,/ ]+\s*(\d{1,2})?\s*[,/ ]+\s*(\d{1,2})?\s*\)?/);
  if (/\bmacd\b/.test(text)) {
    const fast = Number(macdMatch?.[1] || 12), slow = Number(macdMatch?.[2] || 26), signalPeriod = Number(macdMatch?.[3] || 9);
    const entry = /macd line[^.]{0,120}?cross(?:es|ing)?\s+(?:above|over)[^.]{0,100}signal line/.test(text);
    const exit = /exit[^.]{0,160}(?:cross(?:es|ing)?\s+(?:below|under)|below)[^.]{0,100}signal/.test(text) || /exit[^.]{0,160}cross(?:es|ing)?\s+(?:below|under)/.test(text);
    if (fast < 2 || fast >= slow || slow > 100 || signalPeriod < 2 || signalPeriod > 50 || !entry || !exit) return fail();
    return { ok: true, fast, slow, signalPeriod, description: "Long-only MACD(" + fast + ", " + slow + ", " + signalPeriod + ") crossover · enter above its signal line and exit below", mode: "macd", warmupBars: slow + signalPeriod - 2 };
  }

  const hasUpCross = /cross(?:es|ing)?\s+(?:above|over)|bullish crossover/.test(text);
  const hasDownCross = /cross(?:es|ing)?\s+(?:below|under)|bearish crossover/.test(text);
  const periodsFor = aliases => {
    const found = [];
    for (const alias of aliases) {
      const escaped = alias.replace(/\s+/g, "\\s+");
      const pair = new RegExp("\\b" + escaped + "\\s*\\(?\\s*(\\d{1,3})\\s*(?:\\/|,|and|&)\\s*(\\d{1,3})", "g");
      for (const match of text.matchAll(pair)) found.push(Number(match[1]), Number(match[2]));
      const before = new RegExp("\\b(\\d{1,3})\\s*(?:-?period|-?day)?\\s*" + escaped + "\\b", "g");
      for (const match of text.matchAll(before)) found.push(Number(match[1]));
      const after = new RegExp("\\b" + escaped + "\\s*\\(?\\s*(\\d{1,3})\\b", "g");
      for (const match of text.matchAll(after)) found.push(Number(match[1]));
    }
    return [...new Set(found.filter(n => Number.isInteger(n) && n >= 2 && n <= 250))].sort((a, b) => a - b);
  };

  const emaPeriods = periodsFor(["ema", "exponential moving average"]);
  if ((/\bema\b|exponential moving average/.test(text)) && emaPeriods.length >= 2 && hasUpCross && hasDownCross) {
    const intraday = /\b(5|15)\s*[- ]?minute|\b(5m|15m)\b/.test(text);
    return { ok: true, fast: emaPeriods[0], slow: emaPeriods[1], description: "Long-only EMA crossover · enter when fast EMA crosses above slow EMA · exit when it crosses below", mode: "ema", timeframeWarning: intraday ? "The strategy requests intraday candles, but the selected dataset contains daily candles. This run will use daily candles and cannot validate 5-minute or 15-minute execution." : "" };
  }

  const smaPeriods = periodsFor(["sma", "simple moving average", "moving average"]);
  if ((/\bsma\b|simple moving average/.test(text) || /\bma\b/.test(text)) && smaPeriods.length >= 2 && hasUpCross && hasDownCross) {
    return { ok: true, fast: smaPeriods[0], slow: smaPeriods[1], description: "Long-only SMA crossover · enter on fast/slow bullish cross · exit on bearish cross", mode: "sma" };
  }
  return fail();
}


export const strategyPresets = Object.freeze([
  Object.freeze({ id: "sma-20-50", name: "SMA 20 / 50 trend crossover", indicator: "sma", fast: 20, slow: 50, description: "Simple moving average trend-following example", rule: "Long-only SMA 20 / 50 crossover. Buy when the 20-period simple moving average crosses above the 50-period simple moving average. Sell and close when it crosses below." }),
  Object.freeze({ id: "sma-10-30", name: "SMA 10 / 30 faster crossover", indicator: "sma", fast: 10, slow: 30, description: "Faster simple moving average crossover example", rule: "Long-only SMA 10 / 30 crossover. Buy when the 10-period simple moving average crosses above the 30-period simple moving average. Sell and close when it crosses below." }),
  Object.freeze({ id: "ema-9-21", name: "EMA 9 / 21 trend crossover", indicator: "ema", fast: 9, slow: 21, description: "Exponential moving average crossover example", rule: "Long-only EMA 9 / 21 crossover. Buy when the 9-period exponential moving average crosses above the 21-period exponential moving average. Sell and close when it crosses below." }),
  Object.freeze({ id: "ema-12-26", name: "EMA 12 / 26 slower crossover", indicator: "ema", fast: 12, slow: 26, description: "Slower exponential moving average crossover example", rule: "Long-only EMA 12 / 26 crossover. Buy when the 12-period exponential moving average crosses above the 26-period exponential moving average. Sell and close when it crosses below." }),
  Object.freeze({ id: "rsi-14-50", name: "RSI 14 / 50 threshold", indicator: "rsi", fast: 14, slow: 14, description: "RSI midpoint threshold example", rule: "Long-only RSI(14) strategy. Buy when RSI crosses above 50 and exit when RSI crosses below 50." }),
  Object.freeze({ id: "macd-12-26-9", name: "MACD 12 / 26 / 9 crossover", indicator: "macd", fast: 12, slow: 26, description: "MACD line and signal-line crossover example", rule: "Long-only MACD(12, 26, 9) crossover. Buy when the MACD line crosses above its signal line and exit when it crosses below." }),
  Object.freeze({ id: "bollinger-20-2", name: "Bollinger 20 / 2 upper-band breakout", indicator: "bollinger", fast: 20, slow: 20, description: "Bollinger upper-band breakout example", rule: "Long-only Bollinger Bands(20, 2) breakout. Buy when the close crosses above the upper band and exit when it closes back below." })
]);

if (typeof window !== "undefined") {
  window.BosleyStrategyParser = Object.freeze({ parseStrategy });
  window.BosleyStrategyPresets = strategyPresets;
}
