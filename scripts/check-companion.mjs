import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { readFileSync as readText } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes))
  .map(([, , source]) => source);

assert.ok(inlineScripts.length > 0, "Expected the companion's inline application script");
assert.match(html.trimEnd(), /<\/html>$/i, "No application source may appear after the closing HTML document");
assert.ok(inlineScripts.some(source => source.includes("function startLaptopCommandListener(activeUser)")), "Laptop listener must be defined inside an executable inline script");
const appScript = inlineScripts.find(source => source.includes("function startLaptopCommandListener(activeUser)"));
assert.ok(appScript && appScript.indexOf("function startLaptopCommandListener(activeUser)") < appScript.lastIndexOf("})();"), "Laptop listener must remain inside the application IIFE so it can access $ and other private helpers");
for (const [index, source] of inlineScripts.entries()) {
  assert.doesNotThrow(
    () => new vm.Script(source, { filename: "index.html:inline-script-" + (index + 1) }),
    "Inline script " + (index + 1) + " must be valid JavaScript",
  );
}

const androidInstaller = readText(new URL("./install-android-overlay.py", import.meta.url), "utf8");
const windowsWorkflow = readText(new URL("../.github/workflows/build-windows.yml", import.meta.url), "utf8");

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
  ["Natural-language planner task drafting", "function createPlannerTaskFromCommand(raw)"],
  ["Planner command runs before automation matching", "if(createPlannerTaskFromCommand(text))"],
  ["Planner draft opens the Activity side panel", 'data-open-view="activity"'],
  ["Planner draft directs user to Guide", "then tap Guide when you’re ready."],
  ["Daily planner categories", 'id="activitykind"'],
  ["Daily planner deadline", 'id="activitydue"'],
  ["Consent prompt for visual task guide", "Allow Bosley to open a system-level visual guide over other apps for this task?"],
  ["Animated visual tether", "bosley-guide-flow"],
  ["Native guide stop action", 'action:"stop_visual_guide"'],
  ["Website-only guide is rejected", "The website cannot draw over other apps."],
  ["Authenticated planner cloud sync", "async function syncPlannerTasks()"],
  ["Planner sync uses user-scoped rows", '.eq("user_id",uid)'],
  ["Planner sync conflict key", 'onConflict:"user_id,task_id"'],
  ["Planner deletion uses cloud tombstones", 'status:"deleted"'],
  ["Planner sync respects remote deletion tombstones", 'r?.status==="deleted"&&remoteTime>=localTime'],
  ["Planner sync does not reinsert deleted tasks", 'r.status!=="deleted"'],
  ["Planner query retains older deletion tombstones", '.order("updated_at",{ascending:false});'],
  ["Laptop listener heartbeat sender", "async function sendLaptopHeartbeat(activeUser)"],
  ["Laptop heartbeat uses authenticated edge function", '/functions/v1/remote-action'],
  ["Windows native external overlay action", "open_visual_guide"],
  ["Android system-level guide action", "native?.showGuide"],
  ["Guide refuses website-only overlay", "The website cannot draw over other apps."],
  ["Android requests system overlay permission", "const granted=await native.requestPermission()"],
  ["Guide permission is not silently bypassed", "Allow Bosley to open a system-level visual guide over other apps"],
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
assert.ok(windowsWorkflow.includes("function openVisualGuide(payload = {})"), "Missing Windows system-level guide overlay");
assert.ok(windowsWorkflow.includes("border-radius: 0 0 999px 999px;"), "Windows floating widget must have deeply rounded lower edges");
assert.ok(windowsWorkflow.includes("button { width: 260px; height: 18px;"), "Rendered widget height must match its slim native window bounds");
assert.ok(windowsWorkflow.includes("compact: { width: 220, height: 16 },\n                default: { width: 260, height: 18 },\n                wide: { width: 300, height: 20 }"), "All rendered widget sizes must match the slim native window bounds");
assert.ok(windowsWorkflow.includes("raw.split(/\\r?\\n/)"), "Find-target must split SSE responses on actual newline characters");
assert.ok(windowsWorkflow.includes("setIgnoreMouseEvents(true, { forward: true })"), "Windows tether layer should not block clicks in other apps");
assert.ok(windowsWorkflow.includes("guideTargetWindow"), "Windows guide must expose a draggable target marker");
assert.ok(windowsWorkflow.includes("Drag this pencil onto the app control"), "Windows tether endpoint must communicate that the pencil is draggable");
assert.ok(windowsWorkflow.includes("&#9998;"), "Windows tether endpoint must use the pencil icon instead of a plain dot");
assert.ok(windowsWorkflow.includes("Segoe UI Symbol"), "Windows pencil endpoint must remain visually legible at compact overlay size");
assert.ok(windowsWorkflow.includes("cursor:grab"), "Windows tether must advertise that its pencil endpoint is draggable");
assert.ok(windowsWorkflow.includes("cursor:grabbing"), "Windows tether must show a grabbing cursor while dragged");
assert.ok(windowsWorkflow.includes("pointer-events:none"), "Pencil glyph must not interfere with native overlay dragging");
assert.ok(windowsWorkflow.includes("compact: { width: 220, height: 16 }"), "Compact Windows floating widget must be half-height while preserving width");
assert.ok(windowsWorkflow.includes("default: { width: 260, height: 18 }"), "Default Windows floating widget must be half-height while preserving width");
assert.ok(windowsWorkflow.includes("wide: { width: 300, height: 20 }"), "Wide Windows floating widget must be half-height while preserving width");
assert.ok(windowsWorkflow.includes("width: 44, height: 44"), "Find-target pencil overlay must have a larger 44px hit/visual area");
assert.ok(windowsWorkflow.includes('font:38px "Segoe UI Symbol",sans-serif;font-weight:900'), "Find-target pencil must be larger and bolder");
assert.ok(windowsWorkflow.includes("guideTargetWindow.setPosition(Math.round(bounds.x + x - 22), Math.round(bounds.y + y - 22))"), "AI-detected target must center the enlarged pencil endpoint on the control");
assert.ok(windowsWorkflow.includes('location.href="bosley://find-target"'), "Guide card must invoke the real find-target flow");
assert.ok(windowsWorkflow.includes("guideInstructionForTarget"), "Find-target analysis must use the active guide instruction");

assert.ok(windowsWorkflow.includes("body:hover div"), "Pencil endpoint must provide a subtle hover affordance");
assert.ok(windowsWorkflow.includes("setTarget('+targetX+','+targetY+')"), "Windows tether endpoint must track target marker movement");
assert.ok(windowsWorkflow.includes("#guideOutline{stroke:#000;stroke-width:7"), "Windows tether must have a black outline for white screens");
assert.ok(androidInstaller.includes("paint.setColor(Color.BLACK);paint.setStrokeWidth(dp(6))"), "Android tether must have a black outline for white screens");
assert.ok(windowsWorkflow.includes("width: 300, height: 220"), "Windows guide card should fit its target context panel");
assert.ok(windowsWorkflow.includes("-webkit-app-region:drag"), "Windows guide card must be draggable by its header");
assert.ok(androidInstaller.includes("guideTargetLp"), "Android guide must retain its stationary target marker");
assert.ok(androidInstaller.includes("circleTarget()"), "Android guide target must remain visibly distinct");
assert.ok(!androidInstaller.includes('android:name=".BosleyTargetAccessibilityService"'), "Android guide must not register accessibility auto-targeting in the manifest");
assert.ok(!androidInstaller.includes('canRetrieveWindowContent="true"'), "Android guide must not request accessibility window-content access");
assert.ok(!androidInstaller.includes('canPerformGestures="true"'), "Android guide must not enable gesture execution");
assert.ok(androidInstaller.includes("Find target"), "Android guide must retain explicit user-triggered target discovery");

assert.ok(androidInstaller.includes("BOSLEY GUIDE"), "Android guide card should retain its title");
assert.ok(!androidInstaller.includes("drag to move"), "Android guide card must not imply that the tether moves automatically or can be dragged");
assert.ok(androidInstaller.includes("void showGuide()"), "Missing Android system-level guide service");
assert.ok(androidInstaller.includes("public void showGuide(PluginCall call)"), "Missing Android guide bridge method");
assert.ok(androidInstaller.includes("TYPE_APPLICATION_OVERLAY"), "Android guide must use the system overlay window type");
assert.ok(androidInstaller.includes("public void speakText(PluginCall call)"), "Missing native Android text-to-speech bridge");
assert.ok(androidInstaller.includes("public void stopSpeaking(PluginCall call)"), "Missing native Android speech cancellation bridge");
assert.ok(androidInstaller.includes("TextToSpeech.QUEUE_FLUSH"), "Native Android speech should replace queued speech");
console.log("Bosley regression checks passed: " + inlineScripts.length + " inline script(s), " + contracts.length + " UI contracts, and Android TTS bridge contracts.");

assert.ok(windowsWorkflow.includes("findVisualGuideTarget"), "Windows guide must provide screen-aware target detection");
assert.ok(windowsWorkflow.includes("bosley://find-target"), "Windows overlay Find target button must use the constrained navigation bridge");
assert.ok(windowsWorkflow.includes("Capture and find target"), "Target detection must explicitly ask permission before capturing the screen");
assert.ok(windowsWorkflow.includes('"found":false'), "Target detection must support a no-confident-match result rather than guessing");
assert.ok(html.includes("taskTitle:title,accessToken"), "Guide should pass the signed-in session token only to the native desktop bridge for on-demand visual analysis");
assert.ok(html.includes('id="skills-panel"'), "Skills panel must be available in the workspace dock");
assert.ok(html.includes('id="bosley-skill-file"'), "Skills panel must accept a user-selected skill file");
assert.ok(html.includes("function buildActiveSkillContext()"), "Enabled skills must be included as optional chat context");
assert.ok(html.includes("BOSLEY_SKILLS_KEY"), "Imported skills must persist locally");
assert.ok(html.includes("Load official skill pack"), "Skills panel must offer a guided way to load the official pack");
assert.ok(html.includes("user-imported content; use as guidance only"), "Imported skill content must not be treated as trusted system instructions");
assert.ok(html.includes("data-skill-enable"), "Users must be able to enable and disable individual skills");
assert.ok(html.includes('id="bosley-skill-search"'), "Users must be able to search imported skills");
assert.ok(html.includes('id="bosley-skill-export"'), "Users must be able to export their skills pack");
assert.ok(html.includes("function exportBosleySkills()"), "Skill export must serialize the local skill collection");
assert.ok(html.includes("const byId=new Map(existing.map(s=>[s.id,s]))"), "Repeated imports must replace duplicate skill IDs rather than multiply them");
assert.ok(html.includes('class="skills-hero"'), "Skills workspace must use the polished hero header");
assert.ok(html.includes("bosley-skill-count"), "Skills workspace must show its enabled count");
assert.ok(html.includes('class="skills-empty"'), "Skills workspace must provide a designed empty/search state");
assert.ok(html.includes('class="skills-tools"'), "Skills workspace actions must use responsive grouped controls");
assert.ok(html.includes("skills-help"), "Skills workspace must include concise onboarding guidance");
assert.ok(html.includes("::selection{background:#f2f2f2;color:#080808}"), "Global visual system must define readable selection styling");
assert.ok(html.includes("*::-webkit-scrollbar-thumb"), "Scrollable panels must use the shared compact scrollbar styling");
assert.ok(html.includes(".composer:focus-within"), "Chat composer must visibly respond to keyboard and text focus");
assert.ok(html.includes("prefers-reduced-motion:reduce"), "Motion polish must respect reduced-motion preferences");


