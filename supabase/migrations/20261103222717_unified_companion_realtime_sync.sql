-- Keep the shared website and Companion views live-synchronized.
-- Every subscribed table already has RLS and per-user ownership policies.
alter publication supabase_realtime
  add table
    public.agent_devices,
    public.automation_workflows,
    public.bosley_planner_tasks,
    public.eng_notes,
    public.eng_projects,
    public.eng_tasks,
    public.user_widget_layouts;
