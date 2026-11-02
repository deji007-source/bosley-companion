# Bosley Hybrid AI Gateway

Bosley uses a Supabase Edge Function as its authenticated gateway and LiteLLM as the OpenAI-compatible provider router. Ollama is the default local inference deployment; OpenAI, Anthropic, Gemini, and DeepSeek are optional cloud fallbacks.

## Architecture

`Bosley client → Supabase ai-gateway (JWT auth + user routing) → LiteLLM → Ollama / cloud providers`

Supabase stores per-user preferences and request metadata only. Provider credentials and the LiteLLM master key belong in server-side environment secrets. Never put them in `index.html`, Android resources, Electron renderer code, or Supabase user tables.

## Start the local gateway stack

1. Copy `.env.example` to `.env` and set a unique `LITELLM_MASTER_KEY`.
2. Optionally add one or more cloud provider keys. Blank cloud keys mean those providers are not usable; local Ollama remains the default.
3. Start the stack: `docker compose -f docker-compose.ai-gateway.yml up -d`.
4. Pull the default local model: `docker compose -f docker-compose.ai-gateway.yml exec ollama ollama pull qwen2.5:7b`.
5. Check Ollama: `docker compose -f docker-compose.ai-gateway.yml exec ollama ollama list`.
6. Put LiteLLM behind an HTTPS reverse proxy with authentication/rate limiting at the edge. Do not expose an unprotected gateway to the public internet. The Supabase function must reach its HTTPS URL.

The Compose file uses the LiteLLM `main-stable` image tag for initial compatibility. Before production rollout, pin the image to a tested immutable version tag and record it here.

## Supabase secrets

Set the following secrets for the `ai-gateway` Edge Function using the Supabase project secrets interface/CLI:
- `LITELLM_BASE_URL`: HTTPS URL of the deployed LiteLLM service (no trailing slash).
- `LITELLM_MASTER_KEY`: same value configured for LiteLLM.

Provider keys are set only on the LiteLLM host. Do not duplicate them into Supabase unless a future per-user encrypted credential vault is deliberately designed.

## Routes

- `hybrid`: local Ollama first, then configured OpenAI → Anthropic → Gemini → DeepSeek fallbacks.
- `local_only`: Ollama only; cloud fallback disabled.
- `cloud_only`: cloud provider chain.
- Optional preferred provider: `openai`, `anthropic`, `gemini`, `deepseek`, or `ollama`.

Cloud providers may incur charges. Hybrid fallback can call a cloud provider when local inference fails, but only if its key is configured. Set `allow_cloud_fallback=false` to keep hybrid requests local-only.

## API

POST `/functions/v1/ai-gateway` with a signed-in Supabase access token and the existing `{ messages: [...] }` chat payload. The endpoint streams OpenAI-compatible Server-Sent Events. The existing `companion-chat` route remains untouched until the gateway host and secrets have been configured and end-to-end tested.

## Limits and security

- User JWT validation occurs in the Edge Function.
- Requests are validated and rate-limited (15 per minute per user per Edge Function isolate).
- Provider keys stay on the LiteLLM server.
- Supabase RLS restricts preference and usage rows to their owner.
- Usage logs store route, model alias, status and latency; they do not store prompts or completions.
- No device automation tools are exposed through this gateway. Bosley's existing automation permission and execution layers remain separate.
