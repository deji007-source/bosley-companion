# Bosley Optional Agent Pack

This pack is an optional, lightweight set of reusable instructions and skill metadata for Bosley Companion. It is deliberately separate from the Windows installer so the desktop app stays small.

## Important distinction
This is **not a trained AI model** and does not train itself. The pack gives the existing AI backend structured task recipes and capability contracts. Actual reasoning still runs through the configured Bosley backend. A downloadable local model can be considered later as a separate opt-in integration with explicit hardware, privacy, and performance settings.

## Included skills
- `skills.json`: capability descriptions, trigger phrases, and safety boundaries.
- `agent-policy.md`: routing and confirmation rules.
- `bosley-app.json`: app-link configuration template. Replace the placeholder with the actual Lovable Bosley app URL before using an “open Bosley app” shortcut.

## Install / use
1. Download the optional pack artifact from the Bosley Windows workflow when it is published.
2. Extract it to a folder of your choice.
3. Review the policy and skill definitions before connecting them to an AI backend.
4. Keep API keys and Supabase secrets out of these files. Use authenticated server-side functions for privileged operations.

## Design principles
- Optional; no model weights are bundled.
- User confirmation before sending messages, launching apps, screen capture, trading actions, or other consequential actions.
- Trading support is read-only monitoring by default; no automatic order placement.
- Schoolwork support should teach and explain rather than misrepresent work as the user's own.
- Engineering workflows should show units, assumptions, and verification steps.
- Use only explicitly allowlisted desktop actions. Never execute arbitrary shell commands from model output.
