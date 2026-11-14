import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261114000215_add_bosley_scheduled_routines.sql", import.meta.url), "utf8");
const hardening = readFileSync(new URL("../supabase/migrations/20261114000516_harden_bosley_routine_constraints.sql", import.meta.url), "utf8");
for (const marker of ['id="bosley-routines"', 'id="bosley-routine-form"', 'data-routine-run', 'data-routine-toggle', 'data-routine-delete', 'refreshRoutineList', 'routineZone']) {
  assert.ok(html.includes(marker), "Shared web/desktop/mobile app shell must include routine support: " + marker);
}
assert.ok(html.includes('from("bosley_routines")') && html.includes('from("automation_runs").insert'), "Routine CRUD and run-now must use the signed-in account's Supabase records.");
assert.ok(html.includes('summary:"remote_listener_queue:v1"'), "Manual routine runs must use the durable device task queue.");
assert.ok(html.includes('value="app:Spotify"') && html.includes('value="url:https://spotify.com"'), "Routine targets must be restricted to the visible app/site allowlist.");
assert.ok(migration.includes("create table if not exists public.bosley_routines") && migration.includes("for update skip locked") && migration.includes("cron.schedule"), "Database must provide an RLS-owned routine table and concurrency-safe scheduled dispatcher.");
assert.ok(migration.includes("remote_listener_queue:v1") && migration.includes("Open "), "Scheduled actions must enqueue approved open-app/open-site tasks only.");
assert.ok(hardening.includes("pg_timezone_names") && hardening.includes("weekday is not null") && hardening.includes("maximum of 25"), "Routine timezone, weekday and account-count constraints must be enforced.");
assert.ok(app.includes('workspaceTab === "routines"') && app.includes('async function createRoutine') && app.includes('async function changeRoutine'), "React companion must expose the routines workspace and controls.");
assert.ok(app.includes('selectedDay.getDay()') && app.includes('routineWeekday'), "Weekly schedules must honor the selected weekday.");
assert.ok(app.includes('"https://wa.me/"') && app.includes("function buildWhatsAppChatUrl") && app.includes("encodeURIComponent(message.trim())"), "WhatsApp chat links must be generated from a validated international number with safely encoded optional text.");
assert.ok(app.includes("bosley_whatsapp_links") && app.includes("saveWhatsAppContact") && app.includes("openWhatsAppLink"), "WhatsApp chat links must be saved in the signed-in account metadata and reopened from the routines workspace.");
assert.ok(app.includes('"https://open.spotify.com/"') && app.includes('"https://web.whatsapp.com/"'), "Common Spotify and WhatsApp destinations must be available as saved app-opening routines.");
console.log("Bosley scheduled routines checks passed.");
