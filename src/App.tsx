import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient, type User } from "@supabase/supabase-js";
import { ArrowDown, Check, CircleHelp, Command, Copy, Mic, MicOff, Minus, Send, Volume2, VolumeX, X, LogIn, LogOut, ListTodo, RefreshCw, RotateCcw, Ban, ChevronLeft } from "lucide-react";

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
    const confirmationReturn = params.get("auth") === "confirmed";
    if (params.get("auth") === "error") setConfirmationError("That confirmation link could not be verified. It may have expired or already been used.");
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
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin + "/?auth=confirmed" } });
        if (error) throw error;
        if (!data.session) setNotice("Account created. Check your email and click the confirmation link. Bosley will then take you to the login page.");
        else setNotice("Account created and signed in.");
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
        body: JSON.stringify({ messages: historyRef.current.slice(-16) }),
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
      <div className="auth-heading">{authMode === "signin" ? "Welcome back" : "Create your workspace account"}</div>
      <input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email address" aria-label="Email address" required />
      <input type="password" autoComplete={authMode === "signin" ? "current-password" : "new-password"} minLength={8} value={password} onChange={event => setPassword(event.target.value)} placeholder="Password (at least 8 characters)" aria-label="Password" required />
      <button type="submit" className="auth-submit" disabled={authBusy}>{authBusy ? "PLEASE WAIT…" : <><LogIn size={14}/>{authMode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}</>}</button>
      {authMode === "signin" && <button type="button" className="auth-switch" onClick={async () => {
        if (!email.trim()) { setNotice("Enter your email address first so we can resend the confirmation link."); return; }
        setAuthBusy(true); setNotice("");
        const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: window.location.origin + "/?auth=confirmed" } });
        setNotice(error ? error.message : "A new confirmation email has been sent. Check your inbox.");
        setAuthBusy(false);
      }}>Resend confirmation email</button>}
      <button type="button" className="auth-switch" onClick={() => { setAuthMode(current => current === "signin" ? "signup" : "signin"); setNotice(""); }}>{authMode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}</button>
    </form>}
    {user && <div className="account-strip"><span>{user.email ?? "Signed in"}</span><button onClick={async () => { await supabase.auth.signOut(); setNotice("Signed out."); }} aria-label="Sign out"><LogOut size={13}/> Sign out</button></div>}
    {taskPanelOpen && <section className="task-workspace" aria-label="Agent task workspace">
      <header className="task-workspace-header"><button className="icon-button" onClick={() => { setTaskPanelOpen(false); setSelectedTask(null); }} aria-label="Back to chat"><ChevronLeft size={17}/></button><div><strong>AGENT WORKSPACE</strong><span>Private tasks for your account</span></div><button className="icon-button" onClick={() => void loadTasks()} disabled={taskBusy} aria-label="Refresh tasks"><RefreshCw size={15}/></button><button className="icon-button" onClick={() => setTaskPanelOpen(false)} aria-label="Close task workspace"><X size={16}/></button></header>
      {taskNotice && <div className="task-notice" role="status">{taskNotice}</div>}
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
      <input value={input} onChange={event => setInput(event.target.value)} placeholder={!user ? "Sign in to chat with Bosley…" : listening ? "Listening… speak now" : "Message Bosley…"} aria-label="Message Bosley" disabled={!user || sending}/>
      <button type="submit" className="send-button" disabled={!user || sending || !input.trim()} aria-label="Send message"><Send size={17}/></button>
    </form>
    <footer className="bottom-bar"><div><span className="keycap"><Command size={11}/></span><span className="keycap">⇧</span><span className="keycap">B</span><span className="shortcut-label">toggle panel</span></div>
      <button className="voice-toggle" onClick={() => { setSpeechEnabled(current => { if (current && "speechSynthesis" in window) window.speechSynthesis.cancel(); return !current; }); setStatus("Ready"); }} title={speechEnabled ? "Disable spoken replies" : "Enable spoken replies"}>{speechEnabled ? <Volume2 size={14}/> : <VolumeX size={14}/>}<span>VOICE {speechEnabled ? "ON" : "OFF"}</span></button>
    </footer>
  </section><div className="app-footnote">BOSLEY COMPANION <span>·</span> {user ? "AUTHENTICATED AI" : "SIGN IN REQUIRED"} <span>·</span> BROWSER COMPANION</div></main>;
}
