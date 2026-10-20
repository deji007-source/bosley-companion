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
  ["Queued is not reported as executed", /execution is not yet confirmed/i],
  ["Listener delivery feedback", /data\.listenerNotified===true/],
  ["Music next-track route", /play next song on /],
  ["Automation failure feedback", /Automation queue failed:/],
  ["Bosley persona and dry humour instructions", /lightly witty British-style butler tone/],
  ["Jarvis voice uses measured en-GB speech", /u\.lang="en-GB".*u\.rate=voiceProfile==="jarvis"\?0\.88/s],
  ["Native bridge opens website shortcuts", /action:"open_external_url",input:url/],
  ["Automation confirmations speak aloud", /addMsg\("bosley",confirmation\);speak\(confirmation\)/],
  ["Web app shortcuts", /youtube:"https:\/\/www\.youtube\.com\/"/],
  ["Saved workflow command matching", /function findWorkflowCommand\(raw\)[\s\S]*normalizeWorkflowCommand\(w\.name\)===candidate/],
  ["Saved workflow commands run before AI chat fallback", /await syncWorkflows\(\)[\s\S]*dispatchAutomationCommand\(text\)/],
  ["Saved workflow completion is reported after execution", /await runWorkflow\(saved\)[\s\S]*Completed saved automation:/],
  ["Website command aliases", /(?:open|go\\s+to|visit|launch)\\s+(?:youtube|google|gmail|spotify|github|whatsapp|telegram)/],
  ["Website command accepts Chrome suffix", /using\\s+(?:google\\s+)?chrome/],
  ["Appearance reset restores panel dimensions", /facereset[\\s\\S]*panelwidth[\\s\\S]*panelheight/],
  ["Appearance reset restores text scale", /facereset[\\s\\S]*textscalevalue/],
  ["Voice profile tuning", /u\.pitch=voiceProfile==="jarvis"\?0\.72:1/],
  ["Panel hides the web launcher", /body\.panel-open:not\(\.desktop-panel\) \.stage\{display:none!important\}/],
  ["Native launcher hidden in panel window", /html\.widget-mode \.stage\{display:none!important\}/],
  ["Native panel size follows UI dimensions", /syncNativePanelSize\(v\)[\s\S]*action:"set_panel_size",payload:\{width:Number\(v\.panelWidth\)[\s\S]*topAligned:true/],
  ["Native panel size action is allowlisted", /actions: \[[^\]]*set_panel_size/],
  ["Mobile panel layout keeps top bezel and usable width", /@media\(max-width:520px\)[\s\S]*\.panel\{width:calc\(100vw - 8px\)!important;height:min\(var\(--panel-height\),100dvh\)!important/],
  ["Short screens keep composer reachable", /@media\(max-height:520px\)[\s\S]*\.chat\{min-height:48px\}/],
  ["Reduced-motion preference respected", /@media\(prefers-reduced-motion:reduce\)[\s\S]*\.panel\{animation:none!important/],
  ["Composer remains fixed in flex layout", /\.composer\{flex-shrink:0\}/],
  ["Adjustable panel width", /id="panelwidth" type="range" min="340" max="620"/],
  ["Adjustable panel height", /id="panelheight" type="range" min="420" max="760"/],
  ["Panel dimensions persist and apply live", /--panel-width[\s\S]*--panel-height[\s\S]*localStorage\.setItem\(FACE_KEY,JSON\.stringify\(live\)\)/],
  ["Editable panel text size control", /id="textscale" type="range" min="85" max="130"/],
  ["Text size changes apply and save immediately", /textscalevalue[\s\S]*localStorage\.setItem\(FACE_KEY,JSON\.stringify\(live\)\)/],
  ["Morning Mode quick action", /data-prompt="morning"/],
  ["Morning Mode avoids invented live facts", /Do not invent calendar events, weather, news, or completed actions/],
  ["Day planning quick action", /data-prompt="plan"/],
  ["Focus session quick action", /data-prompt="focus"/],
  ["Humour quick action", /data-prompt="joke"/],
  ["Sharper collapsed widget corners", /\.launch\{[^}]*border-radius:2px/],
  ["Larger signature widget eyes", /\.launch \.eye\{width:27px;height:39px\}/],
  ["Panel utilities use one-at-a-time accordion", /function openUtilityPanel\(which\)/],
  ["Panel stays attached to top bezel", /\.panel\{position:fixed;left:50%;top:0/],
  ["Top-bezel web panel", /\.panel\{position:fixed;left:50%;top:0/],
];

for (const [label, pattern] of requiredContracts) {
  assert.match(html, pattern, "Missing required contract: " + label);
}

console.log("Bosley regression checks passed: " + inlineScripts.length + " inline script(s), " + requiredContracts.length + " contracts.");
