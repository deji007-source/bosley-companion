import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_PUSH_SECRET = Deno.env.get("INTERNAL_PUSH_SECRET") || "";
const authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function authenticatedUser(req: Request) {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const { data, error } = await authClient.auth.getUser(match[1]);
  return error ? null : data.user;
}
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

async function notifyLaptopListener(userId: string, instruction: string, runId: string): Promise<boolean> {
  const channel = sb.channel("bosley-laptop-" + userId);
  try {
    const status = await channel.send({ type: "broadcast", event: "automation", payload: { instruction, run_id: runId } });
    return status === "ok";
  } catch (error) {
    console.error("Laptop Listener broadcast failed:", error);
    return false;
  } finally {
    await sb.removeChannel(channel);
  }
}


// Authenticated command submission. The caller can only queue work for their own account.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  const user = await authenticatedUser(req);
  if (!user) return new Response(JSON.stringify({ ok: false, error: "Sign-in required." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }
  if (body.type === "listener_heartbeat") {
    const { error } = await sb.from("device_status").upsert({
      user_id: user.id,
      device: "bosley-laptop-listener",
      last_seen: new Date().toISOString(),
    }, { onConflict: "user_id,device" });
    if (error) {
      console.error("Laptop listener heartbeat write failed:", error);
      return new Response(JSON.stringify({ ok: false, online: false, error: "Could not update listener status." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, online: true, last_seen: new Date().toISOString() }), { headers: { ...cors, "Content-Type": "application/json" } });
  } else if (body.type === "automation_result") {
    const runId = typeof body.run_id === "string" ? body.run_id : "";
    const status = body.status === "completed" ? "done" : body.status === "failed" ? "failed" : "";
    const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 500) : "";
    if (!runId || !status) return new Response(JSON.stringify({ ok: false, error: "A valid run ID and terminal status are required." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const { data, error } = await sb.from("automation_runs").update({ status, summary: summary || (status === "done" ? "Desktop execution confirmed." : "Desktop execution failed."), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", runId).eq("user_id", user.id).in("status", ["pending", "queued", "running"]).select("id").maybeSingle();
    if (error) {
      console.error("Automation result update failed:", error);
      return new Response(JSON.stringify({ ok: false, error: "Could not save execution result." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (!data?.id) return new Response(JSON.stringify({ ok: false, error: "Run not found, not owned by this account, or already finalized." }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, status }), { headers: { ...cors, "Content-Type": "application/json" } });
  } else if (body.type === "phone") {
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction || instruction.length > 2000) return new Response(JSON.stringify({ ok: false, error: "Instruction must be 1–2000 characters." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    if (!INTERNAL_PUSH_SECRET) return new Response(JSON.stringify({ ok: false, telegramNotified: false, telegramDetail: "Telegram trigger is not configured on the server." }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
    try {
      const pushed = await fetch(SUPABASE_URL + "/functions/v1/push-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_PUSH_SECRET },
        body: JSON.stringify({ user_id: user.id, instruction }),
        signal: AbortSignal.timeout(8000),
      });
      const detail = (await pushed.text()).trim();
      const telegramNotified = pushed.ok && detail === "ok";
      return new Response(JSON.stringify({ ok: telegramNotified, telegramNotified, telegramDetail: telegramNotified ? "Telegram trigger accepted." : detail.slice(0, 200) || "Telegram trigger rejected." }), { status: telegramNotified ? 200 : 502, headers: { ...cors, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, telegramNotified: false, telegramDetail: "Telegram trigger request failed: " + String((e as Error)?.message || e).slice(0, 120) }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
  } else if (body.type === "automation") {
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction || instruction.length > 2000) return new Response(JSON.stringify({ ok: false, error: "Instruction must be 1–2000 characters." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const { data: queued, error } = await sb.from("automation_runs").insert({ user_id: user.id, instruction, status: "pending" }).select("id").single();
    if (error || !queued?.id) return new Response(JSON.stringify({ ok: false, error: "Could not queue automation." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    // Attempt both connected execution paths. Telegram delivery is optional and never
    // blocks the durable laptop queue if the trigger bot isn't configured/linked.
    const listenerNotified = await notifyLaptopListener(user.id, instruction, queued.id);
    let telegramNotified = false;
    let telegramDetail = "Telegram trigger not configured on the server.";
    if (INTERNAL_PUSH_SECRET) {
      try {
        const pushed = await fetch(SUPABASE_URL + "/functions/v1/push-automation", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_PUSH_SECRET },
          body: JSON.stringify({ user_id: user.id, instruction }),
          signal: AbortSignal.timeout(8000),
        });
        const detail = (await pushed.text()).trim();
        telegramNotified = pushed.ok && detail === "ok";
        telegramDetail = telegramNotified ? "Telegram trigger accepted." : detail.slice(0, 160) || "Telegram trigger rejected.";
      } catch (e) {
        telegramDetail = "Telegram trigger request failed: " + String((e as Error)?.message || e).slice(0, 120);
      }
    }
    return new Response(JSON.stringify({
      ok: true, queued: true, id: queued.id,
      listenerNotified, telegramNotified, telegramDetail,
      delivery: listenerNotified ? "broadcast_sent" : "queued_listener_not_notified",
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } else if (body.type === "os") {
    const action = typeof body.action === "string" ? body.action : "";
    const allowed = new Set(["move_window", "switch_desktop", "focus_window", "minimize_window", "maximize_window", "click_text", "type_text"]);
    if (!allowed.has(action)) return new Response(JSON.stringify({ ok: false, error: "Unsupported OS action." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const target = body.target == null ? null : String(body.target).slice(0, 200);
    const param = body.param == null ? null : String(body.param).slice(0, 1000);
    const { error } = await sb.from("os_commands").insert({ user_id: user.id, action, target, param, status: "pending" });
    if (error) return new Response(JSON.stringify({ ok: false, error: "Could not queue OS command." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  } else {
    return new Response(JSON.stringify({ ok: false, error: "Unsupported request type." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
});
