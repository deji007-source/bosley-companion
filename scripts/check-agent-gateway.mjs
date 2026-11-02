import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../supabase/functions/agent-gateway/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261102190000_agent_provider_connections.sql", import.meta.url), "utf8");
const docs = readFileSync(new URL("../agent-pack/provider-gateway.md", import.meta.url), "utf8");
for (const provider of ["openai", "anthropic", "gemini", "groq", "openrouter", "mistral"]) {
  assert.ok(source.includes(provider + ":"), "Provider adapter missing: " + provider);
  assert.ok(migration.includes("'" + provider + "'"), "Database provider allowlist missing: " + provider);
}
for (const contract of [
  ["JWT identity validation", "auth.auth.getUser(token)"],
  ["AES-GCM encryption", 'name: "AES-GCM"'],
  ["Per-request random IV", "crypto.getRandomValues(new Uint8Array(12))"],
  ["Credential encryption before persistence", "encryptSecret(apiKey)"],
  ["Credential decryption only server-side", "decryptSecret(saved.api_key_ciphertext, saved.api_key_iv)"],
  ["User-scoped connection reads", '.eq("user_id", user.id)'],
  ["User-scoped connection deletion", '.eq("user_id", user.id).eq("provider", provider)'],
  ["No client-side credential table access", "revoke all on public.agent_provider_connections from anon, authenticated"],
  ["Provider connection test", 'action === "test"'],
  ["Provider chat operation", 'action === "chat"'],
  ["No API keys returned by provider listing", '.select("provider,model,enabled,updated_at")'],
  ["Bounded chat message count", "input.length > 40"],
  ["Bounded message size", "item.content.length > 16000"],
  ["Request timeout", "AbortSignal.timeout(45000)"],
  ["Ollama and LiteLLM intentionally deferred", "does not install or run Ollama, LiteLLM, or Docker"],
]) assert.ok((source + migration + docs).includes(contract[1]), contract[0]);
assert.ok(source.includes("https://api.openai.com/v1/chat/completions"), "OpenAI-compatible adapter endpoint missing");
assert.ok(source.includes("https://api.anthropic.com/v1/messages"), "Anthropic adapter endpoint missing");
assert.ok(source.includes("https://generativelanguage.googleapis.com/v1beta/models"), "Gemini adapter endpoint missing");
console.log("Agent gateway contracts passed.");
