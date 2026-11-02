import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const auth = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const commandTypes = new Set(["show_notification", "open_app", "sync_status"]);
const platforms = new Set(["android", "windows", "web"]);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function getUser(req: Request) {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const { data, error } = await auth.auth.getUser(match[1]);
  return error ? null : data.user;
}

function validObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  const user = await getUser(req);
  if (!user) return json({ ok: false, error: "Sign-in required." }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!validObject(parsed)) return json({ ok: false, error: "A JSON object is required." }, 400);
    body = parsed;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const operation = body.operation;

  if (operation === "register") {
    const platform = String(body.platform || "");
    const label = typeof body.device_label === "string" ? body.device_label.trim() : "Bosley device";
    const version = typeof body.app_version === "string" ? body.app_version.slice(0, 40) : null;
    const capabilities = Array.isArray(body.capabilities)
      ? [...new Set(body.capabilities.filter((item): item is string =>
          typeof item === "string" && commandTypes.has(item)))].slice(0, 10)
      : [];

    if (!platforms.has(platform)) return json({ ok: false, error: "Unsupported platform." }, 400);
    if (!label || label.length > 80) return json({ ok: false, error: "Device label must be 1–80 characters." }, 400);

    const { data: existing, error: lookupError } = await admin
      .from("agent_devices")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", platform)
      .eq("device_label", label)
      .maybeSingle();
    if (lookupError) return json({ ok: false, error: "Could not look up this device." }, 500);

    const values = {
      user_id: user.id,
      platform,
      device_label: label,
      app_version: version,
      capabilities,
      status: "online",
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const write = existing?.id
      ? await admin.from("agent_devices").update(values).eq("id", existing.id).eq("user_id", user.id).select("id, platform, device_label, capabilities, status, last_seen").single()
      : await admin.from("agent_devices").insert(values).select("id, platform, device_label, capabilities, status, last_seen").single();

    if (write.error || !write.data) return json({ ok: false, error: "Could not register device." }, 500);
    return json({ ok: true, device: write.data });
  }

  if (operation === "heartbeat") {
    const deviceId = typeof body.device_id === "string" ? body.device_id : "";
    if (!deviceId) return json({ ok: false, error: "device_id is required." }, 400);
    const status = body.status === "offline" ? "offline" : "online";
    const { data, error } = await admin.from("agent_devices")
      .update({ status, last_seen: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", deviceId).eq("user_id", user.id)
      .select("id, status, last_seen").maybeSingle();
    if (error) return json({ ok: false, error: "Could not update device presence." }, 500);
    if (!data) return json({ ok: false, error: "Device not found for this account." }, 404);
    return json({ ok: true, device: data });
  }

  if (operation === "dispatch") {
    const platform = String(body.platform || "");
    const commandType = String(body.command_type || "");
    const payload = body.payload;
    const requestedDeviceId = typeof body.device_id === "string" ? body.device_id : "";

    if (!platforms.has(platform)) return json({ ok: false, error: "A supported target platform is required." }, 400);
    if (!commandTypes.has(commandType)) return json({ ok: false, error: "Unsupported device command." }, 400);
    if (!validObject(payload) || new TextEncoder().encode(JSON.stringify(payload)).length > 4096) {
      return json({ ok: false, error: "Command payload must be a JSON object no larger than 4 KB." }, 400);
    }
    if (commandType === "show_notification") {
      if (typeof payload.title !== "string" || !payload.title.trim() || payload.title.length > 120 ||
          typeof payload.body !== "string" || payload.body.length > 500) {
        return json({ ok: false, error: "Notifications require a title (max 120) and body (max 500)." }, 400);
      }
    }
    if (commandType === "open_app") {
      if (typeof payload.app_id !== "string" || !/^[a-zA-Z0-9._:/-]{1,160}$/.test(payload.app_id)) {
        return json({ ok: false, error: "open_app requires a valid app_id." }, 400);
      }
    }

    let query = admin.from("agent_devices")
      .select("id, platform, device_label, capabilities, last_seen")
      .eq("user_id", user.id).eq("platform", platform).eq("status", "online")
      .gte("last_seen", new Date(Date.now() - 120_000).toISOString())
      .order("last_seen", { ascending: false }).limit(20);
    if (requestedDeviceId) query = query.eq("id", requestedDeviceId);
    const { data: devices, error: deviceError } = await query;
    if (deviceError) return json({ ok: false, error: "Could not find a connected device." }, 500);

    const target = (devices || []).find((device) =>
      Array.isArray(device.capabilities) && device.capabilities.includes(commandType)
    );
    if (!target) {
      return json({
        ok: false,
        queued: false,
        error: "No recently connected " + platform + " device advertises " + commandType + ".",
      }, 409);
    }

    const { data: command, error } = await admin.from("agent_device_commands").insert({
      user_id: user.id,
      device_id: target.id,
      command_type: commandType,
      payload,
      status: "queued",
    }).select("id, device_id, command_type, status, created_at").single();
    if (error || !command) return json({ ok: false, error: "Could not queue device command." }, 500);
    return json({ ok: true, queued: true, command, target: target.device_label });
  }

  if (operation === "claim") {
    const deviceId = typeof body.device_id === "string" ? body.device_id : "";
    const commandId = typeof body.command_id === "string" ? body.command_id : "";
    if (!deviceId) return json({ ok: false, error: "device_id is required." }, 400);

    const { data: device, error: deviceError } = await admin.from("agent_devices")
      .select("id").eq("id", deviceId).eq("user_id", user.id).maybeSingle();
    if (deviceError || !device) return json({ ok: false, error: "Device not found for this account." }, 404);

    let pending = admin.from("agent_device_commands").select("id, command_type, payload, created_at")
      .eq("device_id", deviceId).eq("user_id", user.id).eq("status", "queued")
      .order("created_at", { ascending: true }).limit(1);
    if (commandId) pending = pending.eq("id", commandId);
    const { data: commands, error } = await pending;
    if (error) return json({ ok: false, error: "Could not read queued commands." }, 500);
    const next = commands?.[0];
    if (!next) return json({ ok: true, command: null });

    const { data: claimed, error: claimError } = await admin.from("agent_device_commands")
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("id", next.id).eq("device_id", deviceId).eq("user_id", user.id).eq("status", "queued")
      .select("id, command_type, payload, status, claimed_at").maybeSingle();
    if (claimError) return json({ ok: false, error: "Could not claim command." }, 500);
    return json({ ok: true, command: claimed || null });
  }

  if (operation === "complete") {
    const deviceId = typeof body.device_id === "string" ? body.device_id : "";
    const commandId = typeof body.command_id === "string" ? body.command_id : "";
    const outcome = body.outcome === "failed" ? "failed" : "completed";
    const result = validObject(body.result) ? body.result : {};
    if (!deviceId || !commandId) return json({ ok: false, error: "device_id and command_id are required." }, 400);
    if (new TextEncoder().encode(JSON.stringify(result)).length > 4096) {
      return json({ ok: false, error: "Result must be no larger than 4 KB." }, 400);
    }

    const { data, error } = await admin.from("agent_device_commands")
      .update({ status: outcome, result, completed_at: new Date().toISOString() })
      .eq("id", commandId).eq("device_id", deviceId).eq("user_id", user.id).eq("status", "claimed")
      .select("id, status, result, completed_at").maybeSingle();
    if (error) return json({ ok: false, error: "Could not acknowledge command." }, 500);
    if (!data) return json({ ok: false, error: "Command is not claimed by this device or is already complete." }, 409);
    return json({ ok: true, command: data });
  }

  return json({ ok: false, error: "Unsupported operation." }, 400);
});
