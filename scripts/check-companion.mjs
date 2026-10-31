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
  ["Enabled Skills can resolve only to existing saved workflows", "function resolveSkillWorkflowCommand(raw)"],
  ["Automation Skill master switch is respected", "if(!settings.enabled)return {status:\"none\"}"],
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
  ["Detective mascot wears a hat", 'class="mascot-hat"'],
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
assert.ok(html.includes("markdown|txt)$/i.test(file.name)"), "Workspace skills intake must reject unsupported extensions");
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
assert.ok(html.includes("Agent plan created: "+'"+instruction+"'), "Conversational automation must create an activity plan before routing");
assert.ok(html.includes("Agent route status: "+'"+result.target+"'), "Automation route outcomes must be visible in activity history");
assert.ok(html.includes('data-step-state="pending"'), "Each planned workflow step must begin in an explicit pending state");
assert.ok(html.includes("item.dataset.stepState=state"), "Workflow steps must update to their live execution state");
