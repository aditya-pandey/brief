/* The Briefing — app.js */

const DATA = "data/";
const BASE_PATH = (() => {
  const path = window.location.pathname;
  const match = path.match(/^(.*?)\/(?:story|day|editor)(?:\/|$)/);
  if (match) return match[1];
  return path.replace(/\/+$/, "");
})();
const dayCache = {};
let indexEntries = [];
const FEEDBACK_ENDPOINT = ""; // Paste your Formspree, Formspark, or Webhook URL here to receive feedback

/* ── Flash state variables ── */
let currentMode = localStorage.getItem("currentMode") || "flash";
let flashStories = [];
let activeFlashCategory = "all";
let currentFlashIndex = 0;
const flashReadsSessionSet = new Set();

/* ── Analytics tracking helpers ──────────────────────────────── */
function trackPageView(path, title) {
  if (title) {
    document.title = title;
  }
  if (typeof gtag === "function") {
    gtag("config", "G-602K6P5H7B", {
      page_path: path,
      page_title: document.title || "The Briefing"
    });
  }
}

function trackEvent(action, category, label, value = null) {
  if (typeof gtag === "function") {
    const params = {
      event_category: category,
      event_label: label
    };
    if (value !== null) params.value = value;
    gtag("event", action, params);
  }
}


/* ── Helpers ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const app = $("app");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function navigate(path) {
  history.pushState(null, "", path);
  route();
}
function formatMdText(s) {
  if (!s) return "";
  return esc(s).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}
function leanClass(lean) {
  const l = (lean||"").toLowerCase();
  if (l.includes("left"))  return "lean-left";
  if (l.includes("right")) return "lean-right";
  return "lean-center";
}
function sourceBuckets(sources = []) {
  const buckets = { left:0, center:0, right:0, other:0 };
  sources.forEach(s => {
    const l = (s.lean||"").toLowerCase();
    if (l.includes("left")) buckets.left++;
    else if (l.includes("right")) buckets.right++;
    else if (l.includes("center")) buckets.center++;
    else buckets.other++;
  });
  return buckets;
}
function readMinutes(story) {
  const wc = JSON.stringify(story).split(/\s+/).length;
  return Math.max(2, Math.round(wc / 220));
}

function keyPhrase(text = "") {
  const stop = new Set("the a an and or of on in to for by with from as is are was were be been this that into amid against after before over under through it its their".split(" "));
  const words = String(text).toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
  const counts = {};
  words.forEach(w => { if (!stop.has(w)) counts[w] = (counts[w]||0) + 1; });
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([w]) => w);
}
function fmtLong(iso) {
  try { return new Date(iso+"T00:00:00").toLocaleDateString("en-IN",
    {weekday:"long",day:"numeric",month:"long",year:"numeric"}); }
  catch { return iso; }
}
function fmtShort(iso) {
  try {
    const d = new Date(iso+"T00:00:00");
    return {day:d.getDate(), month:d.toLocaleDateString("en-IN",{month:"short"}).toUpperCase(),
            year:d.getFullYear(), dow:d.toLocaleDateString("en-IN",{weekday:"short"}).toUpperCase()};
  } catch { return {day:iso,month:"",year:"",dow:""}; }
}
function fmtHeaderDate(iso) {
  try { return new Date(iso+"T00:00:00").toLocaleDateString("en-IN",
    {day:"numeric",month:"short",year:"numeric"}); }
  catch { return iso; }
}

/* ── Theme ─────────────────────────────────────────────────── */
const saved = localStorage.getItem("theme");
if (saved) document.documentElement.setAttribute("data-theme", saved);
$("theme-toggle").onclick = () => {
  const next = document.documentElement.getAttribute("data-theme")==="dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  trackEvent("theme_toggle", "Preferences", next);
};

/* ── Progress bar ──────────────────────────────────────────── */
let progressActive = false;
function startProgress() {
  progressActive = true;
  const bar = $("progress-bar");
  bar.style.width = "0%";
  function update() {
    if (!progressActive) return;
    const el = document.documentElement;
    const pct = el.scrollTop / (el.scrollHeight - el.clientHeight) * 100;
    bar.style.width = Math.min(pct,100)+"%";
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}
function stopProgress() {
  progressActive = false;
  $("progress-bar").style.width = "0%";
}

/* ── Data loading ──────────────────────────────────────────── */
async function loadIndex() {
  if (indexEntries.length) return indexEntries;
  const r = await fetch(DATA+"index.json",{cache:"no-store"});
  const raw = await r.json();
  const mapped = raw.map(x => typeof x==="string" ? {date:x,count:null} : x);
  const unique = [];
  const seen = new Set();
  for (const entry of mapped) {
    if (!seen.has(entry.date)) {
      seen.add(entry.date);
      unique.push(entry);
    }
  }
  indexEntries = unique;
  
  const sel = $("archive-select");
  if (sel) {
    if (indexEntries.length > 0) {
      sel.max = indexEntries[0].date;
      sel.min = indexEntries[indexEntries.length - 1].date;
    }
    sel.addEventListener("change", e => {
      const selected = e.target.value;
      if (selected && indexEntries.some(x => x.date === selected)) {
        navigate(`${BASE_PATH}/day/${selected}`);
      } else if (selected) {
        alert("No briefing available for this date. Please select a valid date.");
        e.target.value = "";
      }
    });
  }
  return indexEntries;
}
async function loadDay(date) {
  if (dayCache[date]) return dayCache[date];
  const r = await fetch(`${DATA}${date}.json`,{cache:"no-store"});
  if (!r.ok) throw new Error("No data for "+date);
  return (dayCache[date] = await r.json());
}

/* ══════════════════════════════════════════════════════════════
   ICON LIBRARY — inline SVGs for visual section headers
   ══════════════════════════════════════════════════════════════ */
const ICON = {
  hex:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 7 22 17 12 22 2 17 2 7"/></svg>`,
  chess:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7"/></svg>`,
  scale:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 8h18M6 8l-3 6a3 3 0 0 0 6 0L6 8zM18 8l-3 6a3 3 0 0 0 6 0L18 8z"/></svg>`,
  fact:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  eye:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="21" x2="21" y2="3"/></svg>`,
  quote:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 6h4v4H8c0 2 1 3 3 3v3c-3 0-4-2-4-4V6zm9 0h4v4h-3c0 2 1 3 3 3v3c-3 0-4-2-4-4V6z"/></svg>`,
  impact:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" opacity=".5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>`,
  clock:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  timeline:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="5" cy="12" r="2"/><line x1="5" y1="8" x2="5" y2="10"/><line x1="5" y1="14" x2="5" y2="16"/><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="16" y2="12"/><line x1="9" y1="18" x2="18" y2="18"/></svg>`,
  bulb:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c1 .9 1 1.6 1 2.3v1h6v-1c0-.7 0-1.4 1-2.3A7 7 0 0 0 12 2z"/></svg>`,
  link:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>`,
};

/* Decorative hero pattern (geometric, story-themed) */
function hashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; 
  }
  return Math.abs(hash);
}

function semanticGraphicBg(story) {
  let hash = Math.abs(hashStr(story.id || story.headline || "default"));
  function rand() { let x = Math.sin(hash++) * 10000; return x - Math.floor(x); }
  const bgs = ["#F4F4F5", "#F8FAFC", "#FAF5FF", "#FDF4FF", "#FFFBEB", "#F0FDF4", "#F0F9FF", "#FEF2F2", "#FFF7ED"];
  return bgs[Math.floor(rand() * bgs.length)];
}

function semanticGraphic(story, idx = 0) {
  const text = ((story.headline || "") + " " + (story.tldr || "")).toLowerCase();
  let hash = Math.abs(hashStr(story.id || story.headline || "default"));
  function rand() {
    let x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  }
  
  // Claude-inspired ultra-soft pastel backgrounds
  const bgs = ["#F4F4F5", "#F8FAFC", "#FAF5FF", "#FDF4FF", "#FFFBEB", "#F0FDF4", "#F0F9FF", "#FEF2F2", "#FFF7ED"];
  const bg = bgs[Math.floor(rand() * bgs.length)];

  const stroke = "currentColor"; 
  const sw = "1.5"; 
  
  const common = `fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;

  const library = {
    conflict: [
      // 1. Shattered Circle
      `<path d="M 100 40 A 60 60 0 0 0 100 160" ${common} />
       <path d="M 110 40 A 60 60 0 0 1 110 160" ${common} />
       <polyline points="105,30 90,80 120,120 95,170" ${common} />`,
      // 2. Abstract Scales
      `<line x1="100" y1="40" x2="100" y2="160" ${common} />
       <line x1="50" y1="70" x2="150" y2="70" ${common} />
       <polygon points="50,70 30,120 70,120" ${common} />
       <polygon points="150,70 130,120 170,120" ${common} />
       <line x1="70" y1="160" x2="130" y2="160" ${common} />`,
      // 3. Clash / Opposing Arrows
      `<polyline points="40,60 80,100 40,140" ${common} />
       <polyline points="160,60 120,100 160,140" ${common} />
       <line x1="100" y1="40" x2="100" y2="160" ${common} stroke-dasharray="4 4"/>`,
      // 4. Shield
      `<path d="M 50 60 Q 100 40 150 60 L 150 100 Q 150 150 100 170 Q 50 150 50 100 Z" ${common} />
       <line x1="100" y1="45" x2="100" y2="170" ${common} />`,
      // 5. Gavel Abstract
      `<line x1="60" y1="140" x2="130" y2="70" ${common} />
       <rect x="120" y="50" width="40" height="20" transform="rotate(45 140 60)" ${common} />
       <line x1="40" y1="150" x2="80" y2="150" ${common} />`,
      // 6. Maze / Knot
      `<polyline points="60,60 140,60 140,140 80,140 80,80 120,80 120,120" ${common} />
       <line x1="100" y1="100" x2="100" y2="160" ${common} />
       <line x1="40" y1="100" x2="60" y2="100" ${common} />`,
      // 7. Broken Pillar
      `<rect x="80" y="40" width="40" height="120" ${common} />
       <polygon points="70,100 130,90 130,110 70,120" fill="${bg}" stroke="${bg}" stroke-width="4" />
       <polyline points="75,100 100,95 125,110" ${common} />`
    ],
    economy: [
      // 1. Ascending Chart
      `<rect x="50" y="120" width="20" height="40" ${common} />
       <rect x="90" y="90" width="20" height="70" ${common} />
       <rect x="130" y="50" width="20" height="110" ${common} />
       <path d="M 30 140 Q 80 140 100 80 T 170 30" ${common} />
       <line x1="30" y1="160" x2="170" y2="160" ${common} />`,
      // 2. Donut / Pie
      `<circle cx="100" cy="100" r="50" ${common} />
       <circle cx="100" cy="100" r="25" ${common} />
       <line x1="100" y1="50" x2="100" y2="75" ${common} />
       <line x1="143" y1="125" x2="122" y2="112" ${common} />
       <line x1="57" y1="125" x2="78" y2="112" ${common} />`,
      // 3. Trade / Exchange
      `<circle cx="70" cy="100" r="30" ${common} />
       <circle cx="130" cy="100" r="30" ${common} />
       <path d="M 70 50 Q 100 30 130 50" ${common} />
       <polygon points="120,40 135,50 120,60" fill="${stroke}" />
       <path d="M 130 150 Q 100 170 70 150" ${common} />
       <polygon points="80,140 65,150 80,160" fill="${stroke}" />`,
      // 4. Staircase / Steps
      `<polyline points="40,160 40,130 80,130 80,100 120,100 120,70 160,70 160,40" ${common} />
       <line x1="40" y1="160" x2="160" y2="160" ${common} />`,
      // 5. Candlestick / Stock
      `<line x1="70" y1="40" x2="70" y2="120" ${common} />
       <rect x="60" y="60" width="20" height="40" fill="${stroke}" />
       <line x1="130" y1="80" x2="130" y2="160" ${common} />
       <rect x="120" y="100" width="20" height="40" ${common} />`,
      // 6. Flow / Curve
      `<path d="M 40 140 Q 100 140 100 100 T 160 60" ${common} />
       <path d="M 40 160 Q 100 160 100 120 T 160 80" ${common} stroke-dasharray="4 4" />`,
    ],
    tech: [
      // 1. Orbits / Atom
      `<ellipse cx="100" cy="100" rx="60" ry="20" transform="rotate(30 100 100)" ${common} />
       <ellipse cx="100" cy="100" rx="60" ry="20" transform="rotate(150 100 100)" ${common} />
       <circle cx="100" cy="100" r="6" fill="${stroke}" />
       <circle cx="50" cy="70" r="3" fill="${stroke}" />
       <circle cx="150" cy="130" r="3" fill="${stroke}" />`,
      // 2. CPU / Chip
      `<rect x="60" y="60" width="80" height="80" rx="4" ${common} />
       <rect x="80" y="80" width="40" height="40" rx="2" ${common} />
       <line x1="60" y1="80" x2="40" y2="80" ${common} />
       <line x1="60" y1="100" x2="40" y2="100" ${common} />
       <line x1="60" y1="120" x2="40" y2="120" ${common} />
       <line x1="140" y1="80" x2="160" y2="80" ${common} />
       <line x1="140" y1="100" x2="160" y2="100" ${common} />
       <line x1="140" y1="120" x2="160" y2="120" ${common} />
       <line x1="80" y1="60" x2="80" y2="40" ${common} />
       <line x1="100" y1="60" x2="100" y2="40" ${common} />
       <line x1="120" y1="60" x2="120" y2="40" ${common} />
       <line x1="80" y1="140" x2="80" y2="160" ${common} />
       <line x1="100" y1="140" x2="100" y2="160" ${common} />
       <line x1="120" y1="140" x2="120" y2="160" ${common} />`,
      // 3. Network Constellation
      `<circle cx="100" cy="100" r="40" ${common} stroke-dasharray="4 4" />
       <circle cx="100" cy="60" r="5" fill="${stroke}" />
       <circle cx="65" cy="120" r="5" fill="${stroke}" />
       <circle cx="135" cy="120" r="5" fill="${stroke}" />
       <circle cx="100" cy="100" r="3" fill="${stroke}" />
       <line x1="100" y1="60" x2="100" y2="100" ${common} />
       <line x1="65" y1="120" x2="100" y2="100" ${common} />
       <line x1="135" y1="120" x2="100" y2="100" ${common} />
       <line x1="65" y1="120" x2="135" y2="120" ${common} />`,
      // 4. Radar / Sonar
      `<path d="M 40 160 A 120 120 0 0 1 160 40" ${common} />
       <path d="M 40 160 A 80 80 0 0 1 120 80" ${common} />
       <path d="M 40 160 A 40 40 0 0 1 80 120" ${common} />
       <circle cx="40" cy="160" r="6" fill="${stroke}" />
       <circle cx="110" cy="90" r="4" fill="${stroke}" />`,
      // 5. Data Blocks
      `<rect x="60" y="60" width="20" height="20" ${common} />
       <rect x="90" y="60" width="20" height="20" fill="${stroke}" />
       <rect x="120" y="60" width="20" height="20" ${common} />
       <rect x="60" y="90" width="20" height="20" fill="${stroke}" />
       <rect x="90" y="90" width="20" height="20" ${common} />
       <rect x="120" y="90" width="20" height="20" fill="${stroke}" />
       <rect x="60" y="120" width="20" height="20" ${common} />
       <rect x="90" y="120" width="20" height="20" fill="${stroke}" />
       <rect x="120" y="120" width="20" height="20" ${common} />`,
      // 6. Waveform
      `<polyline points="30,100 60,100 75,60 90,140 105,40 120,120 135,100 170,100" ${common} />`
    ],
    politics: [
      // 1. Institution / Pillars
      `<polygon points="100,50 40,80 160,80" ${common} />
       <rect x="50" y="80" width="10" height="60" ${common} />
       <rect x="80" y="80" width="10" height="60" ${common} />
       <rect x="110" y="80" width="10" height="60" ${common} />
       <rect x="140" y="80" width="10" height="60" ${common} />
       <rect x="30" y="140" width="140" height="10" ${common} />`,
      // 2. Globe / Geopolitics
      `<circle cx="100" cy="100" r="50" ${common} />
       <ellipse cx="100" cy="100" rx="20" ry="50" ${common} />
       <line x1="50" y1="100" x2="150" y2="100" ${common} />
       <line x1="100" y1="40" x2="100" y2="160" ${common} />`,
      // 3. Podium / Speech
      `<rect x="80" y="80" width="40" height="60" ${common} />
       <rect x="70" y="140" width="60" height="10" ${common} />
       <line x1="100" y1="80" x2="100" y2="50" ${common} />
       <circle cx="100" cy="45" r="5" fill="${stroke}" />
       <line x1="90" y1="90" x2="110" y2="90" ${common} />
       <line x1="90" y1="100" x2="110" y2="100" ${common} />`,
      // 4. Monument / Dome
      `<path d="M 60 100 A 40 40 0 0 1 140 100" ${common} />
       <rect x="50" y="100" width="100" height="20" ${common} />
       <rect x="40" y="120" width="120" height="10" ${common} />
       <line x1="100" y1="60" x2="100" y2="40" ${common} />`,
      // 5. Meeting / Table
      `<line x1="40" y1="100" x2="160" y2="100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
       <circle cx="70" cy="70" r="10" ${common} />
       <circle cx="100" cy="70" r="10" fill="${stroke}" />
       <circle cx="130" cy="70" r="10" ${common} />
       <circle cx="70" cy="130" r="10" fill="${stroke}" />
       <circle cx="100" cy="130" r="10" ${common} />
       <circle cx="130" cy="130" r="10" fill="${stroke}" />`,
      // 6. Flags / Banners
      `<line x1="40" y1="50" x2="160" y2="50" ${common} />
       <polygon points="60,50 100,50 80,120" ${common} />
       <polygon points="110,50 150,50 130,140" fill="${stroke}" opacity="0.8"/>`
    ],
    balance: [
      // 1. Zen Stones
      `<circle cx="100" cy="130" r="30" ${common} />
       <circle cx="100" cy="80" r="20" ${common} />
       <circle cx="100" cy="45" r="15" ${common} />
       <line x1="40" y1="160" x2="160" y2="160" ${common} />`,
      // 2. Horizon
      `<circle cx="100" cy="100" r="50" ${common} />
       <line x1="30" y1="100" x2="170" y2="100" ${common} />
       <line x1="60" y1="110" x2="140" y2="110" ${common} />
       <line x1="80" y1="120" x2="120" y2="120" ${common} />`,
      // 3. Interlocking Rings
      `<circle cx="85" cy="100" r="40" ${common} />
       <circle cx="115" cy="100" r="40" ${common} />
       <path d="M 100 63 L 100 137" ${common} stroke-dasharray="2 4"/>`,
      // 4. Hourglass / Infinity
      `<polygon points="60,60 140,60 100,100" ${common} />
       <polygon points="60,140 140,140 100,100" ${common} />
       <line x1="80" y1="120" x2="120" y2="120" ${common} stroke-dasharray="2 2" />`,
      // 5. Sunrise
      `<path d="M 60 120 A 40 40 0 0 1 140 120" ${common} />
       <line x1="30" y1="120" x2="170" y2="120" ${common} />
       <line x1="100" y1="80" x2="100" y2="60" ${common} />
       <line x1="128" y1="92" x2="142" y2="78" ${common} />
       <line x1="72" y1="92" x2="58" y2="78" ${common} />`,
      // 6. Pendulum
      `<line x1="100" y1="40" x2="100" y2="140" ${common} stroke-dasharray="4 4" />
       <circle cx="100" cy="140" r="15" fill="${stroke}" />
       <path d="M 60 140 A 40 40 0 0 0 140 140" ${common} />`
    ]
  };

  const categories = {
    conflict: ["strike", "war", "conflict", "tension", "crisis", "attack", "threat", "protest", "violence", "court", "lawsuit", "invalidates", "clash", "friction", "strains", "rejects"],
    economy: ["economy", "market", "funding", "growth", "bank", "trade", "tax", "fee", "investment", "price", "billion", "rupee", "dollar"],
    tech: ["tech", "ai", "space", "science", "digital", "data", "software", "apple", "google", "meta", "cyber"],
    politics: ["election", "vote", "president", "minister", "law", "policy", "government", "parliament", "senate", "ruling", "judge", "diplomatic"]
  };

  let activeTheme = "balance";
  let maxMatches = 0;
  for (const [theme, words] of Object.entries(categories)) {
    let matches = 0;
    words.forEach(w => { if (text.includes(w)) matches++; });
    if (matches > maxMatches) {
      maxMatches = matches;
      activeTheme = theme;
    }
  }

  const icons = library[activeTheme];
  const icon = icons[Math.floor(rand() * icons.length)];
  
  return `<div class="cover-pattern" aria-hidden="true" style="--pastel-bg:${bg}; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" style="width:100%; height:100%; max-width:240px; max-height:240px; padding: 24px;">
      ${icon}
    </svg>
  </div>`;
}

/* Source distribution: stacked horizontal bar */
function sourceDistribution(sources) {
  if (!sources?.length) return "";
  const buckets = sourceBuckets(sources);
  const total = sources.length;
  const segs = [
    { cls:"seg-left",   n:buckets.left,   label:"Left" },
    { cls:"seg-center", n:buckets.center+buckets.other, label:"Center" },
    { cls:"seg-right",  n:buckets.right,  label:"Right" },
  ].filter(s => s.n > 0);
  return `
    <div class="source-dist">
      <div class="source-dist-bar">
        ${segs.map(s => `<div class="source-dist-seg ${s.cls}" style="flex:${s.n}" title="${s.label}: ${s.n}">
          <span class="source-dist-num">${s.n}</span>
        </div>`).join("")}
      </div>
      <div class="source-dist-legend">
        <span><span class="dot lean-left"></span>${buckets.left} Left</span>
        <span><span class="dot lean-center"></span>${buckets.center+buckets.other} Center</span>
        <span><span class="dot lean-right"></span>${buckets.right} Right</span>
        <span class="source-dist-total">${total} source${total!==1?"s":""}</span>
      </div>
    </div>`;
}

function miniSourceBar(sources) {
  const buckets = sourceBuckets(sources);
  const center = buckets.center + buckets.other;
  const total = Math.max(1, sources?.length || 0);
  return `
    <div class="mini-source" aria-label="Source balance">
      <span class="mini-seg mini-left" style="flex:${buckets.left || 0.01}"></span>
      <span class="mini-seg mini-center" style="flex:${center || 0.01}"></span>
      <span class="mini-seg mini-right" style="flex:${buckets.right || 0.01}"></span>
      <span class="mini-total">${total}</span>
    </div>`;
}

function storyVisual(story, idx = 0) {
  const region = (story.region||"global").toLowerCase();
  const sources = story.sources || [];
  const terms = keyPhrase(`${story.headline} ${story.tldr}`).slice(0,2);
  return `
    <div class="story-viz ${region}" aria-hidden="true" style="overflow:hidden; position:relative; width: 100%; height: 180px; min-height: 180px; border-bottom: 1px solid var(--rule);">
      ${semanticGraphic(story, idx)}
      <div style="position:absolute; bottom:12px; right:12px; background:rgba(0,0,0,0.4); backdrop-filter:blur(4px); color:#fff; padding:4px 8px; border-radius:4px; font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:.05em;">
        STORY ${String(idx+1).padStart(2,"0")}
      </div>
    </div>`;
}



/* Sentiment detection for impact text (heuristic) */
function impactSentiment(text) {
  const t = (text||"").toLowerCase();
  const neg = /(loss|risk|threat|damage|decline|fall|drop|fail|crisis|burden|deficit|erode|harm|suffer|hurt|crash|collapse|cost|hit|sanction|tension|conflict|strain)/g;
  const pos = /(gain|win|benefit|grow|boost|rise|surge|profit|opportunity|stronger|advance|protect|secure|relief|recovery|invest)/g;
  const n = (t.match(neg)||[]).length;
  const p = (t.match(pos)||[]).length;
  if (p > n + 1) return { dir:"up",   label:"Positive" };
  if (n > p + 1) return { dir:"down", label:"Negative" };
  return { dir:"mixed", label:"Mixed" };
}

function firstSentence(text = "", max = 170) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const sentence = clean.match(/^[^.!?]+[.!?]/)?.[0] || clean;
  return sentence.length > max ? sentence.slice(0, max - 1).trim() + "…" : sentence;
}
function metricScore(text = "", positiveWords = [], negativeWords = []) {
  const t = String(text || "").toLowerCase();
  const hit = words => words.reduce((n,w) => n + (t.includes(w) ? 1 : 0), 0);
  return Math.max(22, Math.min(96, 54 + hit(positiveWords) * 9 + hit(negativeWords) * 11));
}
function actorList(story) {
  const who = story.situational_analysis?.who || "";
  const parts = who.split(/,| and |;|\./).map(x => x.trim()).filter(Boolean);
  return parts.slice(0, 4);
}
function intelMap(story) {
  const actors = actorList(story);
  const region = (story.region || "global").toUpperCase();
  const labels = actors.length ? actors : ["Policy", "Markets", "Public", region];
  return `
    <div class="intel-map" aria-hidden="true">
      <svg viewBox="0 0 320 210" role="img">
        <defs>
          <radialGradient id="mapPulse" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stop-color="currentColor" stop-opacity=".34"/>
            <stop offset="72%" stop-color="currentColor" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <path class="map-grid-line" d="M18 52h284M18 104h284M18 156h284M72 20v170M160 20v170M248 20v170"/>
        <path class="map-land" d="M46 92c23-32 59-40 92-25 24 11 38 2 61-10 31-16 64-4 81 28-15 28-37 42-66 37-31-6-40 26-70 34-31 8-62-9-77-30-9-12-22-13-41-13 1-8 8-16 20-21Z"/>
        <circle class="map-pulse" cx="165" cy="104" r="76" fill="url(#mapPulse)"/>
        <path class="map-connection" d="M93 84 C130 54, 182 54, 222 84"/>
        <path class="map-connection delay" d="M92 138 C136 170, 198 167, 247 125"/>
        <circle class="map-node primary" cx="165" cy="104" r="8"/>
        <circle class="map-node" cx="93" cy="84" r="5"/>
        <circle class="map-node" cx="222" cy="84" r="5"/>
        <circle class="map-node" cx="92" cy="138" r="5"/>
        <circle class="map-node" cx="247" cy="125" r="5"/>
      </svg>
      <div class="intel-actors">
        ${labels.map(a => `<span>${esc(firstSentence(a, 28))}</span>`).join("")}
      </div>
    </div>`;
}
function intelligenceTiles(story) {
  const sa = story.situational_analysis || {};
  const tiles = [
    ["WHAT", "Target", sa.what, "tile-red"],
    ["WHO", "Actors", sa.who, "tile-blue"],
    ["WHEN", "Window", sa.when, "tile-amber"],
    ["WHERE", "Theater", sa.where, "tile-slate"],
    ["WHY", "Motive", sa.why, "tile-teal"],
    ["IMPACT", "Effect", story.stakeholder_impact?.[0]?.impact || story.strategic_assessment, "tile-green"],
  ].filter(([, , v]) => v);
  return tiles.map(([k,label,text,cls]) => `
    <button class="intel-tile ${cls}" type="button">
      <span class="tile-code">${k}</span>
      <strong>${label}</strong>
      <em>${esc(firstSentence(text, 92))}</em>
      <span class="tile-more">${esc(text)}</span>
    </button>`).join("");
}
function mobileBriefingCards(story, slides) {
  const sa = story.situational_analysis || {};
  const pm = story.perspective_matrix || {};
  const facts = story.facts_vs_claims || {};
  const sources = story.sources || [];
  const threatScore = metricScore(`${story.tldr} ${story.blind_spot} ${story.strategic_assessment}`,
    ["benefit","relief","recovery"], ["war","threat","risk","crisis","collapse","breach","strike","inflation"]);
  const impactScore = metricScore(story.stakeholder_impact?.map(x=>x.impact).join(" ") || story.strategic_assessment,
    ["gain","boost","opportunity"], ["risk","threat","loss","collapse","strain","inflation"]);
  const timelineItems = story.timeline?.length ? story.timeline : [
    { when: "Now", event: sa.what || story.tldr },
    { when: "Why", event: sa.why || story.strategic_assessment },
    { when: "Next", event: story.strategic_assessment || story.simple_explanation },
  ].filter(x => x.event);
  const perspectiveItems = [
    ["Left", pm.left_leaning, "lean-left"],
    ["Center", pm.center, "lean-center"],
    ["Right", pm.right_leaning, "lean-right"],
    ["India", pm.indian_media, "scope"],
    ["Global", pm.western_international || pm.global_media, "scope"],
  ].filter(([,v]) => v);

  return [
    {
      id:"overview", label:"Situation", kicker:"CLASSIFIED BRIEFING", tone:"hero",
      summary: `
        ${intelMap(story)}
        <h1>${esc(story.headline)}</h1>
        <p>${esc(story.tldr)}</p>
        <div class="intel-metrics">
          <div style="--p:${threatScore}%"><span>Threat</span><strong>${threatScore}</strong></div>
          <div style="--p:${impactScore}%"><span>Impact</span><strong>${impactScore}</strong></div>
        </div>`,
      detail: `
        <h2>Situation Overview</h2>
        <p>${esc(sa.what || story.tldr)}</p>
        <dl class="intel-facts">
          <div><dt>Time Window</dt><dd>${esc(sa.when || "Developing")}</dd></div>
          <div><dt>Reading Time</dt><dd>${readMinutes(story)} minutes</dd></div>
          <div><dt>Key Actors</dt><dd>${actorList(story).map(esc).join(" · ") || "Multiple stakeholders"}</dd></div>
        </dl>`
    },
    {
      id:"what", label:"5W1H", kicker:"FIELD NOTES", tone:"tiles",
      summary: `<h2>What Happened</h2><p>${esc(firstSentence(sa.what || story.tldr, 180))}</p><div class="intel-tile-grid">${intelligenceTiles(story)}</div>`,
      detail: `<h2>Full 5W1H Intelligence</h2><div class="intel-report-grid">
        ${[["What",sa.what],["Who",sa.who],["When",sa.when],["Where",sa.where],["Why",sa.why],["How",sa.how]].filter(([,v])=>v).map(([k,v])=>`
          <section><strong>${k}</strong><p>${esc(v)}</p></section>`).join("")}
      </div>`
    },
    {
      id:"timeline", label:"Timeline", kicker:"EVENT REEL", tone:"timeline",
      summary: `<h2>Timeline</h2><p>${esc(firstSentence(timelineItems[0]?.event || story.context_background || story.tldr, 170))}</p>
        <div class="story-reel">${timelineItems.slice(0,3).map((o,i)=>`
          <article style="--i:${i}"><span>${esc(o.when)}</span><strong>${esc(firstSentence(o.event, 92))}</strong></article>`).join("")}</div>`,
      detail: `<h2>Event Sequence</h2><div class="intel-timeline">
        ${timelineItems.map((o,i)=>`<article><b>${String(i+1).padStart(2,"0")}</b><span>${esc(o.when)}</span><p>${esc(o.event)}</p></article>`).join("")}
      </div>`
    },
    {
      id:"map", label:"Network", kicker:"RELATIONSHIP MAP", tone:"map",
      summary: `${intelMap(story)}<h2>Relationship Map</h2><p>${esc(firstSentence(sa.who || story.context_background || story.tldr, 180))}</p>`,
      detail: `<h2>Network Reading</h2><p>${esc(sa.who || "The available briefing does not isolate a single actor network.")}</p><p>${esc(story.context_background || "")}</p>`
    },
    {
      id:"perspective", label:"Perspectives", kicker:"NARRATIVE SPLIT", tone:"matrix",
      summary: `<h2>Perspective Matrix</h2><div class="mobile-spectrum"><span>Left</span><b></b><span>Right</span></div>
        <div class="matrix-chips">${perspectiveItems.slice(0,3).map(([k,v,cls])=>`<article class="${cls}"><strong>${k}</strong><p>${esc(firstSentence(v, 104))}</p></article>`).join("")}</div>`,
      detail: `<h2>Competing Readings</h2><div class="matrix-deep">
        ${perspectiveItems.map(([k,v,cls])=>`<section class="${cls}"><strong>${k}</strong><p>${esc(v)}</p></section>`).join("")}
      </div>`
    },
    {
      id:"facts", label:"Evidence", kicker:"FACTS VS CLAIMS", tone:"evidence",
      summary: `<h2>Evidence Split</h2><div class="evidence-split">
        <article><span>Facts</span><strong>${facts.facts?.length || 0}</strong><p>${esc(firstSentence(facts.facts?.[0] || "No verified fact list provided.", 100))}</p></article>
        <article><span>Claims</span><strong>${facts.claims?.length || 0}</strong><p>${esc(firstSentence(facts.claims?.[0] || "No contested claim list provided.", 100))}</p></article>
      </div>`,
      detail: `<h2>Evidence Ledger</h2><div class="ledger">
        <section><strong>Verified Facts</strong>${(facts.facts||[]).map(x=>`<p>${esc(x)}</p>`).join("")}</section>
        <section><strong>Claims</strong>${(facts.claims||[]).map(x=>`<p>${esc(x)}</p>`).join("")}</section>
      </div>`
    },
    {
      id:"impact", label:"Impact", kicker:"STAKEHOLDER RISK", tone:"impact",
      summary: `<h2>Stakeholder Impact</h2><div class="impact-radar" style="--impact:${impactScore}%"><strong>${impactScore}</strong><span>impact</span></div>
        <p>${esc(firstSentence(story.stakeholder_impact?.[0]?.impact || story.strategic_assessment, 180))}</p>`,
      detail: `<h2>Impact Assessment</h2><div class="impact-deep">
        ${(story.stakeholder_impact||[]).map(o=>`<section><strong>${esc(o.stakeholder)}</strong><p>${esc(o.impact)}</p></section>`).join("") || `<p>${esc(story.strategic_assessment || "")}</p>`}
      </div>`
    },
    {
      id:"context", label:"Context", kicker:"ARCHIVE BACKDROP", tone:"context",
      summary: `<h2>Historical Context</h2><p>${esc(firstSentence(story.context_background || story.simple_explanation, 190))}</p>`,
      detail: `<h2>Background File</h2><p>${esc(story.context_background || "")}</p><h2>Plain Terms</h2><p>${esc(story.simple_explanation || "")}</p>`
    },
    {
      id:"sources", label:"Sources", kicker:"SOURCE ANALYSIS", tone:"sources",
      summary: `<h2>Source Analysis</h2>${sourceDistribution(sources)}<p>Source transparency and outlet leanings are detailed below.</p>`,
      detail: `<h2>Transparency Log</h2><p>Attributed sources used in this briefing:</p><ul class="mobile-source-list">
        ${sources.map(src=>`<li><span class="${leanClass(src.lean)}"></span><a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.outlet)}</a><em>${esc(src.lean)} · ${esc(src.region)}</em></li>`).join("")}
      </ul>`
    },
    {
      id:"strategy", label:"Strategy", kicker:"STRATEGIC ASSESSMENT", tone:"strategy",
      summary: `<h2>Strategic Assessment</h2><p>${esc(firstSentence(story.strategic_assessment, 190))}</p>`,
      detail: `<h2>Strategic Assessment</h2><p>${esc(story.strategic_assessment || "")}</p><h2>Blind Spot</h2><p>${esc(story.blind_spot || "")}</p>`
    },
  ].filter(card => card.summary || card.detail);
}

/* ══════════════════════════════════════════════════════════════
   SLIDE BUILDER — each section becomes a self-contained slide
   ══════════════════════════════════════════════════════════════ */
function buildSlides(s, date) {
  const slides = [];
  const region = (s.region||"global").toLowerCase();
  const sourceCount = (s.sources||[]).length;
  const readMin = readMinutes(s);

  // 1 · Cover
  slides.push({ id:"cover", label:"Overview", icon:"◉", html:`
    <div class="slide-cover">
      <div class="slide-cover-visual" style="background-color: ${semanticGraphicBg(s)};">
        ${semanticGraphic(s, 0)}
      </div>
      <div class="slide-cover-content">
        <div class="slide-cover-top">
          <span class="detail-region ${region}">${esc(region.toUpperCase())}</span>
        </div>
        <h1 class="slide-headline">${esc(s.headline)}</h1>
        <div class="cover-meta">
          <span class="cover-meta-item">${ICON.clock}<span>${readMin} min read</span></span>
          <span class="cover-meta-item">${ICON.link}<span>${sourceCount} sources</span></span>
        </div>
        
        <div class="editorial-block" style="margin-top: 24px; padding: 16px; background: var(--bg-card-h); border: 1px solid var(--rule); border-radius: var(--radius-sm);">
          <div class="editorial-label">TL;DR</div>
          <p class="slide-prose" style="margin-top: 8px; font-size: 15px;">${esc(s.tldr)}</p>
        </div>
        
        ${s.simple_explanation ? `
        <div class="editorial-block" style="margin-top: 16px; padding: 16px; background: var(--bg-card-h); border: 1px solid var(--rule); border-radius: var(--radius-sm);">
          <div class="editorial-label">In Plain English</div>
          <p class="slide-prose" style="margin-top: 8px; font-size: 15px;">${esc(s.simple_explanation)}</p>
        </div>` : ""}
        
        <div class="swipe-hint">Swipe ← to explore deep dive</div>
      </div>
    </div>`
  });

  // 2. Situational Analysis (5W1H)
  const sa = s.situational_analysis;
  const wIcons = { "WHAT":"▣", "WHY":"?", "WHO":"◉", "WHEN":"⏱", "WHERE":"⌖", "HOW":"⚙" };
  if (sa) slides.push({ id:"situational", label:"Situational Analysis", icon:"⬡", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.hex}</span>Situational Analysis (5W1H)</div>
      <div class="w-list">
        ${[["WHAT",sa.what],["WHY",sa.why],["WHO",sa.who],["WHEN",sa.when],["WHERE",sa.where],["HOW",sa.how]]
          .filter(([,v])=>v).map(([k,v])=>`
          <div class="w-item">
            <div class="w-keyrow">
              <span class="w-glyph" data-k="${k}">${wIcons[k]||"·"}</span>
              <span class="w-key">${k}</span>
            </div>
            <div class="w-val">${esc(v)}</div>
          </div>`).join("")}
      </div>
    </div>`
  });

  // 3. Perspective Matrix
  const pm = s.perspective_matrix;
  const ei = s.editorial_expert_insight;
  if (pm || ei) {
    const regional = [
      { cls:"region-in", label:"Indian View",       glyph:"IN", view:pm?.indian_media },
      { cls:"region-wi", label:"International View", glyph:"WW", view:pm?.western_international||pm?.global_media },
    ].filter(p => p.view);
    const polLeft = pm?.left_leaning;
    const polRight = pm?.right_leaning;
    const expert = ei?.analysis;

    slides.push({ id:"perspectives", label:"Perspective Matrix", icon:"⊞", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.scale}</span>Perspective Matrix</div>
      ${regional.length ? `
      <div class="region-perspectives">
        ${regional.map(p => `
          <div class="region-card ${p.cls}">
            <div class="region-card-top">
              <span class="region-glyph">${p.glyph}</span>
              <span class="region-label">${p.label}</span>
            </div>
            <div class="region-card-body">${esc(p.view)}</div>
          </div>`).join("")}
      </div>` : ""}
      
      ${polLeft || polRight ? `
      <div class="editorial-block" style="margin-top: 24px;">
        <div class="editorial-label">Political Narratives</div>
        <div class="fc-slide" style="margin-top: 12px; gap: 12px;">
          ${polLeft ? `<div class="fc-half facts" style="border:1px solid var(--rule);"><div class="fc-title" style="color:var(--ink);">Left-Leaning</div><p style="font-size:14px; margin:0;">${esc(polLeft)}</p></div>` : ""}
          ${polRight ? `<div class="fc-half facts" style="border:1px solid var(--rule);"><div class="fc-title" style="color:var(--ink);">Right-Leaning</div><p style="font-size:14px; margin:0;">${esc(polRight)}</p></div>` : ""}
        </div>
      </div>` : ""}

      ${expert ? `
      <div class="editorial-block" style="margin-top: 24px;">
        <div class="editorial-label">Expert Analysis</div>
        <div class="editorial-body" style="margin-top: 8px;">${formatMdText(expert)}</div>
      </div>` : ""}
    </div>`
    });
  }

  // 4. Facts vs Claims
  const fc = s.facts_vs_claims;
  if (fc) slides.push({ id:"facts", label:"Facts & Claims", icon:"⊛", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.fact}</span>Facts & Contested Claims</div>
      <div class="fc-slide">
        <div class="fc-half facts">
          <div class="fc-title">✓ Verified Facts</div>
          <ul>${(fc.facts||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
        </div>
        <div class="fc-half claims">
          <div class="fc-title">⚠ Claims / Disputed Narratives</div>
          <ul>${(fc.claims||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
        </div>
      </div>
    </div>`
  });

  // 5. Impact Analysis
  const arrowSvg = {
    up:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 14 12 8 18 14"/></svg>`,
    down:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 10 12 16 18 10"/></svg>`,
    mixed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="18" y2="12"/><polyline points="14 8 18 12 14 16"/></svg>`,
  };
  if (s.stakeholder_impact?.length) slides.push({ id:"impact", label:"Impact", icon:"◎", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.impact}</span>Impact Analysis</div>
      <div class="impact-cards">
        ${(s.stakeholder_impact||[]).map(o=>{
          const sent = impactSentiment(o.impact);
          return `
          <div class="impact-card sent-${sent.dir}">
            <div class="impact-card-head">
              <span class="impact-arrow sent-${sent.dir}">${arrowSvg[sent.dir]}</span>
              <span class="impact-stakeholder">${esc(o.stakeholder)}</span>
            </div>
            <div class="impact-card-body">${esc(o.impact)}</div>
          </div>`;
        }).join("")}
      </div>
    </div>`
  });

  // 6. Historical Context
  if (s.context_background || s.timeline?.length) slides.push({ id:"context", label:"Historical Context", icon:"⊙", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.timeline}</span>Historical Context</div>
      ${s.context_background ? `<p class="slide-prose" style="margin-bottom:24px;">${esc(s.context_background)}</p>` : ""}
      ${s.timeline?.length ? `
      <div class="timeline-list">
        ${s.timeline.map(o=>`
          <div class="tl-item">
            <div class="tl-when">${esc(o.when)}</div>
            <div class="tl-event">${esc(o.event)}</div>
          </div>`).join("")}
      </div>` : ""}
    </div>`
  });

  // 7. Blind Spots & Sources
  slides.push({ id:"blindspot", label:"Blind Spots", icon:"⚑", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.eye}</span>Blind Spots & Sources</div>
      ${s.blind_spot ? `
      <div class="blindspot" style="margin-bottom: 32px;">
        <span class="blindspot-icon">⚑ Underreported Angles</span>
        ${esc(s.blind_spot)}
      </div>` : ""}
      
      <div class="editorial-block">
        <div class="editorial-label" style="margin-bottom:12px;">Sources Used</div>
        ${sourceDistribution(s.sources)}
        <ul class="sources-list" style="margin-top: 16px;">
          ${(s.sources||[]).map(src=>`
            <li class="source-item">
              <span class="source-dot ${leanClass(src.lean)}"></span>
              <span class="source-name">${esc(src.outlet)}</span>
              <span class="source-meta">${esc(src.lean)} · ${esc(src.region)}</span>
            </li>`).join("")}
        </ul>
      </div>
    </div>`
  });

  return slides;
}

/* ══════════════════════════════════════════════════════════════
   MOBILE DECK — swipeable full-screen slides
   ══════════════════════════════════════════════════════════════ */
function renderMobileDeck(slides, s, date, storyIdx, stories) {
  const container = document.createElement("div");
  container.className = "mobile-story-layout";

  const allSlides = slides;

  container.innerHTML = `
    <!-- Top breadcrumb/header -->
    <div class="mobile-story-header">
      <a class="mobile-back" href="/day/${esc(date)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
        Briefings
      </a>
      <div class="mobile-top-share-bar">
        <button class="m-share-icon-btn share-native" id="m-share-native" title="Share" aria-label="Share">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
        </button>
        <button class="m-share-icon-btn share-copy" id="m-share-copy" title="Copy Link" aria-label="Copy Link">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        </button>
        <button class="m-share-icon-btn share-x" id="m-share-x" title="Share on X" aria-label="Share on X">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </button>
        <button class="m-share-icon-btn share-wa" id="m-share-wa" title="Share on WhatsApp" aria-label="Share on WhatsApp">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.488 1.459 5.416 1.46 5.48-.004 9.938-4.467 9.94-9.948.002-2.65-1.026-5.143-2.897-7.017C17.228 1.776 14.73 .746 12.08.745 6.596.745 2.136 5.207 2.134 10.69c-.001 1.929.501 3.812 1.457 5.417l-.982 3.58 3.674-.963zm11.393-4.504c-.3-.15-1.77-.874-2.043-.973-.272-.1-.47-.15-.668.15-.198.3-.765.973-.938 1.17-.173.198-.346.223-.646.074-.3-.15-1.264-.467-2.41-1.485-.892-.793-1.493-1.773-1.668-2.07-.173-.3-.018-.462.13-.61.135-.133.3-.35.45-.525.15-.173.2-.297.3-.495.1-.198.05-.371-.025-.52-.075-.15-.668-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.568-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.77-.724 2.017-1.424.248-.699.248-1.299.173-1.424-.075-.124-.272-.198-.57-.347z"/></svg>
        </button>
      </div>
    </div>

    <!-- Sticky Tab Navigation Bar -->
    <div class="mobile-tab-bar">
      ${allSlides.map((sl, i) => `
        <button class="mobile-tab-item ${i === 0 ? "active" : ""}" data-idx="${i}">
          <span class="tab-icon">${sl.icon || "·"}</span>
          <span class="tab-label">${sl.label}</span>
        </button>
      `).join("")}
    </div>

    <!-- Swipeable Cards Viewport -->
    <div class="mobile-card-viewport" id="mobile-card-viewport">
      <div class="mobile-card-wrapper" id="mobile-card-wrapper" style="transform: translateX(0%);">
        ${allSlides.map((sl, i) => `
          <div class="mobile-card-slide" data-idx="${i}">
            <div class="mobile-card-content">
              ${sl.html}
            </div>
          </div>
        `).join("")}
      </div>
    </div>

    <!-- Footer navigation controls -->
    <div class="mobile-footer-nav">
      <button class="mobile-footer-btn prev" id="m-footer-prev" aria-label="Exit">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <div class="mobile-footer-dots">
        ${allSlides.map((_, i) => `
          <span class="dot-indicator ${i === 0 ? "active" : ""}" data-idx="${i}"></span>
        `).join("")}
      </div>
      <button class="mobile-footer-btn next" id="m-footer-next" aria-label="Next">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </div>
  `;

  // Swiper state and gesture handlers
  let activeTabIdx = 0;
  let startX = 0;
  let startY = 0;

  const wrapper = container.querySelector("#mobile-card-wrapper");
  const viewport = container.querySelector("#mobile-card-viewport");
  const tabs = container.querySelectorAll(".mobile-tab-item");
  const dots = container.querySelectorAll(".dot-indicator");

  // SVG Icons
  const CHEVRON_LEFT = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
  const CHEVRON_RIGHT = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
  const EXIT_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  const NEXT_STORY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>`;

  function setActiveTab(idx) {
    activeTabIdx = Math.max(0, Math.min(allSlides.length - 1, idx));
    
    // Update wrapper transform
    wrapper.style.transform = `translateX(-${activeTabIdx * 100}%)`;

    // Update active tab buttons
    tabs.forEach((btn, i) => btn.classList.toggle("active", i === activeTabIdx));
    
    // Scroll active tab into view in the tab bar
    const activeTabBtn = tabs[activeTabIdx];
    activeTabBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });

    // Update dots
    dots.forEach((dot, i) => dot.classList.toggle("active", i === activeTabIdx));

    // Update footer button icons
    const prevBtn = container.querySelector("#m-footer-prev");
    const nextBtn = container.querySelector("#m-footer-next");

    if (activeTabIdx === 0) {
      prevBtn.innerHTML = EXIT_ICON;
      prevBtn.setAttribute("aria-label", "Exit");
    } else {
      prevBtn.innerHTML = CHEVRON_LEFT;
      prevBtn.setAttribute("aria-label", "Previous");
    }

    if (activeTabIdx === allSlides.length - 1) {
      nextBtn.innerHTML = NEXT_STORY_ICON;
      nextBtn.setAttribute("aria-label", "Next Story");
    } else {
      nextBtn.innerHTML = CHEVRON_RIGHT;
      nextBtn.setAttribute("aria-label", "Next");
    }
  }

  // Swipe events
  viewport.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  viewport.addEventListener("touchend", (e) => {
    const diffX = e.changedTouches[0].clientX - startX;
    const diffY = e.changedTouches[0].clientY - startY;

    // We only swipe if the horizontal movement is greater than vertical movement
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX > 0) {
        // swipe right -> prev card
        if (activeTabIdx > 0) {
          trackEvent("navigate_swipe", "Mobile Deep Dive", "Prev Slide", allSlides[activeTabIdx - 1].label);
          setActiveTab(activeTabIdx - 1);
        } else {
          trackEvent("navigate_swipe", "Mobile Deep Dive", "Swipe Exit Briefings");
          navigate(`/day/${date}`);
        }
      } else {
        // swipe left -> next card
        if (activeTabIdx < allSlides.length - 1) {
          trackEvent("navigate_swipe", "Mobile Deep Dive", "Next Slide", allSlides[activeTabIdx + 1].label);
          setActiveTab(activeTabIdx + 1);
        } else if (storyIdx < stories.length - 1) {
          trackEvent("navigate_swipe", "Mobile Deep Dive", "Swipe Next Briefing", stories[storyIdx + 1].headline);
          navigate(`${BASE_PATH}/story/${date}/${stories[storyIdx + 1].id}`);
        }
      }
    }
  });

  // Tap tabs
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      trackEvent("navigate_tab", "Mobile Deep Dive", allSlides[idx].label);
      setActiveTab(idx);
    });
  });

  // Footer navigation actions
  container.querySelector("#m-footer-prev").addEventListener("click", () => {
    if (activeTabIdx > 0) {
      trackEvent("navigate_button", "Mobile Deep Dive", "Prev Slide Button", allSlides[activeTabIdx - 1].label);
      setActiveTab(activeTabIdx - 1);
    } else {
      trackEvent("navigate_button", "Mobile Deep Dive", "Exit Button");
      navigate(`${BASE_PATH}/day/${date}`);
    }
  });

  container.querySelector("#m-footer-next").addEventListener("click", () => {
    if (activeTabIdx < allSlides.length - 1) {
      trackEvent("navigate_button", "Mobile Deep Dive", "Next Slide Button", allSlides[activeTabIdx + 1].label);
      setActiveTab(activeTabIdx + 1);
    } else if (storyIdx < stories.length - 1) {
      trackEvent("navigate_button", "Mobile Deep Dive", "Next Briefing Button", stories[storyIdx + 1].headline);
      navigate(`${BASE_PATH}/story/${date}/${stories[storyIdx + 1].id}`);
    }
  });

  // Wire events
  wireEngagementEvents(container, s);

  return container;
}

function wireEngagementEvents(container, s) {
  // Share Copy
  container.querySelectorAll(".share-copy").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const target = e.currentTarget;
      const url = window.location.href;
      trackEvent("share_action", "Engagement", "Copy Link", s.headline);
      navigator.clipboard.writeText(url).then(() => {
        const origText = target.innerHTML;
        target.innerHTML = target.querySelector("span") ? `<span>✓ Copied!</span>` : `✓ Copied!`;
        target.classList.add("copied");
        setTimeout(() => {
          target.innerHTML = origText;
          target.classList.remove("copied");
        }, 2000);
      });
    });
  });

  // Share X
  container.querySelectorAll(".share-x").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = encodeURIComponent(window.location.href);
      const text = encodeURIComponent(`Check out this deep dive: "${s.headline}" on The Briefing`);
      trackEvent("share_action", "Engagement", "Twitter X", s.headline);
      window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, "_blank");
    });
  });

  // Share WA
  container.querySelectorAll(".share-wa").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = encodeURIComponent(window.location.href);
      const text = encodeURIComponent(`Check out this deep dive: "${s.headline}" on The Briefing - `);
      trackEvent("share_action", "Engagement", "WhatsApp", s.headline);
      window.open(`https://api.whatsapp.com/send?text=${text}${url}`, "_blank");
    });
  });

  // Share LI (for desktop / general)
  container.querySelectorAll(".share-li").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = encodeURIComponent(window.location.href);
      trackEvent("share_action", "Engagement", "LinkedIn", s.headline);
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
    });
  });

  // Native share (mobile only)
  container.querySelector(".share-native")?.addEventListener("click", () => {
    trackEvent("share_action", "Engagement", "Native Share", s.headline);
    if (navigator.share) {
      navigator.share({
        title: s.headline,
        text: `Check out this deep dive on The Briefing: "${s.headline}"`,
        url: window.location.href
      }).catch(err => console.log("Error sharing:", err));
    } else {
      container.querySelector(".share-copy")?.click();
    }
  });

}

/* ══════════════════════════════════════════════════════════════
   DESKTOP LAYOUT — sidebar + scrollable sections
   ══════════════════════════════════════════════════════════════ */
function renderDesktopLayout(slides, s, date, storyIdx, stories) {
  const toc = stories.map((st, i) => `
    <button class="sidebar-item ${i === storyIdx ? 'active' : ''}" 
            data-id="${esc(st.id)}" aria-label="${esc(st.headline)}">
      <span class="sidebar-num">${String(i+1).padStart(2,"0")}</span>
      <span class="sidebar-title">${esc(st.headline)}</span>
    </button>`).join("");

  // Cover slide is shown as headline+tldr above; skip it in the section list.
  // Magazine layout: top is 2-col flex masonry, deep sections span full width.
  const sections = slides.filter(sl => sl.id !== "cover");
  const fullWidthIds = new Set(["context","blindspot"]);
  // Estimated content density per section type for balanced 2-col distribution
  const weight = { "exec_summary": 3, "situational": 6, "perspectives": 6, "facts": 3, "impact": 4, "context": 4, "blindspot": 4 };
  const grid = sections.filter(s => !fullWidthIds.has(s.id));
  const fullWidth = sections.filter(s => fullWidthIds.has(s.id));

  // Sort by weight desc, then greedy place into shorter column
  const sorted = [...grid].sort((a,b) => (weight[b.id]||3) - (weight[a.id]||3));
  const colA = [], colB = [];
  let sumA = 0, sumB = 0;
  for (const sl of sorted) {
    const w = weight[sl.id] || 3;
    if (sumA <= sumB) { colA.push(sl); sumA += w; }
    else              { colB.push(sl); sumB += w; }
  }
  const renderSection = sl => `
    <div class="desktop-section" id="section-${sl.id}">${sl.html}</div>`;

  const allSections = `
    <div class="desktop-sections">
      <div class="desktop-col">${colA.map(renderSection).join("")}</div>
      <div class="desktop-col">${colB.map(renderSection).join("")}</div>
    </div>
    ${fullWidth.map(sl => `
      <div class="desktop-section desktop-section-full" id="section-${sl.id}">${sl.html}</div>
    `).join("")}`;

  const wrap = document.createElement("div");
  wrap.className = "desktop-story-layout";
  wrap.innerHTML = `
    <aside class="story-sidebar">
      <div class="sidebar-hdr">
        <a class="sidebar-back" href="./">← Home</a>
        <span class="sidebar-date">${fmtHeaderDate(date).toUpperCase()}</span>
      </div>
      <div class="sidebar-list">${toc}</div>
    </aside>
    <div class="story-main">
      <div class="story-main-inner">
        <!-- Desktop Floating Share Bar -->
        <div class="desktop-floating-share-bar">
          <button class="d-share-icon-btn share-copy" id="d-share-copy" title="Copy Link" aria-label="Copy Link">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          </button>
          <button class="d-share-icon-btn share-x" id="d-share-x" title="Share on X" aria-label="Share on X">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </button>
          <button class="d-share-icon-btn share-wa" id="d-share-wa" title="Share on WhatsApp" aria-label="Share on WhatsApp">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.488 1.459 5.416 1.46 5.48-.004 9.938-4.467 9.94-9.948.002-2.65-1.026-5.143-2.897-7.017C17.228 1.776 14.73 .746 12.08.745 6.596.745 2.136 5.207 2.134 10.69c-.001 1.929.501 3.812 1.457 5.417l-.982 3.58 3.674-.963zm11.393-4.504c-.3-.15-1.77-.874-2.043-.973-.272-.1-.47-.15-.668.15-.198.3-.765.973-.938 1.17-.173.198-.346.223-.646.074-.3-.15-1.264-.467-2.41-1.485-.892-.793-1.493-1.773-1.668-2.07-.173-.3-.018-.462.13-.61.135-.133.3-.35.45-.525.15-.173.2-.297.3-.495.1-.198.05-.371-.025-.52-.075-.15-.668-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.568-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.77-.724 2.017-1.424.248-.699.248-1.299.173-1.424-.075-.124-.272-.198-.57-.347z"/></svg>
          </button>
          <button class="d-share-icon-btn share-li" id="d-share-li" title="Share on LinkedIn" aria-label="Share on LinkedIn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z"/></svg>
          </button>
        </div>

        <section class="story-dossier">
          <div class="desktop-cover-visual" style="background-color: ${semanticGraphicBg(s)}; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
            ${semanticGraphic(s, 0)}
          </div>
          <div class="dossier-copy">
            <span class="detail-region ${(s.region||"").toLowerCase()}">${esc((s.region||"").toUpperCase())}</span>
            <h1 class="detail-headline">${esc(s.headline)}</h1>
            <p class="detail-tldr">${esc(s.tldr)}</p>
            ${s.simple_explanation ? `
            <div class="editorial-block" style="margin-top: 24px; max-width: 68ch;">
              <div class="editorial-label">In Plain English</div>
              <p class="slide-prose" style="margin-top: 8px;">${esc(s.simple_explanation)}</p>
            </div>` : ""}
          </div>
        </section>
        ${allSections}

        ${renderRelatedFlashCards(s)}

        <div class="desktop-story-nav">
          ${storyIdx > 0 ? `<a class="story-nav-btn prev" href="${BASE_PATH}/story/${date}/${stories[storyIdx-1].id}">← ${esc(stories[storyIdx-1].headline.slice(0,50))}…</a>` : "<span></span>"}
          ${storyIdx < stories.length - 1 ? `<a class="story-nav-btn next" href="${BASE_PATH}/story/${date}/${stories[storyIdx+1].id}">${esc(stories[storyIdx+1].headline.slice(0,50))}… →</a>` : "<span></span>"}
        </div>
      </div>
    </div>`;

  wrap.querySelectorAll(".sidebar-item").forEach(btn => {
    btn.addEventListener("click", () => {
      trackEvent("navigate_sidebar", "Desktop Sidebar", btn.dataset.id);
      navigate(`${BASE_PATH}/story/${date}/${btn.dataset.id}`);
    });
  });

  wrap.querySelectorAll(".story-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const direction = btn.classList.contains("next") ? "Next Story" : "Prev Story";
      trackEvent("navigate_button", "Desktop Navigation", direction);
    });
  });

  // Wire events for sharing & feedback
  wireEngagementEvents(wrap, s);

  return wrap;
}

/* ══════════════════════════════════════════════════════════════
   HOME PAGE
   ══════════════════════════════════════════════════════════════ */
async function renderHome(date) {
  document.body.classList.remove("mode-flash-active");
  const tf = $("toggle-flash");
  const tb = $("toggle-briefing");
  if (tf) tf.classList.remove("active");
  if (tb) tb.classList.add("active");

  await loadIndex();
  if (!date) date = indexEntries[0]?.date;
  if (!date) { app.innerHTML=`<div class="error-state">No briefings yet.</div>`; return; }

  const payload = await loadDay(date);
  const isLatest = date === indexEntries[0]?.date;

  const pageTitle = isLatest ? "The Briefing — Daily News, Decoded" : `The Briefing — Archive ${fmtHeaderDate(date)}`;
  const pagePath = isLatest ? "/" : `/#/day/${date}`;
  trackPageView(pagePath, pageTitle);

  $("header-date").textContent = fmtHeaderDate(date).toUpperCase();

  const hero = $("hero");
  hero.classList.remove("hidden");
  $("hero-title-h1").textContent = fmtLong(date);
  const count = payload.stories.length;
  $("hero-meta").textContent = isLatest 
    ? `The ${count} Stor${count === 1 ? "y" : "ies"} That Matter${count === 1 ? "s" : ""} Today` 
    : `Curated Daily Briefings · Archive (${count} stories)`;

  const pastBanner = isLatest ? "" : `
    <div class="past-day-banner">
      <span>📅 Viewing archive for ${fmtLong(date)}</span>
      <a href="./">← Today</a>
    </div>`;

  const cards = payload.stories.map((s,i) => {
    const region = (s.region||"global").toLowerCase();
    const readMin = readMinutes(s);
    return `
      <div class="story-card" data-id="${esc(s.id)}" data-date="${esc(date)}"
           data-region="${esc(region)}" role="button" tabindex="0">
        ${storyVisual(s, i)}
        <div class="card-accent"></div>
        <div class="card-body">
          <div class="card-top">
            <span class="card-num">${String(i+1).padStart(2,"0")}</span>
            <span class="card-region">${esc(region.toUpperCase())}</span>
          </div>
          <h2 class="card-headline">${esc(s.headline)}</h2>
          ${s.tldr ? `<p class="card-tldr">${esc(s.tldr)}</p>` : ""}
          <div class="card-footer">
            <span class="card-stats">
              ${ICON.clock}<span>${readMin} min</span>
            </span>
            <span class="card-arrow">Open Briefing →</span>
          </div>
        </div>
      </div>`;
  }).join("");

  app.innerHTML = `
    <div class="stories-section">
      ${pastBanner}
      <div class="stories-grid">${cards}</div>
    </div>
    ${renderTimeMachine(date)}`;

  app.querySelectorAll(".story-card").forEach(card => {
    const go = () => {
      trackEvent("click_brief_card", "Home Grid", card.dataset.id);
      navigate(`${BASE_PATH}/story/${card.dataset.date}/${card.dataset.id}`);
    };
    card.onclick = go;
    card.onkeydown = e => { if(e.key==="Enter"||e.key===" ") go(); };
  });
  app.querySelectorAll(".tm-card").forEach(btn => {
    btn.onclick = () => {
      trackEvent("click_time_machine", "Time Machine", btn.dataset.date);
      navigate(`${BASE_PATH}/day/${btn.dataset.date}`);
    };
  });
  app.querySelector(".past-day-banner a")?.addEventListener("click", e => {
    e.preventDefault();
    trackEvent("click_archive_banner_back", "Home Grid", "Back to Today");
    navigate(`${BASE_PATH}/`);
  });

  stopProgress();
  window.scrollTo(0,0);
}

/* ── Time Machine ──────────────────────────────────────────── */
function renderTimeMachine(currentDate) {
  const past = indexEntries.filter(e => e.date !== currentDate);
  if (!past.length) return "";
  const cards = past.map(e => {
    const f = fmtShort(e.date);
    const count = e.count!=null ? `<div class="tm-count">${e.count} stor${e.count===1?"y":"ies"}</div>` : "";
    return `
      <button class="tm-card" data-date="${esc(e.date)}" aria-label="${fmtLong(e.date)}">
        <div class="tm-dow">${esc(f.dow)}</div>
        <div class="tm-day">${esc(f.day)}</div>
        <div class="tm-mon">${esc(f.month)} ${esc(String(f.year))}</div>
        ${count}
      </button>`;
  }).join("");
  return `
    <div class="time-machine">
      <div class="tm-header"><span class="tm-label">Time Machine</span></div>
      <div class="tm-grid">${cards}</div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   STORY ROUTE
   ══════════════════════════════════════════════════════════════ */
async function renderStory(date, id) {
  document.body.classList.remove("mode-flash-active");
  const tf = $("toggle-flash");
  const tb = $("toggle-briefing");
  if (tf) tf.classList.remove("active");
  if (tb) tb.classList.add("active");

  await loadIndex();
  const payload = await loadDay(date);
  const stories = payload.stories;
  const storyIdx = stories.findIndex(x => x.id === id);
  if (storyIdx === -1) { app.innerHTML=`<div class="error-state">Story not found.</div>`; return; }
  const s = stories[storyIdx];

  const pageTitle = `The Briefing | ${s.headline}`;
  const pagePath = `/#/story/${date}/${id}`;
  trackPageView(pagePath, pageTitle);

  $("header-date").textContent = fmtHeaderDate(date).toUpperCase();
  $("hero").classList.add("hidden");

  const slides = buildSlides(s, date);
  
  // Append related Flash slide for mobile
  const briefCat = getBriefStoryCategory(s);
  const related = flashStories.filter(fs => fs.cat === briefCat).slice(0, 5);
  if (related.length > 0) {
    const cardsHtml = related.map(fs => {
      const col = getCategoryColor(fs.cat);
      const rgb = getCategoryColorRgb(fs.cat);
      return `
        <div class="related-flash-item" data-id="${esc(fs.id)}" style="background: var(--bg-card-h); margin-bottom: 12px; border: 1px solid var(--rule); border-radius: 12px; padding: 14px; text-align: left;">
          <div class="related-flash-item-top" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span class="related-flash-item-cat" style="background: rgba(${rgb}, 0.15); color: ${col}; font-family: var(--sans); font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 6px; border-radius: 4px;">${esc(FLASH_LABELS[fs.cat] || fs.cat)}</span>
            <span class="related-flash-item-time" style="font-family: var(--mono); font-size: 9px; color: var(--ink-3);">${esc(fs.ts)}</span>
          </div>
          <div class="related-flash-item-headline" style="font-family: var(--serif); font-size: 15px; font-weight: 700; line-height: 1.35; color: var(--ink); margin-bottom: 6px;">${esc(fs.hl)}</div>
          <div class="related-flash-item-summary" style="font-family: var(--sans); font-size: 12px; color: var(--ink-2); line-height: 1.5; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${esc(fs.body)}</div>
          <div class="related-flash-item-tap" style="color: ${col}; font-family: var(--sans); font-size: 9px; font-weight: 700; text-transform: uppercase;">Tap to view card &rarr;</div>
        </div>`;
    }).join("");
    
    slides.push({
      id: "related-flash",
      label: "Related Flash",
      icon: "⚡",
      html: `
        <div class="slide-body" style="padding-bottom: 40px; overflow-y: auto; height: 100%;">
          <div class="slide-section-label" style="display: flex; align-items: center; gap: 8px; font-family: var(--serif); font-size: 18px; font-weight: 700; color: var(--ink); margin-bottom: 16px;">
            <span>⚡</span>Related Flash Speed News
          </div>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${cardsHtml}
          </div>
        </div>`
    });
  }

  const isMobile = window.innerWidth < 768;

  app.innerHTML = "";
  if (isMobile) {
    app.appendChild(renderMobileDeck(slides, s, date, storyIdx, stories));
  } else {
    app.appendChild(renderDesktopLayout(slides, s, date, storyIdx, stories));
    startProgress();
  }
  window.scrollTo(0,0);
}

/* ── Router ────────────────────────────────────────────────── */
async function route() {
  let p = location.pathname;
  if (p.endsWith("/index.html")) {
    p = p.slice(0, -11);
  }
  p = p.replace(/\/+$/, "") || "/";
  if (BASE_PATH && p.startsWith(BASE_PATH)) {
    p = p.slice(BASE_PATH.length) || "/";
  }
  p = p.replace(/\/+$/, "") || "/";

  app.innerHTML=`<div class="loading-screen"><div class="spinner"></div></div>`;
  $("hero").classList.add("hidden");
  stopProgress();
  try {
    const m = p.match(/^\/story\/([^/]+)\/(.+)$/);
    const d = p.match(/^\/day\/([^/]+)$/);
    
    // Ensure flash.json is preloaded so it's always ready for cross-linking
    if (flashStories.length === 0) {
      try { await loadFlash(); } catch(e) { console.error("Preloading flash failed:", e); }
    }
    
    if (m) return await renderStory(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    if (d) return await renderHome(decodeURIComponent(d[1]));
    
    if (currentMode === "flash") {
      return await renderFlashView();
    } else {
      return await renderHome(null);
    }
  } catch(e) {
    stopProgress();
    app.innerHTML=`<div class="error-state">Couldn't load · ${esc(e.message)}</div>`;
  }
}

/* ══════════════════════════════════════════════════════════════
   ⚡ FLASH LAYOUT & INTERACTION ENGINE
   ══════════════════════════════════════════════════════════════ */
const FLASH_COLORS = {
  india:    '#FF5722',
  world:    '#3B82F6',
  politics: '#8B5CF6',
  business: '#22C55E',
  ai:       '#06B6D4',
  science:  '#F59E0B'
};

const FLASH_LABELS = {
  india:    'India',
  world:    'World',
  politics: 'Politics',
  business: 'Business',
  ai:       'AI & Tech',
  science: 'Science'
};

function getCategoryColor(cat) {
  return FLASH_COLORS[cat] || '#3E3E50';
}

function getCategoryColorRgb(cat) {
  const hex = getCategoryColor(cat);
  if (hex.startsWith('#') && hex.length === 7) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ].join(',');
  }
  return '62, 62, 80';
}

function getBriefStoryCategory(s) {
  const text = ((s.headline || "") + " " + (s.tldr || "") + " " + (s.simple_explanation || "")).toLowerCase();
  
  if (text.match(/ai|tech|software|google|meta|apple|microsoft|openai|silicon|computer|digital/)) return "ai";
  if (text.match(/space|science|satellite|isro|nasa|climate|heatwave|monsoon|temperate|medical|health|virus/)) return "science";
  if (text.match(/election|vote|parliament|minister|government|court|judge|law|policy|judgement|ruling/)) return "politics";
  if (text.match(/economy|market|rupee|dollar|billion|million|business|trade|tax|surplus|windfall|sensex|shares|stock/)) return "business";
  
  if ((s.region || "").toLowerCase() === "india") return "india";
  return "world";
}

async function loadFlash() {
  if (flashStories.length > 0) return flashStories;
  const r = await fetch(`${BASE_PATH ? BASE_PATH : "."}/flash.json`, { cache: "no-store" });
  if (!r.ok) throw new Error("Failed to load Flash stories.");
  flashStories = await r.json();
  return flashStories;
}

function renderFlashCategoryPills() {
  const cats = [
    { id: "all", label: "All" },
    { id: "india", label: "🇮🇳 India" },
    { id: "world", label: "🌍 World" },
    { id: "politics", label: "🏛 Politics" },
    { id: "business", label: "📈 Business" },
    { id: "ai", label: "🤖 AI & Tech" },
    { id: "science", label: "🔬 Science" }
  ];
  
  return cats.map(c => {
    const active = c.id === activeFlashCategory;
    const col = getCategoryColor(c.id);
    const rgb = getCategoryColorRgb(c.id);
    
    let style = "";
    if (active) {
      style = `style="--cat-color: ${col}; --cat-color-rgb: ${rgb};"`;
    }
    
    return `
      <button class="flash-cat-pill ${active ? 'active' : ''}" data-cat="${c.id}" ${style}>
        ${c.label}
      </button>`;
  }).join("");
}

function renderFlashDots(total) {
  const show = Math.min(total, 9);
  let start = Math.max(0, Math.min(currentFlashIndex - 4, total - show));
  let dots = [];
  for (let i = start; i < start + show; i++) {
    const active = i === currentFlashIndex;
    dots.push(`
      <div class="flash-nav-dot ${active ? 'active' : ''}"></div>
    `);
  }
  return dots.join("");
}

function wireFlashCategories() {
  const container = $("flash-cats");
  if (!container) return;
  container.addEventListener("click", e => {
    const pill = e.target.closest(".flash-cat-pill");
    if (pill) {
      activeFlashCategory = pill.dataset.cat;
      currentFlashIndex = 0;
      renderFlashView();
    }
  });
}

function wireFlashNavigation(filtered) {
  const prevBtn = $("flash-prev");
  const nextBtn = $("flash-next");
  const bookmarkBtn = $("flash-bookmark-btn");
  const goDeeperBtn = $("flash-go-deeper-btn");
  
  if (prevBtn) {
    prevBtn.onclick = () => {
      navigateFlash(-1, filtered);
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      navigateFlash(1, filtered);
    };
  }
  if (bookmarkBtn) {
    bookmarkBtn.onclick = () => {
      const activeStory = filtered[currentFlashIndex];
      const active = toggleBookmark(activeStory);
      bookmarkBtn.classList.toggle("saved", active);
      
      const col = getCategoryColor(activeStory.cat);
      bookmarkBtn.style.color = active ? col : "";
      
      const svg = bookmarkBtn.querySelector("svg");
      if (svg) {
        svg.setAttribute("fill", active ? "currentColor" : "none");
      }
      const label = bookmarkBtn.querySelector("span");
      if (label) {
        label.textContent = active ? "Saved" : "Save";
      }
    };
  }
  if (goDeeperBtn) {
    goDeeperBtn.onclick = () => {
      const activeStory = filtered[currentFlashIndex];
      const latestDate = indexEntries[0]?.date;
      if (latestDate) {
        // Switch to briefing mode
        currentMode = "briefing";
        localStorage.setItem("currentMode", "briefing");
        document.body.classList.remove("mode-flash-active");
        
        // update header nav active tab
        $("toggle-briefing").classList.add("active");
        $("toggle-flash").classList.remove("active");
        
        navigate(`${BASE_PATH}/story/${latestDate}/${activeStory.id}`);
      }
    };
  }
}

function navigateFlash(direction, filtered) {
  const nextIdx = currentFlashIndex + direction;
  if (nextIdx < 0 || nextIdx >= filtered.length) return;
  
  const card = $("flash-card");
  if (card) {
    card.style.transition = 'transform 0.22s ease-in, opacity 0.18s ease';
    card.style.transform  = direction > 0
      ? 'translateX(-108%) rotate(-5deg)'
      : 'translateX(108%) rotate(5deg)';
    card.style.opacity = '0';
    setTimeout(() => {
      currentFlashIndex = nextIdx;
      renderFlashView();
      // add entrance animation
      const newCard = $("flash-card");
      if (newCard) {
        newCard.style.opacity = '0';
        newCard.style.transform = 'translateY(10px) scale(0.97)';
        // trigger reflow
        newCard.offsetHeight;
        newCard.style.transition = 'transform 0.26s cubic-bezier(0.22, 0, 0.18, 1), opacity 0.26s ease';
        newCard.style.transform = '';
        newCard.style.opacity = '1';
      }
    }, 215);
  } else {
    currentFlashIndex = nextIdx;
    renderFlashView();
  }
}

let flashDragging = false;
let flashStartX = 0;
let flashCurrX = 0;
let flashCardEl = null;

function attachFlashDrag(filtered) {
  flashCardEl = $("flash-card");
  if (!flashCardEl) return;
  
  flashCardEl.addEventListener('touchstart', fStart, { passive: true });
  flashCardEl.addEventListener('touchmove',  fMove,  { passive: false });
  flashCardEl.addEventListener('touchend',   fEnd);
  flashCardEl.addEventListener('mousedown',  fStart);
  
  function fStart(e) {
    flashDragging = true;
    flashCurrX = 0;
    flashStartX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    if (flashCardEl) flashCardEl.style.transition = 'none';
    
    document.addEventListener('mousemove', fMove);
    document.addEventListener('mouseup',   fEnd);
  }
  
  function fMove(e) {
    if (!flashDragging || !flashCardEl) return;
    if (e.cancelable) e.preventDefault();
    
    const x = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    flashCurrX = x - flashStartX;
    const rot = flashCurrX * 0.032;
    flashCardEl.style.transform = `translateX(${flashCurrX}px) rotate(${rot}deg)`;
    
    /* Directional tint feedback */
    const overlayLeft = $("flash-drag-left");
    const overlayRight = $("flash-drag-right");
    
    const intensity = Math.min(Math.abs(flashCurrX) / 160, 1) * 0.18;
    if (flashCurrX < 0) { // Drag left -> next card
      if (overlayLeft) {
        overlayLeft.style.opacity = intensity;
      }
      if (overlayRight) {
        overlayRight.style.opacity = 0;
      }
    } else { // Drag right -> prev card
      if (overlayRight) {
        overlayRight.style.opacity = intensity;
      }
      if (overlayLeft) {
        overlayLeft.style.opacity = 0;
      }
    }
  }
  
  function fEnd() {
    if (!flashDragging) return;
    flashDragging = false;
    
    document.removeEventListener('mousemove', fMove);
    document.removeEventListener('mouseup',   fEnd);
    
    const overlayLeft = $("flash-drag-left");
    const overlayRight = $("flash-drag-right");
    
    if (overlayLeft) overlayLeft.style.opacity = '0';
    if (overlayRight) overlayRight.style.opacity = '0';
    
    const THRESH = 72;
    if (flashCurrX < -THRESH) {
      if (currentFlashIndex < filtered.length - 1) {
        navigateFlash(1, filtered);
      } else {
        snapBack();
      }
    } else if (flashCurrX > THRESH) {
      if (currentFlashIndex > 0) {
        navigateFlash(-1, filtered);
      } else {
        snapBack();
      }
    } else {
      snapBack();
    }
  }
  
  function snapBack() {
    if (flashCardEl) {
      flashCardEl.style.transition = 'transform 0.32s cubic-bezier(0.25, 0, 0.2, 1)';
      flashCardEl.style.transform = '';
    }
  }
}

async function trackViewCount(storyId) {
  const isFirstView = !flashReadsSessionSet.has(storyId);
  if (isFirstView) {
    flashReadsSessionSet.add(storyId);
  }
  
  // Fallback local storage count
  let localReads = {};
  try {
    localReads = JSON.parse(localStorage.getItem("flash_reads_fallback") || "{}");
  } catch(e) {}
  
  if (isFirstView) {
    localReads[storyId] = (localReads[storyId] || 0) + 1;
    localStorage.setItem("flash_reads_fallback", JSON.stringify(localReads));
  }
  
  let views = localReads[storyId] || 0;
  
  // Try CountAPI xyz
  try {
    const namespace = "thebriefing-flash";
    if (isFirstView) {
      // Increment
      const res = await fetch(`https://api.countapi.xyz/hit/${namespace}/${storyId}`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        views = data.value;
      }
    } else {
      // Get
      const res = await fetch(`https://api.countapi.xyz/get/${namespace}/${storyId}`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        views = data.value;
      }
    }
  } catch (err) {
    console.warn("CountAPI failed, using local fallback count:", err);
  }
  
  return views;
}

function showToast(message) {
  const container = $("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  // Remove after animation completes
  setTimeout(() => {
    toast.remove();
  }, 2600);
}

function toggleBookmark(story) {
  let saved = getSavedStories();
  const idx = saved.findIndex(s => s.id === story.id);
  if (idx >= 0) {
    saved.splice(idx, 1);
    localStorage.setItem("flash_saved", JSON.stringify(saved));
    showToast("Removed from bookmarks");
    return false; // not saved
  } else {
    saved.push(story);
    localStorage.setItem("flash_saved", JSON.stringify(saved));
    showToast("Saved to bookmarks");
    return true; // saved
  }
}

function getSavedStories() {
  try {
    return JSON.parse(localStorage.getItem("flash_saved") || "[]");
  } catch(e) {
    return [];
  }
}

function renderSavedStoriesList() {
  const listEl = $("saved-stories-list");
  if (!listEl) return;
  const saved = getSavedStories();
  if (saved.length === 0) {
    listEl.innerHTML = `
      <div class="saved-empty-state">
        <div class="saved-empty-icon">◦</div>
        <div class="saved-empty-text">No saved stories yet.</div>
      </div>`;
    return;
  }
  
  listEl.innerHTML = saved.map((s, index) => {
    const col = getCategoryColor(s.cat);
    return `
      <div class="saved-item-card" data-id="${esc(s.id)}" data-cat="${esc(s.cat)}">
        <button class="saved-item-remove" data-id="${esc(s.id)}" aria-label="Remove bookmark">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <div class="saved-item-top">
          <span class="saved-item-cat" style="color: ${col};">${esc(FLASH_LABELS[s.cat] || s.cat)}</span>
          <span class="saved-item-date">${esc(s.ts)}</span>
        </div>
        <div class="saved-item-headline">${esc(s.hl)}</div>
      </div>`;
  }).join("");
  
  // Wire click events on cards to open them
  listEl.querySelectorAll(".saved-item-card").forEach(card => {
    card.onclick = (e) => {
      if (e.target.closest(".saved-item-remove")) return; // handled by remove button
      const storyId = card.dataset.id;
      // Close modal
      $("saved-stories-modal").classList.remove("active");
      // Go to story
      openFlashStory(storyId);
    };
  });
  
  // Wire remove buttons
  listEl.querySelectorAll(".saved-item-remove").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const storyId = btn.dataset.id;
      const saved = getSavedStories();
      const story = saved.find(s => s.id === storyId);
      if (story) {
        toggleBookmark(story);
        renderSavedStoriesList();
      }
    };
  });
}

function openFlashStory(storyId) {
  currentMode = "flash";
  localStorage.setItem("currentMode", "flash");
  document.body.classList.add("mode-flash-active");
  
  // update tabs classes
  $("toggle-flash").classList.add("active");
  $("toggle-briefing").classList.remove("active");
  
  // Reset category to "all" to make sure the story can be found
  activeFlashCategory = "all";
  
  // Navigate to root to ensure we render flash view
  navigate(`${BASE_PATH}/`);
  
  // Set current flash index
  const index = flashStories.findIndex(fs => fs.id === storyId);
  if (index >= 0) {
    currentFlashIndex = index;
    renderFlashView();
  }
}

function renderRelatedFlashCards(s) {
  const briefCat = getBriefStoryCategory(s);
  const related = flashStories.filter(fs => fs.cat === briefCat).slice(0, 5);
  
  if (related.length === 0) return "";
  
  const cardsHtml = related.map(fs => {
    const col = getCategoryColor(fs.cat);
    const rgb = getCategoryColorRgb(fs.cat);
    return `
      <div class="related-flash-item" data-id="${esc(fs.id)}">
        <div class="related-flash-item-top">
          <span class="related-flash-item-cat" style="background: rgba(${rgb}, 0.15); color: ${col};">${esc(FLASH_LABELS[fs.cat] || fs.cat)}</span>
          <span class="related-flash-item-time">${esc(fs.ts)}</span>
        </div>
        <div class="related-flash-item-headline">${esc(fs.hl)}</div>
        <div class="related-flash-item-summary">${esc(fs.body)}</div>
        <div class="related-flash-item-tap" style="color: ${col};">Tap to view card &rarr;</div>
      </div>`;
  }).join("");

  return `
    <div class="briefing-related-flash-section">
      <h3 class="related-flash-title">⚡ Related Flash Speed News</h3>
      <div class="related-flash-row">
        ${cardsHtml}
      </div>
    </div>`;
}

async function renderFlashView() {
  stopProgress();
  
  // Update mode navigation active tab
  document.body.classList.add("mode-flash-active");
  $("toggle-flash").classList.add("active");
  $("toggle-briefing").classList.remove("active");
  
  try {
    await loadFlash();
  } catch (err) {
    app.innerHTML = `<div class="error-state">Couldn't load Flash stories · ${esc(err.message)}</div>`;
    return;
  }
  
  const filtered = activeFlashCategory === "all" 
    ? flashStories 
    : flashStories.filter(s => s.cat === activeFlashCategory);
    
  const total = filtered.length;
  currentFlashIndex = Math.max(0, Math.min(total - 1, currentFlashIndex));
  
  if (total === 0) {
    app.innerHTML = `
      <div class="flash-container">
        <div class="flash-heading-block">
          <div class="flash-heading-top">
            <div class="flash-heading-title">⚡ FLASH</div>
            <div class="flash-heading-datebar">TODAY'S FLASH</div>
          </div>
        </div>
        
        <div class="flash-categories-bar" id="flash-cats">
          ${renderFlashCategoryPills()}
        </div>
        
        <div class="flash-card-stage">
          <div class="saved-empty-state">
            <div class="saved-empty-icon">◦</div>
            <div class="saved-empty-text">No stories available in this category.</div>
          </div>
        </div>
        
        <div class="flash-progress-track">
          <div class="flash-progress-fill" style="width: 0%;"></div>
        </div>
        
        <div class="flash-nav-row">
          <button class="flash-nav-btn" disabled>&larr;</button>
          <div class="flash-nav-center">
            <span class="flash-nav-counter">0 / 0</span>
          </div>
          <button class="flash-nav-btn" disabled>&rarr;</button>
        </div>
      </div>`;
    
    wireFlashCategories();
    return;
  }
  
  const s = filtered[currentFlashIndex];
  const col = getCategoryColor(s.cat);
  const rgb = getCategoryColorRgb(s.cat);
  
  // Check if saved
  const saved = getSavedStories();
  const isSaved = saved.some(fs => fs.id === s.id);
  
  // Check if "Go Deeper" is available (story.id exists in today's briefing payload)
  let showGoDeeper = false;
  const latestDate = indexEntries[0]?.date;
  if (latestDate) {
    try {
      const todayPayload = dayCache[latestDate] || await loadDay(latestDate);
      showGoDeeper = todayPayload.stories.some(ts => ts.id === s.id);
    } catch(e) {}
  }
  
  // Render ghosts
  const nextStory = filtered[currentFlashIndex + 1];
  const thirdStory = filtered[currentFlashIndex + 2];
  
  const ghost1Html = nextStory 
    ? `<div class="flash-ghost-card-1" style="--next-cat-color-rgb: ${getCategoryColorRgb(nextStory.cat)}"></div>`
    : "";
  const ghost2Html = thirdStory 
    ? `<div class="flash-ghost-card-2"></div>`
    : "";
    
  // Render Who benefits chips
  const benefitsHtml = (s.who_benefits || []).map(b => `
    <div class="flash-benefit-chip" title="${esc(b)}">${esc(b)}</div>
  `).join("");
  const benefitsSection = benefitsHtml 
    ? `<div class="flash-benefits-container">
         <span class="flash-benefits-label">Benefits:</span>
         ${benefitsHtml}
       </div>`
    : "";
    
  // Render views/trending
  let localReads = {};
  try {
    localReads = JSON.parse(localStorage.getItem("flash_reads_fallback") || "{}");
  } catch(e) {}
  const initialViews = localReads[s.id] || 1;
  const isTrending = initialViews >= 1000;
  
  app.innerHTML = `
    <div class="flash-container" style="--cat-color: ${col}; --cat-color-rgb: ${rgb};">
      <div class="flash-heading-block">
        <div class="flash-heading-top">
          <div class="flash-heading-title">⚡ FLASH</div>
          <div class="flash-heading-datebar">TODAY'S FLASH</div>
        </div>
      </div>
      
      <div class="flash-categories-bar" id="flash-cats">
        ${renderFlashCategoryPills()}
      </div>
      
      <div class="flash-card-stage" id="flash-card-stage">
        ${ghost2Html}
        ${ghost1Html}
        
        <div class="flash-card" id="flash-card">
          <div class="flash-drag-overlay left" id="flash-drag-left">PREV</div>
          <div class="flash-drag-overlay right" id="flash-drag-right">NEXT</div>
          
          <div class="flash-card-header">
            <span class="flash-cat-badge">${esc(FLASH_LABELS[s.cat] || s.cat)}</span>
            <span class="flash-time">${esc(s.ts)}</span>
          </div>
          
          <h2 class="flash-headline">${esc(s.hl)}</h2>
          <hr class="flash-divider" />
          
          <div class="flash-summary">
            <p>${esc(s.body)}</p>
          </div>
          
          <div class="flash-signal-box">
            <div class="flash-signal-label">Key Fact / Signal</div>
            <div class="flash-signal-value">${esc(s.fact)}</div>
          </div>
          
          ${benefitsSection}
          
          <div class="flash-card-footer">
            <button class="flash-footer-btn ${isSaved ? 'saved' : ''}" id="flash-bookmark-btn" aria-label="Save story" style="color: ${isSaved ? col : ''}">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="${isSaved ? 'currentColor' : 'none'}" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>${isSaved ? 'Saved' : 'Save'}</span>
            </button>
            
            <div style="display: flex; align-items: center; gap: 8px;">
              ${showGoDeeper ? `<span class="flash-go-deeper" id="flash-go-deeper-btn">Go Deeper &rarr;</span>` : ''}
              
              <div class="flash-trending-pill" style="opacity: ${isTrending ? 1 : 0.4}">
                <span>🔥</span>
                <span id="views-count">${initialViews}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="flash-progress-track">
        <div class="flash-progress-fill" style="width: ${((currentFlashIndex + 1) / total) * 100}%;"></div>
      </div>
      
      <div class="flash-nav-row">
        <button class="flash-nav-btn" id="flash-prev" ${currentFlashIndex === 0 ? 'disabled' : ''}>&larr;</button>
        <div class="flash-nav-center">
          <span class="flash-nav-counter">${currentFlashIndex + 1} / ${total}</span>
          <div class="flash-dots-container" id="flash-dots">
            ${renderFlashDots(total)}
          </div>
        </div>
        <button class="flash-nav-btn" id="flash-next" ${currentFlashIndex === total - 1 ? 'disabled' : ''}>&rarr;</button>
      </div>
    </div>`;
    
  wireFlashCategories();
  wireFlashNavigation(filtered);
  attachFlashDrag(filtered);
  
  trackViewCount(s.id).then(resolvedViews => {
    const vc = $("views-count");
    if (vc) {
      vc.textContent = resolvedViews;
    }
    const pill = document.querySelector(".flash-trending-pill");
    if (pill) {
      pill.style.opacity = resolvedViews >= 1000 ? 1 : 0.4;
    }
  });
}

function initModeToggle() {
  const toggleFlash = $("toggle-flash");
  const toggleBriefing = $("toggle-briefing");
  
  if (toggleFlash) {
    toggleFlash.onclick = () => {
      if (currentMode === "flash") return;
      currentMode = "flash";
      localStorage.setItem("currentMode", "flash");
      document.body.classList.add("mode-flash-active");
      toggleFlash.classList.add("active");
      toggleBriefing.classList.remove("active");
      navigate(`${BASE_PATH}/`);
    };
  }
  
  if (toggleBriefing) {
    toggleBriefing.onclick = () => {
      if (currentMode === "briefing") return;
      currentMode = "briefing";
      localStorage.setItem("currentMode", "briefing");
      document.body.classList.remove("mode-flash-active");
      toggleBriefing.classList.add("active");
      toggleFlash.classList.remove("active");
      navigate(`${BASE_PATH}/`);
    };
  }
  
  // Set initial tab state in header
  if (currentMode === "flash") {
    document.body.classList.add("mode-flash-active");
    if (toggleFlash) toggleFlash.classList.add("active");
    if (toggleBriefing) toggleBriefing.classList.remove("active");
  } else {
    document.body.classList.remove("mode-flash-active");
    if (toggleFlash) toggleFlash.classList.remove("active");
    if (toggleBriefing) toggleBriefing.classList.add("active");
  }
}

function initSavedStories() {
  const trigger = $("saved-trigger");
  const close = $("saved-close");
  const modal = $("saved-stories-modal");
  
  if (trigger) {
    trigger.onclick = () => {
      if (modal) {
        modal.classList.add("active");
        renderSavedStoriesList();
      }
    };
  }
  if (close) {
    close.onclick = () => {
      if (modal) {
        modal.classList.remove("active");
      }
    };
  }
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove("active");
      }
    };
  }
  
  // Wire related card clicks to jump to Flash card
  document.body.addEventListener("click", e => {
    const item = e.target.closest(".related-flash-item");
    if (item) {
      const storyId = item.dataset.id;
      openFlashStory(storyId);
    }
  });
}

// Global keydown listner for desktop arrow keys
window.addEventListener("keydown", e => {
  if (currentMode !== "flash") return;
  if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
  
  const filtered = activeFlashCategory === "all" 
    ? flashStories 
    : flashStories.filter(s => s.cat === activeFlashCategory);
    
  if (e.key === "ArrowLeft") {
    navigateFlash(-1, filtered);
  } else if (e.key === "ArrowRight") {
    navigateFlash(1, filtered);
  }
});

window.addEventListener("popstate", route);
document.body.addEventListener("click", e => {
  const a = e.target.closest("a");
  if (a && a.href && a.href.startsWith(window.location.origin) && !a.hasAttribute("target")) {
    e.preventDefault();
    history.pushState(null, "", a.href);
    route();
  }
});

initModeToggle();
initSavedStories();
route();
