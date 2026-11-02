import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("supabase/functions/agent-dispatch/index.ts", "utf8");
assert.ok(source.includes('operation === "register"'), "Devices must be able to register.");
assert.ok(source.includes('operation === "heartbeat"'), "Devices must be able to report presence.");
assert.ok(source.includes('operation === "dispatch"'), "Bosley must be able to route a command to a device.");
assert.ok(source.includes('operation === "claim"'), "A device must explicitly claim queued work.");
assert.ok(source.includes('operation === "complete"'), "A device must acknowledge execution.");
assert.ok(source.includes('auth.auth.getUser'), "Every operation must require a verified Supabase user.");
assert.ok(source.includes('.eq("user_id", user.id)'), "Device and command access must be scoped to the signed-in user.");
assert.ok(source.includes('new Set(["show_notification", "open_app", "sync_status"])'), "Only supported device command types may be queued.");
assert.ok(source.includes('status: "queued"'), "Dispatch must not claim that a command has executed.");
assert.ok(source.includes('status: "claimed"'), "Claiming must be separate from successful execution.");
assert.ok(source.includes('outcome === "failed" ? "failed" : "completed"'), "Devices must report their actual execution outcome.");
assert.ok(source.includes('No recently connected " + platform + " device advertises " + commandType'), "Unavailable device capabilities must fail clearly.");
console.log("Bosley universal device dispatch checks passed.");
