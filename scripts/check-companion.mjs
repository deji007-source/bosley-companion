import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes))
  .map(([, , source]) => source);

assert.ok(inlineScripts.length > 0, "Expected the companion's inline application script");

// Parse-check the inline app without executing browser-dependent code.
for (const [index, source] of inlineScripts.entries()) {
  assert.doesNotThrow(
    () => new vm.Script(source, { filename: `index.html:inline-script-${index + 1}` }),
    `Inline script ${index + 1} must be valid JavaScript`,
  );
}

// Guard the main user-facing automation routes against accidental removal.
const requiredContracts = [
  ["Chrome command route", /open\\s\+\(\?:google\\s\+\)?chrome/i],
  ["Native desktop action route", /action:\\?"launch_app/],
  ["Shared remote-action gateway", /functions\.invoke\(["']remote-action["']/],
  ["Automation success must mean accepted, not executed", /execution not yet confirmed/i],
  ["Music next-track route", /play next song on /],
  ["Failure feedback for queued automation", /Automation queue failed:/],
];

for (const [label, pattern] of requiredContracts) {
  assert.match(html, pattern, `Missing required contract: ${label}`);
}

console.log(`Bosley regression checks passed: ${inlineScripts.length} inline script(s), ${requiredContracts.length} automation contracts.`);
