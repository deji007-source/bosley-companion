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

const contracts = [
  ["Desktop bridge action", 'launch_app'],
  ["Remote action gateway", 'remote-action'],
  ["Queued status wording", 'QUEUED — DELIVERY UNCONFIRMED'],
  ["Listener delivery wording", 'DELIVERED TO LISTENER'],
  ["Saved workflow matcher", 'findWorkflowCommand'],
  ["Voice profile control", 'voiceprofile'],
  ["Automation history", 'automationHistoryKey'],
  ["Web launcher shortcut", 'youtube'],
  ["Voice mode selector", 'id="voicemodes"'],
  ["Agent voice mode", 'data-mode="agent"'],
  ["Dictation voice mode", 'data-mode="dictate"'],
  ["Edit voice mode", 'data-mode="edit"'],
  ["Mode-aware speech handling", 'function setVoiceMode(next)'],
  ["Edit mode prompt", 'Please edit the text below according to my request'],
  ["Visible startup diagnostics", 'id="startup-error"'],
  ["On-demand screen capture control", 'id="screen"'],
  ["Consent-based screen capture action", 'capture_screen'],
];
for (const [label, token] of contracts) {
  assert.ok(html.includes(token), "Missing required contract: " + label);
}
console.log("Bosley regression checks passed: " + inlineScripts.length + " inline script(s), " + contracts.length + " contracts.");
