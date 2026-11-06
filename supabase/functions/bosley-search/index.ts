import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const recent = new Map<string, number[]>();
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const clean = (value: unknown, max = 700) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const html = (value: string) => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
function publicResults(page: string) {
  const results: any[] = [];
  const blocks = page.split(/<div\b[^>]*class=["'][^"']*\bresult\b[^"']*["'][^>]*>/i).slice(1);
  const candidates = blocks.length ? blocks : [page];
  for (const block of candidates) {
    const openTag = block.match(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*>/i)?.[0];
    if (!openTag) continue;
    const rawHref = openTag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!rawHref) continue;
    const titleStart = block.indexOf(openTag) + openTag.length;
    const titleEnd = block.indexOf("</a>", titleStart);
    if (titleEnd < 0) continue;
    let href = html(rawHref);
    try {
      const parsed = new URL(href, "https://html.duckduckgo.com");
      const redirect = parsed.searchParams.get("uddg");
      href = redirect ? decodeURIComponent(redirect) : parsed.href;
      const target = new URL(href);
      if (!["https:", "http:"].includes(target.protocol)) continue;
    } catch { continue; }
    const title = clean(html(block.slice(titleStart, titleEnd).replace(/<[^>]+>/g, " ")), 180);
    if (!title || results.some(x => x.url === href)) continue;
    const snippetMatch = block.match(/<div\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    results.push({ title, url: href, snippet: clean(html((snippetMatch?.[1] ?? "").replace(/<[^>]+>/g, " ")), 420), source: "web" });
    if (results.length >= 8) break;
  }
  return results;
}
function score(row: any, terms: string[]) {
  const title = clean(row.title).toLowerCase(), body = clean(row.body).toLowerCase();
  return terms.reduce((n, term) => n + (title.includes(term) ? 5 : 0) + (body.includes(term) ? 2 : 0), 0);
}
Deno.serve(async (req: Request) => {
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in required" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Sign in required" }, 401);
  const userId = auth.user.id;
  const now = Date.now(), recentCalls = (recent.get(userId) ?? []).filter(t => now - t < 60_000);
  if (recentCalls.length >= 12) return json({ error: "Search is busy. Try again shortly." }, 429);
  recentCalls.push(now); recent.set(userId, recentCalls);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid search request." }, 400); }
  const query = clean(body?.query, 180);
  if (query.length < 2) return json({ error: "Enter at least two characters to search." }, 400);
  const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 1))].slice(0, 12);
  const internal: any[] = [];
  const jobs = await Promise.allSettled([
    admin.from("user_second_brain_entries").select("id,title,content,url,category,tags,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(100),
    admin.from("tasks").select("id,title,notes,status,priority,due_at,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(60),
    admin.from("memories").select("id,content,kind,importance,updated_at").eq("user_id", userId).order("importance", { ascending: false }).limit(60),
    admin.from("eng_projects").select("id,name,description,discipline,status,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(40),
    admin.from("eng_tasks").select("id,title,done,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(60),
    admin.from("reminders").select("id,title,body,fires_at,recurrence,is_active,updated_at").eq("user_id", userId).eq("is_active", true).order("fires_at", { ascending: true }).limit(40),
    admin.from("schedules").select("id,title,notes,location,starts_at,kind,updated_at").eq("user_id", userId).order("starts_at", { ascending: true }).limit(40),
    admin.from("bosley_planner_tasks").select("task_id,title,kind,priority,project,due,status,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(60),
  ]);
  const [brain, tasks, memories, projects, engTasks, reminders, schedules, planner] = jobs.map(x => x.status === "fulfilled" ? x.value : { data: [], error: x.reason });
  for (const [label, result] of [["Second Brain", brain], ["Tasks", tasks], ["Memories", memories], ["Projects", projects], ["Project tasks", engTasks], ["Reminders", reminders], ["Schedules", schedules], ["Planner tasks", planner]] as any[]) {
    if (result.error) console.warn("Bosley search source unavailable:", label, String(result.error).slice(0, 140));
  }
  for (const x of brain.data ?? []) internal.push({ title: clean(x.title, 180), body: clean(x.content, 700), url: clean(x.url, 1200), kind: "Second Brain", category: clean(x.category, 60), updatedAt: x.updated_at });
  for (const x of tasks.data ?? []) internal.push({ title: clean(x.title, 180), body: clean(x.notes, 700), kind: "Task", category: clean(x.status, 40), updatedAt: x.updated_at });
  for (const x of memories.data ?? []) internal.push({ title: clean(x.kind || "Memory", 80), body: clean(x.content, 700), kind: "Memory", updatedAt: x.updated_at });
  for (const x of projects.data ?? []) internal.push({ title: clean(x.name, 180), body: clean([x.description, x.discipline, x.status].filter(Boolean).join(" · "), 700), kind: "Project", updatedAt: x.updated_at });
  for (const x of engTasks.data ?? []) internal.push({ title: clean(x.title, 180), body: x.done ? "Completed project task" : "Open project task", kind: "Project task", updatedAt: x.created_at });
  for (const x of reminders.data ?? []) internal.push({ title: clean(x.title, 180), body: clean([x.body, x.recurrence, x.fires_at].filter(Boolean).join(" · "), 700), kind: "Reminder", category: "active", updatedAt: x.updated_at });
  for (const x of schedules.data ?? []) internal.push({ title: clean(x.title, 180), body: clean([x.notes, x.location, x.kind, x.starts_at].filter(Boolean).join(" · "), 700), kind: "Schedule", updatedAt: x.updated_at });
  for (const x of planner.data ?? []) internal.push({ title: clean(x.title, 180), body: clean([x.kind, x.project, x.priority, x.status, x.due].filter(Boolean).join(" · "), 700), kind: "Planner task", updatedAt: x.updated_at });
  const brainResults = internal.map(x => ({ ...x, score: score(x, terms) })).filter(x => x.score > 0).sort((a,b) => b.score-a.score).slice(0, 12).map(({score: _score, ...x}) => ({...x, source:"brain"}));
  let web: any[] = [], webError = "";
  if (body?.web !== false) {
    try {
      const response = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), { headers: { "User-Agent": "Mozilla/5.0 (compatible; BosleySearch/1.0)", "Accept": "text/html" }, signal: AbortSignal.timeout(8500) });
      if (!response.ok) throw new Error("Public search returned HTTP " + response.status);
      web = publicResults(await response.text());
      if (!web.length) webError = "The public search engine did not return parseable results. Use the external search link below.";
    } catch (error) { webError = "Live web results are temporarily unavailable. Your personal knowledge search still works."; console.warn("Bosley public search unavailable:", String(error).slice(0,160)); }
  }
  return json({ query, internal: brainResults, web, webError, externalSearchUrl: "https://duckduckgo.com/?q=" + encodeURIComponent(query), searchedAt: new Date().toISOString() });
});
