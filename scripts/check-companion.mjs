import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { readFileSync as readText } from "node:fs";

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

const androidInstaller = readText(new URL("./install-android-overlay.py", import.meta.url), "utf8");

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
  ["Keyboard shortcuts for Agent, Dictate and Edit", "Ctrl/Alt+Shift+3"],
  ["Spoken mode command router", "function handleVoiceModeCommand(raw)"],
  ["Voice command microphone restart", "Listening again in a moment."],
  ["Bosley activity view", 'id="activitytoggle"'],
  ["Activity task tracking", 'id="activityform"'],
  ["Daily planner categories", 'id="activitykind"'],
  ["Daily planner deadline", 'id="activitydue"'],
  ["Consent prompt for visual task guide", "Allow Bosley to guide you to this task?"],
  ["Animated visual tether", "bosley-guide-flow"],
  ["Guide mode stop control", 'id="bosley-guide-stop"'],
  ["Guide mode is limited to Bosley UI", "inside Bosley Companion only"],
  ["Activity event history", 'id="activityevents"'],
  ["Detachable side-view dock", 'id="side-dock"'],
  ["Visible side-view launcher", 'id="dock-launcher"'],
  ["Workspace launcher action", 'data-open-view="ws"'],
  ["Visible side-view launcher", 'id="dock-open"'],
  ["Workspace side-view tabs", 'id="dock-tabs"'],
  ["Side-view dock close control", 'id="dock-close"'],
  ["Side-view dock controller", "Side-view dock: workspace, appearance, automation and activity open beside chat."],
  ["Side dock DOM-ready initialization", 'document.addEventListener("DOMContentLoaded",()=>{'],
  ["Widget side dock click support", "html.widget-mode #dock-launcher,html.widget-mode #side-dock{pointer-events:auto!important}"],
  ["Compact Dynamic Island launcher", "html.widget-mode .launch{border:1px solid #f7f7f7!important;border-radius:22px!important;clip-path:none!important"],
  ["Native Android speech recognition", "startNativeSpeechRecognition"],
  ["Android microphone uses native speech recognition", "Android voice input couldn't start"],
  ["Android mic button native speech routing", "overlayPlugin.startNativeSpeechRecognition"],
  ["Tap panel and hold voice routing", "consumeLaunchAction"],
  ["Edit mode prompt", 'Please edit the text below according to my request'],
  ["Phone command matcher accepts app names", "open .+|launch .+|start .+"],
  ["Voice recorder stop handler is defined", 'recorder.onstop=async()=>{'],
  ["Visible startup diagnostics", 'id="startup-error"'],
  ["Async startup diagnostics", 'unhandledrejection'],
  ["Second Brain workspace capture and PARA categories", "Capture a thought, voice transcript, decision or link…"],
  ["Second Brain category tagging", 'tags:["para:"+($("#note-category")?.value||"Projects")]'],
  ["Second Brain search", "Search your memory…"],
  ["Second Brain PARA filtering", "wsNoteArea"],
  ["On-demand screen capture control", 'id="screen"'],
  ["Consent-based screen capture action", 'capture_screen'],
  ["Captured screenshot normalization", "async function normalizeCapturedImage(dataUrl)"],
  ["Captured screenshot size limit", "1280/Math.max(bitmap.width,bitmap.height)"],
  ["Captured screenshot JPEG compression", 'canvas.toDataURL("image/jpeg",0.82)'],
  ["Captured screenshot resource cleanup", "finally{bitmap.close?.()}"],
  ["Authenticated laptop listener", "function startLaptopCommandListener(activeUser)"],
  ["User-scoped laptop realtime channel", 'db.channel("bosley-laptop-"+activeUser.id)'],
  ["Phone-to-laptop wake action", 'action:"wake_companion"'],
  ["Laptop listener reports status", 'id="laptop-listener-status"'],
  ["Unsupported remote commands fail closed", "unsupported remote command and safely did not execute it"],
  ["Chrome search does not open duplicate browser", "No extra Chrome window was opened."],
];
for (const [label, token] of contracts) {
  assert.ok(html.includes(token), "Missing required contract: " + label);
}
assert.ok(androidInstaller.includes("public void speakText(PluginCall call)"), "Missing native Android text-to-speech bridge");
assert.ok(androidInstaller.includes("public void stopSpeaking(PluginCall call)"), "Missing native Android speech cancellation bridge");
assert.ok(androidInstaller.includes("TextToSpeech.QUEUE_FLUSH"), "Native Android speech should replace queued speech");
console.log("Bosley regression checks passed: " + inlineScripts.length + " inline script(s), " + contracts.length + " UI contracts, and Android TTS bridge contracts.");
