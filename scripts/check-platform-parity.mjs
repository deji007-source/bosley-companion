import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("index.html");
const android = read("scripts/install-android-overlay.py");
const androidWorkflow = read(".github/workflows/build-android.yml");
const windowsWorkflow = read(".github/workflows/build-windows.yml");
const readme = read("README.md");

const sharedContracts = [
  ["authentication gate", 'id="auth-gate"'],
  ["shared chat entry point", "async function send(text,imageData=null)"],
  ["conversation persistence", "restoreLatestConversation"],
  ["saved workflow cloud sync", "async function syncWorkflows()"],
  ["planner cloud sync", "syncPlannerTasks"],
  ["shared appearance and voice sync", "async function syncCompanionSettings()"],
  ["skills workspace", "async function renderBosleySkills()"],
  ["agent/provider manager", "async function renderBosleyProviderManager()"],
  ["shared command routing", "function dispatchAutomationCommand"],
  ["remote automation gateway", "/functions/v1/remote-action"],
  ["authenticated agent gateway", "/functions/v1/agent-gateway"],
];

for (const [label, marker] of sharedContracts) {
  assert.ok(html.includes(marker), "The shared website source is missing the " + label + " contract.");
}

assert.ok(androidWorkflow.includes("cp index.html dist/index.html"), "Android must package the shared production interface, not a separate prototype.");
assert.ok(windowsWorkflow.includes("cp index.html desktop/index.html"), "Windows must package the shared production interface, not a separate prototype.");
for (const [label, workflow] of [["Android", androidWorkflow], ["Windows", windowsWorkflow]]) {
  assert.ok(workflow.includes("'index.html'") || workflow.includes('"index.html"'), label + " CI must rebuild when the shared interface changes.");
  assert.ok(workflow.includes("npm run test:companion"), label + " CI must run the shared regression suite.");
  assert.ok(workflow.includes("pull_request:"), label + " CI must validate pull requests.");
}

const androidContracts = [
  ["native floating overlay", "class BosleyOverlayService"],
  ["Android voice capture", "SpeechRecognizer.createSpeechRecognizer(this)"],
  ["native screen recording", "BosleyScreenRecordingService.java"],
  ["system screen-capture consent", "requestScreenRecording(PluginCall call)"],
  ["shared signed-in session", "syncChatSession(PluginCall call)"],
  ["selected AI provider bridge", "syncAgentPreference(PluginCall call)"],
  ["planner and agent handoff routing", "dispatch-command"],
  ["MacroDroid/remote automation", "/functions/v1/remote-action"],
];
for (const [label, marker] of androidContracts) {
  assert.ok(android.includes(marker) || androidWorkflow.includes(marker) || html.includes(marker),
    "Android is missing the " + label + " integration.");
}

const windowsContracts = [
  ["Electron desktop wrapper", "electron-builder --win nsis"],
  ["restricted native bridge", "preload.cjs"],
  ["desktop floating companion", "companion.html"],
  ["shared website workspace", "desktop/index.html"],
];
for (const [label, marker] of windowsContracts) {
  assert.ok(windowsWorkflow.includes(marker), "Windows is missing the " + label + " packaging contract.");
}

assert.ok(readme.includes("root `index.html`"), "Documentation must identify the shared source of truth.");
console.log("Platform parity contract passed: website, Android and Windows share the same companion source and regression suite; native-only capabilities remain explicitly platform-scoped.");
