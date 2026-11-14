import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
assert.ok(app.includes('className={`push-to-talk-button') && app.includes('onPointerDown=') && app.includes('onPointerUp='), "Companion must support hold-to-talk with press and release.");
assert.ok(app.includes('onPointerCancel=') && app.includes('onPointerLeave='), "Hold-to-talk must stop when pointer interaction is cancelled or leaves the control.");
assert.ok(app.includes('onKeyDown=') && app.includes('onKeyUp='), "Hold-to-talk must be operable from keyboard.");
assert.ok(css.includes(".push-to-talk-button") && css.includes("touch-action:none"), "Push-to-talk control must prevent accidental touch scrolling while held.");
console.log("Bosley push-to-talk checks passed.");
