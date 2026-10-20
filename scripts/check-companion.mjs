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
  ["Automation panel includes concise saved workflow help", /workflow-help[\s\S]*Run \\[saved name\\][\s\S]*Saved workflows are checked before general chat/],
  ["Mobile panel leaves room for chat and composer", /@media\\(max-width:520px\\)[\\s\\S]*height:calc\\(100dvh - 24px\\)[\\s\\S]*workflow-help\\{display:none\\}/],
  ["Saved workflow matching accepts use and routine phrasing", /function findWorkflowCommand\\(raw\\)[\\s\\S]*use\\|begin[\\s\\S]*matches.length===1\\?matches\\[0\\]:null/],
  ["Saved workflow commands tolerate polite natural language", /function normalizeWorkflowCommand\(value\)[\s\S]*kindly[\s\S]*function findWorkflowCommand\(raw\)[\s\S]*stripIntent/],
  ["Saved workflow commands refresh before matching", /await syncWorkflows\(\)[\s\S]*dispatchAutomationCommand\(text\)/],
  ["Saved workflow execution reports runner outcome", /await runWorkflow\(saved\)[\s\S]*Completed saved automation:/],
  ["Voice profile control persists changes", /voiceprofile[\s\S]*addEventListener\("change"/],
  ["Voice selection reports actual device voice", /function getVoiceStatus\\(\\)[\\s\\S]*Selected voice:/],
  ["Voice selection prioritizes available English voices", /const english=voices\\.filter/],
  ["System voice profile respects device language", /voiceProfile==="system"&&navigator\\.language/],
  ["Voice speech language follows selected voice", /u\\.lang=selected\\?\\.lang/],
  ["Native desktop action route", /action\s*:\s*["']launch_app["']/],
  ["Allowlisted Windows app launch commands", /notepad\\|calculator\\|file explorer/],
  ["Native bridge limits app launch to fixed allowlist", /const apps = \\{[\\s\\S]*?chrome:[\\s\\S]*?edge:[\\s\\S]*?notepad:[\\s\\S]*?calculator:[\\s\\S]*?explorer:/],
  ["Native app launch requires explicit consent", /Allow Bosley to launch '\\s*\\+ target\\.label/],
  ["Desktop action accepts approved app aliases", /const aliases=\\{\\"google chrome\\":\\"chrome\\",\\"microsoft edge\\":\\"edge\\"/],
  ["Shared remote-action gateway", /functions\.invoke\(["']remote-action["']/],
  ["Queued is not reported as executed", /execution is not yet confirmed/i],
  ["Listener delivery feedback", /data\.listenerNotified===true/],
  ["Music next-track route", /play next song on /],
  ["Automation failure feedback", /Automation queue failed:/],
  ["Automation execution history is account-scoped", /function automationHistoryKey\\(\\)[\\s\\S]*user\\?\\.id\\|\\|"guest"/],
  ["Automation history persists across refresh", /function autoLog\\(status,message\\)[\\s\\S]*localStorage\\.setItem\\(automationHistoryKey\\(\\)/],
  ["Automation history can be cleared", /clear-auto-log[\\s\\S]*localStorage\\.removeItem\\(automationHistoryKey\\(\\)/],
  ["Desktop app capabilities are described accurately", /launch approved apps \\(Chrome, Edge, Notepad, Calculator, and File Explorer\\)/],
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
