import { useEffect, useRef, useState, type FormEvent } from "react";
import VisualGuide from "./VisualGuide";
import { createClient, type User } from "@supabase/supabase-js";
import { ArrowDown, Check, CircleHelp, Command, Copy, Mic, MicOff, Minus, Send, Volume2, VolumeX, X, LogIn, LogOut, ListTodo, RefreshCw, RotateCcw, Ban, ChevronLeft, CalendarClock, Pause, Play, Trash2, BookOpen, Bot, PlusCircle } from "lucide-react";

const SUPABASE_URL = "https://ywwfqisbmlkjcfoqehph.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhdXRoIiwicmVmIjoieXd3ZnFpc2JtbGtqY2ZvcWVwaHAiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTU4MDYwOSwiZXhwIjoyMDk1MTU2NjA5fQ.__Dwk0-YjWNe9o3EaICSxnJlRKMlJw67XSUc_KjU_sU";
const CHAT_URL = `${SUPABASE_URL}/functions/v1/companion-chat`;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

type Message = { id: number; role: "bosley" | "you"; text: string };
type SpeechAlternative = { transcript: string };
type SpeechResult = { 0: SpeechAlternative; isFinal: boolean };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: SpeechEvent) => void) | null; onerror: ((event: { error?: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type RecognitionConstructor = new () => Recognition;
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };


type BosleySkill = { id: string; title: string; summary: string; capabilities: string[]; instructions: string };

type BosleyClicky = { id: string; name: string; emoji: string; focus: string };
type BosleyRoutine = { id: string; name: string; action_type: "open_app" | "open_url"; target: string; recurrence: "once" | "daily" | "weekly"; timezone: string; scheduled_time: string; weekday: number | null; next_run_at: string; enabled: boolean; last_run_at: string | null };
const DEFAULT_CLICKYS: BosleyClicky[] = [
  { id: "research-scout", name: "Research Scout", emoji: "🔎", focus: "Research topics, compare trustworthy sources and summarise findings with links." },
  { id: "study-coach", name: "Study Coach", emoji: "📚", focus: "Explain school subjects step by step, create practice and check understanding." },
  { id: "project-planner", name: "Project Planner", emoji: "🧭", focus: "Break projects into milestones, organise tasks and track practical next steps." }
];
const ROUTINE_APPS = ["Spotify", "Chrome", "Edge", "Notepad", "Calculator", "Explorer"];
const ROUTINE_URLS = ["https://open.spotify.com/", "https://wa.me/", "https://web.whatsapp.com/", "https://youtube.com", "https://gmail.com", "https://drive.google.com", "https://github.com", "https://chatgpt.com", "https://notion.so"];
function buildWhatsAppChatUrl(phone: string, message = ""): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 8 || digits.length > 15) throw new Error("Enter a valid international phone number including country code.");
  return "https://wa.me/" + digits + (message.trim() ? "?text=" + encodeURIComponent(message.trim()) : "");
}
function localRoutineInstant(dateText: string, timeText: string, timezone: string): string {
  const [year, month, day] = dateText.split("-").map(Number);
  const [hour, minute] = timeText.split(":").map(Number);
  if (![year,month,day,hour,minute].every(Number.isFinite)) throw new Error("Choose a valid date and time.");
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(part => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month)-1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    candidate = desired - (represented - candidate);
  }
  const check = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(part => [part.type, part.value]));
  if (Number(check.year)!==year || Number(check.month)!==month || Number(check.day)!==day || Number(check.hour)!==hour || Number(check.minute)!==minute) throw new Error("That local time does not exist because of a daylight-saving clock change. Choose another time.");
  return new Date(candidate).toISOString();
}

const BOSLEY_SKILLS: BosleySkill[] = [
  { id: "study-tutor", title: "Study Tutor", summary: "Explain concepts, guide practice and review your reasoning.", capabilities: ["Explain step by step", "Offer hints before solutions", "Check understanding"], instructions: "Act as a patient study tutor. Explain concepts clearly, scaffold reasoning, offer hints before full solutions, and check understanding. Do not complete graded work dishonestly." },
  { id: "writing-studio", title: "Writing Studio", summary: "Draft, revise and improve writing while preserving the author's intent.", capabilities: ["Draft and revise", "Improve clarity", "Preserve meaning"], instructions: "Act as a writing editor. Preserve the user's meaning and voice, distinguish suggestions from facts, and never invent personal details, sources, or claims." },
  { id: "app-navigation", title: "App Navigation", summary: "Help navigate apps and websites with safe, user-triggered actions.", capabilities: ["Explain interface steps", "Open allowlisted apps", "Prefer read-only navigation"], instructions: "Act as a safe app-navigation guide. Prefer clear steps and read-only navigation. Only use allowlisted low-risk app launches when the user explicitly starts the saved action. Never submit purchases, send messages, delete data, change security settings, or run arbitrary commands." },
  { id: "project-helper", title: "Project Helper", summary: "Organize project work, identify next steps and review implementation plans.", capabilities: ["Break work into tasks", "Review requirements", "Create verification checklists"], instructions: "Act as a project assistant. Break work into small verifiable steps, preserve existing requirements, state assumptions, and distinguish completed work from proposed work." }
];

const welcome: Message = { id: 1, role: "bosley", text: "Hey, I'm Bosley. Sign in to connect your conversation to the AI companion." };

function PencilMascot({ status, compact = false }: { status: string; compact?: boolean }) {
  return <span className={`pencil-mascot ${compact ? "compact" : ""} mood-${status.toLowerCase().replace(/\s+/g, "-")}`} role="img" aria-label={`Bosley pencil mascot — ${status}`}>
    <span className="pencil-aura" />
    <svg className="pencil-art" viewBox="0 0 100 130" aria-hidden="true">
      <defs><linearGradient id="pencilBody" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#ffe978"/><stop offset=".5" stopColor="#ffc928"/><stop offset="1" stopColor="#f39a12"/></linearGradient><linearGradient id="eraser" x1="0" x2="1"><stop offset="0" stopColor="#ff9a88"/><stop offset="1" stopColor="#f35e62"/></linearGradient></defs>
      <g className="arms" stroke="#f4b51c" strokeWidth="4" strokeLinecap="round" fill="none"><path d="M30 56 Q15 50 12 68 M70 55 Q84 49 88 65"/><path d="M12 68l-5-5m5 5-1 7m1-7 6 2m70-3-4-6m4 6 5-3m-5 3 1 7"/></g>
      <g stroke="#f4b51c" strokeWidth="4" strokeLinecap="round" fill="none"><path d="M39 105l-5 11-6 2m34-13 5 11 6 2"/></g>
      <path d="M36 22L41 10Q50 5 59 10L64 22Z" fill="url(#eraser)" stroke="#d95b58" strokeWidth="1.5"/><path d="M32 22H68L67 99Q50 112 33 99Z" fill="url(#pencilBody)" stroke="#d58a0a" strokeWidth="1.5"/><path d="M40 20H60" stroke="#ffd0c5" strokeWidth="3" strokeLinecap="round"/><path d="M33 29H67" stroke="#fff2a5" strokeWidth="2"/><path d="M33 98L50 123 67 98Z" fill="#e7b66b" stroke="#c48c43" strokeWidth="1.5"/><path d="M44 114L50 123 56 114Z" fill="#33343a"/>
      <ellipse cx="43" cy="49" rx="7" ry="9" fill="#fffdf5"/><ellipse cx="57" cy="49" rx="7" ry="9" fill="#fffdf5"/><ellipse className="pupil" cx="44" cy="51" rx="3.6" ry="5" fill="#20232b"/><ellipse className="pupil" cx="56" cy="51" rx="3.6" ry="5" fill="#20232b"/><circle cx="45" cy="49" r="1.4" fill="white"/><circle cx="57" cy="49" r="1.4" fill="white"/><path className="mouth-line" d="M43 68H57" stroke="#6d3917" strokeWidth="2.7" fill="none" strokeLinecap="round"/><path className="mouth-talk" d="M43 66Q50 78 57 66Q50 69 43 66Z" fill="#6d3917" stroke="#6d3917" strokeWidth="1.2" strokeLinejoin="round"/><ellipse cx="36" cy="62" rx="3" ry="2" fill="#f58e68" opacity=".65"/><ellipse cx="64" cy="62" rx="3" ry="2" fill="#f58e68" opacity=".65"/>
    </svg><span className="pencil-dot"/>
  </span>;
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [notice, setNotice] = useState("");
  const [transcript, setTranscript] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const [sending, setSending] = useState(false);
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [tasks, setTasks] = useState<Array<{id:string;instruction:string;status:string;summary:string|null;created_at:string}>>([]);
  const [taskEvents, setTaskEvents] = useState<Array<{id:string;event_type:string;message:string;created_at:string}>>([]);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskNotice, setTaskNotice] = useState("");
  const [taskInstruction, setTaskInstruction] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<"tasks" | "agents" | "skills" | "routines" | "visual-guide">("tasks");
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const [skillBusy, setSkillBusy] = useState(false);
  const [routines, setRoutines] = useState<BosleyRoutine[]>([]);
  const [clickys, setClickys] = useState<BosleyClicky[]>(DEFAULT_CLICKYS);
  const [activeClickyId, setActiveClickyId] = useState("research-scout");
  const [clickyName, setClickyName] = useState("");
  const [clickyFocus, setClickyFocus] = useState("");
  const [clickyBusy, setClickyBusy] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [routineTarget, setRoutineTarget] = useState("Spotify");
  const [routineRecurrence, setRoutineRecurrence] = useState<"once" | "daily" | "weekly">("daily");
  const [routineDate, setRoutineDate] = useState(() => { const now = new Date(); return now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0"); });
  const [routineTime, setRoutineTime] = useState("08:00");
  const [routineWeekday, setRoutineWeekday] = useState("1");
  const [routineBusy, setRoutineBusy] = useState(false);
  const [whatsAppName, setWhatsAppName] = useState("");
  const [whatsAppPhone, setWhatsAppPhone] = useState("");
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [whatsAppLinks, setWhatsAppLinks] = useState<Array<{name:string;phone:string;url:string}>>([]);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const nextId = useRef(2);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const confirmationReturn = params.get("auth") === "confirmed" || hashParams.has("access_token");
    const callbackError = params.get("error_description") || hashParams.get("error_description") || params.get("error") || hashParams.get("error");
    if (params.get("auth") === "error" || callbackError) setConfirmationError(callbackError || "That confirmation link could not be verified. It may have expired or already been used.");
    if (params.get("auth") === "recovery" || hashParams.get("type") === "recovery") setConfirmationError("Password recovery was opened. Return to sign in or request a new reset link.");
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      if (confirmationReturn && data.session?.user?.email_confirmed_at) {
        setEmailConfirmed(true);
        await supabase.auth.signOut();
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
      userRef.current = data.session?.user ?? null;
      setUser(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (confirmationReturn && session?.user?.email_confirmed_at) {
        setEmailConfirmed(true);
        userRef.current = null;
        setUser(null);
        window.setTimeout(() => { void supabase.auth.signOut(); }, 0);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
      userRef.current = session?.user ?? null;
      setUser(session?.user ?? null);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const saved = user?.user_metadata?.bosley_clickys;
    const restored = Array.isArray(saved) ? saved.filter((item: unknown): item is BosleyClicky => !!item && typeof item === "object" && typeof (item as BosleyClicky).id === "string" && typeof (item as BosleyClicky).name === "string" && typeof (item as BosleyClicky).focus === "string").slice(0, 8) : [];
    const next = restored.length ? restored : DEFAULT_CLICKYS;
    setClickys(next);
    const savedActive = typeof user?.user_metadata?.bosley_active_clicky === "string" ? user.user_metadata.bosley_active_clicky : "";
    setActiveClickyId(next.some(item => item.id === savedActive) ? savedActive : next[0].id);
  }, [user?.id]);

  useEffect(() => {
    const saved = user?.user_metadata?.bosley_whatsapp_links;
    setWhatsAppLinks(Array.isArray(saved) ? saved.filter((item: unknown): item is {name:string;phone:string;url:string} => !!item && typeof item === "object" && typeof (item as any).name === "string" && typeof (item as any).phone === "string" && typeof (item as any).url === "string" && (item as any).url.startsWith("https://wa.me/")).slice(0, 30) : []);
  }, [user?.id]);

  useEffect(() => {
    const saved = user?.user_metadata?.bosley_enabled_skills;
    setEnabledSkills(Array.isArray(saved) ? saved.filter((id: unknown): id is string => typeof id === "string" && BOSLEY_SKILLS.some(skill => skill.id === id)) : []);
  }, [user?.id]);

  useEffect(() => {
    if (!showJumpToLatest) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, showJumpToLatest]);

  function handleConversationScroll() {
    const viewport = conversationRef.current;
    if (!viewport) return;
    setShowJumpToLatest(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 100);
  }
  function jumpToLatest() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setShowJumpToLatest(false);
  }
  async function copyMessage(message: Message) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(message.text);
      else {
        const area = document.createElement("textarea");
        area.value = message.text; area.style.position = "fixed"; area.style.opacity = "0";
        document.body.appendChild(area); area.select();
        if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
        area.remove();
      }
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(current => current === message.id ? null : current), 1500);
    } catch {
      setNotice("Couldn't copy that message. Check clipboard permission and try again.");
    }
  }

  useEffect(() => {
    if (!taskPanelOpen || !user) return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await taskControl({ action: "list", limit: 40 });
        if (active) setTasks(result.tasks || []);
        const routineResult = await supabase.from("bosley_routines").select("*").eq("user_id", user.id).order("next_run_at", { ascending: true }).limit(50);
        if (routineResult.error) throw routineResult.error;
        if (active) setRoutines((routineResult.data || []) as BosleyRoutine[]);
        if (active && selectedTask) {
          const detail = await taskControl({ action: "events", run_id: selectedTask });
          if (active) setTaskEvents(detail.events || []);
        }
      } catch (error) {
        if (active) setTaskNotice(error instanceof Error ? error.message : "Task refresh failed.");
      }
    };
    const timer = window.setInterval(() => { void refresh(); }, 6000);
    return () => { active = false; window.clearInterval(timer); };
  }, [taskPanelOpen, user?.id, selectedTask]);

  useEffect(() => {
    if (!user) {
      setConversationId(null);
      historyRef.current = [];
      setMessages([welcome]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: conversation, error: conversationError } = await supabase
          .from("conversations").select("id").eq("user_id", user.id)
          .order("last_message_at", { ascending: false }).limit(1).maybeSingle();
        if (conversationError) throw conversationError;
        if (cancelled) return;
        setConversationId(conversation?.id ?? null);
        if (!conversation) { historyRef.current = []; setMessages([welcome]); return; }
        const { data: rows, error: messagesError } = await supabase
          .from("messages").select("role,content").eq("user_id", user.id)
          .eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(100);
        if (messagesError) throw messagesError;
        if (cancelled) return;
        const restored = (rows ?? []).filter((row: { role: string; content: string }) => row.role === "user" || row.role === "assistant");
        historyRef.current = restored.map((row: { role: "user" | "assistant"; content: string }) => ({ role: row.role, content: row.content }));
        setMessages(restored.length ? restored.map((row: { role: "user" | "assistant"; content: string }) => ({ id: nextId.current++, role: row.role === "user" ? "you" : "bosley", text: row.content })) : [welcome]);
      } catch (error) {
        console.warn("Bosley conversation restore failed:", error);
        if (!cancelled) setNotice("Signed in, but saved conversation history could not be loaded. Check your workspace permissions.");
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.altKey) && event.shiftKey && event.key.toLowerCase() === "b") { event.preventDefault(); setCollapsed(v => !v); }
      if (event.key === "Escape") { if (listening) stopListening(); setCollapsed(true); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listening]);

  async function taskControl(payload: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) throw new Error("Sign in again to access your task workspace.");
    const response = await fetch(`${SUPABASE_URL}/functions/v1/agent-task-control`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "Task request failed.");
    return result;
  }
  async function loadTasks() {
    setTaskBusy(true); setTaskNotice("");
    try {
      const result = await taskControl({ action: "list", limit: 40 });
      setTasks(result.tasks || []);
      if (selectedTask && !(result.tasks || []).some((task: {id:string}) => task.id === selectedTask)) setSelectedTask(null);
    } catch (error) { setTaskNotice(error instanceof Error ? error.message : "Could not load tasks."); }
    finally { setTaskBusy(false); }
  }

  async function loadRoutines() {
    if (!user) return;
    const { data, error } = await supabase.from("bosley_routines").select("*").eq("user_id", user.id).order("next_run_at", { ascending: true }).limit(50);
    if (error) throw error;
    setRoutines((data || []) as BosleyRoutine[]);
  }
  async function createRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || routineBusy) return;
    setRoutineBusy(true); setTaskNotice("");
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      let scheduleDate = routineDate;
      if (routineRecurrence === "weekly") {
        const selectedDay = new Date(scheduleDate + "T00:00:00");
        const offset = (Number(routineWeekday) - selectedDay.getDay() + 7) % 7;
        selectedDay.setDate(selectedDay.getDate() + offset);
        scheduleDate = selectedDay.getFullYear() + "-" + String(selectedDay.getMonth()+1).padStart(2,"0") + "-" + String(selectedDay.getDate()).padStart(2,"0");
        if (new Date(localRoutineInstant(scheduleDate, routineTime, timezone)).getTime() <= Date.now()) {
          selectedDay.setDate(selectedDay.getDate() + 7);
          scheduleDate = selectedDay.getFullYear() + "-" + String(selectedDay.getMonth()+1).padStart(2,"0") + "-" + String(selectedDay.getDate()).padStart(2,"0");
        }
      }
      const nextRun = localRoutineInstant(scheduleDate, routineTime, timezone);
      if (new Date(nextRun).getTime() <= Date.now()) throw new Error("Choose a future time for this routine.");
      const appTarget = ROUTINE_APPS.find(item => item.toLowerCase() === routineTarget.toLowerCase());
      const urlTarget = ROUTINE_URLS.find(item => item === routineTarget);
      if (!appTarget && !urlTarget) throw new Error("Choose an approved app or website.");
      const action_type = appTarget ? "open_app" : "open_url";
      const { error } = await supabase.from("bosley_routines").insert({
        user_id: user.id, name: routineName.trim() || (appTarget ? "Open " + appTarget : "Open website"),
        action_type, target: appTarget || urlTarget, recurrence: routineRecurrence, timezone,
        scheduled_time: routineTime, weekday: routineRecurrence === "weekly" ? Number(routineWeekday) : null, next_run_at: nextRun
      });
      if (error) throw error;
      setRoutineName("");
      setTaskNotice("Routine saved. Bosley will queue the approved app/site opening at its scheduled time.");
      await loadRoutines();
    } catch (error) { setTaskNotice(error instanceof Error ? error.message : "Could not save routine."); }
    finally { setRoutineBusy(false); }
  }
  async function saveWhatsAppContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) { setTaskNotice("Sign in to save WhatsApp chat links to your account."); return; }
    try {
      const name = whatsAppName.trim();
      if (!name || name.length > 80) throw new Error("Enter the contact name (up to 80 characters).");
      const url = buildWhatsAppChatUrl(whatsAppPhone, whatsAppMessage);
      const phone = whatsAppPhone.replace(/[^0-9]/g, "");
      const next = [{ name, phone, url }, ...whatsAppLinks.filter(item => item.phone !== phone)].slice(0, 30);
      const { data, error } = await supabase.auth.updateUser({ data: { ...user.user_metadata, bosley_whatsapp_links: next } });
      if (error) throw error;
      setWhatsAppLinks(next);
      if (data.user) setUser(data.user);
      setTaskNotice("WhatsApp chat link saved to your account. Open it to review the recipient and message in WhatsApp.");
      setWhatsAppName(""); setWhatsAppPhone(""); setWhatsAppMessage("");
    } catch (error) { setTaskNotice(error instanceof Error ? error.message : "Could not save WhatsApp link."); }
  }
  function openWhatsAppLink(url: string) {
    if (!url.startsWith("https://wa.me/")) { setTaskNotice("That saved WhatsApp link is invalid."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function changeRoutine(routine: BosleyRoutine, action: "toggle" | "run" | "delete") {
    if (!user || routineBusy) return;
    setRoutineBusy(true); setTaskNotice("");
    try {
      if (action === "delete") {
        const { error } = await supabase.from("bosley_routines").delete().eq("id", routine.id).eq("user_id", user.id);
        if (error) throw error;
        setTaskNotice("Routine deleted.");
      } else if (action === "toggle") {
        const { error } = await supabase.from("bosley_routines").update({ enabled: !routine.enabled }).eq("id", routine.id).eq("user_id", user.id);
        if (error) throw error;
        setTaskNotice(routine.enabled ? "Routine paused." : "Routine resumed.");
      } else {
        const instruction = routine.action_type === "open_app" ? "Open " + routine.target : "Open " + routine.target;
        const { data: run, error } = await supabase.from("automation_runs").insert({ user_id: user.id, instruction, status: "pending", summary: "remote_listener_queue:v1" }).select("id").single();
        if (error || !run) throw error || new Error("Could not queue routine.");
        const { error: eventError } = await supabase.from("automation_run_events").insert({ user_id: user.id, run_id: run.id, event_type: "created", message: "Routine run started manually.", details: { routine_id: routine.id, manual: true } });
        if (eventError) throw eventError;
        setTaskNotice("Routine queued to run now.");
      }
      await loadRoutines();
    } catch (error) { setTaskNotice(error instanceof Error ? error.message : "Routine action failed."); }
    finally { setRoutineBusy(false); }
  }
  async function toggleSkill(skillId: string) {
    if (!user || skillBusy) return;
    const next = enabledSkills.includes(skillId) ? enabledSkills.filter(id => id !== skillId) : [...enabledSkills, skillId];
    setSkillBusy(true); setTaskNotice("");
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { ...user.user_metadata, bosley_enabled_skills: next } });
      if (error) throw error;
      if (data.user) { userRef.current = data.user; setUser(data.user); }
      setEnabledSkills(next);
      setTaskNotice(next.includes(skillId) ? "Skill enabled for your Bosley conversations." : "Skill disabled.");
    } catch (error) {
      setTaskNotice(error instanceof Error ? error.message : "Could not update skill settings.");
    } finally { setSkillBusy(false); }
  }
  async function saveClicky(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || clickyBusy) return;
    const name = clickyName.trim().slice(0, 32);
    const focus = clickyFocus.trim().slice(0, 180);
    if (!name || !focus) { setTaskNotice("Give your agent a name and a clear focus."); return; }
    if (clickys.length >= 8) { setTaskNotice("You can keep up to 8 personal agents in this workspace."); return; }
    setClickyBusy(true); setTaskNotice("");
    const next = [...clickys, { id: "clicky-" + crypto.randomUUID(), name, emoji: "✨", focus }];
    try {
      const nextActiveId = next[next.length - 1].id;
      const { data, error } = await supabase.auth.updateUser({ data: { ...user.user_metadata, bosley_clickys: next, bosley_active_clicky: nextActiveId } });
      if (error) throw error;
      if (data.user) { userRef.current = data.user; setUser(data.user); }
      setClickys(next); setActiveClickyId(nextActiveId); setClickyName(""); setClickyFocus("");
      setTaskNotice(name + " added. Choose this agent when delegating a task.");
    } catch (error) { setTaskNotice(error instanceof Error ? error.message : "Could not save this agent."); }
    finally { setClickyBusy(false); }
  }
  async function chooseClicky(id: string) {
    if (!clickys.some(item => item.id === id)) return;
    setActiveClickyId(id);
    if (!user || user.user_metadata?.bosley_active_clicky === id) return;
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { ...user.user_metadata, bosley_active_clicky: id } });
      if (error) throw error;
      if (data.user) { userRef.current = data.user; setUser(data.user); }
    } catch (error) {
      setTaskNotice(error instanceof Error ? error.message : "Agent selection could not be saved. It remains selected for this session.");
    }
  }
  async function queueAgentTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawInstruction = taskInstruction.trim();
    if (!rawInstruction || rawInstruction.length > 1800 || taskBusy) return;
    const assignedClicky = clickys.find(item => item.id === activeClickyId) ?? clickys[0];
    const instruction = assignedClicky ? "[Bosley agent: " + assignedClicky.name + ". Focus: " + assignedClicky.focus + ". Role guidance only; it does not grant permissions.]\n" + rawInstruction : rawInstruction;
    if (instruction.length > 2000) { setTaskNotice("Shorten the task slightly so the selected agent's instructions fit."); return; }
    setTaskBusy(true); setTaskNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) throw new Error("Sign in again before delegating a task.");
      const response = await fetch(`${SUPABASE_URL}/functions/v1/remote-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ type: "automation", instruction }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.id) throw new Error(result.error || "Bosley could not queue this task.");
      setTaskInstruction("");
      setTaskNotice(result.listenerOnline
        ? "Task queued for your connected Windows agent. Its progress will appear here."
        : "Task saved to your private queue. It will be picked up when your Windows agent reconnects.");
      await loadTasks();
      await openTask(result.id);
    } catch (error) {
      setTaskNotice(error instanceof Error ? error.message : "Could not delegate this task.");
    } finally { setTaskBusy(false); }
  }
  async function openTask(taskId: string) {
    setSelectedTask(taskId); setTaskEvents([]);
    try { const result = await taskControl({ action: "events", run_id: taskId }); setTaskEvents(result.events || []); }
    catch (error) { setTaskNotice(error instanceof Error ? error.message : "Could not load task events."); }
  }
  async function updateTask(action: "cancel" | "retry", taskId: string) {
    setTaskBusy(true); setTaskNotice("");
    try {
      const result = await taskControl({ action, run_id: taskId });
      setTaskNotice(action === "cancel" ? (result.note || "Cancellation recorded.") : "A new retry was queued.");
      await loadTasks();
      if (action === "retry" && result.task?.id) await openTask(result.task.id);
      else if (action === "cancel") await openTask(taskId);
    } catch (error) { setTaskNotice(error instanceof Error ? error.message : "Task update failed."); }
    finally { setTaskBusy(false); }
  }
  function speak(text: string) {
    if (!speechEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setStatus("Speaking");
    utterance.onend = () => setStatus("Ready");
    utterance.onerror = () => setStatus("Ready");
    window.speechSynthesis.speak(utterance);
  }
  async function persistExchange(userText: string, assistantText: string, activeUser: User) {
    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const { data, error } = await supabase.from("conversations")
        .insert({ user_id: activeUser.id, title: userText.slice(0, 80) || "New conversation" })
        .select("id").single();
      if (error) throw error;
      activeConversationId = data.id;
      setConversationId(activeConversationId);
    }
    const { error: userError } = await supabase.from("messages").insert({
      conversation_id: activeConversationId, user_id: activeUser.id, role: "user", content: userText
    });
    if (userError) throw userError;
    const { error: assistantError } = await supabase.from("messages").insert({
      conversation_id: activeConversationId, user_id: activeUser.id, role: "assistant", content: assistantText
    });
    if (assistantError) throw assistantError;
    const { error: updateError } = await supabase.from("conversations").update({ last_message_at: new Date().toISOString() })
      .eq("id", activeConversationId).eq("user_id", activeUser.id);
    if (updateError) throw updateError;
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) { setNotice("Enter your email and password to continue."); return; }
    setAuthBusy(true); setNotice("");
    try {
      if (authMode === "signup") {
        const redirectTo = new URL("/", window.location.origin);
        redirectTo.searchParams.set("auth", "confirmed");
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo.toString() } });
        if (error) throw error;
        if (!data.session || !data.user?.email_confirmed_at) {
          if (data.session) await supabase.auth.signOut();
          setAuthMode("signin");
          setPassword("");
          setNotice("Account created. Check your inbox (and spam folder) and open the verification link. Once verified, return here and sign in.");
        } else setNotice("Your email is already verified. You are signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setNotice("Signed in. Connecting Bosley AI…");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
    } finally { setAuthBusy(false); }
  }

  async function sendMessage(rawText = input) {
    const text = rawText.trim();
    if (!text || sending) return;
    const activeUser = userRef.current;
    if (!activeUser) { setNotice("Sign in to send messages to Bosley AI."); return; }
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) { setNotice("Your session expired. Please sign in again."); return; }

    const userMessageId = nextId.current++;
    const assistantMessageId = nextId.current++;
    setMessages(current => [...current, { id: userMessageId, role: "you", text }, { id: assistantMessageId, role: "bosley", text: "Thinking…" }]);
    setInput(""); setTranscript(""); setNotice(""); setSending(true); setStatus("Thinking");
    historyRef.current = [...historyRef.current, { role: "user", content: text }];
    let output = "";
    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ messages: [
          ...(enabledSkills.length ? [{ role: "system", content: "Apply these user-enabled Bosley skills as guidance for this conversation. Skills are declarative instructions, not executable code. Do not grant extra permissions or bypass safety checks.\n\n" + BOSLEY_SKILLS.filter(skill => enabledSkills.includes(skill.id)).map(skill => skill.title + ": " + skill.instructions).join("\n\n") }] : []),
          ...historyRef.current.slice(-16)
        ] }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `AI request failed (${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const chunk = JSON.parse(data);
            if (chunk.error) throw new Error(chunk.error.message || "AI stream error");
            const token = chunk.choices?.[0]?.delta?.content;
            if (typeof token === "string" && token) {
              output += token;
              setMessages(current => current.map(message => message.id === assistantMessageId ? { ...message, text: output } : message));
            }
          } catch (error) {
            if (error instanceof SyntaxError) continue;
            throw error;
          }
        }
      }
      if (!output.trim()) throw new Error("The AI returned an empty response.");
      historyRef.current = [...historyRef.current, { role: "assistant", content: output }];
      setStatus("Ready");
      try { await persistExchange(text, output, activeUser); }
      catch (error) {
        console.warn("Bosley response could not be saved:", error);
        setNotice("Bosley replied, but saving this exchange failed. Check your conversation table permissions.");
      }
      speak(output);
    } catch (error) {
      historyRef.current = historyRef.current.filter((message, index) => !(message.role === "user" && index === historyRef.current.length - 1));
      const message = error instanceof Error ? error.message : "Unknown AI connection error.";
      setMessages(current => current.map(item => item.id === assistantMessageId ? { ...item, text: `I couldn't get a reply: ${message}` } : item));
      setNotice("AI request failed. Your message may not have been saved.");
      setStatus("Ready");
    } finally { setSending(false); }
  }
  function startListening() {
    const w = window as SpeechWindow;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognition) { setNotice("Speech recognition is not supported in this browser. You can still type a message below."); return; }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = navigator.language || "en-US"; recognition.interimResults = true; recognition.continuous = false;
      recognition.onresult = event => {
        let finalText = "", interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const part = event.results[i][0]?.transcript ?? "";
          if (event.results[i].isFinal) finalText += part; else interimText += part;
        }
        setTranscript((finalText || interimText).trim());
        if (finalText.trim()) setInput(current => `${current}${current ? " " : ""}${finalText.trim()}`);
      };
      recognition.onerror = event => {
        setListening(false); setStatus("Ready");
        setNotice(event.error === "not-allowed" ? "Microphone permission was denied. Allow microphone access in browser settings, or type instead." : `Microphone issue${event.error ? `: ${event.error}` : ""}. You can type instead.`);
      };
      recognition.onend = () => { setListening(false); setStatus("Ready"); recognitionRef.current = null; };
      recognitionRef.current = recognition; recognition.start(); setListening(true); setStatus("Listening");
      setNotice("Listening in your browser. Speech recognition availability and processing depend on your browser.");
    } catch { setListening(false); setStatus("Ready"); setNotice("Couldn't start the microphone. Check browser permissions or type a message."); }
  }
  function stopListening() { recognitionRef.current?.stop(); recognitionRef.current = null; setListening(false); setStatus("Ready"); }
  function handleMic() { if (listening) stopListening(); else startListening(); }

  if (emailConfirmed) return <main className="app-shell"><section className="assistant-panel auth-result-panel" aria-live="polite">
    <header className="topbar"><div className="brand-mark"><PencilMascot status="Ready" compact/></div><div className="brand-copy"><div className="brand-name">BOSLEY <span>COMPANION</span></div><div className="brand-status">ACCOUNT VERIFICATION</div></div></header>
    <div className="auth-result-content"><div className="auth-result-icon"><Check size={28}/></div><div className="auth-heading">Email confirmed successfully</div><p>Your email address is verified. You can now return to Bosley and sign in with your email and password.</p><button className="auth-submit" onClick={() => { setEmailConfirmed(false); setConfirmationError(""); setAuthMode("signin"); setNotice("Email confirmed. Sign in to continue."); }}>BACK TO LOGIN <LogIn size={14}/></button></div>
    <footer className="bottom-bar">BOSLEY COMPANION <span>·</span> SECURE ACCOUNT VERIFICATION</footer>
  </section></main>;

  if (collapsed) return <main className="pencil-stage">
    <button className="mascot-launcher" onClick={() => setCollapsed(false)} aria-label="Open Bosley Companion" title="Open Bosley (Ctrl+Shift+B)"><PencilMascot status={status}/></button>
    <div className="mascot-caption">BOSLEY <span>•</span> {status.toUpperCase()}</div><p className="mascot-hint">TAP THE PENCIL TO OPEN</p>
  </main>;

  return <main className="app-shell"><section className="assistant-panel" aria-label="Bosley Companion">
    <header className="topbar"><div className="brand-mark"><PencilMascot status={status} compact/></div><div className="brand-copy"><div className="brand-name">BOSLEY <span>COMPANION</span></div><div className="brand-status"><span className={`status-light ${status === "Listening" ? "status-listening" : ""}`}/>{status}<span className="local-tag">LOCAL UI</span></div></div>
      <div className="window-actions">{user && <button className="icon-button task-launch-button" onClick={() => { setTaskPanelOpen(true); void loadTasks(); }} title="Open task workspace" aria-label="Open task workspace"><ListTodo size={16}/></button>}<button className="icon-button" onClick={() => setCollapsed(true)} title="Collapse to pencil" aria-label="Collapse to pencil"><Minus size={16}/></button><button className="icon-button" onClick={() => setCollapsed(true)} title="Minimize panel" aria-label="Minimize panel"><span>⌄</span></button></div>
    </header>
    <div className="connection-banner"><span className="connection-icon"><CircleHelp size={15}/></span><div><strong>{user ? "Bosley AI connected" : "Sign in to connect Bosley AI"}</strong><span>{user ? `Signed in as ${user.email ?? "your account"}` : "Secure, account-based AI chat and saved conversations."}</span></div><span className="free-pill">{user ? "AI READY" : "SIGN IN"}</span></div>
    {!user && confirmationError && <div className="notice" role="alert">{confirmationError}<button type="button" onClick={() => setConfirmationError("")} aria-label="Dismiss notice"><X size={13}/></button></div>}
    {!user && <form className="auth-form" onSubmit={handleAuth}>
      <div className="auth-heading">{authMode === "signin" ? "Welcome back" : "Create your Bosley account"}</div>
      {authMode === "signup" && <p className="auth-helper">We will email you a verification link. Open it to confirm your address, then come back here to sign in.</p>}
      {authMode === "signin" && <p className="auth-helper">Sign in to restore your private conversations, routines and workspace.</p>}
      <input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email address" aria-label="Email address" required />
      <input type="password" autoComplete={authMode === "signin" ? "current-password" : "new-password"} minLength={authMode === "signup" ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} placeholder={authMode === "signup" ? "Create a password (8+ characters)" : "Password"} aria-label="Password" required />
      <button type="submit" className="auth-submit" disabled={authBusy}>{authBusy ? "PLEASE WAIT…" : <><LogIn size={14}/>{authMode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}</>}</button>
      {authMode === "signin" && <button type="button" className="auth-switch" disabled={authBusy} onClick={async () => {
        if (!email.trim()) { setNotice("Enter your email address first so we can resend the verification link."); return; }
        setAuthBusy(true); setNotice("");
        try {
          const redirectTo = new URL("/", window.location.origin);
          redirectTo.searchParams.set("auth", "confirmed");
          const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: redirectTo.toString() } });
          if (error) throw error;
          setNotice("A fresh verification email has been sent. Check your inbox and spam folder.");
        } catch (error) { setNotice(error instanceof Error ? error.message : "Could not resend the verification email."); }
        finally { setAuthBusy(false); }
      }}>Resend verification email</button>}
      <button type="button" className="auth-switch" onClick={() => { setAuthMode(current => current === "signin" ? "signup" : "signin"); setNotice(""); }}>{authMode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}</button>
    </form>}
    {user && <div className="account-strip"><span>{user.email ?? "Signed in"}</span><button onClick={async () => { await supabase.auth.signOut(); setNotice("Signed out."); }} aria-label="Sign out"><LogOut size={13}/> Sign out</button></div>}
    {taskPanelOpen && <section className="task-workspace" aria-label="Agent task workspace">
      <header className="task-workspace-header"><button className="icon-button task-workspace-mark" aria-label="Bosley workspace"><ListTodo size={17}/></button><div><strong>AGENT WORKSPACE</strong><span>Tasks, skills, routines and visual learning</span></div><span className="workspace-live-indicator">● WORKSPACE</span><button className="icon-button" onClick={() => void loadTasks()} disabled={taskBusy} aria-label="Refresh tasks"><RefreshCw size={15}/></button><button className="icon-button" onClick={() => { setTaskPanelOpen(false); setSelectedTask(null); }} aria-label="Back to chat"><ChevronLeft size={17}/></button><button className="icon-button" onClick={() => setTaskPanelOpen(false)} aria-label="Close task workspace"><X size={16}/></button></header>
      <nav className="workspace-tabs workspace-taskbar" aria-label="Agent workspace sections">
        <button type="button" className={workspaceTab === "tasks" ? "active" : ""} onClick={() => setWorkspaceTab("tasks")}><ListTodo size={13}/> Tasks</button>
        <button type="button" className={workspaceTab === "agents" ? "active" : ""} onClick={() => setWorkspaceTab("agents")}><Bot size={13}/> Agents <span>{clickys.length}</span></button>
        <button type="button" className={workspaceTab === "skills" ? "active" : ""} onClick={() => setWorkspaceTab("skills")}><Command size={13}/> Skills Library <span>{enabledSkills.length} active</span></button>
        <button type="button" className={workspaceTab === "routines" ? "active" : ""} onClick={() => { setWorkspaceTab("routines"); void loadRoutines(); }}><CalendarClock size={13}/> Routines <span>{routines.filter(item => item.enabled).length} active</span></button>
        <button type="button" className={workspaceTab === "visual-guide" ? "active" : ""} onClick={() => setWorkspaceTab("visual-guide")}><BookOpen size={13}/> Visual Guide</button>
      </nav>
      {taskNotice && <div className="task-notice" role="status">{taskNotice}</div>}
      {workspaceTab === "agents" && <div className="clicky-library">
        <div className="clicky-intro"><span className="clicky-kicker">YOUR BOSLEY TEAM</span><h3>Meet your agents</h3><p>Create focused assistants with their own name and job. Choose one when you delegate work; its role travels with the task.</p></div>
        <div className="clicky-grid">{clickys.map(agent => <button type="button" key={agent.id} className={activeClickyId === agent.id ? "clicky-card active" : "clicky-card"} onClick={() => void chooseClicky(agent.id)}><span className="clicky-avatar">{agent.emoji}</span><strong>{agent.name}</strong><small>{agent.focus}</small><span className="clicky-select">{activeClickyId === agent.id ? "SELECTED" : "SELECT AGENT"}</span></button>)}</div>
        <form className="clicky-create" onSubmit={saveClicky}><label>CREATE A NEW AGENT</label><input value={clickyName} onChange={event => setClickyName(event.target.value)} maxLength={32} placeholder="Agent name e.g. Design Helper" required/><textarea value={clickyFocus} onChange={event => setClickyFocus(event.target.value)} maxLength={180} rows={2} placeholder="What should this agent focus on?" required/><button type="submit" disabled={clickyBusy || clickys.length >= 8}><PlusCircle size={14}/>{clickyBusy ? "Saving…" : "Add to my team"}</button><small>Profiles are private to your account. Agents use Bosley's existing approved task and device permissions.</small></form>
      </div>}
      {workspaceTab === "tasks" && <>
      <form className="task-compose" onSubmit={queueAgentTask}>
        <label htmlFor="agent-task-instruction">DELEGATE A TASK</label>
        <div className="task-compose-row"><select aria-label="Choose Bosley agent" value={activeClickyId} onChange={event => void chooseClicky(event.target.value)}>{clickys.map(agent => <option key={agent.id} value={agent.id}>{agent.emoji} {agent.name}</option>)}</select><input id="agent-task-instruction" value={taskInstruction} onChange={event => setTaskInstruction(event.target.value)} maxLength={1800} placeholder="Describe a task for your connected Windows agent…" disabled={taskBusy}/><button type="submit" disabled={taskBusy || !taskInstruction.trim()}><Send size={13}/>{taskBusy ? "Queueing…" : "Delegate"}</button></div>
        <small>Assigned agent: {clickys.find(item => item.id === activeClickyId)?.name ?? "Bosley"}. Tasks are private and remain queued while your Windows agent is offline.</small>
      </form>
      <div className="task-workspace-body">
        <div className="task-list-column"><div className="task-section-label">RECENT TASKS <span>{tasks.length}</span></div>
          {taskBusy && !tasks.length && <div className="task-empty">Loading your tasks…</div>}
          {!taskBusy && !tasks.length && <div className="task-empty">No agent tasks yet. Tasks created by your connected Bosley devices will appear here.</div>}
          {tasks.map(task => <button type="button" key={task.id} className={`task-row ${selectedTask === task.id ? "selected" : ""}`} onClick={() => void openTask(task.id)}>
            <span className={`task-status-dot status-${task.status}`}/><span className="task-row-copy"><strong>{task.instruction}</strong><small>{task.status.toUpperCase()} · {new Date(task.created_at).toLocaleString()}</small></span>
          </button>)}
        </div>
        <div className="task-detail-column">
          {!selectedTask && <div className="task-empty">Select a task to view its activity and available controls.</div>}
          {selectedTask && (() => { const task = tasks.find(item => item.id === selectedTask); return <><div className="task-detail-title"><strong>{task?.instruction || "Task details"}</strong><span>{task?.status?.toUpperCase() || "TASK"}</span></div>
            <div className="task-event-list">{taskEvents.length ? taskEvents.map(event => <article className="task-event" key={event.id}><span>{event.event_type.toUpperCase()}</span><p>{event.message}</p><small>{new Date(event.created_at).toLocaleString()}</small></article>) : <div className="task-empty">No progress events have been recorded for this task yet.</div>}</div>
            <div className="task-actions">{task && ["pending","processing"].includes(task.status) && <button type="button" onClick={() => void updateTask("cancel",task.id)} disabled={taskBusy}><Ban size={14}/> Cancel task</button>}{task && ["failed","cancelled"].includes(task.status) && <button type="button" onClick={() => void updateTask("retry",task.id)} disabled={taskBusy}><RotateCcw size={14}/> Retry task</button>}</div>
          </>; })()}
        </div>
      </div>
      </>}
      {workspaceTab === "routines" && <div className="routines-library">
        <div className="skills-intro"><strong>SCHEDULED ROUTINES</strong><p>Create opt-in routines that open an approved app or trusted website. They run only on the schedule you set and can be paused or deleted any time.</p></div>
        <form className="routine-compose" onSubmit={createRoutine}>
          <label>NEW ROUTINE</label>
          <input value={routineName} onChange={event => setRoutineName(event.target.value)} maxLength={80} placeholder="Routine name (optional)"/>
          <div className="routine-form-grid">
            <label>APP OR WEBSITE<select value={routineTarget} onChange={event => setRoutineTarget(event.target.value)}>{ROUTINE_APPS.map(app => <option key={app} value={app}>{app}</option>)}{ROUTINE_URLS.map(url => <option key={url} value={url}>{url}</option>)}</select></label>
            <label>REPEAT<select value={routineRecurrence} onChange={event => setRoutineRecurrence(event.target.value as "once"|"daily"|"weekly")}><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
            <label>START DATE<input type="date" value={routineDate} onChange={event => setRoutineDate(event.target.value)} required/></label>
            <label>TIME (YOUR TIMEZONE)<input type="time" value={routineTime} onChange={event => setRoutineTime(event.target.value)} required/></label>
            {routineRecurrence === "weekly" && <label>DAY OF WEEK<select value={routineWeekday} onChange={event => setRoutineWeekday(event.target.value)}>{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day,index)=><option key={day} value={index}>{day}</option>)}</select></label>}
          </div>
          <small>Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}. This feature only opens approved apps/sites; it cannot run scripts, send messages or make purchases.</small>
          <button type="submit" disabled={routineBusy}><CalendarClock size={14}/>{routineBusy ? "Saving…" : "Save routine"}</button>
        </form>
        <section className="routine-compose" aria-label="WhatsApp chat links">
          <label>WHATSAPP CHAT LINK</label>
          <p>Enter the contact name and international phone number. Bosley builds and saves the chat URL; WhatsApp opens so you can review and send the message yourself.</p>
          <form onSubmit={saveWhatsAppContact}>
            <input value={whatsAppName} onChange={event => setWhatsAppName(event.target.value)} maxLength={80} placeholder="Contact name" required />
            <input value={whatsAppPhone} onChange={event => setWhatsAppPhone(event.target.value)} inputMode="tel" maxLength={24} placeholder="Phone with country code, e.g. +234..." required />
            <textarea value={whatsAppMessage} onChange={event => setWhatsAppMessage(event.target.value)} maxLength={1000} placeholder="Optional message to prefill" />
            <button type="submit">Save WhatsApp chat link</button>
          </form>
          {whatsAppLinks.length > 0 && <div className="routine-list"><div className="task-section-label">SAVED WHATSAPP LINKS <span>{whatsAppLinks.length}</span></div>{whatsAppLinks.map(item => <div className="routine-item" key={item.phone}><span><strong>{item.name}</strong><small>{item.phone}</small></span><button type="button" onClick={() => openWhatsAppLink(item.url)}>Open chat</button><button type="button" onClick={async () => { const next = whatsAppLinks.filter(link => link.phone !== item.phone); const { error } = await supabase.auth.updateUser({ data: { ...user?.user_metadata, bosley_whatsapp_links: next } }); if (error) setTaskNotice(error.message); else setWhatsAppLinks(next); }}>Delete</button></div>)}</div>}
        </section>
        <div className="routine-list"><div className="task-section-label">YOUR ROUTINES <span>{routines.length}</span></div>
          {!routines.length && <div className="task-empty">No routines yet. Create one above to get started.</div>}
          {routines.map(routine=><article className="routine-card" key={routine.id}>
            <div className="routine-card-copy"><strong>{routine.name}</strong><span>{routine.action_type === "open_app" ? "Open app" : "Open website"} · {routine.target}</span><small>{routine.recurrence === "weekly" ? "Weekly" : routine.recurrence === "daily" ? "Daily" : "Once"} · {routine.scheduled_time.slice(0,5)} · {routine.timezone} · Next: {new Date(routine.next_run_at).toLocaleString()}</small><em>{routine.enabled ? "ACTIVE" : "PAUSED"}</em></div>
            <div className="routine-card-actions"><button type="button" disabled={routineBusy} onClick={()=>void changeRoutine(routine,"run")} title="Run now"><Play size={13}/> Run</button><button type="button" disabled={routineBusy} onClick={()=>void changeRoutine(routine,"toggle")} title={routine.enabled ? "Pause" : "Resume"}>{routine.enabled ? <Pause size={13}/> : <Play size={13}/>} {routine.enabled ? "Pause" : "Resume"}</button><button type="button" disabled={routineBusy} onClick={()=>void changeRoutine(routine,"delete")} title="Delete"><Trash2 size={13}/></button></div>
          </article>)}
        </div>
      </div>}
      {workspaceTab === "visual-guide" && <VisualGuide answer={(() => { const latest = [...messages].reverse().find(message => message.role === "bosley"); return latest && latest.text !== "Thinking…" && !latest.text.startsWith("I couldn\u0027t get a reply:") ? latest.text : ""; })()} onAsk={(prompt) => { setTaskPanelOpen(false); void sendMessage(prompt); }} />}
      {workspaceTab === "skills" && <div className="skills-library">
        <div className="skills-intro"><strong>REUSABLE BOSLEY SKILLS</strong><p>Enable instruction packs for your conversations. Skills are account-scoped guidance only; they do not install code or grant new device permissions.</p></div>
        {BOSLEY_SKILLS.map(skill => <article className="skill-card" key={skill.id}>
          <div className="skill-card-head"><div><strong>{skill.title}</strong><p>{skill.summary}</p></div><button type="button" disabled={skillBusy} className={enabledSkills.includes(skill.id) ? "skill-enabled" : ""} onClick={() => void toggleSkill(skill.id)}>{enabledSkills.includes(skill.id) ? "Enabled" : "Enable"}</button></div>
          <div className="skill-capabilities">{skill.capabilities.map(capability => <span key={capability}>{capability}</span>)}</div>
        </article>)}
        <p className="skills-footnote">Only these reviewed instruction packs are available. Downloaded scripts and arbitrary code are never executed as skills.</p>
      </div>}
    </section>}
    <section ref={conversationRef} onScroll={handleConversationScroll} className="conversation" aria-live="polite"><div className="day-label"><span/> SESSION STARTED <span/></div>
      {messages.map(message => <article className={`message ${message.role === "you" ? "user-message" : "bosley-message"}`} key={message.id}>
        {message.role === "bosley" && <div className="avatar"><PencilMascot status={status} compact/></div>}
        <div className="message-body"><div className="message-meta">{message.role === "you" ? "YOU" : "BOSLEY"} <span>{message.role === "you" ? "LOCAL INPUT" : "COMPANION"}</span></div><div className="message-bubble">{message.text}</div><button type="button" className="message-copy" onClick={() => void copyMessage(message)} aria-label={copiedMessageId === message.id ? "Message copied" : "Copy message"} title="Copy message">{copiedMessageId === message.id ? <Check size={12}/> : <Copy size={12}/>}<span>{copiedMessageId === message.id ? "Copied" : "Copy"}</span></button></div>
      </article>)}
      {transcript && <div className="transcript-preview"><Mic size={13}/> HEARD: “{transcript}”</div>}<div ref={bottomRef}/>
      {showJumpToLatest && <button type="button" className="conversation-jump" onClick={jumpToLatest} aria-label="Jump to latest message" title="Jump to latest message"><ArrowDown size={17}/></button>}
    </section>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={13}/></button></div>}
    <form className="composer" onSubmit={event => { event.preventDefault(); void sendMessage(); }}>
      <button type="button" className={`mic-button ${listening ? "is-listening" : ""}`} onClick={handleMic} title={listening ? "Stop listening" : "Start microphone"} aria-label={listening ? "Stop listening" : "Start microphone"}>{listening ? <MicOff size={18}/> : <Mic size={18}/>}</button>
      <button type="button" className={`push-to-talk-button ${listening ? "is-listening" : ""}`} onPointerDown={event => { event.preventDefault(); if (!listening) startListening(); }} onPointerUp={() => { if (listening) stopListening(); }} onPointerLeave={() => { if (listening) stopListening(); }} onPointerCancel={() => { if (listening) stopListening(); }} onKeyDown={event => { if ((event.key === " " || event.key === "Enter") && !event.repeat && !listening) { event.preventDefault(); startListening(); } }} onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (listening) stopListening(); } }} onContextMenu={event => event.preventDefault()} title="Hold to talk; release to stop" aria-label="Hold to talk, release to stop"><Mic size={14}/><span>Hold</span></button>
      <input value={input} onChange={event => setInput(event.target.value)} placeholder={!user ? "Sign in to chat with Bosley…" : listening ? "Listening… speak now" : "Message Bosley…"} aria-label="Message Bosley" disabled={!user || sending}/>
      <button type="submit" className="send-button" disabled={!user || sending || !input.trim()} aria-label="Send message"><Send size={17}/></button>
    </form>
    <footer className="bottom-bar"><div><span className="keycap"><Command size={11}/></span><span className="keycap">⇧</span><span className="keycap">B</span><span className="shortcut-label">toggle panel</span></div>
      <button className="voice-toggle" onClick={() => { setSpeechEnabled(current => { if (current && "speechSynthesis" in window) window.speechSynthesis.cancel(); return !current; }); setStatus("Ready"); }} title={speechEnabled ? "Disable spoken replies" : "Enable spoken replies"}>{speechEnabled ? <Volume2 size={14}/> : <VolumeX size={14}/>}<span>VOICE {speechEnabled ? "ON" : "OFF"}</span></button>
    </footer>
  </section><div className="app-footnote">BOSLEY COMPANION <span>·</span> {user ? "AUTHENTICATED AI" : "SIGN IN REQUIRED"} <span>·</span> BROWSER COMPANION</div></main>;
}
