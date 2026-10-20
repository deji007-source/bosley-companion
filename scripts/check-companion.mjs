import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes))
  .map(([, , source]) => source);

assert.ok(inlineScripts.length > 0, "Expected the companion's inline application script");

for (const [index, source] of inlineScripts.entries()) {
  assert.doesNotThrow(
    () => new vm.Script(source, { filename: "index.html:inline-script-" + (index + 1) }),
    "Inline script " + (index + 1) + " must be valid JavaScript",
  );
}

const requiredContracts = [
  ["Chrome command route", /open\s+(?:google\s+)?chrome/i],
  ["Native desktop action route", /action\s*:\s*["']launch_app["']/],
  ["Shared remote-action gateway", /functions\.invoke\(["']remote-action["']/],
  ["Queued is not reported as executed", /execution not yet confirmed/i],
  ["Music next-track route", /play next song on /],
  ["Automation failure feedback", /Automation queue failed:/],
  ["Web app shortcuts", /youtube:"https:\/\/www\.youtube\.com\/"/],
  ["Voice profile tuning", /u\.pitch=voiceProfile==="jarvis"\?0\.74:1/],
  ["Panel hides the web launcher", /body\.panel-open:not\(\.desktop-panel\) \.stage\{display:none!important\}/],
  ["Native launcher hidden in panel window", /html\.widget-mode \.stage\{display:none!important\}/],
  ["Top-bezel web panel", /\.panel\{position:fixed;left:50%;top:0/],
];

for (const [label, pattern] of requiredContracts) {
  assert.match(html, pattern, "Missing required contract: " + label);
}

console.log("Bosley regression checks passed: " + inlineScripts.length + " inline script(s), " + requiredContracts.length + " contracts.");
