# Bosley Companion

Bosley Companion is a browser-first AI companion with a Vite frontend, Supabase-backed services, and an optional Windows Electron wrapper.

**Live app:** https://bosley-companion.vercel.app/  
**Windows build:** GitHub Actions → **Build Bosley Windows App** workflow.

## Source-of-truth note

The currently maintained companion experience is the root `index.html`, which contains the inline UI and its Supabase integration. `src/App.tsx` is a separate React prototype and still contains a demo welcome message saying AI is disconnected; do not assume that prototype is the deployed production UI. Avoid implementing the same feature twice. Before migrating the inline experience into React, first port and test authentication, streaming chat, conversation persistence, workspace data, workflow sync, and appearance settings as one controlled migration.

## Current capabilities

- Dark companion interface and floating Windows widget.
- Supabase authentication and a chat Edge Function that streams AI responses.
- Per-user conversation/message persistence in Supabase.
- Per-user workflow storage using `automation_workflows`.
- Saved workflow command dispatch: a chat message such as `Open Spotify`, `run Open Spotify`, or `run my Morning research automation` is matched against the signed-in user’s saved workflow names before the AI-chat fallback. Matching is case-insensitive and ignores punctuation. A matched workflow runs its configured steps in order and reports completion/failure from the local workflow runner.
- Browser-safe workflow actions such as opening URLs, web search, creating a text file, and preparing a message draft.
- Voice-related Edge Functions and browser speech features, subject to browser/device support.
- Remote action queue and an OS-agent polling endpoint.

Saved-workflow command dispatch and the new Windows installer require end-to-end testing on the deployed app. A workflow that depends on browser pop-ups can still fail if the browser blocks them. A successful workflow run only confirms the individual actions that the runner itself confirms; queued remote/laptop actions are not treated as completed until the listener or agent confirms execution. Do not assume a feature is operational merely because its function or UI exists.

## Important limitations

- **Native desktop automation is not complete.** The Electron preload currently exposes only the panel toggle. It does not provide a verified native action bridge for the web app.
- **The OS command queue needs a lifecycle correction before it can be trusted.** The current `os-agent-poll` endpoint marks commands as `done` when it returns them, before any desktop agent confirms execution. Do not use this status as proof that an OS action ran.
- Browser-safe workflow actions are not the same as controlling Windows applications. Desktop actions must remain unavailable unless a secure, allowlisted native bridge is installed and confirms the result.
- Message actions that lack a verified send integration should be treated as drafts, not as sent messages.
- Voice support depends on browser/device capabilities and permissions; speech recognition may rely on the browser vendor's service.
- The Windows wrapper loads the hosted site. It is not a standalone offline AI model.
- Do not add API keys, passwords, Supabase service-role keys, or other secrets to this public repository or to frontend code.

## Run locally

Install Node.js LTS, then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build the web app

```bash
npm run build
```

The production output is written to `dist/`.

## Build the Windows installer

1. Open the repository's **Actions** tab on GitHub.
2. Select **Build Bosley Windows App**.
3. Choose **Run workflow**.
4. When it completes, open the run and download the `Bosley-Windows-Installer` artifact.

The workflow builds an Electron installer that loads the hosted Bosley site. A successful build confirms packaging, not that every remote service or desktop automation feature works end to end.

## Backend notes

The Supabase project used by this app is the Jarvis project with ref `ywwfqisbmlkjcfoqehph`. Keep changes scoped to that project; do not modify other projects with similar names.

Edge Functions and database policies should be reviewed and tested before enabling additional automation. Keep user data scoped to the authenticated user, keep service-role credentials server-side, and require explicit user confirmation for sensitive actions.
