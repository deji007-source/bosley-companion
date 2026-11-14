import { useMemo, useState, type FormEvent } from "react";
import { Atom, BookOpen, Brain, Search, Send, Sparkles, RotateCcw, HeartPulse, Globe2, Calculator, Cpu, Clock3, GitBranch, Network, Microscope, Lightbulb } from "lucide-react";

type Props = { onAsk?: (prompt: string) => void };
type Mode = "concept" | "process" | "timeline" | "compare" | "system";
const examples = [
  { label: "How diabetes affects the body", icon: HeartPulse, prompt: "Explain how diabetes affects the human body, with an interactive visual guide to insulin, blood glucose, organs involved, common symptoms, prevention and treatment." },
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

export default function VisualGuide({ onAsk }: Props) {
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<Mode>("concept");
  const [lastTopic, setLastTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(0);
  const [showExamples, setShowExamples] = useState(true);
  const isHealthTopic = /disease|illness|cancer|diabetes|heart|brain|infection|virus|bacteria|symptom|medicine|medical|health|organ|anatomy/i.test(lastTopic);
  const stages = useMemo(() => {
    const clean = lastTopic.trim() || "Your topic";
    return [
      { title: "What is it?", text: "Start with a clear definition and the main idea." },
      { title: "Main parts", text: "Identify the important components, people, structures or concepts." },
      { title: "How it works", text: "Follow the relationships, causes, steps or mechanisms." },
      { title: "Why it matters", text: "Connect the explanation to examples and real-world context." },
    ];
  }, [lastTopic]);
  function askBosley(event?: FormEvent) {
    event?.preventDefault();
    const value = topic.trim();
    if (!value || busy) return;
    setBusy(true);
    setLastTopic(value);
    setShowExamples(false);
    const selectedMode = modes.find(item => item.id === mode)?.label ?? "Concept map";
    onAsk?.(`Open Visual Guide mode. Teach me: ${value}. Create a detailed, accurate, age-appropriate ${selectedMode.toLowerCase()} with clear headings, labelled diagram instructions, step-by-step explanation, practical examples, and a short recap. Adapt the visual structure to the subject rather than forcing a chemistry template. If this is a medical topic, provide general educational information only, distinguish established facts from uncertainty, and do not diagnose me or recommend personal treatment. Include reliable sources and links when available.`);
    setTopic("");
    window.setTimeout(() => setBusy(false), 500);
  }
  function searchTopic() {
    const value = (topic.trim() || lastTopic).trim();
    if (!value) return;
    const query = encodeURIComponent(value + " explanation diagram reliable sources");
    window.open("https://www.google.com/search?q=" + query, "_blank", "noopener,noreferrer");
  }
  function selectExample(prompt: string) { setTopic(prompt); setShowExamples(false); }
  return <section className="visual-guide" aria-label="Bosley universal Visual Guide">
    <header className="vg-header">
      <div className="vg-brand"><span className="vg-brand-icon"><Sparkles size={19}/></span><div><strong>VISUAL GUIDE</strong><small>Explore any subject · Ask, search, see and understand</small></div></div>
      <button type="button" className="vg-reset" onClick={() => { setTopic(""); setLastTopic(""); setMode("concept"); setShowExamples(true); setExpanded(0); }}><RotateCcw size={14}/> New guide</button>
    </header>

    <div className="vg-universal-intro">
      <span className="vg-eyebrow">YOUR INTERACTIVE EXPLAINER</span>
      <h2>What would you like to understand?</h2>
      <p>Ask about anything — a disease, a machine, a maths problem, a historical event, an idea or how something works. Bosley will explain it and help you explore it visually.</p>
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
      <div className="vg-generated-heading"><div><span className="vg-eyebrow">VISUAL LEARNING BOARD</span><h3>{lastTopic}</h3></div><span className="vg-live"><i/> READY TO EXPLORE</span></div>
      <div className="vg-visual-canvas">
        <div className="vg-topic-node"><Sparkles size={19}/><strong>{lastTopic}</strong><small>MAIN TOPIC</small></div>
        <div className="vg-topic-branches">{stages.map((item, index) => <button type="button" key={item.title} className={expanded === index ? "vg-topic-card selected" : "vg-topic-card"} onClick={() => setExpanded(index)}><span className="vg-topic-number">{String(index + 1).padStart(2,"0")}</span><strong>{item.title}</strong><small>{item.text}</small></button>)}</div>
      </div>
      <div className="vg-expanded-note"><Lightbulb size={16}/><span><strong>{stages[expanded].title}:</strong> {stages[expanded].text} Ask Bosley below to expand this section into a detailed explanation, diagram or worked example.</span></div>
      {isHealthTopic && <div className="vg-health-note"><HeartPulse size={16}/><span>Health learning mode: this guide is for general education, not personal diagnosis or treatment. For symptoms or medical decisions, consult a qualified healthcare professional.</span></div>}
      <button type="button" className="vg-continue-button" onClick={() => onAsk?.(`Continue the Visual Guide for “${lastTopic}”. Expand the selected section “${stages[expanded].title}” with a detailed explanation and an appropriate labelled visual. Keep it accurate and easy to understand.`)}><BookOpen size={15}/> Continue learning with Bosley</button>
    </div>}

    <footer className="vg-footer"><span>BOSLEY VISUAL GUIDE · ANY SUBJECT, MULTIPLE VISUAL FORMATS</span><span>Search opens external results; AI explanations appear in your Bosley conversation.</span></footer>
  </section>;
}
