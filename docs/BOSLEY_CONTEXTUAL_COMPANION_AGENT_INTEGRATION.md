# Bosley Contextual Companion and Agent Integration

Status: architecture and delivery specification. Research baseline: public HeyClicky product pages, changelog, Chrome Web Store listing, and trust/privacy page reviewed on 13 November 2026.

## Product direction
Build an original Bosley experience that brings contextual help to the user's current work surface, voice-first interaction, visual explanations, persistent task agents, reusable skills, and repeatable routines into the existing Bosley account and app family. This is a capability study and original implementation plan; do not copy HeyClicky's branding, interface assets, source code, or proprietary implementation.

## Capability study
Public HeyClicky materials describe ten capability groups:
1. Contextual talk: user-triggered screenshot context, voice/text questions and step-by-step guidance.
2. Visual guidance: pointers, circles, highlights, explanatory cards, 2D and interactive 3D explanations.
3. Voice and dictation: push-to-talk, hold-to-dictate, customizable shortcuts, speech output and multilingual voices.
4. Delegated agents: long-running jobs, dedicated conversations, progress, generated files and visible browser work.
5. Connected services: user-authorized Google Workspace and other integrations with scoped read/write permissions.
6. Skills: reusable installable instructions activated per conversation or agent run.
7. Memory and preferences: durable editable preferences plus short-lived project context.
8. Routines: opt-in scheduled tasks with pause, resume, run-now, delete, retry and catch-up behaviour.
9. Desktop interaction: explicit user-approved computer control, visible progress and immediate interruption.
10. Expanded task workspace: chat, task history, files and settings alongside a compact companion surface.

Sources reviewed:
- https://www.heyclicky.com/
- https://www.heyclicky.com/changelog
- https://www.heyclicky.com/about
- https://www.heyclicky.com/terms
- https://www.hiclicky.com/trust
- https://chromewebstore.google.com/detail/heyclicky/bphdnlcghkpiaoiplkhfofpfboddahce

## Existing Bosley foundations discovered
- src/App.tsx: React companion chat, Supabase auth, conversation history, speech recognition and speech output.
- supabase/functions/agent-gateway/index.ts: authenticated multi-provider gateway, encrypted provider credentials, realtime session support and agent actions.
- supabase/functions/remote-action/index.ts: authenticated per-user Windows listener status, heartbeat, command queue, claim and acknowledgement.
- supabase/functions/os-agent-poll/index.ts: existing remote agent polling surface.
- supabase/functions/companion-chat/index.ts: existing chat service.
- supabase/functions/bosley-search/index.ts: existing web research service.
- supabase/functions/bosley-writing-assist/index.ts: existing writing assistance.
- agent-pack/skills.json: existing skill catalogue.
- .github/workflows/build-android.yml and build-ios.yml: native build paths; Android has an overlay service and user-consented MediaProjection declarations. iOS currently builds an unsigned simulator app.

Bosley already has useful building blocks. Extend them rather than creating a second identity, chat history, agent queue, or credential store.

## Target architecture
### A. One contextual companion surface
- Windows: compact always-on-top Bosley surface, global shortcut, expandable full workspace.
- Android: existing floating overlay, explicit screen-capture action, visible capture state and card UI served from packaged same-origin assets.
- iOS: in-app contextual companion and share/import flow first; do not promise a system-wide floating overlay or unrestricted screen capture that iOS does not permit.
- Web: installable web companion with browser-supported capture initiated by the user and clear browser permission prompts.

### B. Consent-first context capture
- Capture only after an explicit press, tap or shortcut.
- Show a clear capture indicator and preview before sending.
- Never run continuous screen, microphone, clipboard, keystroke or app-activity surveillance.
- Process screenshots transiently by default; persist only user-approved text summaries or explicitly saved context.
- Redact likely secrets and offer crop/region capture.
- Provide delete controls for context summaries and capture history.

### C. Voice and dictation
- Consistent push-to-talk states: idle, permission-needed, listening, transcribing, responding, interrupted and error.
- Typed fallback, hold-to-dictate, configurable shortcuts where the OS allows them, speech playback controls and cancellation.
- Store language/voice preferences per authenticated account.
- Request microphone permission only when the user starts a voice feature.

### D. Agent workspace
- Extend the existing agent-gateway and per-user automation_runs queue.
- Add task records with status, progress events, checkpoints, cancellation, retries, generated-file references and conversation linkage.
- Give each task a dedicated thread while preserving the same signed-in user and account boundary.
- Require confirmation before external side effects such as sending messages, publishing, deleting, purchasing or changing account settings.
- Keep browser automation in a clearly visible, isolated browser context; never silently reuse credentials or submit sensitive actions without approval.
- Long-running jobs must survive app restarts and expose resumable progress.

### E. Visual explanations
- Start with safe 2D overlay primitives: pointer, circle, rectangle, numbered step and text card.
- Anchor annotations to screenshot coordinates and scale them for display density and window resizing.
- Provide accessible text instructions alongside visual guidance.
- Add 3D models later as an optional renderer.

### F. Skills library
- Extend agent-pack/skills.json into a signed/versioned catalogue with metadata, permissions, compatibility, publisher and changelog.
- Show each skill's requested capabilities before installation.
- Keep skills declarative and constrained; do not execute arbitrary downloaded code.
- Support create, test, enable/disable, update, uninstall and per-task activation.

### G. Memory and routines
- Store account-owned profile preferences separately from project/session context.
- Let users inspect, edit, pause and delete each memory item.
- Routines must be opt-in, visible, pausable and scoped to an account and device.
- Surface missed-run recovery and failures; never silently catch up with a burst of actions.
- Do not reintroduce passive activity tracking.

### H. Security invariants
- Supabase Auth and row-level security remain the source of account isolation.
- Server actions validate the JWT and derive user_id from the verified session, never a client-supplied owner ID.
- Encrypt provider credentials at rest; never return secrets to the browser.
- Use explicit per-action capability grants and short-lived execution leases.
- Require user confirmation for consequential external actions.
- Log task intent, permission grant, confirmation, execution outcome and cancellation without storing raw screenshots or secret values.
- Provide a global stop control for active desktop/browser automation.
- No real-money trading, broker order execution or financial transactions; Trading Dock remains historical education/backtesting and paper simulation only.

## Delivery plan
### Phase 1 — foundation and safety
- Audit and stabilize current Windows listener, Android overlay and screenshot capture paths.
- Define shared task, event, permission and context schemas.
- Add cancellation, lease recovery, idempotency and account-isolation tests.
- Add a unified task inbox/history to the existing companion workspace.

### Phase 2 — contextual talk
- Add user-triggered screenshot capture and preview to Windows and Android.
- Add screen-aware chat requests with transient image processing.
- Add consistent push-to-talk/dictation controls and interruption handling.
- Add iOS in-app context import and share-sheet entry point.

### Phase 3 — visible agents
- Add task progress streaming, dedicated task conversations, generated files, retry and cancel.
- Add visible browser session support with action confirmation.
- Integrate approved connectors through explicit user authorization.

### Phase 4 — visual guidance and skills
- Add 2D annotation renderer and tutorial steps.
- Build a permissions-aware skills catalogue and skill authoring workflow.

### Phase 5 — memory and routines
- Add editable account memory and project context.
- Add opt-in scheduled routines with pause/resume/run-now/delete and safe recovery.

## Cross-platform release gates
Every shared UI change must pass Web, Windows, Android and iOS workflows. Android must additionally install and launch on an emulator and test overlay entry/capture where emulator permissions allow. iOS must build and launch on a simulator; physical-device distribution requires Apple signing and device testing. Windows must verify the installer and packaged executable. Feature parity means the same core account, task and conversation data model while respecting platform permission and OS limitations.