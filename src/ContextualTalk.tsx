import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Camera, ImagePlus, Send, X, RefreshCw, ShieldCheck, MonitorUp, Trash2 } from "lucide-react";

const SUPABASE_URL = "https://ywwfqisbmlkjcfoqehph.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhdXRoIiwicmVmIjoieXd3ZnFpc2JtbGtqY2ZvcWVwaHAiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTU4MDYwOSwiZXhwIjoyMDk1MTU2NjA5fQ.__Dwk0-YjWNe9o3EaICSxnJlRKMlJw67XSUc_KjU_sU";
const CHAT_URL = SUPABASE_URL + "/functions/v1/companion-chat";
// Share the same persisted Supabase auth key as the main Bosley application.
const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: "sb-ywwfqisbmlkjcfoqehph-auth-token", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
});
type Capture = { dataUrl: string; label: string };

async function compressImage(source: Blob): Promise<string> {
  if (!source.type.startsWith("image/")) throw new Error("Choose a JPEG, PNG or WebP image.");
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image preview is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.76, 0.64, 0.52, 0.42]) {
      const encoded = canvas.toDataURL("image/jpeg", quality);
      if (encoded.length <= 1_300_000) return encoded;
    }
    throw new Error("This image is still too large. Choose a smaller image or crop it first.");
  } finally { bitmap.close(); }
}

export default function ContextualTalk() {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    let alive = true;
    authClient.auth.getSession().then(({ data }) => { if (alive) setSignedIn(!!data.session?.user); });
    const { data } = authClient.auth.onAuthStateChange((_event, session) => setSignedIn(!!session?.user));
    return () => { alive = false; data.subscription.unsubscribe(); recognitionRef.current?.stop(); };
  }, []);

  async function captureScreen() {
    setNotice("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setNotice("Screen capture is not supported here. Choose an image instead.");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      // This call is only reachable from the user's explicit Capture screen click.
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("No screen or window was selected.");
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (!canvas.width || !canvas.height) throw new Error("The selected screen did not provide an image.");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the screenshot.");
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Screenshot encoding failed.")), "image/jpeg", .82));
      const dataUrl = await compressImage(blob);
      setCapture({ dataUrl, label: "Screen capture preview" });
      setAnswer("");
      setNotice("Preview ready. Nothing has been sent yet.");
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      setNotice(name === "NotAllowedError" ? "Screen sharing was cancelled or permission was denied." : error instanceof Error ? error.message : "Screen capture failed.");
    } finally {
      stream?.getTracks().forEach(track => track.stop());
    }
  }

  async function chooseImage(file?: File) {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setCapture({ dataUrl, label: file.name || "Selected image" });
      setAnswer("");
      setNotice("Image preview ready. Nothing has been sent yet.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not prepare that image."); }
  }

  function dictate() {
    const w = window as Window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Speech = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Speech) { setNotice("Speech recognition is unavailable. Type your question instead."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    try {
      const recognition = new Speech();
      recognition.lang = navigator.language || "en-US";
      recognition.interimResults = false;
      recognition.onresult = (event: any) => {
        const text = Array.from(event.results as ArrayLike<any>).map((result: any) => result[0]?.transcript || "").join(" ").trim();
        if (text) setQuestion(current => (current ? current + " " : "") + text);
      };
      recognition.onerror = () => { setNotice("Microphone access failed. You can type instead."); setListening(false); };
      recognition.onend = () => { setListening(false); recognitionRef.current = null; };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch { setNotice("Could not start dictation. Check microphone permission."); }
  }

  async function askBosley(event: React.FormEvent) {
    event.preventDefault();
    if (!capture || !question.trim() || busy) return;
    const { data } = await authClient.auth.getSession();
    const session = data.session;
    if (!session) { setNotice("Sign in to use Contextual Talk."); setSignedIn(false); return; }
    setBusy(true); setNotice(""); setAnswer("Bosley is examining the image…");
    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({ messages: [{ role: "user", content: [
          { type: "text", text: question.trim() },
          { type: "image_url", image_url: { url: capture.dataUrl } }
        ] }] })
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Visual question failed (" + response.status + ").");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", output = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const chunk = JSON.parse(data);
            if (chunk.error) throw new Error(chunk.error.message || "Visual analysis failed.");
            const token = chunk.choices?.[0]?.delta?.content;
            if (typeof token === "string") { output += token; setAnswer(output); }
          } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
        }
      }
      if (!output.trim()) throw new Error("Bosley returned an empty visual analysis.");
    } catch (error) {
      setAnswer("");
      setNotice(error instanceof Error ? error.message : "Visual analysis failed.");
    } finally { setBusy(false); }
  }

  if (!signedIn) return null;
  return <>
    <button className="contextual-launch" type="button" onClick={() => setOpen(true)} aria-label="Open Contextual Talk" title="Show Bosley what you're looking at">
      <Camera size={16}/><span>Ask about screen</span>
    </button>
    {open && <div className="contextual-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="contextual-dialog" role="dialog" aria-modal="true" aria-labelledby="contextual-title">
        <header className="contextual-header"><div><strong id="contextual-title">CONTEXTUAL TALK</strong><span>Show Bosley what you're looking at</span></div><button type="button" onClick={() => { if (!busy) setOpen(false); }} aria-label="Close Contextual Talk" disabled={busy}><X size={17}/></button></header>
        <div className="contextual-privacy"><ShieldCheck size={15}/><span>Capture only when you click. Preview before sending. Images are not saved to chat history.</span></div>
        <div className="contextual-actions">
          <button type="button" onClick={() => void captureScreen()} disabled={busy}><MonitorUp size={15}/> Capture screen</button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}><ImagePlus size={15}/> Choose image</button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { void chooseImage(event.target.files?.[0]); event.currentTarget.value = ""; }}/>
        </div>
        {capture && <div className="contextual-preview"><div><span>{capture.label}</span><button type="button" onClick={() => { setCapture(null); setAnswer(""); setNotice(""); }} disabled={busy} aria-label="Discard image"><Trash2 size={14}/> Discard</button></div><img src={capture.dataUrl} alt="Preview of the image that will be sent to Bosley"/></div>}
        <form className="contextual-form" onSubmit={askBosley}>
          <textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="What would you like Bosley to explain or help with?" rows={3} disabled={busy}/>
          <div><button type="button" className={listening ? "is-listening" : ""} onClick={dictate} disabled={busy}>{listening ? "Stop dictation" : "Dictate"}</button><button type="submit" disabled={!capture || !question.trim() || busy}>{busy ? <><RefreshCw size={14} className="contextual-spin"/> Analysing…</> : <><Send size={14}/> Ask Bosley</>}</button></div>
        </form>
        {notice && <p className="contextual-notice" role="status">{notice}</p>}
        {answer && <div className="contextual-answer"><strong>BOSLEY</strong><p>{answer}</p></div>}
        <footer>Images stay in this temporary capture panel. Closing or discarding clears the preview.</footer>
      </section>
    </div>}
  </>;
}
