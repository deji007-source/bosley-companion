import { useMemo, useState, type FormEvent, type CSSProperties } from "react";
import { BookOpen, Brain, Search, Send, Sparkles, RotateCcw, HeartPulse, Globe2, Calculator, Cpu, Clock3, GitBranch, Network, Microscope, Lightbulb, ZoomIn, ZoomOut, Eye, ChevronLeft, ChevronRight, CircleHelp, CheckCircle2 } from "lucide-react";

type Props = { onAsk?: (prompt: string) => void; answer?: string };
type Mode = "concept" | "process" | "timeline" | "compare" | "system";
type Stage = { title: string; text: string };
const examples = [
  { label: "How diabetes affects the body", icon: HeartPulse, prompt: "Explain how diabetes affects the human body, with a visual guide to insulin, blood glucose, organs involved, common symptoms, prevention and treatment." },
  { label: "How the heart works", icon: HeartPulse, prompt: "Teach me how the human heart works with a labelled visual of its chambers, valves and blood flow." },
  { label: "The solar system", icon: Globe2, prompt: "Explain the solar system with a visual model of the planets and their orbits." },
  { label: "Quadratic equations", icon: Calculator, prompt: "Teach me quadratic equations with a graph, labelled parts and worked examples." },
  { label: "How the internet works", icon: Cpu, prompt: "Explain how the internet works, from a device through routers, DNS and servers, with a network diagram." },
  { label: "World War II timeline", icon: Clock3, prompt: "Create a clear visual timeline of the major events of World War II and explain their significance." },
];
const modes: { id: Mode; label: string; icon: typeof Brain; detail: string }[] = [
  { id: "concept", label: "Concept map", icon: Brain, detail: "A central idea connected to its key parts" },
  { id: "process", label: "How it works", icon: GitBranch, detail: "A step-by-step process or flowchart" },
  { id: "system", label: "Anatomy / system", icon: Network, detail: "Parts, relationships and labelled structures" },
  { id: "timeline", label: "Timeline", icon: Clock3, detail: "Events in chronological order" },
  { id: "compare", label: "Compare", icon: Microscope, detail: "Side-by-side similarities and differences" },
];

function extractStages(answer: string): Stage[] {
  const clean = answer.replace(/\r/g, "").trim();
  if (!clean || clean === "Thinking…") return [];
  const headings = [...clean.matchAll(/^#{1,3}\s+(.+)$/gm)];
  if (headings.length) return headings.slice(0, 8).map((match, index) => {
    const from = (match.index ?? 0) + match[0].length;
    const to = headings[index + 1]?.index ?? clean.length;
    const body = clean.slice(from, to).replace(/^\s+/, "");
    const text = body.split(/\n\s*\n/)[0].replace(/^[-*+]\s+/gm, "").replace(/\*\*/g, "").replace(/\*/g, "").trim();
    return { title: match[1].replace(/[*_]/g, "").trim(), text: text.slice(0, 420) || "Explore this section in the full explanation." };
  });
  const bullets = clean.split(/\n+/).map(line => line.trim()).filter(line => /^([-*+]\s+|\d+[.)]\s+)/.test(line));
  if (bullets.length) return bullets.slice(0, 8).map((line, index) => ({ title: "Point " + (index + 1), text: line.replace(/^([-*+]\s+|\d+[.)]\s+)/, "").replace(/\*\*/g, "").slice(0, 420) }));
  const paragraphs = clean.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return paragraphs.slice(0, 6).map((p, index) => ({ title: index === 0 ? "Overview" : "Explore " + (index + 1), text: p.replace(/\*\*/g, "").slice(0, 420) }));
}

export default function VisualGuide({ onAsk, answer = "" }: Props) {
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<Mode>("concept");
  const [lastTopic, setLastTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showExamples, setShowExamples] = useState(true);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizChoice, setQuizChoice] = useState<number | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const stages = useMemo(() => extractStages(answer), [answer]);
  const visibleStages = stages.length ? stages : [
    { title: "Start with the idea", text: "Bosley will turn the explanation into connected sections here. Ask a question to build your first visual guide." },
    { title: "Explore the parts", text: "Select a node to inspect its description and follow its connections." },
    { title: "Understand the links", text: "The diagram layout adapts to processes, timelines, comparisons and systems." },
    { title: "Check understanding", text: "Use the quick knowledge check after the explanation is ready." },
  ];
  const activeStage = visibleStages[Math.min(selected, visibleStages.length - 1)];
  const sourceLinks = useMemo(() => [...answer.matchAll(/\[([^\]]{1,100})\]\((https:\/\/[^\s)]+)\)/g)].slice(0, 8).map(m => ({ label: m[1], url: m[2] })), [answer]);
  const isHealthTopic = /disease|illness|cancer|diabetes|heart|brain|infection|virus|bacteria|symptom|medicine|medical|health|organ|anatomy/i.test(lastTopic);
  const ready = stages.length > 0;

  function askBosley(event?: FormEvent) {
    event?.preventDefault();
    const value = topic.trim();
    if (!value || busy) return;
    setBusy(true); setLastTopic(value); setSelected(0); setShowExamples(false); setQuizOpen(false); setQuizChoice(null); setAnswerRevealed(false);
    const selectedMode = modes.find(item => item.id === mode)?.label ?? "Concept map";
    onAsk?.(`Open Visual Guide mode. Teach me: ${value}. Build a detailed, accurate, age-appropriate ${selectedMode.toLowerCase()}. Structure the response with 4–8 meaningful Markdown headings, concise explanatory paragraphs, and numbered steps or dated events when relevant. Include explicit relationships between parts, labelled visual descriptions, useful examples and a short recap. For mathematical topics include a worked example and, where useful, graph points or an equation. For science and anatomy describe the structures and relationships accurately; do not invent measurements. Adapt the visual structure to the subject rather than forcing a chemistry template. If this is a medical topic, provide general educational information only, distinguish established facts from uncertainty, and do not diagnose me or recommend personal treatment. Include reliable source links when available.`);
    setTopic("");
    window.setTimeout(() => setBusy(false), 500);
  }
  function searchTopic() {
    const value = (topic.trim() || lastTopic).trim();
    if (value) window.open("https://www.google.com/search?q=" + encodeURIComponent(value + " explanation diagram reliable sources"), "_blank", "noopener,noreferrer");
  }
  function selectExample(prompt: string) { setTopic(prompt); setShowExamples(false); }
  function selectStage(index: number) { setSelected(index); setAnswerRevealed(false); }
  function nextStage() { setSelected(index => Math.min(visibleStages.length - 1, index + 1)); setAnswerRevealed(false); }
  function previousStage() { setSelected(index => Math.max(0, index - 1)); setAnswerRevealed(false); }

  const positions = visibleStages.map((_, i) => {
    if (mode === "process") return { x: 90 + (i % 2) * 220, y: 55 + i * 92 };
    if (mode === "timeline") return { x: 80 + i * (340 / Math.max(1, visibleStages.length - 1)), y: i % 2 ? 145 : 75 };
    if (mode === "compare") return { x: i % 2 ? 300 : 100, y: 55 + Math.floor(i / 2) * 105 };
    if (mode === "system") { const angle = (Math.PI * 2 * i) / Math.max(1, visibleStages.length); return { x: 190 + Math.cos(angle) * 125, y: 135 + Math.sin(angle) * 95 }; }
    const angle = (Math.PI * 2 * i) / Math.max(1, visibleStages.length);
    return { x: 190 + Math.cos(angle) * 125, y: 135 + Math.sin(angle) * 95 };
  });

  return <section className="visual-guide" aria-label="Bosley interactive Visual Guide">
    <header className="vg-header">
      <div className="vg-brand"><span className="vg-brand-icon"><Sparkles size={19}/></span><div><strong>VISUAL GUIDE</strong><small>Explore any subject · Ask, see, interact and understand</small></div></div>
      <button type="button" className="vg-reset" onClick={() => { setTopic(""); setLastTopic(""); setMode("concept"); setShowExamples(true); setSelected(0); setZoom(1); setQuizOpen(false); setQuizChoice(null); setAnswerRevealed(false); }}><RotateCcw size={14}/> New guide</button>
    </header>

    <div className="vg-universal-intro">
      <span className="vg-eyebrow">YOUR INTERACTIVE EXPLAINER</span>
      <h2>What would you like to understand?</h2>
      <p>Ask about anything — a disease, a machine, a maths problem, a historical event, an idea or how something works. Bosley builds a visual board you can explore, zoom and use to check your understanding.</p>
      <form className="vg-ask-form" onSubmit={askBosley}>
        <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={2} maxLength={1200} placeholder="For example: Explain malaria and how it affects the human body…" aria-label="Ask Visual Guide about any topic"/>
        <div className="vg-ask-actions">
          <button type="button" className="vg-search-button" onClick={searchTopic} disabled={!topic.trim() && !lastTopic}><Search size={14}/> Search the web</button>
          <button type="submit" className="vg-ask-button" disabled={!topic.trim() || busy}><Send size={14}/> Ask Bosley <span>↗</span></button>
        </div>
      </form>
      <div className="vg-mode-label">CHOOSE HOW TO VISUALISE IT</div>
      <div className="vg-mode-picker">{modes.map(item => <button type="button" key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)} title={item.detail}><item.icon size={15}/>{item.label}</button>)}</div>
    </div>

    {showExamples && <div className="vg-examples">
      <div className="vg-section-heading"><span>TRY A TOPIC</span><small>Or type absolutely anything above</small></div>
      <div className="vg-example-grid">{examples.map(item => <button type="button" key={item.label} onClick={() => selectExample(item.prompt)}><item.icon size={17}/><span>{item.label}</span><span className="vg-example-arrow">↗</span></button>)}</div>
    </div>}

    {lastTopic && <div className="vg-generated">
      <div className="vg-generated-heading"><div><span className="vg-eyebrow">INTERACTIVE LEARNING BOARD</span><h3>{lastTopic}</h3></div><span className="vg-live"><i/> {ready ? "ANSWER LINKED" : "WAITING FOR BOSLEY"}</span></div>
      <div className="vg-engine-toolbar">
        <span><Eye size={14}/> Select a node to inspect it</span>
        <div><button type="button" aria-label="Zoom out" onClick={() => setZoom(v => Math.max(.75, +(v - .1).toFixed(2)))} disabled={zoom <= .75}><ZoomOut size={15}/></button><strong>{Math.round(zoom * 100)}%</strong><button type="button" aria-label="Zoom in" onClick={() => setZoom(v => Math.min(1.35, +(v + .1).toFixed(2)))} disabled={zoom >= 1.35}><ZoomIn size={15}/></button></div>
      </div>
      <div className={`vg-engine-canvas vg-engine-${mode}`} style={{ "--vg-zoom": zoom } as CSSProperties}>
        <svg className="vg-engine-svg" viewBox="0 0 380 270" role="group" aria-label={`${mode} diagram for ${lastTopic}`}>
          {positions.map((p, i) => {
            const next = positions[(i + 1) % positions.length];
            if (mode === "process" && i === positions.length - 1) return null;
            if (mode === "compare" && i % 2 === 0) return null;
            return <line key={`edge-${i}`} x1={p.x} y1={p.y} x2={next.x} y2={next.y} className="vg-engine-edge"/>;
          })}
          <line x1="190" y1="135" x2={positions[selected]?.x ?? 190} y2={positions[selected]?.y ?? 135} className="vg-engine-focus-edge"/>
          <circle cx="190" cy="135" r="35" className="vg-engine-center"/>
          <text x="190" y="132" className="vg-engine-center-label">TOPIC</text><text x="190" y="146" className="vg-engine-center-small">{lastTopic.length > 19 ? lastTopic.slice(0, 18) + "…" : lastTopic}</text>
          {positions.map((p, i) => <g key={`node-${i}`} role="button" tabIndex={0} aria-label={visibleStages[i].title} aria-pressed={selected === i} onClick={() => selectStage(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectStage(i); } }}>
            <circle cx={p.x} cy={p.y} r={selected === i ? 29 : 25} className={selected === i ? "vg-engine-node active" : "vg-engine-node"}/>
            <text x={p.x} y={p.y + 4} className="vg-engine-node-number">{String(i + 1).padStart(2, "0")}</text>
            <text x={p.x} y={p.y + 43} className="vg-engine-node-label">{visibleStages[i].title.length > 22 ? visibleStages[i].title.slice(0, 20) + "…" : visibleStages[i].title}</text>
          </g>)}
        </svg>
      </div>
      <div className="vg-inspector">
        <div className="vg-inspector-count">SECTION {String(selected + 1).padStart(2, "0")} / {String(visibleStages.length).padStart(2, "0")}</div>
        <h4>{activeStage.title}</h4>
        <p>{activeStage.text}</p>
        <div className="vg-inspector-actions"><button type="button" onClick={previousStage} disabled={selected === 0}><ChevronLeft size={14}/> Previous</button><button type="button" onClick={nextStage} disabled={selected >= visibleStages.length - 1}>Next <ChevronRight size={14}/></button><button type="button" onClick={() => { setAnswerRevealed(v => !v); }}><BookOpen size={14}/>{answerRevealed ? "Hide detail" : "Explore detail"}</button></div>
        {answerRevealed && <div className="vg-detail-reveal">{activeStage.text}{ready ? " Read the full explanation below for more context." : " Ask Bosley to generate the lesson content."}</div>}
      </div>
      <div className="vg-quick-check">
        <div><CircleHelp size={17}/><strong>Quick knowledge check</strong><span>Which section introduces the main explanation?</span></div>
        <button type="button" onClick={() => { setQuizOpen(v => !v); setQuizChoice(null); }}>{quizOpen ? "Close check" : "Start check"}</button>
        {quizOpen && <div className="vg-quiz-options">{visibleStages.slice(0, Math.min(4, visibleStages.length)).map((stage, i) => <button type="button" key={stage.title} className={quizChoice === i ? "chosen" : ""} onClick={() => setQuizChoice(i)}>{stage.title}</button>)}{quizChoice !== null && <p>{quizChoice === 0 ? "Correct — the first section introduces the explanation." : "Not quite. Review the first section, then try again."}</p>}</div>}
      </div>
      {answer.trim() && answer !== "Thinking…" && <details className="vg-full-explanation"><summary>Read the full explanation</summary><div>{answer.split(/\n+/).map((line, index) => <p key={index}>{line.replace(/^#{1,6}\s*/, "").replace(/\*\*/g, "").trim()}</p>)}</div></details>}
      {sourceLinks.length > 0 && <div className="vg-source-list"><strong>Sources included in Bosley's answer</strong>{sourceLinks.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>)}</div>}
      {isHealthTopic && <div className="vg-health-note"><HeartPulse size={16}/><span>Health learning mode: this guide is for general education, not personal diagnosis or treatment. For symptoms or medical decisions, consult a qualified healthcare professional.</span></div>}
      <button type="button" className="vg-continue-button" onClick={() => onAsk?.(`Continue the Visual Guide for “${lastTopic}”. Expand “${activeStage.title}” with a deeper explanation, a suitable labelled visual and an example. Refer to the previous answer and avoid repeating it.`)}><BookOpen size={15}/> Continue learning with Bosley</button>
    </div>}

    <footer className="vg-footer"><span>BOSLEY VISUAL GUIDE · INTERACTIVE DIAGRAMS · KNOWLEDGE CHECKS</span><span>Search opens external results; AI explanations appear in your Bosley conversation.</span></footer>
  </section>;
}
