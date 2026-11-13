import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function userFor(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await auth.auth.getUser(token);
  return error ? null : data.user;
}
async function event(runId: string, userId: string, type: string, message: string, progress: number | null = null, metadata = {}) {
  const { error } = await db.from("automation_run_events").insert({
    run_id: runId, user_id: userId, event_type: type,
    message: message.slice(0, 1200), progress, metadata
  });
  if (error) throw error;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  const user = await userFor(req);
  if (!user) return json({ ok: false, error: "Sign-in required." }, 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body." }, 400); }
  const action = typeof body.action === "string" ? body.action : "list";
  try {
    if (action === "list") {
      const limit = Math.min(100, Math.max(1, Number(body.limit) || 40));
      const { data, error } = await db.from("automation_runs")
        .select("id,instruction,status,summary,steps,created_at,updated_at,finished_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      const ids = (data ?? []).map(x => x.id);
      let events: unknown[] = [];
      if (ids.length) {
        const result = await db.from("automation_run_events")
          .select("id,run_id,event_type,message,progress,metadata,created_at")
          .eq("user_id", user.id).in("run_id", ids).order("created_at", { ascending: true }).limit(1000);
        if (result.error) throw result.error;
        events = result.data ?? [];
      }
      return json({ ok: true, tasks: data ?? [], events });
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return json({ ok: false, error: "A task id is required." }, 400);
    const { data: run, error: readError } = await db.from("automation_runs")
      .select("id,user_id,instruction,status,summary,steps")
      .eq("id", id).eq("user_id", user.id).maybeSingle();
    if (readError) throw readError;
    if (!run) return json({ ok: false, error: "Task not found." }, 404);

    if (action === "cancel") {
      if (!["pending", "processing"].includes(run.status)) return json({ ok: false, error: "Only queued or running tasks can be cancelled." }, 409);
      const now = new Date().toISOString();
      const { data, error } = await db.from("automation_runs").update({
        status: "cancelled", summary: "Cancelled by the account owner.", finished_at: now, updated_at: now
      }).eq("id", id).eq("user_id", user.id).in("status", ["pending", "processing"])
        .select("id,status,updated_at").maybeSingle();
      if (error) throw error;
      if (!data) return json({ ok: false, error: "Task changed before cancellation; refresh and try again." }, 409);
      await event(id, user.id, "cancelled", "Task cancelled by the account owner.");
      return json({ ok: true, task: data });
    }

    if (action === "retry") {
      if (!["failed", "cancelled"].includes(run.status)) return json({ ok: false, error: "Only failed or cancelled tasks can be retried." }, 409);
      const { data, error } = await db.from("automation_runs").insert({
        user_id: user.id, instruction: run.instruction, status: "pending",
        summary: "remote_listener_queue:v1", steps: []
      }).select("id,status,created_at").single();
      if (error) throw error;
      await event(data.id, user.id, "retried", "Task queued as a new attempt.", 0, { retry_of: id });
      return json({ ok: true, task: data, retry_of: id }, 201);
    }

    if (action === "progress") {
      const message = typeof body.message === "string" ? body.message.trim() : "";
      const progress = body.progress == null ? null : Number(body.progress);
      const type = typeof body.event_type === "string" ? body.event_type : "progress";
      if (!message || message.length > 1200 || (progress !== null && (!Number.isInteger(progress) || progress < 0 || progress > 100)) ||
          !["progress", "checkpoint", "completed", "failed"].includes(type)) {
        return json({ ok: false, error: "Invalid progress event." }, 400);
      }
      if (["completed", "failed"].includes(type) && !["pending", "processing"].includes(run.status)) {
        return json({ ok: false, error: "Task is already in a terminal state." }, 409);
      }
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (type === "completed" || type === "failed") {
        update.status = type;
        update.summary = message.slice(0, 500);
        update.finished_at = new Date().toISOString();
      } else if (run.status === "pending") update.status = "processing";
      const { data, error } = await db.from("automation_runs").update(update)
        .eq("id", id).eq("user_id", user.id).select("id,status,updated_at").single();
      if (error) throw error;
      await event(id, user.id, type, message, progress);
      return json({ ok: true, task: data });
    }
    return json({ ok: false, error: "Unsupported task action." }, 400);
  } catch (error) {
    console.error("agent-tasks failed:", error);
    return json({ ok: false, error: "The task request could not be completed." }, 500);
  }
});
