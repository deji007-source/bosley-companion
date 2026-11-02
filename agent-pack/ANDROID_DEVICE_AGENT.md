# Android device agent client

This module talks to the deployed `agent-device` Supabase Edge Function using the signed-in user's Supabase session. It registers an Android device, sends presence heartbeats, polls a small command queue while the app is foregrounded, and acknowledges supported commands.

## Current supported commands
- `show_notification`: shows an OS notification if notification permission is already granted; otherwise emits an in-app status event.
- `sync_status`: acknowledges a lightweight status sync.

It deliberately does not execute arbitrary intents, shell commands, accessibility actions, or silently launch apps. Existing Telegram -> MacroDroid automation remains a separate, unchanged integration.

## Integration
Import `createBosleyDeviceAgent` into the Android app's authenticated startup path and pass the existing Supabase client:

```js
import { createBosleyDeviceAgent } from "./agent-pack/android-device-agent.js";

const deviceAgent = createBosleyDeviceAgent({
  supabase,
  onStatus: ({ state, detail }) => {
    // Update the device status UI; optionally surface detail in the app.
  }
});

// Call after Supabase authentication has restored a valid session.
await deviceAgent.start();

// Call on sign-out / app teardown.
deviceAgent.stop();
```

The module polls every 30 seconds and heartbeats every 60 seconds while the WebView is visible. It pauses queue polling while hidden and resumes immediately when the app returns to the foreground.

## 24/7 limitation and next step
A WebView timer is not a 24/7 background service. Android may suspend or kill it when the app is backgrounded. True reliable background delivery needs Firebase Cloud Messaging (FCM) push notifications, plus a native Android receiver/notification path; periodic WorkManager is a fallback for deferred sync, not instant delivery. FCM credentials and Android notification permission must be configured before claiming always-on delivery.

## MacroDroid compatibility
No MacroDroid webhook or Telegram bot configuration is changed here. When an approved task should run an existing MacroDroid routine, the server should continue using the established Telegram trigger flow rather than treating a Telegram notification as proof that an Android native command executed.
