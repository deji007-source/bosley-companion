import { useEffect, useRef, useState } from "react";
import { AudioLines, CircleHelp, Command, Mic, MicOff, Minus, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";

type Message = { id: number; role: "bosley" | "you"; text: string };
type SpeechAlternative = { transcript: string };
type SpeechResult = { 0: SpeechAlternative; isFinal: boolean };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: SpeechEvent) => void) | null; onerror: ((event: { error?: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type RecognitionConstructor = new () => Recognition;
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

const welcome: Message = { id: 1, role: "bosley", text: "Hey! I'm Bosley. This companion is running locally in your browser. AI is not connected yet, so I can help you test the interface, microphone, and spoken replies." };

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [notice, setNotice] = useState("");
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const nextId = useRef(2);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.altKey) && event.shiftKey && event.key.toLowerCase() === "b") { event.preventDefault(); setCollapsed(current => !current); }
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

  function sendMessage(rawText = input) {
    const text = rawText.trim();
    if (!text) return;
    const reply = "I received your message in the interface, but AI is not connected yet. When you're ready, we can connect an approved model without putting secrets in the public code.";
    setMessages(current => [...current, { id: nextId.current++, role: "you", text }, { id: nextId.current++, role: "bosley", text: reply }]);
    setInput(""); setTranscript("");
    setNotice("AI is disconnected. Your message stays in this browser and has not been sent to an AI service.");
    if (speechEnabled) speak(reply); else setStatus("Ready");
  }

  function startListening() {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) { setNotice("Speech recognition is not supported in this browser. You can still type a message below."); return; }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = navigator.language || "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = event => {
        let finalText = ""; let interimText = "";
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
      recognitionRef.current = recognition; recognition.start();
      setListening(true); setStatus("Listening");
      setNotice("Listening in your browser. Speech recognition availability and processing depend on your browser.");
    } catch { setListening(false); setStatus("Ready"); setNotice("Couldn't start the microphone. Check browser permissions or type a message."); }
  }

  function stopListening() { recognitionRef.current?.stop(); recognitionRef.current = null; setListening(false); setStatus("Ready"); }
  function handleMic() { if (listening) stopListening(); else startListening(); }

  if (collapsed) return <main className="orb-stage">
    <button className="orb" onClick={() => setCollapsed(false)} aria-label="Open Bosley Companion" title="Open Bosley (Ctrl+Shift+B)"><span className="orb-glow"/><AudioLines size={26} strokeWidth={1.8}/><span className="orb-dot"/></button>
    <div className="orb-caption">BOSLEY <span>•</span> {status.toUpperCase()}</div>
  </main>;

  return <main className="app-shell">
    <section className="assistant-panel" aria-label="Bosley Companion">
      <header className="topbar">
        <div className="brand-mark"><Sparkles size={18}/></div>
        <div className="brand-copy"><div className="brand-name">BOSLEY <span>COMPANION</span></div><div className="brand-status"><span className="status-light"/> {status} <span className="local-tag">LOCAL UI</span></div></div>
        <div className="window-actions"><button className="icon-button" onClick={() => setCollapsed(true)} title="Collapse to orb" aria-label="Collapse to orb"><Minus size={16}/></button><button className="icon-button" onClick={() => setCollapsed(true)} title="Minimize panel" aria-label="Minimize panel"><span>⌄</span></button></div>
      </header>
      <div className="connection-banner"><span className="connection-icon"><CircleHelp size={15}/></span><div><strong>AI disconnected</strong><span>No API calls or cloud AI are active.</span></div><span className="free-pill">FREE MODE</span></div>
      <section className="conversation" aria-live="polite">
        <div className="day-label"><span/> SESSION STARTED <span/></div>
        {messages.map(message => <article className={`message ${message.role === "you" ? "user-message" : "bosley-message"}`} key={message.id}>
          {message.role === "bosley" && <div className="avatar"><Sparkles size={14}/></div>}
          <div className="message-body"><div className="message-meta">{message.role === "you" ? "YOU" : "BOSLEY"} <span>{message.role === "you" ? "LOCAL INPUT" : "COMPANION"}</span></div><div className="message-bubble">{message.text}</div></div>
        </article>)}
        {transcript && <div className="transcript-preview"><Mic size={13}/> HEARD: “{transcript}”</div>}
        <div ref={bottomRef}/>
      </section>
      {notice && <div className="notice">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={13}/></button></div>}
      <form className="composer" onSubmit={event => { event.preventDefault(); sendMessage(); }}>
        <button type="button" className={`mic-button ${listening ? "is-listening" : ""}`} onClick={handleMic} title={listening ? "Stop listening" : "Start microphone"} aria-label={listening ? "Stop listening" : "Start microphone"}>{listening ? <MicOff size={18}/> : <Mic size={18}/>}</button>
        <input value={input} onChange={event => setInput(event.target.value)} placeholder={listening ? "Listening… speak now" : "Message Bosley…"} aria-label="Message Bosley"/>
        <button type="submit" className="send-button" disabled={!input.trim()} aria-label="Send message"><Send size={17}/></button>
      </form>
      <footer className="bottom-bar">
        <div><span className="keycap"><Command size={11}/></span><span className="keycap">⇧</span><span className="keycap">B</span><span className="shortcut-label">toggle panel</span></div>
        <button className="voice-toggle" onClick={() => { setSpeechEnabled(current => { if (current && "speechSynthesis" in window) window.speechSynthesis.cancel(); return !current; }); setStatus("Ready"); }} title={speechEnabled ? "Disable spoken replies" : "Enable spoken replies"}>{speechEnabled ? <Volume2 size={14}/> : <VolumeX size={14}/>}<span>VOICE {speechEnabled ? "ON" : "OFF"}</span></button>
      </footer>
    </section>
    <div className="app-footnote">BOSLEY COMPANION <span>·</span> AI NOT CONNECTED <span>·</span> BROWSER PROTOTYPE</div>
  </main>;
}