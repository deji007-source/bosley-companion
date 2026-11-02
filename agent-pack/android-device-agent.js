/**
 * Bosley Android device agent (foreground-safe client).
 *
 * Keeps a signed-in Android companion registered with Supabase while the app is
 * active. Android background execution is intentionally delegated to push
 * delivery / native WorkManager in a later native build step; this module does
 * not pretend browser timers survive process suspension.
 *
 * Usage:
 *   const agent = createBosleyDeviceAgent({ supabase, onStatus });
 *   await agent.start();
 *   agent.stop();
 */
const FUNCTION_URL = "https://ywwfqisbmlkjcfoqehph.supabase.co/functions/v1/agent-device";
const DEVICE_KEY = "bosley.agent.android.device.v1";
const POLL_MS = 30000;
const HEARTBEAT_MS = 60000;

export function createBosleyDeviceAgent({ supabase, onStatus = () => {} }) {
  let deviceId = null;
  let pollTimer = null;
  let heartbeatTimer = null;
  let running = false;
  let busy = false;

  const status = (state, detail = "") => onStatus({ state, detail });

  async function request(payload) {
    const { data: { session } = {} } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sign in required");
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: (import.meta.env?.VITE_SUPABASE_ANON_KEY || "")
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Agent request failed (${response.status})`);
    return body;
  }

  async function register() {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) {
      try {
        await request({ action: "heartbeat", device_id: saved });
        deviceId = saved;
        return;
      } catch {
        localStorage.removeItem(DEVICE_KEY);
      }
    }
    const result = await request({
      action: "register",
      platform: "android",
      device_label: "Bosley Android",
      app_version: "1.0",
      capabilities: ["notifications", "task_polling", "telegram-macrodroid-bridge"]
    });
    deviceId = result.device.id;
    localStorage.setItem(DEVICE_KEY, deviceId);
  }

  async function execute(command) {
    let result = {};
    let state = "completed";
    try {
      if (command.command_type === "show_notification") {
        const title = String(command.payload?.title || "Bosley").slice(0, 80);
        const message = String(command.payload?.message || "").slice(0, 240);
        if (!message) throw new Error("Notification message is empty");
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(title, { body: message, tag: "bosley-" + command.id });
          result = { delivered: true, method: "web-notification" };
        } else {
          // The UI can display this event even if OS notifications are not granted.
          status("notification", message);
          result = { delivered: false, reason: "notification_permission_not_granted", visible_in_app: true };
        }
      } else if (command.command_type === "sync_status") {
        result = { synced: true, platform: "android", at: new Date().toISOString() };
      } else {
        throw new Error("Command is not supported by this client version");
      }
    } catch (error) {
      state = "failed";
      result = { error: String(error?.message || error).slice(0, 180) };
    }
    await request({ action: "ack", device_id: deviceId, command_id: command.id, status: state, result });
  }

  async function poll() {
    if (!running || busy || !deviceId || document.visibilityState !== "visible") return;
    busy = true;
    try {
      const result = await request({ action: "poll", device_id: deviceId });
      for (const command of (result.commands || [])) await execute(command);
      status("online");
    } catch (error) {
      status("retrying", String(error?.message || error));
    } finally {
      busy = false;
    }
  }

  async function heartbeat() {
    if (!running || !deviceId) return;
    try {
      await request({ action: "heartbeat", device_id: deviceId });
      status("online");
    } catch (error) {
      status("offline", String(error?.message || error));
    }
  }

  async function start() {
    if (running) return;
    running = true;
    try {
      await register();
      status("online");
      await poll();
      pollTimer = setInterval(poll, POLL_MS);
      heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("online", heartbeat);
    } catch (error) {
      running = false;
      status("error", String(error?.message || error));
      throw error;
    }
  }

  function onVisibility() {
    if (document.visibilityState === "visible") {
      heartbeat();
      poll();
    }
  }

  function stop() {
    running = false;
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", heartbeat);
    status("stopped");
  }

  return { start, stop, pollNow: poll };
}
