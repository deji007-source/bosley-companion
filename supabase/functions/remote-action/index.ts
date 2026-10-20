import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function authenticatedUser(req: Request) {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const { data, error } = await authClient.auth.getUser(match[1]);
  return error ? null : data.user;
}
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

async function notifyLaptopListener(userId: string, instruction: string): Promise<boolean> {
  const channel = sb.channel(\`bosley-laptop-\${userId}\`);
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
  if (body.type === "automation") {
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction || instruction.length > 2000) return new Response(JSON.stringify({ ok: false, error: "Instruction must be 1–2000 characters." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const { error } = await sb.from("automation_runs").insert({ user_id: user.id, instruction, status: "pending" });
    if (error) return new Response(JSON.stringify({ ok: false, error: "Could not queue automation." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    const listenerNotified = await notifyLaptopListener(user.id, instruction);
    return new Response(JSON.stringify({ ok: true, queued: true, listenerNotified, delivery: listenerNotified ? "broadcast_sent" : "queued_listener_not_notified" }), { headers: { ...cors, "Content-Type": "application/json" } });
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
