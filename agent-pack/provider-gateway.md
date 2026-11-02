# Bosley AI provider gateway

This is the first provider-integration layer. It deliberately does not install or run Ollama, LiteLLM, or Docker.

## Supported API providers
- OpenAI
- Anthropic
- Google Gemini
- Groq
- OpenRouter
- Mistral

## Deployment prerequisites
1. Apply `supabase/migrations/20261102190000_agent_provider_connections.sql`. (Already applied to the existing Jarvis Supabase project.)
2. Configure the Edge Function secret `AGENT_CREDENTIALS_ENCRYPTION_KEY` in Supabase Dashboard → Edge Functions → Secrets. This is still required before the Connect button can save a provider key. Generate a unique value locally with the command below; do not paste the value into chat or commit it.

Configure the other environment variables only if they are not already present in the project: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

3. Deploy `agent-gateway` with JWT verification enabled. (Already deployed to the existing Jarvis Supabase project.)

 (UI is implemented on this branch; the chat route uses the gateway when a provider is selected.)

5. Configure the Edge Function secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AGENT_CREDENTIALS_ENCRYPTION_KEY` — generate a unique 32-byte key and store its base64 encoding. Never commit it.
3. Deploy `agent-gateway` with JWT verification enabled. (Already deployed to the existing Jarvis Supabase project.)

Generate an encryption key locally with:
```sh
openssl rand -base64 32
```

## API
POST `/functions/v1/agent-gateway` with the signed-in user's Supabase bearer token.

- `{ "action": "providers" }` — list supported providers and connection status; never returns keys.
- `{ "action": "connect", "provider": "openai", "apiKey": "...", "model": "gpt-4.1-mini" }` — encrypt and save a key.
- `{ "action": "test", "provider": "openai" }` — perform a minimal live API test.
- `{ "action": "chat", "provider": "openai", "messages": [...] }` — call the selected provider.
- `{ "action": "disconnect", "provider": "openai" }` — delete that user's connection.

Provider API keys are encrypted with AES-256-GCM before database storage. The table has RLS enabled and no client access policies; only the authenticated Edge Function uses the service-role key. The gateway validates the caller's Supabase JWT and scopes every database operation to that user.

## Current boundaries
- No provider is automatically selected; callers explicitly select one.
- No automatic fallback or multi-agent delegation yet.
- No streaming, tool/function calling, or model discovery yet.
- Never send provider keys from the browser to a provider directly.
