import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.ok(app.includes("async function queueAgentTask"), "Agent workspace must support task delegation.");
assert.ok(app.includes('/functions/v1/remote-action') && app.includes('type: "automation"'), "Delegated tasks must enter the authenticated remote-action queue.");
assert.ok(app.includes("result.listenerOnline") && app.includes("private queue"), "The UI must explain online pickup and offline queue behaviour.");
assert.ok(app.includes('id="agent-task-instruction"') && app.includes('maxLength={2000}'), "Task instructions must have a bounded input.");
assert.ok(app.includes('action: "list"') && app.includes('action: "events"') && app.includes('action, run_id: taskId'), "Task history, progress events, cancellation and retry controls must remain available.");
assert.ok(app.includes('Authorization: `Bearer ${session.access_token}`'), "Task delegation must use the signed-in user's access token.");
assert.ok(styles.includes(".task-compose") && styles.includes(".task-compose-row"), "Task composer must have responsive workspace styling.");

console.log("Agent workspace delegation checks passed.");
