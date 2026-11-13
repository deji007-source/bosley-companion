import fs from "node:fs";
import assert from "node:assert/strict";

const html = fs.readFileSync("index.html", "utf8");
assert.match(html, /protectedWorkspaceIds=new Set\(\["money-learning","lovable-bosley"\]\)/);
assert.match(html, /id="bosley-access-lock"/);
assert.match(html, /id="bosley-access-code"/);
assert.match(html, /Unlock workspace/);
assert.match(html, /async function show\(id\)[\s\S]*?await requireWorkspacePasscode\(id\)/);
assert.match(html, /b3282a2f2a28757b3a18ab833de16a9c54518c0b0cf493e3f0a7cf09386f326a/);
assert.match(html, /bosley-trading-dock-v2:"\+\(\(user&&user\.id\)\|\|"guest"\)/);
assert.match(html, /bosley_face_settings_v1:"\+\(\(user&&user\.id\)\|\|"guest"\)/);
assert.doesNotMatch(html, /(?:const|let)\s+(?:ACCESS_CODE|PASSCODE)\s*=\s*["']1122["']/);
console.log("Access lock and account-scoped local settings checks passed.");
