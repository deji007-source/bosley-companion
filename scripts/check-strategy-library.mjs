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
