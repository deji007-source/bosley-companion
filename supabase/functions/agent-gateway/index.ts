import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_KEY = Deno.env.get("AGENT_CREDENTIALS_ENCRYPTION_KEY") || "";
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

type Provider = "openai" | "anthropic" | "gemini" | "groq" | "openrouter" | "mistral";
const PROVIDERS: Record<Provider, { label: string; model: string; endpoint: string; protocol: "openai" | "anthropic" | "gemini" }> = {
  openai: { label: "OpenAI", model: "gpt-4.1-mini", endpoint: "https://api.openai.com/v1/chat/completions", protocol: "openai" },
  anthropic: { label: "Anthropic", model: "claude-3-5-haiku-latest", endpoint: "https://api.anthropic.com/v1/messages", protocol: "anthropic" },
  gemini: { label: "Google Gemini", model: "gemini-2.0-flash", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", protocol: "gemini" },
  groq: { label: "Groq", model: "llama-3.3-70b-versatile", endpoint: "https://api.groq.com/openai/v1/chat/completions", protocol: "openai" },
  openrouter: { label: "OpenRouter", model: "openai/gpt-4.1-mini", endpoint: "https://openrouter.ai/api/v1/chat/completions", protocol: "openai" },
  mistral: { label: "Mistral", model: "mistral-small-latest", endpoint: "https://api.mistral.ai/v1/chat/completions", protocol: "openai" },
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function encryptionKey() {
  if (!ENCRYPTION_KEY) throw new Error("Agent credential encryption is not configured on the server.");
  const raw = /^[a-f0-9]{64}$/i.test(ENCRYPTION_KEY) ? unb64(btoa(String.fromCharCode(...ENCRYPTION_KEY.match(/../g)!.map(x => parseInt(x, 16))))) : unb64(ENCRYPTION_KEY);
  if (raw.length !== 32) throw new Error("AGENT_CREDENTIALS_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex value.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
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
    return json({ ok: true, providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.label, defaultModel: p.model, connected: !!data?.some(x => x.provider === id), ...(data?.find(x => x.provider === id) || {}) })) });
  }
  if (action === "connect") {
    const provider = body.provider as Provider;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim().slice(0, 120) : "";
    if (!(provider in PROVIDERS)) return json({ ok: false, error: "Unsupported provider." }, 400);
    if (apiKey.length < 12 || apiKey.length > 500) return json({ ok: false, error: "Enter a valid provider API key." }, 400);
    let encrypted;
    try { encrypted = await encryptSecret(apiKey); } catch (e) { return json({ ok: false, error: (e as Error).message }, 503); }
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
