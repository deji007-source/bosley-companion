import { useMemo, useState } from "react";
import { Atom, BookOpen, ChevronLeft, ChevronRight, FlaskConical, Lightbulb, RotateCcw } from "lucide-react";

type Lesson = "chain" | "water" | "ionic" | "periodic";
const atoms = [
  { symbol: "H", name: "Hydrogen", number: 1, note: "Hydrogen has one proton and commonly forms one covalent bond." },
  { symbol: "C", name: "Carbon", number: 6, note: "Carbon has four valence electrons, so it can form four covalent bonds and build chains." },
  { symbol: "O", name: "Oxygen", number: 8, note: "Oxygen has six valence electrons and commonly forms two covalent bonds." },
  { symbol: "Na", name: "Sodium", number: 11, note: "Sodium can lose one outer electron to form a positively charged Na⁺ ion." },
  { symbol: "Cl", name: "Chlorine", number: 17, note: "Chlorine can gain one electron to form a negatively charged Cl⁻ ion." },
];
const lessonCopy: Record<Lesson, { title: string; subtitle: string; explanation: string }> = {
  chain: { title: "Build a carbon chain", subtitle: "Organic chemistry · Alkanes", explanation: "Carbon forms four covalent bonds. In a straight-chain alkane, each carbon connects to its neighbours and the remaining bonds connect to hydrogen atoms." },
  water: { title: "How water is bonded", subtitle: "Molecular structure · H₂O", explanation: "Oxygen shares one pair of electrons with each hydrogen. The molecule is bent, with an approximate bond angle of 104.5°." },
  ionic: { title: "Ionic bonding", subtitle: "Electron transfer · NaCl", explanation: "Sodium transfers an outer electron to chlorine. The resulting Na⁺ and Cl⁻ ions attract because they have opposite charges." },
  periodic: { title: "Explore the elements", subtitle: "Periodic table · Selected elements", explanation: "An element is defined by its proton number. Select an element tile to inspect its atomic number and a useful bonding fact." },
};

export default function VisualGuide() {
  const [lesson, setLesson] = useState<Lesson>("chain");
  const [chainLength, setChainLength] = useState(4);
  const [selectedAtom, setSelectedAtom] = useState("C");
  const [step, setStep] = useState(0);
  const [showHydrogens, setShowHydrogens] = useState(true);
  const copy = lessonCopy[lesson];
  const selected = atoms.find((atom) => atom.symbol === selectedAtom) ?? atoms[1];
  const formula = useMemo(() => `C${chainLength === 1 ? "" : chainLength}H${2 * chainLength + 2}`, [chainLength]);
  const chainNodes = useMemo(() => Array.from({ length: chainLength }, (_, i) => ({ x: 66 + i * (360 / Math.max(1, chainLength - 1)), y: 116 + (i % 2 ? 0 : 0) })), [chainLength]);
  const reset = () => { setStep(0); setSelectedAtom("C"); setShowHydrogens(true); };

  return <section className="visual-guide" aria-label="Bosley Visual Guide">
    <header className="vg-header">
      <div className="vg-brand"><span className="vg-brand-icon"><Atom size={19}/></span><div><strong>VISUAL GUIDE</strong><small>Interactive lessons · Draw, explore, understand</small></div></div>
      <button type="button" className="vg-reset" onClick={reset} title="Reset lesson"><RotateCcw size={14}/> Reset</button>
    </header>
    <nav className="vg-lessons" aria-label="Visual guide lessons">
      <button type="button" className={lesson === "chain" ? "active" : ""} onClick={() => { setLesson("chain"); reset(); }}><Atom size={14}/> Carbon chains</button>
      <button type="button" className={lesson === "water" ? "active" : ""} onClick={() => { setLesson("water"); reset(); }}><FlaskConical size={14}/> Water molecule</button>
      <button type="button" className={lesson === "ionic" ? "active" : ""} onClick={() => { setLesson("ionic"); reset(); }}><Lightbulb size={14}/> Ionic bonds</button>
      <button type="button" className={lesson === "periodic" ? "active" : ""} onClick={() => { setLesson("periodic"); reset(); }}><BookOpen size={14}/> Elements</button>
    </nav>
    <div className="vg-content">
      <div className="vg-stage-column">
        <div className="vg-stage-heading"><div><span>{copy.subtitle}</span><h2>{copy.title}</h2></div><span className="vg-live"><i/> LIVE DIAGRAM</span></div>
        <div className="vg-canvas" role="img" aria-label={lesson === "chain" ? `Diagram of ${chainLength} carbon atoms in a straight alkane chain` : copy.title}>
          {lesson === "chain" && <svg viewBox="0 0 500 250" className="vg-svg">
            <defs><filter id="vgGlow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
            {chainNodes.slice(0, -1).map((node, i) => <line key={`bond-${i}`} x1={node.x} y1={node.y} x2={chainNodes[i + 1].x} y2={chainNodes[i + 1].y} className="vg-bond"/>)}
            {chainNodes.map((node, i) => <g key={`carbon-${i}`} className={step >= 1 && step - 1 === i ? "vg-selected" : ""} onClick={() => { setSelectedAtom("C"); setStep(i + 1); }} role="button" tabIndex={0} aria-label={`Carbon atom ${i + 1}`}>
              {showHydrogens && <><line x1={node.x} y1={node.y - 15} x2={node.x} y2={node.y - 53} className="vg-bond thin"/><text x={node.x} y={node.y - 62} className="vg-hydrogen">H</text><line x1={node.x} y1={node.y + 15} x2={node.x} y2={node.y + 53} className="vg-bond thin"/><text x={node.x} y={node.y + 70} className="vg-hydrogen">H</text></>}
              {i === 0 && <><line x1={node.x - 15} y1={node.y} x2={node.x - 47} y2={node.y} className="vg-bond thin"/><text x={node.x - 57} y={node.y + 5} className="vg-hydrogen">H</text></>}
              {i === chainLength - 1 && <><line x1={node.x + 15} y1={node.y} x2={node.x + 47} y2={node.y} className="vg-bond thin"/><text x={node.x + 57} y={node.y + 5} className="vg-hydrogen">H</text></>}
              <circle cx={node.x} cy={node.y} r="17" className="vg-carbon"/><text x={node.x} y={node.y + 5} className="vg-atom-label">C</text><text x={node.x} y={node.y + 34} className="vg-index">{i + 1}</text>
            </g>)}
          </svg>}
          {lesson === "water" && <svg viewBox="0 0 500 250" className="vg-svg"><path d="M250 118 L164 183 M250 118 L336 183" className="vg-bond"/><circle cx="250" cy="118" r="29" className="vg-oxygen"/><text x="250" y="124" className="vg-atom-label">O</text><circle cx="150" cy="194" r="22" className="vg-hydrogen-node"/><text x="150" y="199" className="vg-atom-label">H</text><circle cx="350" cy="194" r="22" className="vg-hydrogen-node"/><text x="350" y="199" className="vg-atom-label">H</text><path d="M205 153 Q250 190 295 153" className="vg-angle"/><text x="250" y="215" className="vg-callout">104.5° · BENT MOLECULE</text></svg>}
          {lesson === "ionic" && <svg viewBox="0 0 500 250" className="vg-svg"><circle cx="160" cy="115" r="39" className="vg-sodium"/><text x="160" y="121" className="vg-atom-label">Na⁺</text><circle cx="340" cy="115" r="39" className="vg-chlorine"/><text x="340" y="121" className="vg-atom-label">Cl⁻</text><path d="M205 115 H293" className="vg-electron-path"/><circle cx="250" cy="115" r="8" className="vg-electron"/><text x="250" y="72" className="vg-callout">ELECTROSTATIC ATTRACTION</text><text x="160" y="180" className="vg-small-label">Sodium ion</text><text x="340" y="180" className="vg-small-label">Chloride ion</text></svg>}
          {lesson === "periodic" && <div className="vg-element-grid">{atoms.map((atom) => <button type="button" key={atom.symbol} className={selectedAtom === atom.symbol ? "vg-element selected" : "vg-element"} onClick={() => setSelectedAtom(atom.symbol)}><small>{atom.number}</small><strong>{atom.symbol}</strong><span>{atom.name}</span></button>)}</div>}
        </div>
        <div className="vg-controls">
          {lesson === "chain" && <><label>Carbon atoms <strong>{chainLength}</strong><input type="range" min="1" max="8" value={chainLength} onChange={(e) => setChainLength(Number(e.target.value))}/></label><button type="button" className={showHydrogens ? "vg-toggle active" : "vg-toggle"} onClick={() => setShowHydrogens((v) => !v)}>{showHydrogens ? "Hide" : "Show"} hydrogen atoms</button><span className="vg-formula">{formula}</span></>}
          {lesson === "water" && <span className="vg-formula">H₂O</span>}
          {lesson === "ionic" && <span className="vg-formula">NaCl</span>}
          {lesson === "periodic" && <span className="vg-formula">5 ELEMENTS</span>}
        </div>
      </div>
      <aside className="vg-explainer">
        <span className="vg-eyebrow">LEARN WITH BOSLEY</span><h3>{lesson === "periodic" ? selected.name : "What you're seeing"}</h3>
        <p>{lesson === "periodic" ? selected.note : copy.explanation}</p>
        {lesson === "chain" && <div className="vg-step-card"><strong>Carbon {step || 1} of {chainLength}</strong><span>Each carbon makes four bonds. The end carbons have three hydrogen atoms; inner carbons have two.</span><div className="vg-step-actions"><button type="button" onClick={() => setStep((v) => Math.max(0, v - 1))}><ChevronLeft size={14}/> Previous</button><button type="button" onClick={() => setStep((v) => Math.min(chainLength, v + 1))}>Next <ChevronRight size={14}/></button></div></div>}
        <div className="vg-tip"><Lightbulb size={15}/><span><strong>Try this:</strong> {lesson === "chain" ? "Change the number of carbon atoms and watch the molecular formula update." : lesson === "water" ? "Compare the bent shape with a straight line: lone pairs on oxygen influence the shape." : lesson === "ionic" ? "Notice the charges: opposite charges attract to form an ionic lattice." : "Choose an element tile to see its atomic number and bonding behaviour."}</span></div>
      </aside>
    </div>
    <footer className="vg-footer"><span>VISUAL GUIDE · INTERACTIVE LEARNING</span><span>Diagrams are simplified teaching models.</span></footer>
  </section>;
}
