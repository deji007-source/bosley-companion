# Bosley Free-First AI Gateway

Run Ollama and LiteLLM on your Windows laptop. The default hybrid route is intentionally local-only: it does **not** automatically fall back to a paid cloud model. OpenAI, Anthropic, Gemini and DeepSeek routes are prepared but only run when explicitly selected and configured.

## Cost and storage

- No VPS, paid hosting plan, or separate cloud database is required for local inference.
- Ollama downloads model files to your computer. The default `qwen2.5:1.5b` model is a small model (roughly 1 GB; exact download size varies).
- Docker images and containers also use local disk space.
- AI processing uses your laptop's RAM/CPU (and GPU if available) and electricity.
- Hosted OpenAI, Anthropic, Gemini and DeepSeek API calls can incur charges. Their keys are blank by default and no cloud fallback is configured.
- Supabase Edge Function and database usage remain subject to your existing Supabase plan limits.

To reclaim model storage later, run `docker compose -f docker-compose.ai-gateway.yml exec ollama ollama rm qwen2.5:1.5b`. To remove the downloaded model volume and all models in it, stop the stack and remove the named volume; that is destructive.

## Architecture

`Bosley client → Supabase ai-gateway (JWT auth + per-user routing) → LiteLLM → Ollama`

Optional cloud routes: OpenAI, Anthropic, Gemini and DeepSeek. Supabase stores user preferences and request metadata only. Provider credentials and the LiteLLM master key stay on the LiteLLM host, never in browser/mobile/desktop client code or user tables.

## Windows setup (free local mode)

1. Install Docker Desktop and make sure its engine is running.
2. Copy `.env.example` to `.env`. Set a unique random `LITELLM_MASTER_KEY`; leave all cloud provider keys blank.
3. From this folder, start: `docker compose -f docker-compose.ai-gateway.yml up -d`.
4. Download the small local model: `docker compose -f docker-compose.ai-gateway.yml exec ollama ollama pull qwen2.5:1.5b`.
5. Verify: `docker compose -f docker-compose.ai-gateway.yml exec ollama ollama list`.
6. Local LiteLLM endpoint: `http://127.0.0.1:4000`. It is bound to localhost only.

The Compose file uses rolling image tags for easy setup. For production, pin both images to tested immutable versions.

## Connect Supabase for remote clients (optional)

Supabase Edge Functions cannot call your laptop's localhost directly. For a free temporary test tunnel:

1. Start the tunnel profile: `docker compose -f docker-compose.ai-gateway.yml --profile public-tunnel up -d`.
2. Read the generated `https://….trycloudflare.com` URL from `docker logs bosley-ai-tunnel`.
3. In Supabase Edge Function secrets, set `LITELLM_BASE_URL` to that HTTPS URL and `LITELLM_MASTER_KEY` to the exact key from your local `.env`.
4. Restart the Edge Function is not required; new secret values are read by new invocations after the secrets update.
5. Test `/functions/v1/ai-gateway` using an authenticated Bosley session.

Cloudflare Quick Tunnels are temporary: the hostname changes when the tunnel is recreated. They are suitable for development, not reliable 24/7 production. Keep the LiteLLM master key secret; the gateway requires it. Do not expose Ollama's port 11434.

## Supabase secrets

For the deployed `ai-gateway` Edge Function:
- `LITELLM_BASE_URL`: HTTPS gateway URL (temporary Quick Tunnel URL for development).
- `LITELLM_MASTER_KEY`: same random key as the local LiteLLM host.

## Routing policy

- `hybrid`: Ollama local model only by default. No automatic cloud fallback.
- `local_only`: Ollama only.
- `cloud_only`: explicit OpenAI route unless a preferred cloud provider is selected.
- `preferred_provider`: `openai`, `anthropic`, `gemini`, `deepseek`, or `ollama`.

Cloud API calls are opt-in and may cost money. Do not set a cloud provider as preferred unless you intend to use that provider.

## API and safety

POST `/functions/v1/ai-gateway` with a signed-in Supabase access token and the existing `{ messages: [...] }` payload. The endpoint streams OpenAI-compatible Server-Sent Events. Existing `companion-chat` remains unchanged until the gateway has been tested end-to-end.

The Edge Function validates user JWTs, validates request shape, rate-limits per user, and stores route/status/latency metadata only (not prompts or completions). RLS limits preference and usage rows to their owner. The gateway does not expose device automation tools.


## Local image understanding (free-first)

The gateway routes image attachments and screenshots to the local Ollama vision model
`qwen2.5vl:3b` through the `bosley-vision` alias. Pull the model once on the computer
running Ollama:

```bash
docker exec -it bosley-ollama ollama pull qwen2.5vl:3b
```

This model runs locally and does not send images to a paid provider. It needs several
gigabytes of disk space and enough RAM/compute; performance depends on the host computer.
Image requests will fail until the model is pulled and the updated gateway/config are deployed.
Explicitly selected cloud providers remain separate opt-in routes.
