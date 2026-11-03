# Bosley Companion platform feature matrix

The root `index.html` is the shared companion experience. The website serves it directly, the Windows Electron package copies it into `desktop/index.html`, and the Android workflow copies it into the Capacitor web assets. Shared product features must be implemented in this common experience or in a shared authenticated backend—not separately in a platform prototype.

## Shared product capabilities

| Capability | Website | Windows | Android | Shared state |
|---|---|---|---|---|
| Sign-in and account session | Yes | Yes | Yes | Supabase Auth |
| AI chat and saved conversations | Yes | Yes | Yes | Supabase |
| Saved automation workflows | Yes | Yes | Yes | `automation_workflows` |
| Planner tasks | Yes | Yes | Yes | `bosley_planner_tasks` |
| Appearance and voice profile | Yes | Yes | Yes | `user_widget_layouts` |
| Agent/provider connections | Yes | Yes | Yes | Server-side provider connections |
| Selected AI provider | Yes | Yes | Yes | `user_companion_sync.selected_ai_provider` + native Android bridge |
| Imported skills | Yes | Yes | Yes | `user_companion_sync.skills` + deletion markers; local offline cache |\n| Automation skill selection | Yes | Yes | Yes | `user_companion_sync.automation_skill_settings` |
| Recent automation activity | Yes | Yes | Yes | `user_companion_sync.automation_history` + cross-device clear timestamp |
| Phone automation via Telegram/MacroDroid | Web request | Web request | Native overlay routes through the same authenticated endpoint | Shared remote-action backend |

## Native capabilities (not expected to be identical)

- **Website:** browser permissions only. It cannot draw above unrelated apps or launch arbitrary native desktop applications.
- **Windows:** Electron floating companion, independent movable dock cards, and a restricted allowlisted desktop bridge. Native actions must return a verified result; the bridge is not arbitrary shell access.
- **Android:** system floating overlay, Android speech capture, screen capture/recording after Android's own consent prompt, and native quick actions. These require Android runtime permissions and are not available in a browser tab.

## Release rules

1. Change shared behavior in root `index.html` and shared backend contracts, not in `src/App.tsx` (the separate React prototype).
2. Android and Windows packaging must copy the same root interface.
3. Both desktop and Android pull-request workflows must run the same companion regression suite.
4. Native-only capabilities must be clearly labeled and must fail closed when the platform bridge or permission is unavailable.
5. A green CI build verifies compilation and packaging, not physical-device behavior or live provider credentials.
6. Do not report a queued automation as executed. Require a listener/device acknowledgement for completion.
7. Personal skills, selected AI provider, and recent automation history are account-scoped and protected by RLS. Realtime updates are supplemented by foreground/reconnect sync; local copies are retained if cloud sync is unavailable.
8. Skill deletions and history clears use sync markers so older device copies do not silently restore removed data.

The `scripts/check-platform-parity.mjs` test enforces the shared-source and packaging contracts. Feature-level tests remain in `scripts/check-companion.mjs` and `scripts/check-agent-gateway.mjs`.
