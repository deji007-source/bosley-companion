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
  ["Allowlisted website launch commands", /function dispatchKnownWebsiteCommand\(raw\)[\s\S]*"spotify":"https:\/\/open\.spotify\.com\/"[\s\S]*runAction\(\{type:"open_url",input:url\}\)/],
  ["Website commands run before AI chat fallback", /dispatchKnownWebsiteCommand\(t\)[\s\S]*if\(dispatchAutomationCommand\(text\)\)/],
  ["Website launch errors are surfaced", /I couldn.t open \+name[\s\S]*autoLog\("error",message\)/],
  ["Saved workflow command matching", /function findWorkflowCommand\(raw\)[\s\S]*normalizeWorkflowCommand\(w\.name\)===candidate/],
  ["Saved workflow commands refresh before matching", /await syncWorkflows\(\)[\s\S]*dispatchAutomationCommand\(text\)/],
  ["Saved workflow execution reports runner outcome", /await runWorkflow\(saved\)[\s\S]*Completed saved automation:/],
  ["Voice profile control persists changes", /voiceprofile[\s\S]*addEventListener\("change"/],
  ["Voice selection reports actual device voice", /function getVoiceStatus\\(\\)[\\s\\S]*Selected voice:/],
  ["Voice selection prioritizes available English voices", /const english=voices\\.filter/],
  ["System voice profile respects device language", /voiceProfile==="system"&&navigator\\.language/],
  ["Voice speech language follows selected voice", /u\\.lang=selected\\?\\.lang/],
  ["Native desktop action route", /action\s*:\s*["']launch_app["']/],
  ["Shared remote-action gateway", /functions\.invoke\(["']remote-action["']/],
  ["Queued is not reported as executed", /execution is not yet confirmed/i],
  ["Listener delivery feedback", /data\.listenerNotified===true/],
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
