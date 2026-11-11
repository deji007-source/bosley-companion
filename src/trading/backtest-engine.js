export function normalizeHistoricalBars(input) {
  if (!Array.isArray(input)) throw new Error("Historical candles must be supplied as a list.");
  const byDate = new Map();
  for (const [index, bar] of input.entries()) {
    const date = String(bar?.date ?? "");
    const validDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + "T00:00:00Z")) && new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date;
    const values = [bar?.open, bar?.high, bar?.low, bar?.close];
    const volumeValid = bar?.volume == null || (Number.isFinite(bar.volume) && bar.volume >= 0);
    if (!validDate || !values.every(value => Number.isFinite(value) && value > 0) ||
      bar.high < Math.max(bar.open, bar.close, bar.low) ||
      bar.low > Math.min(bar.open, bar.close, bar.high) || !volumeValid) {
      throw new Error("Historical candle " + (index + 1) + " has an invalid date, OHLC value, or volume.");
    }
    byDate.set(date, { date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume == null ? null : bar.volume });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const money = value => "$" + Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function createDemoSeries() {
  const rows = [];
  const day = new Date(Date.UTC(2023, 0, 2));
  let i = 0;
  for (; rows.length < 756; day.setUTCDate(day.getUTCDate() + 1)) {
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const previous = rows.length ? rows[rows.length - 1].close : 100;
    const logPrice = Math.log(100) + .00012 * i + .105 * Math.sin(i / 43) + .045 * Math.sin(i / 13) + .012 * Math.sin(i / 3.7);
    const close = Math.exp(logPrice);
    const open = previous * (1 + .003 * Math.sin(i * 1.71));
    const high = Math.max(open, close) * (1 + .002 + Math.abs(Math.sin(i * 2.1)) * .003);
    const low = Math.min(open, close) * (1 - .002 - Math.abs(Math.cos(i * 1.37)) * .003);
    rows.push({ date: day.toISOString().slice(0, 10), open, high, low, close, volume: 1000 + Math.round(Math.abs(Math.sin(i * 1.7)) * 9000) });
    i++;
  }
  return rows;
}

const sma = (bars, period, index) => {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) sum += bars[i].close;
  return sum / period;
};
const emaSeries = (bars, period) => {
  const out = new Array(bars.length).fill(null), alpha = 2 / (period + 1);
  let value = null;
  for (let i = 0; i < bars.length; i++) {
    value = value === null ? bars[i].close : bars[i].close * alpha + value * (1 - alpha);
    if (i >= period - 1) out[i] = value;
  }
  return out;
};
const emaValues = (values, period) => {
  const out = new Array(values.length).fill(null), alpha = 2 / (period + 1);
  let value = null, count = 0;
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue;
    count++;
    value = value === null ? values[i] : values[i] * alpha + value * (1 - alpha);
    if (count >= period) out[i] = value;
  }
  return out;
};
const rsiSeries = (bars, period) => {
  const out = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(0, change)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -change)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
};
const bollingerSeries = (bars, period, multiplier) => {
  const upper = new Array(bars.length).fill(null), middle = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (bars[j].close - mean) ** 2;
    middle[i] = mean;
    upper[i] = mean + multiplier * Math.sqrt(variance / period);
  }
  return { middle, upper };
};

export async function runBacktest({
  bars, strategy, initial, allocation, riskPerTrade, stopLoss, takeProfit,
  feeRate = .0005, spread = .0002, slippage = .0005,
  onProgress = () => {}, shouldCancel = () => false,
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0))
}) {
  bars = normalizeHistoricalBars(bars);
  if (bars.length < 60) throw new Error("At least 60 unique, validated daily candles are required.");
  if (!strategy || strategy.ok !== true) throw new Error("The strategy must pass validation before a backtest can run.");
  for (const [name, value, min, max] of [
    ["starting capital", initial, 1, 1000000], ["allocation", allocation, 1, 100],
    ["risk budget", riskPerTrade, .1, 5], ["stop-loss", stopLoss, .1, 50], ["take-profit", takeProfit, .1, 100]
  ]) if (!Number.isFinite(value) || value < min || value > max) throw new Error("Invalid " + name + " setting.");

  const warmupStart = Math.max(strategy.slow + 2, (strategy.warmupBars || 0) + 2);
  const split = Math.max(warmupStart + 3, Math.floor(bars.length * .7));
  if (split >= bars.length - 2) throw new Error("Not enough candles for a separate out-of-sample period.");

  let cash = initial, units = 0, entry = 0, entryFee = 0, closed = [], log = [], curve = [];
  let peak = initial, maxDD = 0, signalChangesLive = 0;
  const sizePosition = (equity, price) => {
    const allocationQty = equity * allocation / 100 / (price * (1 + feeRate));
    const roundTripCost = 2 * feeRate + spread + 2 * slippage;
    const riskQty = equity * riskPerTrade / 100 / (price * (stopLoss / 100 + roundTripCost));
    return Math.max(0, Math.min(allocationQty, riskQty));
  };
  const bracketExit = (bar, entryPrice) => {
    const stop = entryPrice * (1 - stopLoss / 100), target = entryPrice * (1 + takeProfit / 100);
    if (bar.open <= stop) return { price: bar.open, reason: "stop-loss gap" };
    if (bar.open >= target) return { price: bar.open, reason: "take-profit gap" };
    if (Number.isFinite(bar.low) && bar.low <= stop) return { price: stop, reason: "stop-loss" };
    if (Number.isFinite(bar.high) && bar.high >= target) return { price: target, reason: "take-profit" };
    return null;
  };
  const closeSample = (rawPrice, date, note) => {
    const fill = rawPrice * (1 - slippage - spread / 2), gross = units * fill;
    const fee = gross * feeRate, net = gross - fee, pl = net - (units * entry + entryFee);
    cash += net;
    closed.push(pl);
    log.push({ side: "SELL", date, price: fill, note: "P/L " + money(pl) + " incl. estimated costs · " + note });
    units = 0; entry = 0; entryFee = 0;
  };
  const fastEma = strategy.mode === "ema" ? emaSeries(bars, strategy.fast) : null;
  const slowEma = strategy.mode === "ema" ? emaSeries(bars, strategy.slow) : null;
  const rsiValues = strategy.mode === "rsi" ? rsiSeries(bars, strategy.fast) : null;
  const macdFast = strategy.mode === "macd" ? emaSeries(bars, strategy.fast) : null;
  const macdSlow = strategy.mode === "macd" ? emaSeries(bars, strategy.slow) : null;
  const macdLine = strategy.mode === "macd" ? bars.map((bar, i) => macdFast[i] === null || macdSlow[i] === null ? null : macdFast[i] - macdSlow[i]) : null;
  const macdSignalLine = strategy.mode === "macd" ? emaValues(macdLine, strategy.signalPeriod) : null;
  const bands = strategy.mode === "bollinger" ? bollingerSeries(bars, strategy.fast, strategy.bandMultiplier) : null;
  const signal = i => strategy.mode === "ema" ? fastEma[i] > slowEma[i]
    : strategy.mode === "sma" ? sma(bars, strategy.fast, i) > sma(bars, strategy.slow, i)
    : strategy.mode === "rsi" ? rsiValues[i] > strategy.threshold
    : strategy.mode === "macd" ? macdLine[i] > macdSignalLine[i]
    : strategy.mode === "bollinger" ? bars[i].close > bands.upper[i]
    : false;

  const backtestStart = warmupStart;
  const backtestCount = Math.max(1, split + 1 - backtestStart);
  const oosCount = Math.max(1, bars.length - (split + 2));
  const totalWork = backtestCount + oosCount;
  const uiBatch = Math.max(1, Math.min(250, Math.ceil(backtestCount / 24)));
  onProgress({ phase: "in-sample", done: 0, total: backtestCount, percent: 0, equity: initial, closedTrades: 0, winRate: null, profitFactor: null });

  for (let i = backtestStart; i < split + 1; i++) {
    if ((i - backtestStart) % uiBatch === 0 || i === split) {
      const done = i - backtestStart + 1;
      const liveEquity = cash + units * (i > backtestStart ? bars[i - 1].close : bars[i].open);
      const liveWins = closed.filter(value => value > 0).length;
      const liveLosses = Math.abs(closed.filter(value => value < 0).reduce((a, b) => a + b, 0));
      const liveGains = closed.filter(value => value > 0).reduce((a, b) => a + b, 0);
      onProgress({ phase: "in-sample", done, total: backtestCount, percent: done / totalWork * 100, equity: liveEquity, closedTrades: closed.length, winRate: closed.length ? liveWins / closed.length * 100 : null, profitFactor: liveLosses ? liveGains / liveLosses : liveGains ? Infinity : null });
      await yieldControl();
      if (shouldCancel()) return null;
    }
    const previousSignal = signal(i - 2), currentSignal = signal(i - 1);
    const fillPrice = bars[i].open * (1 + slippage + spread / 2), date = bars[i].date;
    if (currentSignal !== previousSignal) signalChangesLive++;
    let exitedThisBar = false;
    if (units > 0) {
      const bracket = bracketExit(bars[i], entry);
      if (bracket) { closeSample(bracket.price, date, bracket.reason + "; conservative OHLC ordering"); exitedThisBar = true; }
      else if (!currentSignal && previousSignal) { closeSample(bars[i].open, date, "strategy exit at next open"); exitedThisBar = true; }
    }
    if (!exitedThisBar && currentSignal && (!previousSignal || i === backtestStart) && units === 0) {
      const quantity = sizePosition(cash, fillPrice);
      if (quantity > 0) {
        const cost = quantity * fillPrice, fee = cost * feeRate;
        cash -= cost + fee; units = quantity; entry = fillPrice; entryFee = fee;
        log.push({ side: "BUY", date, price: fillPrice, note: "signal at prior close; filled next open · risk-sized position" });
        const sameBarExit = bracketExit(bars[i], entry);
        if (sameBarExit) { closeSample(sameBarExit.price, date, sameBarExit.reason + " on entry candle; conservative OHLC ordering"); exitedThisBar = true; }
      }
    }
    const equity = cash + units * bars[i].close;
    const worstEquity = units > 0 && Number.isFinite(bars[i].low) ? cash + units * bars[i].low * (1 - slippage - spread / 2) * (1 - feeRate) : equity;
    curve.push(equity);
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, (peak - worstEquity) / peak * 100, (peak - equity) / peak * 100);
  }
  if (units > 0) {
    const last = bars[split], gross = units * last.close * (1 - slippage - spread / 2);
    const fee = gross * feeRate, profitLoss = gross - fee - (units * entry + entryFee);
    cash += gross - fee; closed.push(profitLoss);
    log.push({ side: "CLOSE", date: last.date, price: last.close, note: "end-of-in-sample mark-to-market " + money(profitLoss) });
    units = 0;
  }
  const finalEquity = cash, totalReturn = (finalEquity / initial - 1) * 100;
  peak = Math.max(peak, finalEquity);
  maxDD = Math.max(maxDD, (peak - finalEquity) / peak * 100);
  const benchmarkReturn = (bars[split].close / bars[backtestStart].close - 1) * 100;
  const wins = closed.filter(value => value > 0).length;
  const lossCount = closed.filter(value => value < 0).length;
  const gains = closed.filter(value => value > 0).reduce((a, b) => a + b, 0);
  const losses = Math.abs(closed.filter(value => value < 0).reduce((a, b) => a + b, 0));
  const signalChanges = bars.slice(backtestStart, split + 1).reduce((count, bar, index) => {
    const i = index + backtestStart, previous = signal(i - 2), current = signal(i - 1);
    return count + (typeof previous === "boolean" && typeof current === "boolean" && previous !== current ? 1 : 0);
  }, 0);
  const activeSignalBars = bars.slice(backtestStart, split + 1).reduce((count, bar, index) => count + (signal(index + backtestStart - 1) === true ? 1 : 0), 0);
  const expectancy = closed.length ? closed.reduce((a, b) => a + b, 0) / closed.length : 0;
  const averageWin = wins ? gains / wins : 0, averageLoss = lossCount ? losses / lossCount : 0;

  let oosInitial = initial, oosCash = initial, oosUnits = 0, oosEntry = 0;
  const closeOos = rawPrice => {
    const fill = rawPrice * (1 - slippage - spread / 2), gross = oosUnits * fill;
    oosCash += gross - gross * feeRate; oosUnits = 0; oosEntry = 0;
  };
  const oosBatch = Math.max(1, Math.min(200, Math.ceil(oosCount / 16)));
  onProgress({ phase: "out-of-sample", done: 0, total: oosCount, percent: backtestCount / totalWork * 100, equity: finalEquity, closedTrades: closed.length, winRate: closed.length ? wins / closed.length * 100 : null, profitFactor: closed.length ? (losses ? gains / losses : gains ? Infinity : 0) : null });
  for (let i = split + 2; i < bars.length; i++) {
    if ((i - (split + 2)) % oosBatch === 0 || i === bars.length - 1) {
      const done = i - (split + 2) + 1;
      onProgress({ phase: "out-of-sample", done, total: oosCount, percent: (backtestCount + done) / totalWork * 100, equity: finalEquity, closedTrades: closed.length, winRate: closed.length ? wins / closed.length * 100 : null, profitFactor: closed.length ? (losses ? gains / losses : gains ? Infinity : 0) : null });
      await yieldControl();
      if (shouldCancel()) return null;
    }
    const previousSignal = signal(i - 2), currentSignal = signal(i - 1);
    const fillPrice = bars[i].open * (1 + slippage + spread / 2);
    let exited = false;
    if (oosUnits > 0) {
      const bracket = bracketExit(bars[i], oosEntry);
      if (bracket) { closeOos(bracket.price); exited = true; }
      else if (!currentSignal && previousSignal) { closeOos(bars[i].open); exited = true; }
    }
    if (!exited && currentSignal && (!previousSignal || i === split + 2) && oosUnits === 0) {
      const quantity = sizePosition(oosCash, fillPrice);
      if (quantity > 0) {
        oosUnits = quantity; oosEntry = fillPrice;
        const fee = quantity * fillPrice * feeRate; oosCash -= quantity * fillPrice + fee;
        const sameBarExit = bracketExit(bars[i], oosEntry);
        if (sameBarExit) closeOos(sameBarExit.price);
      }
    }
  }
  const oosEquity = oosCash + (oosUnits ? oosUnits * bars[bars.length - 1].close * (1 - slippage - spread / 2) * (1 - feeRate) : 0);
  const result = {
    initial, riskPerTrade, allocation, stopLoss, takeProfit, finalEquity, totalReturn, maxDrawdown: maxDD,
    winRate: closed.length ? wins / closed.length * 100 : null, trades: closed.length, wins, losses: lossCount,
    expectancy, averageWin, averageLoss, signalChanges, profitFactor: closed.length ? (losses ? gains / losses : gains ? Infinity : 0) : null,
    oosInitial, oosFinal: oosEquity, oosReturn: (oosEquity / oosInitial - 1) * 100,
    oosStart: bars[split + 2].date, benchmarkReturn, curve, bars: split + 1 - backtestStart,
    start: bars[backtestStart].date, end: bars[split].date,
    strategy: strategy.description + (strategy.timeframeWarning ? " · " + strategy.timeframeWarning : ""),
    activeSignalBars, log
  };
  onProgress({ phase: "completed", done: totalWork, total: totalWork, percent: 100, equity: finalEquity, closedTrades: closed.length, winRate: result.winRate, profitFactor: result.profitFactor });
  return result;
}

if (typeof window !== "undefined") window.BosleyBacktestEngine = Object.freeze({ createDemoSeries, runBacktest });
