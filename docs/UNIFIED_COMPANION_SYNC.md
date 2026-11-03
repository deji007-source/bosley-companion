# Unified Bosley Companion sync

## Purpose

The Bosley website and installed Companion builds use the same authenticated Supabase account and shared records. Users do not need to export or import files to make ordinary workspace data available across the website, Android and Windows.

## Shared data

- Second Brain resources and notes: `user_second_brain_entries`, legacy `eng_notes`
- Tasks: `tasks`, `bosley_planner_tasks`, `eng_tasks`
- Saved memories: `memories`
- Reminders and schedules: `reminders`, `schedules`
- Automation: `automation_workflows`, `agent_devices`
- Companion preferences/layout: `user_companion_sync`, `user_widget_layouts`
- Notifications: `notifications`

## Live updates

The Companion opens one Supabase Realtime Postgres Changes channel after authentication. It subscribes to the account-owned rows using a `user_id=eq.<authenticated-user-id>` filter. RLS remains enabled and is the database authorization boundary. Changes trigger targeted workspace, planner, preferences or workflow refreshes. The channel is removed on sign-out or account change.

The publication migration is `20261103222717_unified_companion_realtime_sync.sql`.

## AI context retrieval

Before a chat request, Bosley retrieves bounded, account-scoped records from the Second Brain, saved memories, open tasks, active reminders and upcoming schedules. It ranks matches against the user's current message and includes a small number of relevant records in the AI context. Source URLs are retained. Retrieved record text is untrusted reference data, not instructions.

The retrieval path is best-effort: if one of the supporting queries fails, Bosley logs the issue and continues without adding private workspace context. It does not expose one account's records to another account.

## Research sources

The Research Library is an always-available shared module, not a mandatory import step. Users can save public resources to the Second Brain vault, open source links from any build, and ask Bosley to retrieve relevant saved references. Importing a personal Start.me export remains optional and is only needed to copy that external account's private bookmark collection into Bosley.

## Validation

- Realtime publication membership verified in Supabase after migration.
- RLS enabled and ownership policies verified on subscribed private tables.
- JavaScript syntax and companion regression checks run in GitHub Actions.
- Live external web research remains dependent on an available search integration; saved resources and workspace recall work independently.
