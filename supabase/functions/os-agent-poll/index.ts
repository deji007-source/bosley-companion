import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_PUSH_SECRET") || "";
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  if (!INTERNAL_SECRET || req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (!userId) return json({ ok: false, error: "user_id is required" }, 400);

  if (body.action === "ack") {
    const commandId = typeof body.command_id === "string" ? body.command_id : "";
    const claimToken = typeof body.claim_token === "string" ? body.claim_token : "";
    const status = body.status === "done" ? "done" : body.status === "failed" ? "failed" : "";
    const result = typeof body.result === "string" ? body.result.trim().slice(0, 500) : "";
    if (!commandId || !claimToken || !status) {
      return json({ ok: false, error: "command_id, claim_token and a terminal status are required" }, 400);
    }
    const now = new Date().toISOString();
    const { data, error } = await sb.from("os_commands")
      .update({ status, result: result || (status === "done" ? "Desktop agent confirmed execution." : "Desktop agent reported failure."), processed_at: now, updated_at: now })
      .eq("id", commandId).eq("user_id", userId).eq("status", "processing")
      .eq("claim_token", claimToken).select("id,status").maybeSingle();
    if (error) {
      console.error("OS command acknowledgement failed:", error);
      return json({ ok: false, error: "Could not save command result" }, 500);
    }
    if (!data) return json({ ok: false, error: "Command claim expired, was already acknowledged, or does not belong to this agent" }, 409);
    return json({ ok: true, command_id: data.id, status: data.status });
  }

  const staleBefore = new Date(Date.now() - 120_000).toISOString();
  const { error: reclaimError } = await sb.from("os_commands")
    .update({ status: "pending", claimed_at: null, claim_token: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("status", "processing").lt("claimed_at", staleBefore);
  if (reclaimError) {
    console.error("Could not reclaim expired OS command claims:", reclaimError);
    return json({ ok: false, error: "Could not refresh command queue" }, 500);
  }

  const { data: hb } = await sb.from("device_status").select("last_seen")
    .eq("user_id", userId).eq("device", "os-agent").maybeSingle();
  if (!hb || Date.now() - new Date(hb.last_seen).getTime() > 20_000) {
    const { error: heartbeatError } = await sb.from("device_status")
      .upsert({ user_id: userId, device: "os-agent", last_seen: new Date().toISOString() }, { onConflict: "user_id,device" });
    if (heartbeatError) console.error("OS agent heartbeat update failed:", heartbeatError);
  }

  const { data: pending, error: pendingError } = await sb.from("os_commands")
    .select("id, action, target, param")
    .eq("user_id", userId).eq("status", "pending")
    .order("created_at", { ascending: true }).limit(20);
  if (pendingError) {
    console.error("OS command queue read failed:", pendingError);
    return json({ ok: false, error: "Could not read command queue" }, 500);
  }
  if (!pending?.length) return json({ ok: true, commands: [] });

  const ids = pending.map((command) => command.id);
  const claimToken = crypto.randomUUID();
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await sb.from("os_commands")
    .update({ status: "processing", claimed_at: claimedAt, claim_token: claimToken, updated_at: claimedAt })
    .eq("user_id", userId).eq("status", "pending").in("id", ids)
    .select("id, action, target, param");
  if (claimError) {
    console.error("OS command claim failed:", claimError);
    return json({ ok: false, error: "Could not claim commands" }, 500);
  }

  return json({ ok: true, commands: (claimed ?? []).map((command) => ({ ...command, claim_token: claimToken })) });
});
