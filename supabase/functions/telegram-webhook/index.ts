import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

const BOSLEY_TAG = "\ud83c\udd71\ufe0f";

const AUTOMATION_PATTERNS = [
  /\bwhatsapp\b/i, /\bbluetooth\b/i, /\bspotify\b/i, /\byoutube\b/i, /\bmoviebox\b/i,
  /\bsnapchat\b/i, /\bgoogle\b/i, /\bchrome\b/i, /\binstagram\b/i, /\bpinterest\b/i,
  /^\s*(open|launch|start|turn on|turn off|toggle)\b/i, /^\s*call\b/i,
  /\bwake up\b/i, /\bdaddy.?s?\s*home\b/i,
];
function isAutomationCommand(t) { return AUTOMATION_PATTERNS.some((p) => p.test(t)); }

async function notifyLaptopListener(userId, instruction) {
  const channel = sb.channel("bosley-laptop-" + userId);
  try {
    const status = await channel.send({ type: "broadcast", event: "automation", payload: { instruction } });
    return status === "ok";
  } catch (error) {
    console.error("Laptop Listener broadcast failed:", error);
    return false;
  } finally {
    await sb.removeChannel(channel);
  }
}


const MIN_VOICE_SECONDS = 1;
const HALLUCINATION_PHRASES = new Set(["okay.","okay","what's that?","thank you.","thanks for watching!","you","bye.","..."]);

const COIN_ALIASES = {
  btc:"bitcoin", bitcoin:"bitcoin", eth:"ethereum", ethereum:"ethereum",
  sol:"solana", solana:"solana", bnb:"binancecoin", doge:"dogecoin", dogecoin:"dogecoin",
  xrp:"ripple", ripple:"ripple", ada:"cardano", cardano:"cardano",
  matic:"matic-network", polygon:"matic-network", usdt:"tether", tether:"tether", usdc:"usd-coin",
};

const WATCH_RE = /^watch\s+(\S+)\s+(above|below)\s+([\d,]+(?:\.\d+)?)\s*(usd|ngn|eur|gbp)?$/i;
const UNWATCH_RE = /^unwatch\s+(\S+)$/i;
const ADD_CONTACT_RE = /^add contact\s+(\S+)\s+(\+?[\d\s-]{7,})$/i;
const TEXT_RE = /^(?:text|whatsapp|message)\s+(\S+)\s+(.+)$/i;

const SITE_LABELS = { google:"Google", chrome:"Google", youtube:"YouTube", spotify:"Spotify", pinterest:"Pinterest" };
const SITE_RE = /\b(google|chrome|youtube|spotify|pinterest)\b/i;
const TRIGGER_RE = /\b(search|look\s*up|find|play)\b/i;

const MOVE_WINDOW_RE = /^move\s+(\S+)\s+to\s+desktop\s+(\d+)$/i;
const SWITCH_DESKTOP_RE = /^(?:switch|go)\s+to\s+desktop\s+(\d+)$/i;
const FOCUS_RE = /^focus\s+(\S+)$/i;
const MIN_MAX_RE = /^(minimize|maximize)\s+(\S+)$/i;
const CLICK_RE = /^(?:click|tap)\s+(?:on\s+)?(.+)$/i;
const TYPE_RE = /^type\s+(.+)$/i;
const CALC_RE = /^calc\s+(.+)$/i;
const SET_ABBR_RE = /^set abbr(?:eviation)?\s+(.+?)\s+(?:to|as)\s+(\S+)$/i;
const PROJECT_INFO_RE = /^project\s+(\S+)$/i;
const OPEN_PROJECT_RE = /^open\s+(?:the\s+)?project\s+(\S+)$/i;

function extractSearch(text) {
  const siteMatch = text.match(SITE_RE);
  const triggerMatch = text.match(TRIGGER_RE);
  if (!siteMatch || !triggerMatch) return null;
  let tail = text.slice(triggerMatch.index + triggerMatch[0].length);
  tail = tail.replace(/^[\s,]*\b(for|up|on|in)\b[\s,]*/i, "");
  tail = tail.replace(/[\s,]*\b(on|in|using|at)\s+(google|chrome|youtube|spotify|pinterest)\b[\s,]*$/i, "");
  tail = tail.replace(/^[\s,.'"]+|[\s,.'"]+$/g, "").trim();
  if (!tail) return null;
  const label = SITE_LABELS[siteMatch[1].toLowerCase()] ?? siteMatch[1];
  return { site: label, query: tail };
}

function fmt(n,d=4){ return Number.isFinite(n) ? Number(n.toPrecision(d)).toString() : "\u2014"; }
const CALCS = {
  ohm: { names:["ohm","ohms law","ohm's law"], keys:["V","I","R"],
    compute:(v)=>{ let {V,I,R}=v; if(!V&&I&&R)V=I*R; else if(!I&&V&&R)I=V/R; else if(!R&&V&&I)R=V/I; else return "Give exactly two of V, I, R.";
      return `V = I \u00d7 R\nV=${fmt(V)}V, I=${fmt(I)}A, R=${fmt(R)}\u03a9`; } },
  power: { names:["power"], keys:["V","I"], compute:({V,I})=>`P = V \u00d7 I = ${fmt(V*I)} W` },
  seriesr: { names:["series","series resistance"], keys:["R1","R2","R3"],
    compute:({R1,R2,R3})=>`R_total = R1+R2+R3 = ${fmt((R1||0)+(R2||0)+(R3||0))} \u03a9` },
  parr: { names:["parallel","parallel resistance"], keys:["R1","R2"],
    compute:({R1,R2})=>`R_total = (R1\u00d7R2)/(R1+R2) = ${fmt((R1*R2)/(R1+R2))} \u03a9` },
  rc: { names:["rc","rc time","time constant"], keys:["R","C"],
    compute:({R,C})=>`\u03c4 = R \u00d7 C = ${fmt(R*C,6)} s` },
  led: { names:["led","led resistor"], keys:["Vs","Vf","If"],
    compute:({Vs,Vf,If})=>`R = (Vs-Vf)/If = ${fmt((Vs-Vf)/If)} \u03a9` },
  force: { names:["force"], keys:["m","a"], compute:({m,a})=>`F = m \u00d7 a = ${fmt(m*a)} N` },
  work: { names:["work","energy"], keys:["F","d"], compute:({F,d})=>`W = F \u00d7 d = ${fmt(F*d)} J` },
  torque: { names:["torque"], keys:["F","r"], compute:({F,r})=>`\u03c4 = F \u00d7 r = ${fmt(F*r)} N\u00b7m` },
  stress: { names:["stress"], keys:["F","A"], compute:({F,A})=>`\u03c3 = F / A = ${fmt(F/A)} Pa` },
  kinematics: { names:["kinematics","velocity"], keys:["u","a","t"], compute:({u,a,t})=>`v = u + a\u00d7t = ${fmt(u+a*t)} m/s` },
  beam: { names:["beam","beam reaction"], keys:["L","P","a"],
    compute:({L,P,a})=>{ const b=L-a; return `R_left = P\u00d7b/L = ${fmt(P*b/L)} N\nR_right = P\u00d7a/L = ${fmt(P*a/L)} N`; } },
  vector: { names:["vector"], keys:["x","y"],
    compute:({x,y})=>`|v| = \u221a(x\u00b2+y\u00b2) = ${fmt(Math.hypot(x,y))}\n\u03b8 = ${fmt(Math.atan2(y,x)*180/Math.PI)}\u00b0` },
  unitlen: { names:["length","unit length"], keys:["m","ft"],
    compute:({m,ft})=>{ if(m&&!ft) return `${fmt(m)} m = ${fmt(m*3.28084)} ft`; if(ft&&!m) return `${fmt(ft)} ft = ${fmt(ft/3.28084)} m`; return "Give only one of m or ft."; } },
};
function findCalc(name) {
  const n = name.toLowerCase().trim();
  for (const [id, c] of Object.entries(CALCS)) if (c.names.some((alt)=>n.includes(alt))) return { id, ...c };
  return null;
}
function parseKeyValues(text) {
  const out = {};
  const re = /([a-zA-Z]+)\s*(?:=|is|equals)\s*(-?\d+\.?\d*)/gi;
  let m;
  while ((m = re.exec(text))) out[m[1]] = parseFloat(m[2]);
  return out;
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return res.json();
}
async function reply(chatId, text, markdown = true) {
  const body = { chat_id: chatId, text: `${BOSLEY_TAG} ${text}` };
  if (markdown) body.parse_mode = "Markdown";
  await tg("sendMessage", body);
}

const COMMAND_LIST = `*Here's everything I can do:*\n\n*\ud83d\udcdd Tasks & reminders*\n\u2022 \"remind me to call the bank\" \u2192 saves a task\n\u2022 /tasks \u2014 list open tasks\n\u2022 /reminders \u2014 list today's reminders\n\n*\ud83d\udcf1 Open an app* (phone + laptop)\n\u2022 \"open whatsapp / spotify / youtube / chrome / instagram / pinterest / snapchat / google / moviebox\" (or any app in your launcher, on laptop)\n\u2022 add \"on my phone\" or \"on my laptop\" to target just one device\n\n*\ud83d\udd0d Search something*\n\u2022 \"search [query] on youtube / spotify / google / pinterest\"\n\u2022 \"play [song] on spotify\" \u2022 \"look up [query]\"\n\n*\ud83e\uddee Calculators*\n\u2022 \"calc ohm V=12 R=4\" \u2022 \"calc force m=5 a=3\" \u2014 saves to your Engineering Dock history\n\n*\ud83d\udcc1 Projects*\n\u2022 /projects \u2014 list all projects\n\u2022 \"project [abbr]\" \u2014 see that project's tasks\n\u2022 \"open project [abbr]\" \u2014 signals the open app to jump there (once Lovable adds the listener)\n\u2022 \"set abbr [project name] to [ABBR]\"\n\n*\ud83d\udcde Calls & texts*\n\u2022 \"add contact [name] [number]\" \u2014 save a contact\n\u2022 /contacts \u2014 list saved contacts\n\u2022 \"call [name]\"\n\u2022 \"text [name] on whatsapp [message]\"\n\n*\ud83d\udd0a Bluetooth*\n\u2022 \"turn on bluetooth\"\n\n*\ud83c\udf9b\ufe0f Wake up*\n\u2022 \"wake up\" or \"daddy's home\" \u2014 opens the Bosley app + plays Papi's Home on your laptop\n\n*\ud83d\udda5\ufe0f Desktop & windows* (needs the laptop agent running)\n\u2022 \"move chrome to desktop 2\" \u2022 \"switch to desktop 1\"\n\u2022 \"focus chrome\" \u2022 \"minimize chrome\" \u2022 \"maximize chrome\"\n\u2022 \"list windows\"\n\n*\ud83d\uddb1\ufe0f Click & type* (needs the laptop agent running)\n\u2022 \"click [button text]\" / \"tap [button text]\"\n\u2022 \"type [text]\"\n\n*\ud83c\udfa4 Voice notes*\n\u2022 send one instead of typing \u2014 works for all of the above\n\n*\ud83d\uddbc\ufe0f Photos*\n\u2022 send a photo (with or without a caption) \u2014 I'll describe it or answer your question about it\n\n*\ud83d\udcb0 Price watches*\n\u2022 \"watch bitcoin above 70000\" \u2022 \"unwatch bitcoin\" \u2022 /watches\n\n*\u2600\ufe0f Morning brief*\n\u2022 sent automatically every day at 8am, no command needed\n\nAnything else you type just gets saved as a plain task.\nSend */list* anytime to see this again.`;

async function transcribeVoice(fileId, durationSeconds) {
  if (!GROQ_API_KEY) return { text: null };
  if (durationSeconds < MIN_VOICE_SECONDS) return { text: null, tooShort: true };
  try {
    const fileRes = await tg("getFile", { file_id: fileId });
    const filePath = fileRes?.result?.file_path;
    if (!filePath) return { text: null };
    const audioRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
    const audioBlob = await audioRes.blob();
    const form = new FormData();
    form.append("file", audioBlob, "voice.ogg");
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "en");
    form.append("prompt", "Voice commands: open WhatsApp, open Spotify, text Dotun on WhatsApp, search drake on Spotify, call Dotun, turn on Bluetooth, wake up, daddy's home, move chrome to desktop 2, switch to desktop 1, focus chrome, click search, type hello, calc ohm V=12 R=4, calc force m=5 a=3, project ARC, open project ARC, set abbr Arc Reactor to ARC.");
    const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, body: form,
    });
    if (!whisperRes.ok) return { text: null };
    const data = await whisperRes.json();
    const raw = (data.text ?? "").trim();
    if (!raw) return { text: null };
    if (HALLUCINATION_PHRASES.has(raw.toLowerCase())) return { text: raw, lowConfidence: true };
    return { text: raw };
  } catch { return { text: null }; }
}

async function analyzeImage(fileId, caption) {
  if (!GROQ_API_KEY) return null;
  try {
    const fileRes = await tg("getFile", { file_id: fileId });
    const filePath = fileRes?.result?.file_path;
    if (!filePath) return null;
    const imgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i += 8192) binary += String.fromCharCode(...buf.subarray(i, i + 8192));
    const base64 = btoa(binary);
    const prompt = caption?.trim() || "Describe what's in this image in a few sentences, and read out any visible text exactly as written.";
    const visionRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }] }],
        max_tokens: 500 }),
    });
    if (!visionRes.ok) return null;
    const data = await visionRes.json();
    return (data.choices?.[0]?.message?.content ?? "").trim() || null;
  } catch { return null; }
}

async function handlePriceCommand(userId, chatId, text) {
  const watchMatch = text.match(WATCH_RE);
  if (watchMatch) {
    const [, rawLabel, direction, rawPrice, rawCurrency] = watchMatch;
    const label = rawLabel.toLowerCase();
    const coinId = COIN_ALIASES[label] ?? label;
    const targetPrice = parseFloat(rawPrice.replace(/,/g, ""));
    const currency = (rawCurrency ?? "usd").toLowerCase();
    const { error } = await sb.from("price_watches").insert({ user_id: userId, coin_id: coinId, label: rawLabel, direction: direction.toLowerCase(), target_price: targetPrice, currency });
    await reply(chatId, error ? "Couldn't set that watch \u2014 double check the coin name and try again." : `\ud83d\udc40 Watching *${rawLabel}* \u2014 I'll ping you when it goes ${direction} ${targetPrice} ${currency.toUpperCase()}.`);
    return true;
  }
  const unwatchMatch = text.match(UNWATCH_RE);
  if (unwatchMatch) {
    const label = unwatchMatch[1].toLowerCase();
    const coinId = COIN_ALIASES[label] ?? label;
    const { data: deactivated } = await sb.from("price_watches").update({ is_active: false }).eq("user_id", userId).eq("is_active", true).or(`coin_id.eq.${coinId},label.ilike.${label}`).select("id");
    await reply(chatId, deactivated && deactivated.length > 0 ? `Stopped watching *${unwatchMatch[1]}*.` : `No active watch found for *${unwatchMatch[1]}*.`);
    return true;
  }
  if (text === "/watches") {
    const { data: watches } = await sb.from("price_watches").select("label, direction, target_price, currency").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: true });
    const list = (watches ?? []).map((w) => `\u2022 ${w.label} ${w.direction} ${w.target_price} ${w.currency.toUpperCase()}`).join("\n") || "No active price watches.";
    await reply(chatId, `*Price watches:*\n${list}\n\n_Add one: \"watch bitcoin above 70000\". Remove: \"unwatch bitcoin\"._`);
    return true;
  }
  return false;
}

async function queueAutomation(userId, instruction) {
  const { error } = await sb.from("automation_runs").insert({ user_id: userId, instruction, status: "pending" });
  if (error) { console.error("Could not queue Telegram automation:", error); return { ok: false, listenerNotified: false }; }
  const listenerNotified = await notifyLaptopListener(userId, instruction);
  return { ok: true, listenerNotified };
}

async function handleCalcCommand(userId, chatId, text) {
  const m = text.match(CALC_RE);
  if (!m) return false;
  const body = m[1];
  const nameMatch = Object.values(CALCS).flatMap(c=>c.names).sort((a,b)=>b.length-a.length).find(n=>body.toLowerCase().includes(n));
  if (!nameMatch) { await reply(chatId, "Which calculator? e.g. \"calc ohm V=12 R=4\""); return true; }
  const calc = findCalc(nameMatch);
  const vals = parseKeyValues(body);
  const normVals = {};
  for (const k of calc.keys) {
    const found = Object.keys(vals).find(vk => vk.toLowerCase() === k.toLowerCase());
    if (found !== undefined) normVals[k] = vals[found];
  }
  let out;
  try { out = calc.compute(normVals); } catch { out = "Couldn't compute \u2014 check your inputs."; }
  await reply(chatId, out.replace(/\n/g, "  \n"));
  await sb.from("eng_calc_history").insert({ user_id: userId, calculator: calc.id, inputs: normVals, result: out });
  return true;
}

async function handleProjectCommand(userId, chatId, text, rawText) {
  if (text === "/projects" || text === "projects") {
    const { data: projects } = await sb.from("eng_projects").select("name, abbreviation, status").eq("user_id", userId).order("created_at", { ascending: false });
    const list = (projects ?? []).map((p) => `\u2022 ${p.name}${p.abbreviation ? ` (${p.abbreviation})` : ""} \u2014 ${p.status}`).join("\n") || "No projects yet.";
    await reply(chatId, `*Projects:*\n${list}\n\n_Set an abbreviation: \"set abbr [project name] to [ABBR]\"._`);
    return true;
  }

  const setAbbr = rawText.match(SET_ABBR_RE);
  if (setAbbr) {
    const [, name, abbr] = setAbbr;
    const { data: proj } = await sb.from("eng_projects").select("id, name").eq("user_id", userId).ilike("name", `%${name}%`).maybeSingle();
    if (!proj) { await reply(chatId, `Couldn't find a project matching "${name}".`); return true; }
    await sb.from("eng_projects").update({ abbreviation: abbr.toUpperCase() }).eq("id", proj.id);
    await reply(chatId, `Set *${proj.name}* abbreviation to *${abbr.toUpperCase()}*. Try "project ${abbr.toUpperCase()}" anytime.`);
    return true;
  }

  const openProj = text.match(OPEN_PROJECT_RE);
  if (openProj) {
    const [, abbr] = openProj;
    const { data: proj } = await sb.from("eng_projects").select("id, name").eq("user_id", userId).ilike("abbreviation", abbr).maybeSingle();
    if (!proj) { await reply(chatId, `No project with abbreviation "${abbr.toUpperCase()}" \u2014 set one with "set abbr [name] to ${abbr.toUpperCase()}".`); return true; }
    await sb.rpc("broadcast_to_app", { p_user_id: userId, p_event: "open_project", p_payload: { project_id: proj.id, name: proj.name, abbreviation: abbr.toUpperCase() } });
    await reply(chatId, `\ud83d\udce1 Signaled: open ${proj.name}. _(works once the app is listening \u2014 queued in Lovable)_`);
    return true;
  }

  const projInfo = text.match(PROJECT_INFO_RE);
  if (projInfo) {
    const [, abbr] = projInfo;
    const { data: proj } = await sb.from("eng_projects").select("id, name, description, status, discipline").eq("user_id", userId).ilike("abbreviation", abbr).maybeSingle();
    if (!proj) { await reply(chatId, `No project with abbreviation "${abbr.toUpperCase()}" \u2014 set one with "set abbr [name] to ${abbr.toUpperCase()}".`); return true; }
    const { data: tasks } = await sb.from("eng_tasks").select("title, done").eq("user_id", userId).eq("project_id", proj.id);
    const taskList = (tasks ?? []).map((t) => `${t.done ? "\u2705" : "\u2b1c"} ${t.title}`).join("\n") || "No tasks yet.";
    await reply(chatId, `*${proj.name}* (${proj.discipline || "\u2014"}) \u2014 ${proj.status}\n${proj.description || ""}\n\n*Tasks:*\n${taskList}`);
    return true;
  }

  return false;
}

async function handleOsCommand(userId, chatId, text) {
  async function queueOs(action, fields, instruction, successMessage) {
    const { error } = await sb.from("os_commands").insert({ user_id: userId, action, ...fields });
    if (error) { await reply(chatId, "Could not queue that — try again?"); return; }
    const listenerNotified = await notifyLaptopListener(userId, instruction);
    await reply(chatId, listenerNotified ? "Sent to laptop listener: " + successMessage : "Queued, but the laptop listener did not confirm receiving it. Check that the listener is connected.");
  }
  if (text === "list windows") {
    await queueOs("list_windows", {}, "list windows", "list windows");
    return true;
  }
  const click = text.match(CLICK_RE);
  if (click) {
    const [, target] = click;
    await queueOs("click_text", { target }, "click " + target, "click " + target);
    return true;
  }
  const typeMatch = text.match(TYPE_RE);
  if (typeMatch) {
    const [, param] = typeMatch;
    await queueOs("type_text", { param }, "type " + param, "type text");
    return true;
  }
  const move = text.match(MOVE_WINDOW_RE);
  if (move) {
    const [, target, param] = move;
    await queueOs("move_window", { target, param }, "move " + target + " to desktop " + param, "move window");
    return true;
  }
  const switchD = text.match(SWITCH_DESKTOP_RE);
  if (switchD) {
    const [, param] = switchD;
    await queueOs("switch_desktop", { param }, "switch to desktop " + param, "switch desktop");
    return true;
  }
  const focus = text.match(FOCUS_RE);
  if (focus) {
    const [, target] = focus;
    await queueOs("focus_window", { target }, "focus " + target, "focus window");
    return true;
  }
  const minMax = text.match(MIN_MAX_RE);
  if (minMax) {
    const [, action, target] = minMax;
    const osAction = action.toLowerCase() + "_window";
    await queueOs(osAction, { target }, action + " " + target, action + " window");
    return true;
  }
  return false;
}

async function handleDeepCommand(userId, chatId, text) {
  const addContact = text.match(ADD_CONTACT_RE);
  if (addContact) {
    const [, name, rawNumber] = addContact;
    const phone = rawNumber.replace(/[\s-]/g, "");
    const { error } = await sb.from("contacts").insert({ user_id: userId, name, phone_number: phone });
    await reply(chatId, error ? "Couldn't save that contact \u2014 try again?" : `Saved contact *${name}* \u2192 ${phone}.`);
    return true;
  }
  if (text === "/contacts") {
    const { data: contacts } = await sb.from("contacts").select("name, phone_number").eq("user_id", userId).order("name");
    const list = (contacts ?? []).map((c) => `\u2022 ${c.name} \u2014 ${c.phone_number}`).join("\n") || "No saved contacts.";
    await reply(chatId, `*Contacts:*\n${list}\n\n_Add one: \"add contact dotun +2348012345678\"._`);
    return true;
  }
  const textMatch = text.match(TEXT_RE);
  if (textMatch) {
    const [, name, message] = textMatch;
    const { data: contact } = await sb.from("contacts").select("name, phone_number").eq("user_id", userId).ilike("name", name).maybeSingle();
    if (!contact) { await reply(chatId, `I don't have a contact called *${name}* yet \u2014 add one: \"add contact ${name} +234...\"`); return true; }
    await queueAutomation(userId, `WhatsApp ${contact.name} (${contact.phone_number}): ${message}`);
    return true;
  }
  const search = extractSearch(text);
  if (search) { await queueAutomation(userId, `${search.site} search: ${search.query}`); return true; }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== WEBHOOK_SECRET) return new Response("unauthorized", { status: 401 });

  const update = await req.json();
  const msg = update.message;
  if (!msg) return new Response("ok");

  const chatId = msg.chat.id;
  const updateId = update.update_id;
  const isVoice = !!msg.voice;
  const isPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  const text = (msg.text ?? "").trim();
  const caption = (msg.caption ?? "").trim();

  if (!isVoice && !isPhoto && !text) return new Response("ok");
  if (!isVoice && !isPhoto && text.startsWith(BOSLEY_TAG)) return new Response("ok");

  const { data: link } = await sb.from("telegram_chat_links").select("user_id, linked_at").eq("chat_id", chatId).maybeSingle();

  if (!link || !link.linked_at) {
    if (isVoice || isPhoto) { await reply(chatId, "Link your account first \u2014 open the Bosley app \u2192 Settings \u2192 Telegram for your code."); return new Response("ok"); }
    const code = text.replace("/start", "").trim();
    if (!code) { await reply(chatId, "\ud83d\udc4b I'm *Bosley*. Open the Bosley app \u2192 Settings \u2192 Telegram to get your link code, then send it to me here."); return new Response("ok"); }
    const { data: matched, error } = await sb.from("telegram_chat_links").update({ chat_id: chatId, linked_at: new Date().toISOString() }).eq("link_code", code).is("linked_at", null).select("user_id").maybeSingle();
    await reply(chatId, error || !matched ? "\u274c That code didn't match. Double-check it in the app and try again." : "\u2705 Linked! Send /list anytime to see everything I can do.");
    return new Response("ok");
  }

  const userId = link.user_id;

  if (isPhoto) {
    const largest = msg.photo[msg.photo.length - 1];
    const description = await analyzeImage(largest.file_id, caption);
    await sb.from("telegram_messages").upsert({ update_id: updateId, chat_id: chatId, user_id: userId, text: `[photo] ${caption || "(no caption)"}`, raw_update: update, direction: "in" });
    if (!description) { await reply(chatId, GROQ_API_KEY ? "Couldn't read that image \u2014 try resending it?" : "Image reading isn't set up yet."); return new Response("ok"); }
    await reply(chatId, description, false);
    return new Response("ok");
  }

  if (isVoice) {
    const duration = msg.voice.duration ?? 0;
    const { text: transcript, tooShort, lowConfidence } = await transcribeVoice(msg.voice.file_id, duration);
    if (tooShort) { await reply(chatId, "That voice note was too short \u2014 try holding the mic a little longer."); return new Response("ok"); }
    if (!transcript) { await reply(chatId, GROQ_API_KEY ? "Couldn't transcribe that \u2014 try again?" : "Voice notes aren't set up yet."); return new Response("ok"); }
    if (lowConfidence) { await reply(chatId, `I only caught \"${transcript}\" \u2014 mind resending?`); return new Response("ok"); }

    await sb.from("telegram_messages").upsert({ update_id: updateId, chat_id: chatId, user_id: userId, text: `[voice] ${transcript}`, raw_update: update, direction: "in" });

    const lower = transcript.toLowerCase();
    if (await handlePriceCommand(userId, chatId, lower)) return new Response("ok");
    if (await handleCalcCommand(userId, chatId, lower)) return new Response("ok");
    if (await handleProjectCommand(userId, chatId, lower, transcript)) return new Response("ok");
    if (await handleOsCommand(userId, chatId, lower)) return new Response("ok");
    if (await handleDeepCommand(userId, chatId, lower)) return new Response("ok");

    if (isAutomationCommand(transcript)) {
      const queued = await queueAutomation(userId, transcript);
      if (!queued.ok) await reply(chatId, "Could not queue that — try again?");
      else if (!queued.listenerNotified) await reply(chatId, "Automation saved, but the laptop listener did not confirm receiving it. Check the listener connection and try again.");
    } else {
      const { error: insertErr } = await sb.from("tasks").insert({ user_id: userId, title: transcript, status: "pending" });
      await reply(chatId, insertErr ? "Couldn't save that \u2014 try again?" : `Task added: _${transcript}_`);
    }
    return new Response("ok");
  }

  await sb.from("telegram_messages").upsert({ update_id: updateId, chat_id: chatId, user_id: userId, text, raw_update: update, direction: "in" });

  if (text === "/list" || text === "/help") { await reply(chatId, COMMAND_LIST); return new Response("ok"); }

  const lowerText = text.toLowerCase();
  if (await handlePriceCommand(userId, chatId, lowerText)) return new Response("ok");
  if (await handleCalcCommand(userId, chatId, lowerText)) return new Response("ok");
  if (await handleProjectCommand(userId, chatId, lowerText, text)) return new Response("ok");
  if (await handleOsCommand(userId, chatId, lowerText)) return new Response("ok");
  if (await handleDeepCommand(userId, chatId, lowerText)) return new Response("ok");

  if (text === "/tasks") {
    const { data: tasks } = await sb.from("tasks").select("title, status, due_at").eq("user_id", userId).neq("status", "done").order("due_at", { ascending: true }).limit(10);
    const list = (tasks ?? []).map((t) => `\u2022 ${t.title}${t.due_at ? ` (due ${new Date(t.due_at).toLocaleString()})` : ""}`).join("\n") || "No open tasks \ud83c\udf89";
    await reply(chatId, `*Open tasks:*\n${list}`);
  } else if (text === "/reminders") {
    const { data: rems } = await sb.from("reminders").select("title, fires_at").eq("user_id", userId).eq("is_active", true).order("fires_at", { ascending: true }).limit(10);
    const list = (rems ?? []).map((r) => `\u2022 ${r.title} \u2014 ${new Date(r.fires_at).toLocaleString()}`).join("\n") || "No active reminders.";
    await reply(chatId, `*Reminders:*\n${list}`);
  } else if (isAutomationCommand(text)) {
    await queueAutomation(userId, text);
  } else {
    const { error: insertErr } = await sb.from("tasks").insert({ user_id: userId, title: text, status: "pending" });
    await reply(chatId, insertErr ? "Couldn't save that \u2014 try again?" : `Task added: _${text}_`);
  }

  return new Response("ok");
});
