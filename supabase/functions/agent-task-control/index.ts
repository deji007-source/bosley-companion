import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
async function currentUser(req: Request) {
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await auth.auth.getUser(token);
  return error ? null : data.user;
}
async function addEvent(userId: string, runId: string, eventType: string, message: string, details: Record<string, unknown> = {}) {
  const { error } = await db.from("automation_run_events").insert({ user_id: userId, run_id: runId, event_type: eventType, message: message.slice(0, 1000), details });
  if (error) throw error;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ ok: false, error: "Method not allowed." }, 405);
  const user = await currentUser(req);
  if (!user) return reply({ ok: false, error: "Sign-in required." }, 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ ok: false, error: "Invalid JSON body." }, 400); }
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "list") {
    const limit = Math.max(1, Math.min(50, Number(body.limit) || 25));
    const { data, error } = await db.from("automation_runs").select("id,instruction,status,summary,steps,created_at,updated_at,finished_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
    if (error) return reply({ ok: false, error: "Could not load your task history." }, 500);
    return reply({ ok: true, tasks: data ?? [] });
  }
  const runId = typeof body.run_id === "string" ? body.run_id : "";
  if (!runId || runId.length > 64) return reply({ ok: false, error: "A valid run_id is required." }, 400);
  const { data: run, error: readError } = await db.from("automation_runs").select("id,user_id,instruction,status,summary,steps,created_at").eq("id", runId).eq("user_id", user.id).maybeSingle();
  if (readError) return reply({ ok: false, error: "Could not read the task." }, 500);
  if (!run) return reply({ ok: false, error: "Task not found." }, 404);
  if (action === "events") {
    const { data, error } = await db.from("automation_run_events").select("id,event_type,message,details,created_at").eq("run_id", run.id).eq("user_id", user.id).order("created_at", { ascending: true }).limit(200);
    if (error) return reply({ ok: false, error: "Could not load task events." }, 500);
    return reply({ ok: true, events: data ?? [] });
  }
  if (action === "progress") {
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 1000) return reply({ ok: false, error: "Progress message must be 1–1000 characters." }, 400);
    if (run.status !== "processing") return reply({ ok: false, error: "Only a running task can receive progress updates." }, 409);
    try { await addEvent(user.id, run.id, "progress", message, body.details && typeof body.details === "object" ? body.details as Record<string, unknown> : {}); return reply({ ok: true }); }
    catch (error) { console.error("Task progress event failed:", error); return reply({ ok: false, error: "Could not save task progress." }, 500); }
  }
  if (action === "cancel") {
    if (!["pending", "processing"].includes(run.status)) return reply({ ok: false, error: "Only pending or running tasks can be cancelled." }, 409);
    const now = new Date().toISOString();
    const { data: updated, error } = await db.from("automation_runs").update({ status: "cancelled", summary: "Cancelled by the account owner.", finished_at: now, updated_at: now }).eq("id", run.id).eq("user_id", user.id).in("status", ["pending", "processing"]).select("id,status").maybeSingle();
    if (error || !updated) return reply({ ok: false, error: "Task changed before cancellation; refresh and try again." }, 409);
    try { await addEvent(user.id, run.id, "cancelled", "Task cancelled by you."); } catch (eventError) { console.error("Cancellation event write failed:", eventError); }
    return reply({ ok: true, task: updated, note: "Cancellation recorded. An already-running local action may need to finish its current safe step." });
  }
  if (action === "retry") {
    if (!["failed", "cancelled"].includes(run.status)) return reply({ ok: false, error: "Only failed or cancelled tasks can be retried." }, 409);
    if (run.summary !== "remote_listener_queue:v1") return reply({ ok: false, error: "This task type cannot be retried from the task inbox." }, 400);
    const { data: created, error } = await db.from("automation_runs").insert({ user_id: user.id, instruction: run.instruction, status: "pending", summary: "remote_listener_queue:v1", steps: [] }).select("id,status,instruction,created_at").single();
    if (error || !created) return reply({ ok: false, error: "Could not create a retry." }, 500);
    try { await addEvent(user.id, created.id, "retried", "Retry created from an earlier task.", { source_run_id: run.id }); await addEvent(user.id, run.id, "retried", "A new retry was created.", { retry_run_id: created.id }); } catch (eventError) { console.error("Retry event write failed:", eventError); }
    return reply({ ok: true, task: created });
  }
  return reply({ ok: false, error: "Unsupported action." }, 400);
});