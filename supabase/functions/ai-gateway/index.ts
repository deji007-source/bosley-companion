import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LITELLM_BASE_URL = (Deno.env.get("LITELLM_BASE_URL") ?? "").replace(/\/+$/, "");
const LITELLM_MASTER_KEY = Deno.env.get("LITELLM_MASTER_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const hits = new Map<string, number[]>();
const LIMIT_PER_MIN = 15;
const PROVIDER_MODELS: Record<string, string> = {
  openai: "bosley-openai",
  anthropic: "bosley-anthropic",
  gemini: "bosley-gemini",
  deepseek: "bosley-deepseek",
  ollama: "bosley-local",
};

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!LITELLM_BASE_URL || !LITELLM_MASTER_KEY) return json({
    error: "Bosley AI Gateway is not configured yet.",
    setup_required: ["LITELLM_BASE_URL", "LITELLM_MASTER_KEY"],
  }, 503);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in required" }, 401);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authError ? null : authData.user;
  if (!user) return json({ error: "Sign in required" }, 401);

  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMIT_PER_MIN) return json({ error: "Too many requests — wait a moment" }, 429);
  recent.push(now);
  hits.set(user.id, recent);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) return json({ error: "Invalid messages" }, 400);

  const clean: any[] = [];
  let hasImage = false;
  for (const message of messages) {
    if (!message || !["user", "assistant"].includes(message.role)) return json({ error: "Invalid message role" }, 400);
    if (typeof message.content === "string") {
      if (!message.content.trim() || message.content.length > 12000) return json({ error: "Invalid message content" }, 400);
      clean.push({ role: message.role, content: message.content });
      continue;
    }
    if (message.role !== "user" || !Array.isArray(message.content) || message.content.length > 2) {
      return json({ error: "Invalid multimodal message" }, 400);
    }
    const parts: any[] = [];
    let sawText = false, sawImage = false;
    for (const part of message.content) {
      if (part?.type === "text" && typeof part.text === "string" && part.text.trim() && part.text.length <= 12000 && !sawText) {
        parts.push({ type: "text", text: part.text }); sawText = true;
      } else if (part?.type === "image_url" && typeof part.image_url?.url === "string") {
        const url = part.image_url.url;
        if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(url) || url.length > 6_000_000) {
          return json({ error: "Unsupported image. Attach a JPEG, PNG, or WebP image under 4 MB." }, 400);
        }
        parts.push({ type: "image_url", image_url: { url } }); sawImage = true; hasImage = true;
      } else return json({ error: "Invalid image attachment format" }, 400);
    }
    if (!sawText || !sawImage) return json({ error: "Image messages must include a question and an image." }, 400);
    clean.push({ role: message.role, content: parts });
  }
  if (clean[clean.length - 1]?.role !== "user") return json({ error: "Last message must be from the user" }, 400);

  const { data: prefs } = await admin.from("ai_gateway_preferences")
    .select("mode,preferred_provider,allow_cloud_fallback").eq("user_id", user.id).maybeSingle();
  const mode = prefs?.mode ?? "hybrid";
  const preferred = prefs?.preferred_provider ?? null;
  let model = "bosley-hybrid";
  let route = mode;
  if (preferred && PROVIDER_MODELS[preferred]) {
    model = PROVIDER_MODELS[preferred];
    route = "provider:" + preferred;
  } else if (mode === "local_only") model = "bosley-local";
  else if (mode === "cloud_only") model = "bosley-cloud";
  if (mode === "local_only" && preferred && preferred !== "ollama") {
    return json({ error: "Local-only mode cannot route to a cloud provider." }, 400);
  }
  if (mode === "hybrid" && prefs?.allow_cloud_fallback === false) model = "bosley-local";
  // Images use a local vision model by default. This keeps image analysis free
  // and avoids silently sending screenshots or photos to a paid cloud provider.
  // An explicitly selected cloud provider remains an explicit user choice.
  if (hasImage && (model === "bosley-local" || model === "bosley-hybrid")) {
    model = "bosley-vision";
    route = route + ":local-vision";
  }
  if (hasImage && model === "bosley-cloud" && mode === "local_only") {
    return json({ error: "Local-only mode cannot send images to a cloud model." }, 400);
  }

  const startedAt = Date.now();
  const { data: usage } = await admin.from("ai_gateway_usage").insert({
    user_id: user.id, requested_route: route, requested_provider: preferred, model_id: model, status: "started",
  }).select("id").single();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const upstream = await fetch(LITELLM_BASE_URL + "/v1/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + LITELLM_MASTER_KEY },
      body: JSON.stringify({
        model, messages: clean, stream: true, temperature: 0.5, max_tokens: 900,
        metadata: { user_id: user.id, bosley_usage_id: usage?.id ?? "untracked" },
      }),
    });
    const requestId = upstream.headers.get("x-litellm-call-id") ?? upstream.headers.get("x-request-id");
    if (!upstream.ok || !upstream.body) {
      const detail = (await upstream.text().catch(() => "")).slice(0, 300);
      if (usage?.id) await admin.from("ai_gateway_usage").update({
        status: "failed", http_status: upstream.status, latency_ms: Date.now() - startedAt, provider_request_id: requestId,
      }).eq("id", usage.id).eq("user_id", user.id);
      return json({ error: "AI gateway provider error", detail }, 502);
    }
    if (usage?.id) await admin.from("ai_gateway_usage").update({
      status: "completed", http_status: upstream.status, latency_ms: Date.now() - startedAt, provider_request_id: requestId,
    }).eq("id", usage.id).eq("user_id", user.id);
    return new Response(upstream.body, {
      headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Bosley-AI-Route": route },
    });
  } catch (error) {
    if (usage?.id) await admin.from("ai_gateway_usage").update({
      status: "failed", http_status: 504, latency_ms: Date.now() - startedAt,
    }).eq("id", usage.id).eq("user_id", user.id);
    return json({ error: (error as Error).name === "AbortError" ? "AI gateway request timed out" : "AI gateway request failed" }, 504);
  } finally { clearTimeout(timeout); }
});
