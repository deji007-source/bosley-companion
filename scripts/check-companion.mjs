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
assert.ok(androidInstaller.includes('if(!moved&&!longPressed&&System.currentTimeMillis()-down<480)expandPanel();'), "Android floating widget tap must open the native panel instead of launching the app");
assert.ok(androidInstaller.includes("void sendOverlayMessage()"), "Android native floating panel must have its own Send handler");
assert.ok(androidInstaller.includes('/functions/v1/companion-chat'), "Android native Send must call the existing authenticated chat endpoint directly");
assert.ok(androidInstaller.includes('getSharedPreferences("bosley_native_chat"'), "Android overlay must use the app-private session store");
assert.ok(androidInstaller.includes('Authorization","Bearer "+token'), "Android native chat requests must use the signed-in user's access token");
assert.ok(androidInstaller.includes('void syncChatSession(PluginCall call)'), "Capacitor bridge must sync the active signed-in session to the native overlay");
assert.ok(html.includes('native.syncChatSession({accessToken:s?.access_token||"",anonKey:SUPABASE_PUBLIC_KEY,supabaseUrl:SUPABASE_URL})'), "Auth changes must update the native overlay session");


assert.ok(androidInstaller.includes('Math.min(dp(360),getResources().getDisplayMetrics().heightPixels-dp(70))'), "Android floating chat panel must stay compact with a 360dp maximum height");
assert.ok(androidInstaller.includes('shortcutLabels={"AUTOMATION","AGENTS","OPEN APP"}'), "Android overlay must expose direct Automation, Agents and Open App shortcuts");
assert.ok(androidInstaller.includes('app.setText("APP ↗")'), "Android panel header must include a direct full-app launcher");
assert.ok(androidInstaller.includes('if(chatPanel!=null){try{wm.removeView(chatPanel);}catch(Exception ignored){}chatPanel=null;}Intent a=new Intent(BosleyOverlayService.this,MainActivity.class)'), "Opening the full app must dismiss the expanded overlay panel first");
assert.ok(androidInstaller.includes('shortcutActions={"automation","providers","panel"}'), "Android shortcuts must map to app views");
assert.ok(html.includes('["panel","voice","automation","providers","skills","plugins","screen-record","capture-screen"].includes(action)'), "Native quick-action bridge must accept automation and provider views");
assert.ok(html.includes('action==="providers"||action==="plugins"?"provider-panel":"skills-panel"'), "Native shortcut routing must open the selected automation or provider view");
assert.ok(html.includes('data-open-view="provider-panel" aria-label="Open Agents and AI connections"'), "Side dock must expose Agents and Connections directly");
assert.ok(html.includes("Agents & Connections"), "Provider manager must be presented as the Agents and Connections control centre");

assert.ok(androidInstaller.includes('Switch voiceInputToggle=new Switch(this)')||androidInstaller.includes('voiceInputToggle=new Switch(this)'), "Floating panel must include an on/off microphone control");
assert.ok(androidInstaller.includes('voiceReplyToggle=new Switch(this)'), "Floating panel must include a spoken-replies toggle");
assert.ok(androidInstaller.includes('putBoolean("voice_input_enabled",checked)'), "Microphone preference must persist across panel reopen/restart");
assert.ok(androidInstaller.includes('putBoolean("voice_replies_enabled",checked)'), "Spoken-replies preference must persist");
assert.ok(androidInstaller.includes('if(!checked)stopOverlayVoice()'), "Turning voice input off must stop any active recognition session");
assert.ok(androidInstaller.includes('voiceReply||getSharedPreferences("bosley_overlay_preferences",MODE_PRIVATE).getBoolean("voice_replies_enabled",false)'), "Voice reply preference must control text-to-speech output");
assert.ok(androidInstaller.includes('toolRows={{"▣  SCREEN RECORD","▧  CAPTURE SCREEN","⚙  AUTOMATION"},{"✦  AGENTS","⌘  SKILLS","＋  PLUGINS"}}'), "Android plus toolbox must expose recording, capture, automation, agents, skills, and plugins");
assert.ok(androidInstaller.includes('plus.setText("＋")') && androidInstaller.includes('Open Bosley tools'), "Android composer must expose an accessible plus toolbox toggle");
assert.ok(androidInstaller.includes('BosleyScreenRecordingService.java'), "Android installer must generate the native screen recording service");
assert.ok(androidInstaller.includes('recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264)'), "Screen recording must encode a local MP4 video");
assert.ok(androidInstaller.includes('FOREGROUND_SERVICE_MEDIA_PROJECTION'), "Screen recording must declare the media-projection foreground service permission");
assert.ok(androidInstaller.includes('requestScreenRecording(PluginCall call)'), "Android plugin must request explicit screen recording consent");
assert.ok(androidInstaller.includes('syncAgentPreference(PluginCall call)'), "Android plugin must sync the selected agent provider to native chat");
assert.ok(androidInstaller.includes('prefs.getString("selected_provider","")'), "Native overlay chat must use the selected AI provider");
assert.ok(androidInstaller.includes('prefs.getString("chat_history","[]")'), "Android floating chat must retain a short conversation context");
assert.ok(androidInstaller.includes('putString("chat_history",messages.toString())'), "Android floating chat must persist assistant replies for follow-up turns");
assert.ok(androidInstaller.includes('/functions/v1/agent-gateway'), "Native overlay chat must call the authenticated agent gateway when a provider is selected");
assert.ok(html.includes('plugin.requestScreenRecording()'), "Screen recording action must be initiated from the Android app after user consent");
assert.ok(html.includes('syncAgentPreference?.({provider:select.value||""})'), "Provider selection must sync to the Android floating panel");


const contracts = [
  ["Enabled Skills can resolve only to existing saved workflows", "function resolveSkillWorkflowCommand(raw)"],
  ["Automation Skill master switch is respected", "if(!settings.enabled)return {status:\"none\"}"],
  ["Automation skill status distinguishes an empty selection", "No skills selected. Imported skills will not be used for automation guidance."],
  ["Automation skill status distinguishes the default all-enabled selection", "skillSettings.ids===null?\"All enabled skills can guide Bosley when preparing automation requests.\""],
  ["Disabled Skills cannot be selected for workflow routing", "readBosleySkills().filter(skill=>skill.enabled&&(settings.ids===null||settings.ids.includes(skill.id)))"],
  ["Skills link workflows through explicit workflow metadata", "workflowLine=content.match"],
  ["Skills triggers require exact normalized phrase matches", "triggers.includes(command)"],
  ["Ambiguous Skill triggers stop without executing", "skillResolution.status===\"ambiguous\""],
  ["Unlinked Skills explain the saved-workflow requirement", "skillResolution.status===\"unlinked\""],
  ["Skill routing reuses the saved workflow execution path", "skillResolution.status===\"match\"?skillResolution.workflow:findWorkflowCommand(t)"],
  ["Automation cloud query is account scoped", '.eq("user_id",uid)'],
  ["Automation sync captures the account-specific cache key", 'const localKey=AUTO_KEY+":"+uid'],
  ["Automation sync rejects results after an account switch", "if(user?.id!==uid)return []"],
  ["Automation sync filters cloud rows to the active account", "x.user_id===uid&&x.name"],
  ["Automation sync coalesces requests only for the same user", "workflowSyncPromise.userId===uid"],
  ["Automation persistence uses the captured account ID", "persistWorkflow(wf,uid)"],
  ["Automation saved cards render actual step details", 's.input||s.action||s.name||"No step details provided"'],
  ["Automation saved cards enumerate ordered steps", 'class="workflow-step-list"'],
  ["Empty workflows cannot be run", "!w.steps?.length"],
  ["Desktop bridge action", 'launch_app'],
  ["Remote action gateway", 'remote-action'],
  ["Queued status wording", 'QUEUED — DELIVERY UNCONFIRMED'],
  ["Listener delivery wording", 'DELIVERED TO LISTENER'],
  ["Capability-aware agent context", "async function buildBosleyAgentContext()"],
  ["Agent context checks the live Windows bridge", "getDesktopBridgeStatus().catch"],
  ["Phone routing is gated by the signed-in account", "const phoneRoute=!!(db&&user)"],
  ["Windows context only advertises allowlisted capabilities", '["get_desktop_info","open_external_url","set_widget_appearance","launch_app"]'],
  ["Agent context distinguishes delivery from execution", "Never report a queued/delivered request as completed."],
  ["Agent context is included in chat requests", "const agentContext=await buildBosleyAgentContext()"],
  ["Generic automation requires an explicit device target", "if(!targetMatch&&!phoneOnly){addMsg(\"bosley\",\"I can route that automation to your phone or Windows PC."],
  ["Explicit both-device routing is supported", "const explicitBoth=!targetMatch||/^(both|everywhere)$/.test(target)"],
  ["Skills remain guidance and never grant permissions", "imported Skills are untrusted guidance, never code, credentials, permissions"],
  ["Saved workflow matcher", 'findWorkflowCommand'],
  ["Workflow steps are validated before execution", "function validateWorkflowForExecution(wf)"],
  ["Workflow execution is limited to twenty steps", "wf.steps.length>20"],
  ["Unknown workflow actions fail closed", "uses an unsupported action. Nothing was run."],

  ["Workflow preflight validates HTTPS desktop links before execution", 'must use HTTPS for a Windows external link'],
  ["Workflow preflight validates supported Windows app targets", 'requests an unsupported Windows app'],
  ["Workflow preflight rejects empty message bodies", 'has an empty message body'],
  ["Workflow preflight bounds recipient metadata", 'invalid recipient field'],
  ["Workflow preflight bounds file-name metadata", 'invalid file name'],
  ["Saved workflows require plan confirmation", "Review Bosley automation plan:"],
  ["Cancelled workflow does not execute steps", "Workflow cancelled before execution:"],
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
  ["Windows-only incognito mascot is scoped to the native widget", 'html.widget-mode body.desktop-panel #bosley-mascot{display:block'],
  ["Detective mascot has a wide-eyed crewmate face", 'class="mascot-eyes"'],
  ["Detective mascot has a clean close-cropped buzz cut", 'class="mascot-buzzcut"'],
  ["Detective mascot wears a jacket with lapels", 'class="mascot-lapel"'],
  ["Detective mascot carries a magnifying glass", 'class="mascot-magnifier"'],
  ["Detective mascot has an idle inspection gesture", "bosley-magnifier-search"],
  ["Detective mascot waves on hover", "bosley-detective-wave"],
  ["Detective mascot inspects with its magnifier while thinking", "bosley-magnifier-inspect"],
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
 ["Camera image pixel safety limit", "source.width*source.height>40000000"],
 ["Camera bitmap cleanup on every path", "finally{source?.close?.()}"],
 ["Camera image encoding validation", 'prepared==="data:,"'],
  ["Cross-device appearance and voice settings sync", "async function syncCompanionSettings()"],
  ["Account-scoped widget preference storage", 'from("user_widget_layouts")'],
  ["Widget preference sync preserves existing layout data", "bosley_companion_settings:chosen"],
  ["Widget preference sync uses authenticated account", "sessionData?.session?.user?.id!==uid"],
  ["Widget preference sync rechecks account before writing", "writeSession?.session?.user?.id!==uid||user?.id!==uid"],
  ["Widget preference conflict resolution uses timestamps", "remoteTime>local.updatedAt"],
  ["Cloud-restored appearance values are validated", "function normalizeFaceSettings(value={})"],
  ["Cloud-restored appearance refreshes visible controls", "function syncFaceSettingsControls(v)"],
  ["Remote preference restore refreshes form and voice selector", "syncFaceSettingsControls(chosen.appearance)"],
  ["Synced widget dimensions reject unsupported values", '["compact","default","wide"].includes(v.widgetSize)'],

  ["Appearance changes schedule cloud sync", "scheduleCompanionSettingsSync()"],
  ["Voice profile changes schedule cloud sync", 'localStorage.setItem("bosley_voice_profile",voiceProfile)}catch{};scheduleCompanionSettingsSync()'],
  ["Account sign-in restores companion preferences", "syncPlannerTasks();syncCompanionSettings()"],
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
assert.ok(windowsWorkflow.includes("compact: { width: 220, height: 16 }"), "Compact rendered widget height must match its native window");
assert.ok(windowsWorkflow.includes("default: { width: 260, height: 18 }"), "Default rendered widget height must match its native window");
assert.ok(windowsWorkflow.includes("wide: { width: 300, height: 20 }"), "Wide rendered widget height must match its native window");
assert.ok(windowsWorkflow.includes("raw.split(/\\r?\\n/)"), "Find-target must split SSE responses on actual newline characters");
assert.ok(windowsWorkflow.includes("Some gateway configurations return a single JSON response instead of SSE."), "Find-target must support non-streaming JSON responses too");
assert.ok(windowsWorkflow.includes("packet.choices?.[0]?.message?.content"), "Find-target must parse ordinary chat-completion JSON payloads");
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
assert.ok(html.includes("const stopWords=new Set(["), "Knowledge graph must filter generic stop words before creating links");
assert.ok(html.includes('x.length>=6'), "Knowledge graph must require a meaningful long keyword or multiple shared terms");
assert.ok(html.includes("edges:edges.slice(0,160)"), "Knowledge graph relationship generation must remain bounded");
assert.ok(html.includes("edges.sort((a,b)=>b.score-a.score"), "Knowledge graph must prioritize stronger keyword relationships");
console.log("Bosley regression checks passed: " + inlineScripts.length + " inline script(s), " + contracts.length + " UI contracts, and Android TTS bridge contracts.");

assert.ok(windowsWorkflow.includes("findVisualGuideTarget"), "Windows guide must provide screen-aware target detection");
assert.ok(windowsWorkflow.includes("bosley://find-target"), "Windows overlay Find target button must use the constrained navigation bridge");
assert.ok(windowsWorkflow.includes("Capture and find target"), "Target detection must explicitly ask permission before capturing the screen");
assert.ok(windowsWorkflow.includes('"found":false'), "Target detection must support a no-confident-match result rather than guessing");
assert.ok(html.includes("taskTitle:title,accessToken"), "Guide should pass the signed-in session token only to the native desktop bridge for on-demand visual analysis");
assert.ok(html.includes('id="skills-panel"'), "Skills panel must be available in the workspace dock");
assert.ok(html.includes('id="bosley-skill-file"'), "Skills panel must accept a user-selected skill file");
assert.ok(html.includes('id="bosley-skill-drop" role="button" tabindex="0"'), "Workspace skills dropzone must be keyboard accessible");
assert.ok(html.includes("Accepted: .json, .md, .markdown, .txt"), "Workspace skills intake must list supported formats");
assert.ok(html.includes('drop.addEventListener("drop"'), "Workspace skills intake must support drag and drop");
assert.ok(html.includes('if(!/\\.(json|md|markdown|txt)$/i.test(file.name))'), "Workspace skills intake must validate ordinary filename extensions");
assert.ok(!html.includes('if(!/\\\\.(json|md|markdown|txt)$/i.test(file.name))'), "Workspace skills intake must not require a literal backslash in the filename");
assert.ok(html.includes("file.size>100000"), "Workspace skills intake must enforce the 100 KB limit");
assert.ok(html.includes("function buildActiveSkillContext()"), "Enabled skills must be included as optional chat context");
assert.ok(html.includes('id="context-engine-enabled"'), "Context Engine must be explicitly opt-in");
assert.ok(html.includes("function buildContextEngineContext()"), "Context Engine must build task-aware chat context");
assert.ok(html.includes('id="handoff-save"'), "Planner must expose an explicit handoff save action");
assert.ok(html.includes('id="handoff-restore"'), "Planner must expose an explicit handoff restore action");
assert.ok(html.includes("function saveHandoffSnapshot()"), "Handoff must capture a bounded task snapshot");
assert.ok(html.includes("function restoreHandoffSnapshot()"), "Handoff must restore a saved task snapshot");
assert.ok(html.includes("bosley_handoff:snapshot"), "Handoff snapshot must sync through the authenticated user layout");
assert.ok(html.includes("buildHandoffContext()"), "Restored handoff must be available to the opt-in Context Engine");
assert.ok(html.includes("!tasks.length&&!events.length&&!handoff"), "Handoff-only snapshots must be included even when no current tasks or activity exist");
assert.ok(html.includes("BOSLEY_HANDOFF_KEY"), "Handoff must retain a local fallback");
assert.ok(html.includes('id="workflow-record-start"'), "Automation workspace must expose an explicit workflow recorder start control");
assert.ok(html.includes('id="workflow-record-finish"'), "Automation workspace must expose a workflow recorder save control");
assert.ok(html.includes("let workflowRecording=false,workflowRecordedSteps=[];"), "Workflow recorder must maintain an explicit in-session step buffer");
assert.ok(html.includes("workflowRecordedSteps.push(step)"), "Workflow recorder must capture only steps explicitly added through the form");
assert.ok(html.includes("no background activity is captured"), "Workflow recorder must disclose that it does not monitor other apps");
assert.ok(html.includes("wf.steps.push(...workflowRecordedSteps)"), "Workflow recorder must save captured steps into reusable workflows");


assert.ok(html.includes('id="offline-queue-panel"'), "Activity workspace must expose the offline command draft queue");
assert.ok(html.includes("BOSLEY_OFFLINE_QUEUE_KEY"), "Offline command drafts must have a dedicated local storage key");
assert.ok(html.includes("function readOfflineCommandQueue()"), "Offline command queue must safely parse stored drafts");
assert.ok(html.includes('id="offline-import-local"'), "Offline queue must expose an explicit import control for pre-sign-in drafts");
assert.ok(html.includes('function readLocalOfflineCommandDrafts()'), "Pre-sign-in drafts must be read from the isolated local queue");
assert.ok(html.includes('function importLocalOfflineCommandDrafts()'), "Local draft import must be a deliberate user action");
assert.ok(html.includes('if(!user?.id){addMsg("bosley","Sign in before importing local drafts.'), "Local drafts must not be imported into an anonymous or other account queue");
assert.ok(html.includes('Nothing will be sent or executed.'), "Import confirmation must state that importing does not execute commands");
assert.ok(html.includes('localStorage.removeItem(BOSLEY_OFFLINE_QUEUE_KEY+":local")'), "Local drafts must be cleared only after account-queue save succeeds");
assert.ok(html.includes("const merged=[...current],remaining=[];let imported=0"), "Offline import must track capacity and retain unimported drafts");
assert.ok(html.includes('if(merged.length>=30){remaining.push(draft);continue}'), "A full account queue must not cause local drafts to be dropped");
assert.ok(html.includes('if(remaining.length)localStorage.setItem(BOSLEY_OFFLINE_QUEUE_KEY+":local",JSON.stringify(remaining))'), "Drafts that do not fit must remain in the local queue");
assert.ok(html.includes('No command was sent.'), "Draft import must not imply that commands were sent");
assert.ok(html.includes("renderOfflineCommandQueue();startLaptopCommandListener(user)"), "Initial auth restoration must refresh the account-scoped offline queue");
assert.ok(html.includes("renderAuthGate();renderOfflineCommandQueue();startLaptopCommandListener(user)"), "Sign-in and sign-out transitions must refresh the account-scoped offline queue");
assert.ok(html.includes("function queueOfflineCommandDraft(instruction)"), "Failed offline automation requests must be saved as drafts");
assert.ok(html.includes("function reviewAndSendOfflineDraft(id)"), "Offline drafts must require an explicit review-and-send action");
assert.ok(html.includes('data-offline-send="'), "Offline drafts must expose an explicit send control");
assert.ok(html.includes("if(!navigator.onLine)"), "Offline drafts must not be sent while the browser is offline");
assert.ok(html.includes('confirm("Send this automation request to your connected device?'), "Sending an offline draft must require confirmation");
assert.ok(html.includes("They are never executed automatically when you reconnect."), "Offline reconnect must never auto-execute queued commands");
assert.ok(html.includes('id="knowledge-search"'), "Activity workspace must expose local knowledge graph search");
assert.ok(html.includes('id="knowledge-items"'), "Activity workspace must expose local knowledge graph results");
assert.ok(html.includes("function buildBosleyKnowledgeGraph()"), "Knowledge graph must derive relationships from local workspace data");
assert.ok(html.includes("function renderBosleyKnowledgeGraph()"), "Knowledge graph must render searchable local relationships");
assert.ok(html.includes("graph.edges.filter(e=>e.a===n.key||e.b===n.key)"), "Knowledge graph must resolve edges using collision-safe composite node keys");
assert.ok(html.includes('data-knowledge-query="'), "Knowledge graph relationships must expose navigable linked-item controls");
assert.ok(html.includes('event.target?.closest?.("[data-knowledge-query]")'), "Selecting a graph relationship must focus the related item through local search");
assert.ok(html.includes('search.value=link.dataset.knowledgeQuery||""'), "Knowledge graph navigation must filter to the selected related item");
assert.ok(html.includes("BOSLEY_KNOWLEDGE_GRAPH_VERSION"), "Knowledge graph must be versioned");
assert.ok(html.includes('LOCAL ONLY'), "Knowledge graph must disclose that its index remains local");
assert.ok(html.includes('if(typeof renderBosleyKnowledgeGraph==="function")renderBosleyKnowledgeGraph()'), "Planner and memory changes must refresh the local knowledge graph");
assert.ok(html.includes("BOSLEY_CONTEXT_ENGINE_KEY"), "Context Engine preference must persist locally");
assert.ok(html.includes("Active planner tasks:"), "Context Engine must include active planner tasks when enabled");
assert.ok(html.includes("Recent Bosley activity:"), "Context Engine must include bounded recent activity when enabled");
assert.ok(html.includes("not background screen or microphone monitoring"), "Context Engine UI must disclose its privacy boundary");
assert.ok(html.includes("buildContextEngineContext()].filter(Boolean)"), "Chat must include Context Engine data only when enabled");

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



assert.ok(html.includes('id="workflow-step-timeline"'), "Automation must expose a live step-by-step agent timeline");
assert.ok(html.includes("activityEvent(\"Plan approved: \"+wf.name"), "Approved plans must appear in recent workspace activity");
assert.ok(html.includes("activityEvent(\"Running step \""), "Running workflow steps must appear in the activity timeline");
assert.ok(html.includes("activityEvent(\"Completed step \""), "Completed workflow steps must be recorded");
assert.ok(html.includes("function setBosleyCompanionState(state)"), "Agent state changes must be centralized");
assert.ok(html.includes("bosley-teleport-in"), "Bosley must animate into view with a teleport-style arrival");
assert.ok(html.includes("bosley-lock-focus"), "Bosley must use a focused lock-in animation while thinking or working");
assert.ok(html.includes("agent-response-phase"), "Chat responses must expose a live agent phase indicator");
assert.ok(html.includes("Checking skills and available actions"), "Agent phase must show its capability review stage");
assert.ok(html.includes("Composing your response"), "Agent phase must transition when response generation starts");
assert.ok(html.includes("Response ready"), "Agent phase must show a distinct successful completion state");
assert.ok(html.includes("Could not complete"), "Agent phase must expose failures instead of silently resetting");
assert.ok(html.includes("agentTrackSweep"), "Agent response progress indicator must animate");
assert.ok(html.includes("Agent plan created: "+'"+instruction+"'), "Conversational automation must create an activity plan before routing");
assert.ok(html.includes("Agent route status: "+'"+result.target+"'), "Automation route outcomes must be visible in activity history");
assert.ok(html.includes('data-step-state="pending"'), "Each planned workflow step must begin in an explicit pending state");
assert.ok(html.includes("item.dataset.stepState=state"), "Workflow steps must update to their live execution state");
assert.ok(html.includes('id="agent-provider"'), "Automation must expose selectable AI providers");
assert.ok(html.includes("function dispatchAgentHandoffCommand(raw)"), "Chat must route send-to-provider commands into the handoff flow");
assert.ok(html.includes("dispatchAgentHandoffCommand(text)"), "Agent handoff routing must run before ordinary AI chat fallback");

assert.ok(html.includes('id="agent-chat-mode"'), "AI handoff must let users choose a new or existing conversation");
assert.ok(html.includes('id="agent-chat-url"'), "Continuing an existing provider conversation must require its exact URL");
assert.ok(html.includes('bosley_agent_handoff_v1'), "AI handoffs must retain a local resumable handoff record");
assert.ok(html.includes('w.location.href=target'), "AI handoff must open the selected provider after preparing the prompt");
assert.ok(html.includes('Provider submission remains under your control'), "AI handoff must not claim the external provider submitted a prompt");
assert.ok(html.includes('{value:"notify_phone",label:"Send phone notification (MacroDroid)"}'), "Phone notification must be a reusable cross-platform workflow action");
assert.ok(html.includes('if(step.type==="notify_phone")'), "Phone notification workflow action must execute through the authenticated bridge");
assert.ok(html.includes('functions/v1/macrodroid-bridge-'), "Phone notification action must use the shared authenticated MacroDroid bridge");
assert.ok(html.includes('Phone notifications are limited to 160 characters'), "Phone notifications must enforce the bridge's input limit");
assert.ok(html.includes('Desktop bridge unavailable'), "Windows-only desktop steps must fail clearly on platforms without the native bridge");


assert.ok(html.includes("mascot-buzzcut"), "Bosley must have a neat close-cropped buzz cut instead of a hat");
assert.ok(html.includes("M32 41Q31 17 60 17 89 17 88 41"), "Bosley face silhouette must use a rounder head shape");
assert.ok(!html.includes("mascot-hat"), "The Windows mascot must not render a hat");
assert.ok(!html.includes('class="hat"'), "The collapsed launcher must not render a hat");
assert.ok(!html.includes('id="hatstyle"'), "Appearance settings must no longer expose a hat control");

assert.ok(html.includes("mascot-mouth-closed"), "Bosley must retain a clean neutral mouth line");
assert.ok(html.includes("mascot-mouth-open"), "Bosley must have a separate open-mouth speaking shape");
assert.ok(html.includes("bosley-mouth-talk"), "Bosley mouth must animate while speaking");
assert.ok(html.includes("data-state=speaking]:not([data-mouth-sync=true])"), "Native speech must retain a speaking-mouth fallback");
assert.ok(html.includes("data-mouth=open"), "Speech boundary events must drive the mouth shape");
assert.ok(html.includes("u.onboundary="), "Browser speech must synchronize mouth movement to utterance boundaries");
assert.ok(html.includes("function finishBosleySpeech()"), "Speech completion must always reset Bosley's speaking state");
assert.ok(html.includes("Promise.resolve(nativeVoice.speakText"), "Native Android speech must share the speaking lifecycle");
assert.ok(html.includes("data-state=listening] #bosley-mascot .mascot-eye"), "Listening state must visibly change Bosley's eyes");
assert.ok(html.includes("mascot-brow"), "Bosley must have expressive eyebrows");
assert.ok(html.includes("bosley-eye-blink"), "Bosley must blink naturally");
assert.ok(html.includes("data-state=waiting] #bosley-mascot .mascot-eyes"), "Waiting state must visibly shift Bosley's gaze");
assert.ok(html.includes("data-state=working] #bosley-mascot .mascot-eye"), "Working state must use a focused eye expression");
assert.ok(html.includes("data-state=success] #bosley-mascot .mascot-mouth-closed"), "Success state must use a distinct positive mouth expression");
assert.ok(html.includes("data-state=error] #bosley-mascot .mascot-eyes"), "Error state must visibly alter Bosley's expression");
assert.ok(html.includes("data-state=walk] #bosley-mascot"), "Walk state must animate Bosley's movement");
assert.ok(html.includes("bosley-mascot-success"), "Success state must provide a short completion animation");
assert.ok(html.includes("bosley-mascot-error"), "Error state must provide a restrained error cue");
assert.ok(html.includes("bosley-magnifier-wait"), "Waiting state must animate the magnifier subtly");
assert.ok(html.includes("launch[data-state=walk] #bosley-mascot,html.widget-mode"), "Walk animation must respect reduced-motion settings");

assert.ok(html.includes("function executeDirectChatAction(step,label)"), "Everyday actions must be executable directly from the chat command router");
assert.ok(html.includes('type:"open_url",input:m[1]'), "Chat must open explicit website URLs without visiting Automation");
assert.ok(html.includes('type:"search_web",input:m[1]'), "Chat must run web searches without visiting Automation");
assert.ok(html.includes('type:"create_text_file",name,input:content'), "Chat must create and download named text files");
assert.ok(html.includes('type:"draft_message",recipient,input:body,draftOnly:true'), "Chat must create message drafts without sending them");
assert.ok(html.includes('if(step.draftOnly){'), "Direct message drafts must never trigger the send-message bridge");
assert.ok(html.includes('type:"desktop_action",action:"get_desktop_info"'), "Chat must expose the desktop status bridge action");
assert.ok(html.includes('type:"desktop_action",action:"set_widget_appearance"'), "Chat must expose the widget appearance bridge action");
assert.ok(html.includes("Chat action result:"), "Direct chat actions must record their result in workspace activity");

assert.ok(!html.includes('<section class="bosley-presence"'), "Main panel must not repeat the mascot eye/avatar header");
assert.ok(html.includes(".top{min-height:42px;padding:6px 12px"), "Panel top bar must remain slim and compact");
assert.ok(html.includes("bosley-orbit"), "Holographic companion rings must animate");
assert.ok(html.includes('id="remote-mode-card" hidden'), "Remote Mode card must be available near the top of the panel");
assert.ok(html.includes("bosley-mascot-teleport"), "Floating Bosley widget must use the teleport arrival animation");
assert.ok(html.includes("width:min(900px,calc(100vw - 24px))"), "The Companion panel must open as a spacious assistant workspace");
assert.ok(html.includes("width:min(1240px,calc(100vw - 24px))"), "Maximized Companion must support a wide desktop workspace");
assert.ok(html.includes("prefers-reduced-motion:reduce){html.bosley-arrive .launch #bosley-mascot"), "Mascot motion must respect reduced-motion preferences");
assert.ok(html.includes('data-open-view="lovable-bosley"'), "Side dock must expose the hosted Lovable Bosley page");
assert.ok(html.includes('id="lovable-bosley"'), "Companion must provide a dedicated hosted Lovable Bosley dock section");
assert.ok(html.includes("https://jarvis-mark85.lovable.app/home"), "Hosted viewer must point at the requested Jarvis Bosley deployment");
assert.ok((html.match(/initAndroidRemoteMode\s*\(/g)||[]).length>=2, "Android Remote Mode initializer must actually be invoked, not only declared");
assert.ok(html.includes('card.dataset.mode=remoteModeEnabled?"on":"off"'), "Remote Mode must expose its current ON/OFF state on the card");
assert.ok(html.includes('button.textContent=remoteModeEnabled?"ON":"OFF"'), "Remote Mode switch must visibly label ON and OFF");
assert.ok(html.includes("@media(max-width:600px)"), "Companion layouts must adapt to phone-sized screens");
assert.ok(html.includes("#dock-body{min-height:0;overflow:auto"), "Dock content must remain scrollable within the available height");
assert.ok(html.includes("min-height:0;min-width:0"), "Hosted workspace iframe must flex to fit its resizable dock");
assert.ok(html.includes('class="lovable-viewer-frame"'), "Hosted Lovable Bosley must render in an interactive embedded browser frame");
assert.ok(html.includes('allow="microphone; camera; clipboard-read; clipboard-write; autoplay; fullscreen"'), "Hosted app frame must request browser capabilities used by voice and interaction UI");
assert.ok(html.includes("Open separately"), "Hosted app must provide a browser fallback for embedding or authentication restrictions");
assert.ok(html.includes("initLovableBosleyViewer"), "Lovable viewer must initialize when its dock page is opened");
assert.ok(html.includes("bosley-side-dock-position"), "Windows side dock position must persist after dragging");
assert.ok(html.includes(".holo-face i{width:12px;height:18px"), "Bosley presence avatar must use two large, wide eyes");
assert.ok(html.includes(".holo-face{width:54px;height:50px"), "Bosley face must be sized to support the larger paired eyes");
assert.ok(html.includes("#side-dock .dock-tabs button.on{border-color:#eee;background:#eee;color:#050505"), "Side dock selected tabs must use the monochrome theme");
assert.ok(html.includes("#side-dock .dock-body input,#side-dock .dock-body textarea,#side-dock .dock-body select"), "Side dock form controls must use the monochrome theme");
assert.ok(html.includes(".holo-face i{width:12px;height:18px"), "Bosley presence avatar must use two large, wide eyes");
assert.ok(html.includes(".holo-face{width:54px;height:50px"), "Bosley face must be sized to support the larger paired eyes");
assert.ok(html.includes("#side-dock .dock-tabs button.on{border-color:#eee;background:#eee;color:#050505"), "Side dock selected tabs must use the monochrome theme");
assert.ok(html.includes("#side-dock .dock-body input,#side-dock .dock-body textarea,#side-dock .dock-body select"), "Side dock form controls must use the monochrome theme");
assert.ok(html.includes("body.desktop-panel #side-dock{left:12px;right:auto;top:12px"), "Windows side dock must open on the left side of the display");
assert.ok(html.includes('handle?.addEventListener("pointermove"'), "Windows side dock must remain movable by dragging its header");

assert.ok(html.includes("body.desktop-panel .desktop-view-window{position:fixed"), "Windows side views must open as independent floating windows");
assert.ok(html.includes("const desktopCards=new Map()"), "Windows floating views must maintain multiple open pages independently");
assert.ok(html.includes("desktopCards.has(x.panel)"), "Windows side navigation must preserve already-open cards");
assert.ok(html.includes("desktopCards.delete(v.panel);p.hidden=true;body.appendChild(p);card.remove()"), "Closing one Windows floating card must leave the other cards open");
assert.ok(html.includes("html.widget-mode body.desktop-panel #side-dock:not([hidden])"), "Windows side navigation must stay in a compact left rail");
assert.ok(html.includes("width:min(350px,calc(100vw - 24px));height:min(420px,calc(100dvh - 92px))"), "Windows floating cards must stay compact");
assert.ok(html.includes('setAttribute("aria-label","Close "+v.label)'), "Windows floating cards must expose individual close controls");
assert.ok(html.includes("desktop-view-window-header"), "Windows floating cards must have draggable headers");
assert.ok(html.includes("Each page opens in its own floating window"), "Windows dock must explain independent floating windows");


assert.ok(html.includes(".holo-face i{display:block;flex:0 0 17px;width:17px;height:17px"), "Bosley presence eyes must be large true circles, not ovals");
assert.ok(html.includes("border-radius:50%;background:#fff"), "Bosley presence eyes must retain a circular silhouette");
assert.ok(html.includes("@keyframes bosley-holo-teleport"), "Holographic Bosley must have a teleport-style arrival animation");
assert.ok(html.includes("@keyframes bosley-holo-float"), "Holographic avatar must have subtle idle movement");

assert.ok(html.includes('<circle class="mascot-eye" cx="49" cy="46" r="9"/><circle class="mascot-eye" cx="71" cy="46" r="9"/>'), "Main Bosley mascot must render two large circular eyes");

assert.ok(html.includes('id="remote-mode-card" hidden'), "Remote Mode control must be hidden by default");
assert.ok(html.includes('window.BosleyAndroidBridge||window.AndroidBridge'), "Remote Mode must detect supported native Android bridge runtimes");
assert.ok(html.includes('id="remote-mode-toggle"'), "Android first page must expose a readily accessible Remote Mode toggle");
assert.ok(html.includes('REMOTE_MODE_KEY="bosley_android_remote_mode_v1"'), "Remote Mode preference must persist on Android");
assert.ok(html.includes('db.from("device_status").select("last_seen")'), "Remote Mode must verify the Windows listener heartbeat");
assert.ok(html.includes('db.functions.invoke("remote-action",{body:{type:"automation",instruction}})'), "Remote Mode must use the authenticated automation gateway");
assert.ok(html.includes('if(await routeRemoteVoiceToLaptop(spoken))return;'), "Native Android voice must respect Remote Mode before local execution");
assert.ok(html.includes('data.listenerNotified!==true'), "Remote Mode must not claim delivery without listener confirmation");

assert.ok(html.includes('action:"open_external_url",payload:{url:url.href}'), "Windows listener must support safe remote website opening");
assert.ok(html.includes('https://www.google.com/search?q="+encodeURIComponent(search[1].trim())'), "Windows listener must support remote web searches");
assert.ok(html.includes('action:"get_desktop_info",payload:{}'), "Windows listener must support remote desktop status queries");


assert.ok(html.includes('id="provider-panel"'), "AI Provider Manager must have a dedicated workspace panel");
assert.ok(html.includes('panel:"provider-panel",label:"AI Providers"'), "AI Providers must be accessible from the side dock");
assert.ok(html.includes("renderBosleyProviderManager"), "AI Provider Manager renderer must be registered");
assert.ok(html.includes('action:"providers"'), "AI Provider Manager must load connected provider status");
assert.ok(html.includes('action:"connect"'), "AI Provider Manager must securely connect a provider");
assert.ok(html.includes('action:"test"'), "AI Provider Manager must test provider connections");
assert.ok(html.includes('action:"disconnect"'), "AI Provider Manager must disconnect providers");
assert.ok(html.includes('localStorage.setItem(BOSLEY_PROVIDER_PREF,select.value)'), "Selected provider preference must persist on the device");
assert.ok(html.includes("AGENT_GATEWAY_URL"), "Provider requests must use the authenticated gateway");
assert.ok(html.includes('action:"chat",provider:chosenProvider'), "Selected provider must handle new text chats");
assert.ok(html.includes("if(chosenProvider&&!imageData)"), "Image requests must continue using the existing image-capable Companion route");


const overlayInstaller = readFileSync("scripts/install-android-overlay.py", "utf8");
assert.ok(overlayInstaller.includes('startOverlayVoice();'), "Floating widget long-press must start direct overlay voice capture");
assert.ok(overlayInstaller.includes('SpeechRecognizer.createSpeechRecognizer(this)'), "Overlay must support native speech recognition without opening the app");
assert.ok(overlayInstaller.includes('chatVoice.setOnClickListener(v->{if(voiceInputEnabled)startOverlayVoice();'), "Floating panel must expose an immediate circular voice control");
assert.ok(overlayInstaller.includes('routeOverlayCommand(message,token,anon,base)'), "Overlay sends must pass through command routing before chat");
assert.ok(overlayInstaller.includes('"/functions/v1/remote-action"'), "Overlay automations must use the existing authenticated automation backend");
assert.ok(overlayInstaller.includes('phone?"phone":"automation"'), "Overlay must preserve phone/MacroDroid and laptop automation routing");
assert.ok(overlayInstaller.includes('if(answer==null)'), "Ordinary chat must fall back to the Companion AI chat endpoint");
assert.ok(overlayInstaller.includes('speakOverlayText(result)'), "Voice-originated commands must receive spoken responses");
assert.ok(overlayInstaller.includes('android.speech.RecognitionService'), "Android manifest must declare speech recognition service visibility");

assert.ok(overlayInstaller.includes('if(chatPanel==null)expandPanel(false);'), "Long-press voice must create the native panel before using its composer");

assert.ok(overlayInstaller.includes('bosley_overlay_position'), "Floating widget position must persist across service restarts");
