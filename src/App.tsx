import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient, type User } from "@supabase/supabase-js";
import { CircleHelp, Command, Mic, MicOff, Minus, Send, Volume2, VolumeX, X, LogIn, LogOut } from "lucide-react";

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
      <path d="M32 22L39 9Q50 3 61 9L68 22Z" fill="url(#eraser)" stroke="#d95b58" strokeWidth="1.5"/><path d="M32 22H68L67 99Q50 112 33 99Z" fill="url(#pencilBody)" stroke="#d58a0a" strokeWidth="1.5"/><path d="M38 20H62" stroke="#ffd0c5" strokeWidth="3" strokeLinecap="round"/><path d="M33 29H67" stroke="#fff2a5" strokeWidth="2"/><path d="M33 98L50 123 67 98Z" fill="#e7b66b" stroke="#c48c43" strokeWidth="1.5"/><path d="M44 114L50 123 56 114Z" fill="#33343a"/>
      <ellipse cx="43" cy="49" rx="7" ry="9" fill="#fffdf5"/><ellipse cx="57" cy="49" rx="7" ry="9" fill="#fffdf5"/><ellipse className="pupil" cx="44" cy="51" rx="3.6" ry="5" fill="#20232b"/><ellipse className="pupil" cx="56" cy="51" rx="3.6" ry="5" fill="#20232b"/><circle cx="45" cy="49" r="1.4" fill="white"/><circle cx="57" cy="49" r="1.4" fill="white"/><path d="M42 66Q50 74 59 65" stroke="#6d3917" strokeWidth="2.7" fill="none" strokeLinecap="round"/><path d="M45 67Q50 71 56 67" fill="#fff8e8"/><ellipse cx="36" cy="62" rx="3" ry="2" fill="#f58e68" opacity=".65"/><ellipse cx="64" cy="62" rx="3" ry="2" fill="#f58e68" opacity=".65"/>
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
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const nextId = useRef(2);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { userRef.current = data.session?.user ?? null; setUser(data.session?.user ?? null); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      userRef.current = session?.user ?? null;
      setUser(session?.user ?? null);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);

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
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) setNotice("Account created. Check your email to confirm it, then sign in.");
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
        while ((newline = buffer.indexOf("\\n")) >= 0) {
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

  if (collapsed) return <main className="pencil-stage">
    <button className="mascot-launcher" onClick={() => setCollapsed(false)} aria-label="Open Bosley Companion" title="Open Bosley (Ctrl+Shift+B)"><PencilMascot status={status}/></button>
    <div className="mascot-caption">BOSLEY <span>•</span> {status.toUpperCase()}</div><p className="mascot-hint">TAP THE PENCIL TO OPEN</p>
  </main>;

  return <main className="app-shell"><section className="assistant-panel" aria-label="Bosley Companion">
    <header className="topbar"><div className="brand-mark"><PencilMascot status={status} compact/></div><div className="brand-copy"><div className="brand-name">BOSLEY <span>COMPANION</span></div><div className="brand-status"><span className={`status-light ${status === "Listening" ? "status-listening" : ""}`}/>{status}<span className="local-tag">LOCAL UI</span></div></div>
      <div className="window-actions"><button className="icon-button" onClick={() => setCollapsed(true)} title="Collapse to pencil" aria-label="Collapse to pencil"><Minus size={16}/></button><button className="icon-button" onClick={() => setCollapsed(true)} title="Minimize panel" aria-label="Minimize panel"><span>⌄</span></button></div>
    </header>
    <div className="connection-banner"><span className="connection-icon"><CircleHelp size={15}/></span><div><strong>{user ? "Bosley AI connected" : "Sign in to connect Bosley AI"}</strong><span>{user ? `Signed in as ${user.email ?? "your account"}` : "Secure, account-based AI chat and saved conversations."}</span></div><span className="free-pill">{user ? "AI READY" : "SIGN IN"}</span></div>
    {!user && <form className="auth-form" onSubmit={handleAuth}>
      <div className="auth-heading">{authMode === "signin" ? "Welcome back" : "Create your workspace account"}</div>
      <input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email address" aria-label="Email address" required />
      <input type="password" autoComplete={authMode === "signin" ? "current-password" : "new-password"} minLength={8} value={password} onChange={event => setPassword(event.target.value)} placeholder="Password (at least 8 characters)" aria-label="Password" required />
      <button type="submit" className="auth-submit" disabled={authBusy}>{authBusy ? "PLEASE WAIT…" : <><LogIn size={14}/>{authMode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}</>}</button>
      <button type="button" className="auth-switch" onClick={() => setAuthMode(current => current === "signin" ? "signup" : "signin")}>{authMode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}</button>
    </form>}
    {user && <div className="account-strip"><span>{user.email ?? "Signed in"}</span><button onClick={async () => { await supabase.auth.signOut(); setNotice("Signed out."); }} aria-label="Sign out"><LogOut size={13}/> Sign out</button></div>}
    <section className="conversation" aria-live="polite"><div className="day-label"><span/> SESSION STARTED <span/></div>
      {messages.map(message => <article className={`message ${message.role === "you" ? "user-message" : "bosley-message"}`} key={message.id}>
        {message.role === "bosley" && <div className="avatar"><PencilMascot status={status} compact/></div>}
        <div className="message-body"><div className="message-meta">{message.role === "you" ? "YOU" : "BOSLEY"} <span>{message.role === "you" ? "LOCAL INPUT" : "COMPANION"}</span></div><div className="message-bubble">{message.text}</div></div>
      </article>)}
      {transcript && <div className="transcript-preview"><Mic size={13}/> HEARD: “{transcript}”</div>}<div ref={bottomRef}/>
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
