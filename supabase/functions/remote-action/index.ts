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

async function writeRunEvent(runId: string, userId: string, eventType: string, message: string) {
  const { error } = await sb.from("automation_run_events").insert({
    run_id: runId, user_id: userId, event_type: eventType, message: message.slice(0, 1200)
  });
  if (error) console.error("Automation run event write failed:", error);
}

async function notifyLaptopListener(userId: string, instruction: string): Promise<boolean> {
  const channel = sb.channel("bosley-laptop-" + userId);
  try {
    const status = await channel.send({ type: "broadcast", event: "automation", payload: { instruction } });
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
  if (body.type === "listener_status") {
    const { data, error } = await sb.from("device_status")
      .select("last_seen")
      .eq("user_id", user.id)
      .eq("device", "bosley-laptop-listener")
      .maybeSingle();
    if (error) {
      console.error("Laptop listener status check failed:", error);
      return new Response(JSON.stringify({ ok: false, error: "Could not verify the Windows listener." }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const seen = data?.last_seen ? new Date(data.last_seen).getTime() : 0;
    const online = Number.isFinite(seen) && seen > 0 && Date.now() - seen < 90000;
    return new Response(JSON.stringify({ ok: true, online, last_seen: data?.last_seen ?? null }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (body.type === "listener_heartbeat") {
    const { error } = await sb.from("device_status").upsert({
      user_id: user.id,
      device: "bosley-laptop-listener",
      last_seen: new Date().toISOString(),
    }, { onConflict: "user_id,device" });
    if (error) {
      console.error("Laptop listener heartbeat failed:", error);
      return new Response(JSON.stringify({ ok: false, error: "Could not register the Windows listener." }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, last_seen: new Date().toISOString() }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (body.type === "listener_poll") {
    // Recover a command whose Windows listener crashed or disconnected mid-run.
    // The two-minute lease is longer than normal UI actions and short enough to retry.
    const staleBefore = new Date(Date.now() - 120000).toISOString();
    const { error: reclaimError } = await sb.from("automation_runs")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "processing")
      .eq("summary", "remote_listener_queue:v1")
      .lt("updated_at", staleBefore);
    if (reclaimError) {
      console.error("Stale laptop command recovery failed:", reclaimError);
      return new Response(JSON.stringify({ ok: false, error: "Could not recover interrupted laptop commands." }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data: pending, error: pendingError } = await sb.from("automation_runs")
      .select("id, instruction")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .eq("summary", "remote_listener_queue:v1")
      .order("created_at", { ascending: true })
      .limit(5);
    if (pendingError) {
      console.error("Laptop command queue read failed:", pendingError);
      return new Response(JSON.stringify({ ok: false, error: "Could not read the laptop command queue." }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!pending?.length) return new Response(JSON.stringify({ ok: true, commands: [] }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
    const ids = pending.map((command) => command.id);
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await sb.from("automation_runs")
      .update({ status: "processing", updated_at: now })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .eq("summary", "remote_listener_queue:v1")
      .in("id", ids)
      .select("id, instruction");
    if (claimError) {
      console.error("Laptop command claim failed:", claimError);
      return new Response(JSON.stringify({ ok: false, error: "Could not claim laptop commands." }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, commands: claimed ?? [] }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (body.type === "listener_ack") {
    const id = typeof body.id === "string" ? body.id : "";
    const status = body.status === "done" ? "completed" : body.status === "failed" ? "failed" : "";
    const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 500) : "";
    if (!id || !status) return new Response(JSON.stringify({ ok: false, error: "A command id and terminal status are required." }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
    const now = new Date().toISOString();
    const { data: acknowledged, error: ackError } = await sb.from("automation_runs")
      .update({ status, summary: summary || (status === "completed" ? "Windows listener completed the command." : "Windows listener could not complete the command."), finished_at: now, updated_at: now })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "processing")
      .select("id, status")
      .maybeSingle();
    if (ackError || !acknowledged) return new Response(JSON.stringify({ ok: false, error: "The command could not be acknowledged." }), {
      status: 409, headers: { ...cors, "Content-Type": "application/json" },
    });
    await writeRunEvent(id, user.id, status === "completed" ? "completed" : "failed", summary || (status === "completed" ? "Windows listener completed the task." : "Windows listener reported a failure."));
    return new Response(JSON.stringify({ ok: true, command: acknowledged }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (body.type === "automation") {
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction || instruction.length > 2000) return new Response(JSON.stringify({ ok: false, error: "Instruction must be 1–2000 characters." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const { data: queued, error } = await sb.from("automation_runs").insert({ user_id: user.id, instruction, status: "pending", summary: "remote_listener_queue:v1" }).select("id").single();
    if (error || !queued?.id) return new Response(JSON.stringify({ ok: false, error: "Could not queue automation." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    await writeRunEvent(queued.id, user.id, "created", "Task added to the private Windows agent queue.");
    // The durable Windows queue is authoritative. Telegram delivery remains optional
    // and never blocks command pickup if the trigger bot is not configured or linked.
    const { data: heartbeat } = await sb.from("device_status").select("last_seen")
      .eq("user_id", user.id).eq("device", "bosley-laptop-listener").maybeSingle();
    const lastSeen = heartbeat?.last_seen ? new Date(heartbeat.last_seen).getTime() : 0;
    const listenerOnline = Number.isFinite(lastSeen) && lastSeen > 0 && Date.now() - lastSeen < 90000;
    // Durable queue polling is authoritative; Realtime broadcasts are intentionally
    // not treated as delivery because a successful broadcast can have zero recipients.
    const listenerNotified = false;
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
      listenerNotified, listenerOnline, telegramNotified, telegramDetail,
      delivery: listenerOnline ? "queued_for_laptop_poll" : "queued_laptop_offline",
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } else if (body.type === "phone") {
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction || instruction.length > 2000) return new Response(JSON.stringify({ ok: false, error: "Instruction must be 1–2000 characters." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    if (!INTERNAL_PUSH_SECRET) return new Response(JSON.stringify({ ok: false, telegramNotified: false, telegramDetail: "The Telegram-to-phone trigger is not configured on the server." }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
    try {
      const pushed = await fetch(SUPABASE_URL + "/functions/v1/push-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_PUSH_SECRET },
        body: JSON.stringify({ user_id: user.id, instruction }),
        signal: AbortSignal.timeout(8000),
      });
      const detail = (await pushed.text()).trim();
      const telegramNotified = pushed.ok && detail === "ok";
      return new Response(JSON.stringify({
        ok: telegramNotified, telegramNotified,
        telegramDetail: telegramNotified ? "Telegram trigger accepted." : detail.slice(0, 160) || "Telegram trigger rejected.",
      }), { status: telegramNotified ? 200 : 502, headers: { ...cors, "Content-Type": "application/json" } });
    } catch (error) {
      console.error("Phone automation push failed:", error);
      return new Response(JSON.stringify({ ok: false, telegramNotified: false, telegramDetail: "Phone trigger request failed." }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
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
