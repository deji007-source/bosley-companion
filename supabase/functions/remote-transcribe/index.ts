import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Authenticated speech-to-text ONLY. It writes nothing; the page sends the
// transcript through the bosley-command gateway so one allow-list governs everything.
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
const AGENT_ENCRYPTION_KEY = Deno.env.get("AGENT_CREDENTIALS_ENCRYPTION_KEY") || "";
const ORIGINS = ["https://bosley-remote.vercel.app", "https://bosley-companion.vercel.app", "https://jarvis-mark85.lovable.app"];
const JUNK = new Set(["okay.", "okay", "what's that?", "thank you.", "thanks for watching!", "you", "bye.", "..."]);
const MAX_BYTES = 2_000_000;
const decodeBase64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
function encryptionKeyBytes() {
  if (!AGENT_ENCRYPTION_KEY) throw new Error("Agent credential encryption is not configured.");
  let raw: Uint8Array;
  try {
    raw = /^[a-f0-9]{64}$/i.test(AGENT_ENCRYPTION_KEY)
      ? Uint8Array.from(AGENT_ENCRYPTION_KEY.match(/../g)!, x => parseInt(x, 16))
      : decodeBase64(AGENT_ENCRYPTION_KEY);
  } catch {
    throw new Error("Agent credential encryption key has invalid encoding.");
  }
  if (raw.length !== 32) throw new Error("Agent credential encryption key must decode to 32 bytes.");
  return raw;
}
async function decryptSavedGroqKey(ciphertext: string, iv: string) {
  const key = await crypto.subtle.importKey("raw", encryptionKeyBytes(), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64(iv) }, key, decodeBase64(ciphertext));
  return new TextDecoder().decode(plain);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const cors = {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!data?.user) return json({ error: "Sign in required" }, 401);
  let providerKey = GROQ_API_KEY;
  const { data: saved, error: savedError } = await admin.from("agent_provider_connections")
    .select("api_key_ciphertext,api_key_iv,enabled")
    .eq("user_id", data.user.id).eq("provider", "groq").maybeSingle();
  if (savedError && !providerKey) return json({ error: "Could not load your saved Groq connection." }, 503);
  if (saved?.enabled) {
    try { providerKey = await decryptSavedGroqKey(saved.api_key_ciphertext, saved.api_key_iv); }
    catch (error) {
      console.error("Saved Groq voice credential could not be decrypted:", String(error).slice(0, 180));
      return json({ error: "Your saved Groq connection needs its encryption setting checked. Reconnect Groq in Bosley Agents after the server setting is corrected." }, 503);
    }
  }
  if (!providerKey) return json({ error: "Connect Groq in Bosley Agents to enable voice transcription." }, 503);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "Invalid upload" }, 400); }
  const audio = form.get("audio");
  const duration = parseFloat(String(form.get("duration") ?? "0"));
  if (!(audio instanceof Blob) || audio.size === 0) return json({ error: "No audio received" }, 400);
  if (audio.size > MAX_BYTES) return json({ error: "Recording too long" }, 413);
  if (duration < 1) return json({ error: "Too short, try again" }, 400);

  const f = new FormData();
  f.append("file", audio, "voice.webm");
  f.append("model", "whisper-large-v3-turbo");
  f.append("language", "en");
  f.append("prompt", "Voice commands: open WhatsApp, open Spotify, text Dotun on WhatsApp, search drake on Spotify, call Dotun, turn on Bluetooth, wake up, daddy's home, move chrome to desktop 2, switch to desktop 1, focus chrome, minimize chrome.");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${providerKey}` }, body: f });
    if (!res.ok) return json({ error: `Transcription failed (${res.status})` }, 502);
    const text = String((await res.json()).text ?? "").trim();
    if (!text || JUNK.has(text.toLowerCase())) return json({ error: "Couldn't catch that, try again" }, 422);
    return json({ transcript: text });
  } catch (e) {
    return json({ error: (e as Error).name === "AbortError" ? "Transcription timed out" : "Transcription failed" }, 504);
  } finally { clearTimeout(timer); }
});
