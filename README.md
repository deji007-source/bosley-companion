# Bosley Companion

Bosley Companion is a browser-first AI companion with a Vite frontend, Supabase-backed services, and an optional Windows Electron wrapper.

**Live app:** https://bosley-companion.vercel.app/  
**Web test bundle:** GitHub Actions → [Build Bosley Web](https://github.com/deji007-source/bosley-companion/actions/workflows/build-web.yml) → download `Bosley-Web-Test-Bundle-*`.  
**Windows installer:** GitHub Actions → [Build Bosley Windows App](https://github.com/deji007-source/bosley-companion/actions/workflows/build-windows.yml) → download `Bosley-Windows-Installer`.  
**Android debug APK:** GitHub Actions → [Build Bosley Android APK](https://github.com/deji007-source/bosley-companion/actions/workflows/build-android.yml) → download `Bosley-Android-Debug-APK`.

## Source-of-truth note

The currently maintained companion experience is the root `index.html`, which contains the inline UI and its Supabase integration. `src/App.tsx` is a separate React prototype and still contains a demo welcome message saying AI is disconnected; do not assume that prototype is the deployed production UI. Avoid implementing the same feature twice. Before migrating the inline experience into React, first port and test authentication, streaming chat, conversation persistence, workspace data, workflow sync, and appearance settings as one controlled migration.

## Current capabilities

- Dark companion interface and floating Windows widget.
- Supabase authentication and a chat Edge Function that streams AI responses.
- Per-user conversation/message persistence in Supabase.
- Per-user workflow storage using `automation_workflows`.
- Second Brain knowledge vault using `user_second_brain_entries`, with Projects/Areas/Resources/Archive categories, searchable notes, optional HTTP(S) source links, and per-user Supabase access policies. Existing engineering notes remain readable during the transition.
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
- **OS command lifecycle:** `os-agent-poll` claims commands as `processing`; it does not mark them `done` when delivered. The desktop agent must acknowledge a claimed command with its claim token before the row becomes `done` or `failed`. Claims abandoned for two minutes are returned to `pending` so a disconnected agent does not leave work stuck. The deployed function source is tracked at `supabase/functions/os-agent-poll/index.ts` and covered by `npm run test:companion`.
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
5. Use **Search skills** to find an imported skill, **Export skills** to back up the local collection as JSON, or disable/delete entries you no longer need. Re-importing a skill with the same ID updates it rather than duplicating it. Imported skills are stored locally in that browser/device; they are not automatically synced to another device.

The skills are guidance, not new tools or permissions. Imported text is treated as untrusted reference material, not system instructions; it cannot enable arbitrary shell commands, skip confirmations, or guarantee that a capability exists. Review files before importing them. If the official-pack button cannot reach GitHub, download `agent-pack/skills.json` from the repository and import it manually. The Windows workflow also publishes a separate `Bosley-Optional-Agent-Pack` artifact.

## System-level visual guide (Windows and Android)

The current Windows installer and Android debug APK include a native visual-guide overlay. It is designed to appear above other applications after the user selects a task's **Guide** action and confirms the prompt. Android also requires the system **Display over other apps** permission. The hosted website alone cannot display an overlay over unrelated apps.

**Current limitations:** Windows can request an explicit screen capture and visually locate a likely control; Android keeps a stationary guide target marker and does not inspect other apps' accessibility content. Both are best-effort matching, not guaranteed identification. The overlay provides visual guidance only; it does not click, type, or read the contents of other apps. A successful CI build confirms the package compiles, not that the overlay has been verified on every device.

### Install and smoke-test the current builds

1. Open the [Web build](https://github.com/deji007-source/bosley-companion/actions/workflows/build-web.yml), [Windows build](https://github.com/deji007-source/bosley-companion/actions/workflows/build-windows.yml), or [Android build](https://github.com/deji007-source/bosley-companion/actions/workflows/build-android.yml) while signed in to GitHub, then choose the latest successful run.
2. In **Artifacts**, download `Bosley-Web-Test-Bundle-*`, `Bosley-Windows-Installer`, or `Bosley-Android-Debug-APK`. Extract the downloaded ZIP. The web bundle contains the production `index.html`; the Windows artifact contains the installer; the Android artifact contains a development-only debug APK.
3. Install and launch Bosley Companion, then sign in if prompted.
4. Open the Activity/Daily Planner, create an active test task, and select **Guide**. Accept the in-app confirmation.
5. On Android, if prompted, enable **Allow display over other apps** for Bosley Companion, return to the app, and try **Guide** again.
6. Switch to another app and check whether the guide card and tether remain visible above it. Use **Stop guide** to close the overlay.
7. Report the platform, Android version or Windows version, and any exact error text if the overlay does not appear. Do not include passwords or tokens.

Workflow artifacts are temporary. New builds may produce newer artifacts; always prefer the latest successful run when testing.

## Backend notes

The Supabase project used by this app is the Jarvis project with ref `ywwfqisbmlkjcfoqehph`. Keep changes scoped to that project; do not modify other projects with similar names.

Edge Functions and database policies should be reviewed and tested before enabling additional automation. Keep user data scoped to the authenticated user, keep service-role credentials server-side, and require explicit user confirmation for sensitive actions.


## iOS simulator build

The **Build Bosley iOS App** workflow creates an unsigned iOS Simulator app from the same production `index.html` used by the website, runs shared regression checks, compiles with Xcode, and installs/launches the app in an iPhone simulator. Download the `Bosley-iOS-Simulator` artifact from the latest successful [iOS workflow run](https://github.com/deji007-source/bosley-companion/actions/workflows/build-ios.yml).

**Important:** this artifact is for the iOS Simulator on a Mac with Xcode. It is not an installable iPhone IPA. Installing on a physical iPhone requires an Apple signing identity, provisioning, and a signed distribution build (for example, through TestFlight). iOS also does not permit the Android-style always-on overlay above unrelated apps; the iOS app provides the in-app companion experience instead.

## Android distribution and Play Protect

The default GitHub Actions artifact is a **debug APK for development testing only**. A successful build does not mean Google Play Protect has reviewed or trusted it. Do not disable Play Protect to install an unfamiliar APK.

For a signed release, configure these GitHub Actions repository secrets using a release keystore that you control: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Keep a secure offline backup of the keystore and passwords; the signing identity must remain stable for future updates. The workflow then produces a signed APK for controlled testing and an Android App Bundle (`.aab`) suitable for uploading to Play Console. Play Console internal testing or a reviewed store release is the preferred distribution path. Signing alone does not guarantee Play Protect approval.

## Trading Dock strategy library

The Trading Dock now has a versioned strategy-library module backed by the Jarvis Supabase project. Signed-in users can save named strategies, append immutable revisions, inspect revision history, and restore an older revision as a new revision. The first portable rule format supports explicit long-only SMA/EMA crossovers and RSI rules with matching 50/50 entry and exit thresholds. The Trading Dock also ships seven selectable examples: SMA 20/50, SMA 10/30, EMA 9/21, EMA 12/26, RSI 14/50, MACD 12/26/9, and Bollinger 20/2. Each preset is validated by the same production parser before it can be loaded into the editor.

Strategy imports accept small JSON-based Bosley Strategy v1 files only. Imported content is parsed as data, checked for supported fields and suspicious executable content, and stored as pending licence/security review. Imports are not executed or activated. Arbitrary Python, JavaScript and shell content is rejected.

Comparison sets pin one saved historical dataset, a date window, and selected strategy revisions. Creating a comparison set does not itself run the comparison; each backtest still needs to be run and verified on the same dataset and date window before results can be compared. Backtests started with a saved strategy revision receive separate execution records and event logs.

The chat assistant routes trading and market-data questions to a market-literacy context. It distinguishes provider history from synthetic demonstration data, explains assumptions and uncertainty, and does not connect brokerage accounts or submit orders.

Run the focused rule/import checks with:

```bash
npm run test:strategy-library
```

The strategy library and audit modules are copied into the web, Android and Windows build artifacts by their respective workflows.


### Cross-platform strategy-library builds

The website, Android WebView package, and Windows Electron package load the same `src/trading/strategy-library.js` and `src/trading/strategy-audit.js` modules from the repository. Their GitHub Actions workflows run the shared companion regression checks, strategy-rule/import checks, and JavaScript syntax checks. Android and Windows workflows also run for pull requests targeting `main`, alongside the website workflow, so a change is checked across all three delivery targets before merge.

The strategy format is intentionally versioned and extensible. Existing supported rule types remain available; additional strategy types should be added only after their exact entry, exit, indicator, and risk semantics are specified and validated. A future custom strategy requested by the user will be added as a separately tested rule type rather than guessed from an incomplete description.
