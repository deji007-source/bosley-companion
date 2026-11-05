import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_KEY = Deno.env.get("AGENT_CREDENTIALS_ENCRYPTION_KEY") || "";
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

type Provider = "openai" | "anthropic" | "gemini" | "groq" | "openrouter" | "mistral" | "grok";
const PROVIDERS: Record<Provider, { label: string; model: string; endpoint: string; protocol: "openai" | "anthropic" | "gemini" }> = {
  openai: { label: "OpenAI", model: "gpt-4.1-mini", endpoint: "https://api.openai.com/v1/chat/completions", protocol: "openai" },
  anthropic: { label: "Anthropic", model: "claude-3-5-haiku-latest", endpoint: "https://api.anthropic.com/v1/messages", protocol: "anthropic" },
  gemini: { label: "Google Gemini", model: "gemini-2.0-flash", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", protocol: "gemini" },
  groq: { label: "Groq", model: "llama-3.3-70b-versatile", endpoint: "https://api.groq.com/openai/v1/chat/completions", protocol: "openai" },
  openrouter: { label: "OpenRouter", model: "openai/gpt-4.1-mini", endpoint: "https://openrouter.ai/api/v1/chat/completions", protocol: "openai" },
  mistral: { label: "Mistral", model: "mistral-small-latest", endpoint: "https://api.mistral.ai/v1/chat/completions", protocol: "openai" },
  grok: { label: "Grok · xAI", model: "grok-4.1-fast", endpoint: "https://api.x.ai/v1/chat/completions", protocol: "openai" },
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function encryptionKeyBytes() {
  const configured = ENCRYPTION_KEY.trim().replace(/^["']|["']$/g, "");
  if (!configured) throw new Error("Missing AGENT_CREDENTIALS_ENCRYPTION_KEY Supabase Edge Function secret.");
  let raw: Uint8Array | null = null;
  if (/^[a-f0-9]{64}$/i.test(configured)) {
    raw = Uint8Array.from(configured.match(/../g)!, x => parseInt(x, 16));
  } else if (configured.length === 32 && /^[\\x20-\\x7e]{32}$/.test(configured)) {
    // Preserve compatibility with existing 32-character printable secrets.
    raw = new TextEncoder().encode(configured);
  } else {
    const base64 = configured.replace(/-/g, "+").replace(/_/g, "/").replace(/\\s/g, "");
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(base64) && base64.length % 4 !== 1) {
      try {
        const paddedBase64 = base64 + "=".repeat((4 - base64.length % 4) % 4);
        const decoded = unb64(paddedBase64);
        if (decoded.length === 32) raw = decoded;
      } catch {
        // Treat a sufficiently long non-encoded secret as text below.
      }
    }
  }
  if (!raw) {
    const textBytes = new TextEncoder().encode(configured);
    if (textBytes.length < 32) {
      throw new Error("AGENT_CREDENTIALS_ENCRYPTION_KEY must contain at least 32 characters, or decode to exactly 32 bytes.");
    }
    // Stable SHA-256 derivation supports long text secrets that are not valid base64.
    raw = new Uint8Array(await crypto.subtle.digest("SHA-256", textBytes));
  }
  if (raw.length !== 32) throw new Error("AGENT_CREDENTIALS_ENCRYPTION_KEY must resolve to exactly 32 bytes.");
  return raw;
}
async function encryptionKey() {
  return crypto.subtle.importKey("raw", await encryptionKeyBytes(), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptSecret(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret));
  return { api_key_ciphertext: b64(new Uint8Array(ciphertext)), api_key_iv: b64(iv) };
}
async function decryptSecret(ciphertext: string, iv: string) {
  const key = await encryptionKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ciphertext));
  return new TextDecoder().decode(plain);
}
async function getUser(req: Request) {
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await auth.auth.getUser(token);
  return error ? null : data.user;
}
function validMessages(input: unknown) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 40) return null;
  const messages = [];
  for (const item of input) {
    if (!item || typeof item.content !== "string" || !item.content.trim() || item.content.length > 16000) return null;
    const role = item.role;
    if (!["system", "user", "assistant"].includes(role)) return null;
    messages.push({ role, content: item.content.trim() });
  }
  return messages;
}
async function callProvider(provider: Provider, apiKey: string, model: string, messages: { role: string; content: string }[]) {
  const config = PROVIDERS[provider];
  const signal = AbortSignal.timeout(45000);
  let response: Response;
  if (config.protocol === "anthropic") {
    const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const conversation = messages.filter(m => m.role !== "system");
    response = await fetch(config.endpoint, { method: "POST", signal, headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, max_tokens: 2048, ...(system ? { system } : {}), messages: conversation }) });
  } else if (config.protocol === "gemini") {
    const contents = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    response = await fetch(config.endpoint + "/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey), { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents, generationConfig: { maxOutputTokens: 2048 } }) });
  } else {
    response = await fetch(config.endpoint, { method: "POST", signal, headers: { "content-type": "application/json", authorization: "Bearer " + apiKey, ...(provider === "openrouter" ? { "HTTP-Referer": "https://bosley-companion.vercel.app", "X-Title": "Bosley Companion" } : {}) }, body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 2048 }) });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || "Provider request failed.";
    throw new Error("Provider returned " + response.status + ": " + String(detail).slice(0, 300));
  }
  const content = config.protocol === "anthropic" ? (payload?.content || []).filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n") : config.protocol === "gemini" ? (payload?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("") : payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("The provider returned no text response.");
  return { content, model: payload?.model || model, usage: payload?.usage || payload?.usageMetadata || null };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  const user = await getUser(req);
  if (!user) return json({ ok: false, error: "Sign-in required." }, 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body." }, 400); }
  const action = body.action;
  if (action === "providers") {
    const { data, error } = await db.from("agent_provider_connections").select("provider,model,enabled,updated_at").eq("user_id", user.id);
    if (error) return json({ ok: false, error: "Could not load provider connections." }, 500);
    let credentialStoreReady = false;
    let credentialStoreIssue = "";
    try { await encryptionKeyBytes(); credentialStoreReady = true; } catch (e) { credentialStoreIssue = (e as Error).message; }
    return json({ ok: true, credentialStoreReady, credentialStoreIssue, providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.label, defaultModel: p.model, connected: !!data?.some(x => x.provider === id), ...(data?.find(x => x.provider === id) || {}) })) });
  }
  if (action === "connect") {
    const provider = body.provider as Provider;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim().slice(0, 120) : "";
    if (!(provider in PROVIDERS)) return json({ ok: false, error: "Unsupported provider." }, 400);
    if (apiKey.length < 12 || apiKey.length > 500) return json({ ok: false, error: "Enter a valid provider API key." }, 400);
    let encrypted;
    try { encrypted = await encryptSecret(apiKey); } catch (e) { const message = (e as Error).message; console.error("Agent credential encryption setup failed:", message); return json({ ok: false, error: message }, 503); }
    const { error } = await db.from("agent_provider_connections").upsert({ user_id: user.id, provider, ...encrypted, model: model || PROVIDERS[provider].model, enabled: true, updated_at: new Date().toISOString() }, { onConflict: "user_id,provider" });
    if (error) { console.error("Provider credential save failed:", error); return json({ ok: false, error: "Could not securely save this provider connection." }, 500); }
    return json({ ok: true, provider, connected: true, message: "API key encrypted and saved. Run a connection test before using this provider." });
  }
  if (action === "disconnect") {
    const provider = body.provider as Provider;
    if (!(provider in PROVIDERS)) return json({ ok: false, error: "Unsupported provider." }, 400);
    const { error } = await db.from("agent_provider_connections").delete().eq("user_id", user.id).eq("provider", provider);
    return error ? json({ ok: false, error: "Could not remove provider connection." }, 500) : json({ ok: true, connected: false });
  }
  if (action === "realtime_session") {
    const { data: saved, error } = await db.from("agent_provider_connections")
      .select("api_key_ciphertext,api_key_iv,enabled")
      .eq("user_id", user.id)
      .eq("provider", "openai")
      .maybeSingle();
    if (error) return json({ ok: false, error: "Could not load your OpenAI connection." }, 500);
    if (!saved) return json({ ok: false, error: "Connect your OpenAI provider in Bosley Agents before starting Live Talk." }, 404);
    if (!saved.enabled) return json({ ok: false, error: "Your OpenAI provider connection is disabled." }, 409);
    try {
      const key = await decryptSecret(saved.api_key_ciphertext, saved.api_key_iv);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(user.id + ":" + SUPABASE_URL));
      const safetyIdentifier = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
      const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key, "OpenAI-Safety-Identifier": safetyIdentifier },
        body: JSON.stringify({
          expires_after: { anchor: "created_at", seconds: 600 },
          session: {
            type: "realtime",
            model: "gpt-realtime-2.1",
            audio: {
              input: {
                noise_reduction: { type: "near_field" },
                transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
                turn_detection: { type: "semantic_vad", eagerness: "auto" }
              },
              output: { voice: "marin", speed: 1.0 }
            },
            tools: [{
              type: "function",
              name: "bosley_task",
              description: "Send an explicit user-requested action, research, or workspace/device task to Bosley's existing task workflow. Ordinary conversation should not use this tool.",
              parameters: { type: "object", properties: { task: { type: "string", description: "The user's task, preserving their intent and relevant details." } }, required: ["task"], additionalProperties: false }
            }],
            tool_choice: "auto",
            instructions: "You are Bosley, a warm, concise, thoughtful voice companion. Speak naturally and calmly. Let the user finish their thoughts and allow interruptions. For explicit tasks, use bosley_task to route the request through Bosley's authenticated task workflow. Never claim a task is complete without confirmation. Consequential actions require the app's existing on-screen approval."
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload?.value !== "string") {
        const detail = payload?.error?.message || "OpenAI could not create a Realtime session.";
        return json({ ok: false, error: String(detail).slice(0, 320) }, 502);
      }
      return json({ ok: true, token: payload.value, expiresAt: payload.expires_at, model: payload.session?.model || "gpt-realtime-2.1" });
    } catch (e) {
      const message = (e as Error)?.message || "Could not create a secure live voice session.";
      console.error("Realtime session creation failed:", message);
      return json({ ok: false, error: message.slice(0, 320) }, 502);
    }
  }
  if (action === "test" || action === "chat") {
    const provider = body.provider as Provider;
    if (!(provider in PROVIDERS)) return json({ ok: false, error: "Select a supported provider." }, 400);
    const { data: saved, error } = await db.from("agent_provider_connections").select("api_key_ciphertext,api_key_iv,model,enabled").eq("user_id", user.id).eq("provider", provider).maybeSingle();
    if (error || !saved) return json({ ok: false, error: "Connect this provider first." }, 404);
    if (!saved.enabled) return json({ ok: false, error: "This provider is disabled." }, 409);
    const messages = action === "test" ? [{ role: "user", content: "Reply with exactly: Bosley connection successful." }] : validMessages(body.messages);
    if (!messages) return json({ ok: false, error: "Provide 1–40 valid chat messages." }, 400);
    try {
      const key = await decryptSecret(saved.api_key_ciphertext, saved.api_key_iv);
      const result = await callProvider(provider, key, saved.model || PROVIDERS[provider].model, messages);
      return json({ ok: true, provider, model: result.model, ...(action === "test" ? { message: "Connection test passed." } : { reply: result.content, usage: result.usage }) });
    } catch (e) {
      const message = (e as Error)?.message || "Provider request failed.";
      console.error("Agent provider request failed:", provider, message);
      return json({ ok: false, error: message.slice(0, 400) }, 502);
    }
  }
  return json({ ok: false, error: "Unsupported action." }, 400);
});
