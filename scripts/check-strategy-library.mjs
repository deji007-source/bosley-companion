import assert from "node:assert/strict";
import { validateStrategyRules, inspectStrategyImport } from "../src/trading/strategy-library.js";
const valid={version:1,direction:"long-only",indicators:[{type:"rsi",period:14,entryAbove:50,exitBelow:50}],entry:{indicator:"rsi",operator:"crosses_above",threshold:50},exit:{indicator:"rsi",operator:"crosses_below",threshold:50}};
assert.deepEqual(validateStrategyRules(valid),valid);
assert.throws(()=>validateStrategyRules({...valid,indicators:[{type:"rsi",period:14,entryAbove:70,exitBelow:30}]}),/threshold 50/);
assert.throws(()=>validateStrategyRules({...valid,indicators:[{type:"rsi",period:14,entryAbove:70,exitBelow:70}],entry:{indicator:"rsi",operator:"crosses_above",threshold:70},exit:{indicator:"rsi",operator:"crosses_below",threshold:70}}),/threshold 50/);
assert.throws(()=>validateStrategyRules({...valid,python:"print(1)"}),/Unsupported strategy field/);
assert.throws(()=>validateStrategyRules({...valid,indicators:[{type:"sma",period:1}]}),/periods/);
const file=JSON.stringify({format:"bosley-strategy-v1",name:"RSI 50",licence:{name:"MIT"},rules:valid});
assert.equal(inspectStrategyImport(file,"rsi.json").name,"RSI 50");
assert.throws(()=>inspectStrategyImport(file.replace('"licence":{"name":"MIT"}','"licence":{}')),/licence name/);
assert.throws(()=>inspectStrategyImport('{"format":"bosley-strategy-v1","name":"Bad","licence":{"name":"MIT"},"rules":{},"code":"import os"}'),/executable code/);
assert.throws(()=>inspectStrategyImport(file,"strategy.py"),/Only JSON/);
console.log("Bosley strategy library checks passed.");

import { parseStrategy, strategyPresets } from "../src/trading/strategy-parser.js";
import { createDemoSeries, normalizeHistoricalBars, runBacktest } from "../src/trading/backtest-engine.js";
const strategyCases = [
  ["sma", "Long-only SMA 9 / 21 crossover. Buy when the 9-period simple moving average crosses above the 21-period simple moving average. Sell and close when it crosses below.", 9, 21],
  ["ema", "Long-only EMA 9 / 21 crossover. Buy when the 9-period exponential moving average crosses above the 21-period exponential moving average. Sell and close when it crosses below.", 9, 21],
  ["sma", "Buy when the 20-day SMA crosses above the 50-day SMA. Sell when the 20-day SMA crosses below the 50-day SMA.", 20, 50],
  ["ema", "Buy when the 12-period EMA crosses above the 26-period EMA. Exit when it crosses below.", 12, 26],
  ["rsi", "Long-only RSI(14) strategy. Buy when RSI crosses above 50 and exit when RSI crosses below 50.", 14, 14],
  ["macd", "Long-only MACD(9, 21, 9) crossover. Buy when the MACD line crosses above its signal line and exit when it crosses below.", 9, 21],
  ["bollinger", "Long-only Bollinger Bands(20, 2) breakout. Buy when the close crosses above the upper band and exit when it closes back below.", 20, 20]
];
for (const [mode, description, fast, slow] of strategyCases) {
  const parsed = parseStrategy(description);
  assert.equal(parsed.ok, true, mode + " generated strategy should parse: " + parsed.message);
  assert.equal(parsed.mode, mode);
  assert.equal(parsed.fast, fast);
  assert.equal(parsed.slow, slow);
}
assert.equal(parseStrategy("Buy when the 20-day SMA crosses above the 50-day SMA.").ok, false, "A crossover without an explicit exit must be rejected.");
assert.equal(parseStrategy("RSI(14) crosses above 70 and exits below 30.").ok, false, "Mismatched RSI thresholds must not be approximated.");
assert.equal(parseStrategy("Buy when the moon is bright.").ok, false, "Unsupported rules must be rejected.");
console.log("Bosley strategy parser checks passed.");

assert.equal(strategyPresets.length, 7, "The repository should ship seven ready-to-load supported strategy examples.");
assert.equal(new Set(strategyPresets.map(preset => preset.id)).size, strategyPresets.length, "Built-in strategy IDs must be unique.");
for (const preset of strategyPresets) {
  const parsed = parseStrategy(preset.rule);
  assert.equal(parsed.ok, true, preset.name + " must pass the same parser used by Trading Dock: " + parsed.message);
  assert.equal(parsed.mode, preset.indicator);
  assert.equal(parsed.fast, preset.fast);
  assert.equal(parsed.slow, preset.slow);
}
console.log("Bosley built-in strategy preset checks passed.");


const normalizedSample = normalizeHistoricalBars([
  { date: "2024-01-03", open: 12, high: 14, low: 11, close: 13, volume: null },
  { date: "2024-01-01", open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
  { date: "2024-01-03", open: 12, high: 15, low: 11, close: 14, volume: null },
  { date: "2024-01-02", open: 10.5, high: 12, low: 10, close: 11.5, volume: 0 }
]);
assert.deepEqual(normalizedSample.map(bar => bar.date), ["2024-01-01", "2024-01-02", "2024-01-03"], "Historical bars must be sorted and duplicate dates collapsed.");
assert.equal(normalizedSample[2].close, 14, "The latest duplicate observation must be retained.");
assert.equal(normalizedSample[2].volume, null, "Missing volume must remain null, not NaN.");
assert.throws(() => normalizeHistoricalBars([{ date: "2024-02-30", open: 1, high: 1, low: 1, close: 1, volume: null }]), /invalid date/i);
assert.throws(() => normalizeHistoricalBars([{ date: "2024-01-01", open: 1, high: 0.5, low: 0.8, close: 1, volume: 1 }]), /invalid date, OHLC value, or volume/i);
assert.throws(() => normalizeHistoricalBars([{ date: "2024-01-01", open: 1, high: 1, low: 1, close: 1, volume: Number.NaN }]), /invalid date, OHLC value, or volume/i);

const demoBars = createDemoSeries();
assert.equal(demoBars.length, 756, "The production demo generator must return the labelled three-year, 756-candle series.");
assert.ok(demoBars.every((bar, index) => Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close) && bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close) && (!index || bar.date > demoBars[index - 1].date)), "The generated OHLC demo candles must be valid and date ordered.");
const demoResults = [];
for (const preset of strategyPresets) {
  const strategy = parseStrategy(preset.rule);
  const phases = [];
  const result = await runBacktest({
    bars: demoBars, strategy, initial: 10, allocation: 95, riskPerTrade: 0.5,
    stopLoss: 1, takeProfit: 2, onProgress: info => phases.push(info.phase),
    yieldControl: async () => {}
  });
  assert.ok(result, preset.name + " should complete against the production demo dataset.");
  assert.ok(Number.isFinite(result.finalEquity) && result.finalEquity > 0, preset.name + " must return a valid ending balance.");
  assert.ok(Number.isFinite(result.totalReturn), preset.name + " must return a finite total return.");
  assert.ok(Number.isFinite(result.oosFinal) && Number.isFinite(result.oosReturn), preset.name + " must return separate holdout metrics.");
  assert.ok(result.bars > 0 && result.curve.length === result.bars, preset.name + " must produce an in-sample equity curve.");
  assert.ok(result.start < result.oosStart && result.end < result.oosStart, preset.name + " must keep holdout dates outside the in-sample window.");
  assert.ok(result.winRate === null || (Number.isFinite(result.winRate) && result.winRate >= 0 && result.winRate <= 100), preset.name + " must calculate win rate from closed trades only.");
  assert.ok(result.profitFactor === null || result.profitFactor === Infinity || Number.isFinite(result.profitFactor), preset.name + " must return an explicit profit-factor value.");
  assert.equal(result.riskPerTrade, 0.5);
  assert.equal(result.allocation, 95);
  assert.equal(result.stopLoss, 1);
  assert.equal(result.takeProfit, 2);
  assert.ok(phases.includes("in-sample") && phases.includes("out-of-sample") && phases.includes("completed"), preset.name + " must run both test windows and report completion.");
  demoResults.push({ name: preset.name, trades: result.trades, winRate: result.winRate, totalReturn: result.totalReturn, holdoutReturn: result.oosReturn });
}
assert.ok(demoResults.find(result => result.name === "SMA 20 / 50 trend crossover").trades > 0, "The default SMA 20/50 demo must generate closed trades so the win-rate calculation is exercised.");
let cancelYields = 0;
const cancelledRun = await runBacktest({
  bars: demoBars, strategy: parseStrategy(strategyPresets[0].rule), initial: 10,
  allocation: 95, riskPerTrade: 0.5, stopLoss: 1, takeProfit: 2,
  shouldCancel: () => cancelYields > 0, yieldControl: async () => { cancelYields++; }
});
assert.equal(cancelledRun, null, "A cancelled simulation must not return a completed report.");
console.log("Bosley demo backtest smoke results:", JSON.stringify(demoResults));
console.log("Bosley production backtest engine checks passed.");
