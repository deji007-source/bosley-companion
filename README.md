# Bosley Companion

Bosley Companion is a browser-first AI companion with a Vite frontend, Supabase-backed services, and an optional Windows Electron wrapper.

**Live app:** https://bosley-companion.vercel.app/  
**Windows build:** GitHub Actions → **Build Bosley Windows App** workflow.  
**Android build:** GitHub Actions → **Build Bosley Android APK** workflow.

## Source-of-truth note

The currently maintained companion experience is the root `index.html`, which contains the inline UI and its Supabase integration. `src/App.tsx` is a separate React prototype and still contains a demo welcome message saying AI is disconnected; do not assume that prototype is the deployed production UI. Avoid implementing the same feature twice. Before migrating the inline experience into React, first port and test authentication, streaming chat, conversation persistence, workspace data, workflow sync, and appearance settings as one controlled migration.

## Current capabilities

- Dark companion interface and floating Windows widget.
- Supabase authentication and a chat Edge Function that streams AI responses.
- Per-user conversation/message persistence in Supabase.
- Per-user workflow storage using `automation_workflows`.
- Automation execution history persists locally per signed-in user (up to 12 recent status entries), survives page refreshes, and can be cleared from the Automation panel. History stays in that browser's local storage; it is not uploaded to the cloud.
- Saved-workflow command dispatch: chat messages such as `Open Spotify`, `run Open Spotify`, `please run my Morning Research automation`, and `could you start Morning Research for me` are matched to the signed-in user's saved workflow names before AI chat fallback. Matching ignores case and punctuation and tolerates common polite prefixes/suffixes; the existing workflow runner executes configured steps and records step-level results.
- Voice profiles: Jarvis-style, natural assistant, and system default. Voice selection prioritizes available English voices, reports the actual selected device voice when available, follows the selected voice's language, and falls back to browser/device defaults when voice metadata is unavailable. The Jarvis-style profile uses slower, lower-pitch speech settings; exact timbre depends on the browser and operating system.
- Browser-safe workflow actions such as opening URLs, web search, creating a text file, and preparing a message draft.
- Allowlisted natural-language website launch commands in chat, including `open Spotify`, `open Google`, `open YouTube`, `open Gmail`, `open Google Drive`, `open WhatsApp`, `open Telegram`, `open GitHub`, `open ChatGPT`, `open Notion`, and `open Discord`. These open the corresponding website in a browser tab; they do not guarantee launch of a native desktop app. Browser pop-up permission is required.
- Allowlisted Windows desktop launch commands for `Chrome`, `Edge`, `Notepad`, `Calculator`, and `File Explorer`. These require the installed Windows desktop companion and a user confirmation dialog; the website-only version cannot launch native apps. Arbitrary commands, executable paths, and shell arguments are not accepted.
- Voice-related Edge Functions and browser speech features, subject to browser/device support.
- Remote action queue and an OS-agent polling endpoint.

Some of these integrations have been implemented in code but still require end-to-end testing against the deployed app. Do not assume a feature is operational merely because its function or UI exists.

## Important limitations

- **Native desktop automation remains limited.** The Electron wrapper now has a restricted native bridge for specific actions, including opening/stopping the system visual guide and allowlisted app launches. This is not general-purpose remote control of arbitrary apps.
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

### Import and use Bosley skills on Windows

1. Download and install the latest **Bosley-Windows-Installer** artifact.
2. Open Bosley and select **Skills** in the workspace side dock.
3. Choose **Load official skill pack** to import the repository's default skills, or choose **Import skill file** to load a local `.json`, `.md`, `.markdown`, or `.txt` file (maximum 100 KB).
4. Enable the specific skills you want Bosley to consider. Ask for the task normally in chat; relevant enabled skill text is attached as optional context.
5. Disable or delete skills when no longer needed. Imported skills are stored locally in that browser/device; they are not automatically synced to another device.

The skills are guidance, not new tools or permissions. Imported text is treated as untrusted reference material, not system instructions; it cannot enable arbitrary shell commands, skip confirmations, or guarantee that a capability exists. Review files before importing them. If the official-pack button cannot reach GitHub, download `agent-pack/skills.json` from the repository and import it manually. The Windows workflow also publishes a separate `Bosley-Optional-Agent-Pack` artifact.

## System-level visual guide (Windows and Android)

The current Windows installer and Android debug APK include a native visual-guide overlay. It is designed to appear above other applications after the user selects a task's **Guide** action and confirms the prompt. Android also requires the system **Display over other apps** permission. The hosted website alone cannot display an overlay over unrelated apps.

**Current limitations:** Windows can request an explicit screen capture and visually locate a likely control; Android keeps a stationary guide target marker and does not inspect other apps' accessibility content. Both are best-effort matching, not guaranteed identification. The overlay provides visual guidance only; it does not click, type, or read the contents of other apps. A successful CI build confirms the package compiles, not that the overlay has been verified on every device.

### Install and smoke-test the current builds

1. Open the [Windows build workflow](https://github.com/deji007-source/bosley-companion/actions/runs/40003886128) or [Android build workflow](https://github.com/deji007-source/bosley-companion/actions/runs/40003886096) while signed in to GitHub.
2. In **Artifacts**, download `Bosley-Windows-Installer` or `Bosley-Android-Debug-APK`. Extract the downloaded ZIP to get the installer/APK.
3. Install and launch Bosley Companion, then sign in if prompted.
4. Open the Activity/Daily Planner, create an active test task, and select **Guide**. Accept the in-app confirmation.
5. On Android, if prompted, enable **Allow display over other apps** for Bosley Companion, return to the app, and try **Guide** again.
6. Switch to another app and check whether the guide card and tether remain visible above it. Use **Stop guide** to close the overlay.
7. Report the platform, Android version or Windows version, and any exact error text if the overlay does not appear. Do not include passwords or tokens.

These workflow artifacts are temporary and are scheduled to expire on 6 November 2026. New builds may produce newer artifacts; prefer the latest successful run when testing.

## Backend notes

The Supabase project used by this app is the Jarvis project with ref `ywwfqisbmlkjcfoqehph`. Keep changes scoped to that project; do not modify other projects with similar names.

Edge Functions and database policies should be reviewed and tested before enabling additional automation. Keep user data scoped to the authenticated user, keep service-role credentials server-side, and require explicit user confirmation for sensitive actions.


## Android distribution and Play Protect

The default GitHub Actions artifact is a **debug APK for development testing only**. A successful build does not mean Google Play Protect has reviewed or trusted it. Do not disable Play Protect to install an unfamiliar APK.

For a signed release, configure these GitHub Actions repository secrets using a release keystore that you control: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Keep a secure offline backup of the keystore and passwords; the signing identity must remain stable for future updates. The workflow then produces a signed APK for controlled testing and an Android App Bundle (`.aab`) suitable for uploading to Play Console. Play Console internal testing or a reviewed store release is the preferred distribution path. Signing alone does not guarantee Play Protect approval.
