/* The Briefing — app.js */

const DATA = "data/";
const dayCache = {};
let indexEntries = [];
const FEEDBACK_ENDPOINT = ""; // Paste your Formspree, Formspark, or Webhook URL here to receive feedback


/* ── Helpers ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const app = $("app");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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
function confidenceScore(level) {
  const l = (level||"").toLowerCase();
  if (l === "high") return 92;
  if (l === "medium") return 64;
  if (l === "low") return 34;
  return 50;
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
  indexEntries = raw.map(x => typeof x==="string" ? {date:x,count:null} : x);
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
function heroPattern(region) {
  const accent = region === "india" ? "#e67e22" : "#c0392b";
  return `
    <svg class="cover-pattern" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="${accent}" opacity=".22"/>
        </pattern>
        <radialGradient id="glow">
          <stop offset="0%" stop-color="${accent}" stop-opacity=".18"/>
          <stop offset="60%" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="400" height="200" fill="url(#grid)"/>
      <circle cx="320" cy="40" r="120" fill="url(#glow)"/>
      <circle cx="60" cy="170" r="90" fill="url(#glow)" opacity=".7"/>
    </svg>`;
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
  const conf = confidenceScore(story.confidence?.level);
  const sources = story.sources || [];
  const angle = Math.round(conf * 3.6);
  const terms = keyPhrase(`${story.headline} ${story.tldr}`).slice(0,2);
  return `
    <div class="story-viz ${region}" aria-hidden="true">
      <div class="viz-orbit" style="--score:${angle}deg">
        <span class="viz-core">${String(idx+1).padStart(2,"0")}</span>
      </div>
      ${miniSourceBar(sources)}
      <div class="viz-tags">
        <span>${esc(region)}</span>
        ${terms.map(t => `<span>${esc(t)}</span>`).join("")}
      </div>
    </div>`;
}

function renderBriefingBoard(payload) {
  const stories = payload.stories || [];
  if (!stories.length) return "";
  const india = stories.filter(s => (s.region||"").toLowerCase()==="india").length;
  const global = stories.length - india;
  const avgSources = Math.round(stories.reduce((n,s)=>n+(s.sources?.length||0),0) / stories.length);
  const avgRead = Math.round(stories.reduce((n,s)=>n+readMinutes(s),0) / stories.length);
  const lead = stories[0];
  const recap = (payload.recap || []).filter(r => r.front && r.front !== "---").slice(0,4);
  const hasRecap = recap.length > 0;

  return `
    <section class="briefing-board ${hasRecap ? "three-cols" : "two-cols"}" aria-label="Daily briefing dashboard">
      <div class="board-lead" onclick="location.hash='#/story/${esc(payload.date)}/${esc(lead.id)}'" role="button" tabindex="0" style="cursor: pointer;">
        <div class="board-label">Today's signal</div>
        <h2>${esc(lead.headline)}</h2>
        <p>${esc(lead.tldr)}</p>
        <div class="board-stat-row">
          <span><strong>${stories.length}</strong> stories</span>
          <span><strong>${avgSources}</strong> avg sources</span>
          <span><strong>${avgRead}</strong> avg min</span>
        </div>
      </div>
      <div class="board-map" style="display: flex; flex-direction: column; justify-content: space-between; padding: 22px;">
        <div class="board-label">Coverage balance</div>
        <div class="map-bars" style="margin-top: 8px; margin-bottom: 20px;">
          <div class="map-bar"><span>Global</span><b style="width:${(global/stories.length*100).toFixed(0)}%"></b><em>${global}</em></div>
          <div class="map-bar india"><span>India</span><b style="width:${(india/stories.length*100).toFixed(0)}%"></b><em>${india}</em></div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: auto;">
          <div style="background: var(--bg-card-h); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--rule); text-align: center;">
            <div style="font-family: var(--mono); font-size: 9px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em;">Confidence</div>
            <div style="font-family: var(--sans); font-size: 15px; font-weight: 700; color: var(--ink); margin-top: 4px;">
              ${(stories.filter(s=> (s.confidence?.level||"").toLowerCase()==="high").length / stories.length * 100).toFixed(0)}% High
            </div>
          </div>
          <div style="background: var(--bg-card-h); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--rule); text-align: center;">
            <div style="font-family: var(--mono); font-size: 9px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.05em;">Sources</div>
            <div style="font-family: var(--sans); font-size: 15px; font-weight: 700; color: var(--ink); margin-top: 4px;">
              ${avgSources} avg
            </div>
          </div>
        </div>
      </div>
      ${hasRecap ? `
      <div class="board-recap">
        <div class="board-label">Pressure points</div>
        ${recap.map((r,i)=>`
          <div class="recap-row">
            <span class="recap-index">${String(i+1).padStart(2,"0")}</span>
            <div>
              <strong>${esc(r.front.replace(/^\d+:\s*/, ""))}</strong>
              <small>${esc(r.core_threat || r.primary_catalyst || r.horizon || "")}</small>
            </div>
          </div>`).join("")}
      </div>` : ""}
    </section>`;
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
  const confidence = confidenceScore(story.confidence?.level);
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
          <div style="--p:${confidence}%"><span>Confidence</span><strong>${confidence}</strong></div>
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
      summary: `<h2>Source Analysis</h2>${sourceDistribution(sources)}<p>${esc(firstSentence(story.confidence?.notes || "Source transparency is available below.", 170))}</p>`,
      detail: `<h2>Transparency Log</h2><p>${esc(story.confidence?.notes || "")}</p><ul class="mobile-source-list">
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
function buildSlides(s) {
  const slides = [];
  const region = (s.region||"global").toLowerCase();
  const confLevel = (s.confidence?.level||"").toLowerCase();
  const sourceCount = (s.sources||[]).length;
  // Reading time: ~200 wpm on body content
  const readMin = readMinutes(s);

  // 1 · Cover — hero pattern + meta strip
  slides.push({ id:"cover", label:"Overview", icon:"◉", html:`
    <div class="slide-cover">
      ${heroPattern(region)}
      <div class="slide-cover-content">
        <div class="slide-cover-top">
          <span class="detail-region ${region}">${esc(region.toUpperCase())}</span>
          ${confLevel ? `<span class="cover-chip confidence-chip ${confLevel}">
            <span class="cover-chip-dot"></span>${esc(s.confidence.level)} confidence</span>` : ""}
        </div>
        <h1 class="slide-headline">${esc(s.headline)}</h1>
        <p class="slide-tldr">${esc(s.tldr)}</p>
        <div class="cover-meta">
          <span class="cover-meta-item">${ICON.clock}<span>${readMin} min read</span></span>
          <span class="cover-meta-item">${ICON.link}<span>${sourceCount} source${sourceCount!==1?"s":""}</span></span>
          <span class="cover-meta-item">${ICON.hex}<span>12 angles</span></span>
        </div>
        <div class="swipe-hint">Swipe ← to explore deep dive</div>
      </div>
    </div>`
  });

  // 2 · 5W1H — with glyph badges per question
  const sa = s.situational_analysis;
  const wIcons = {
    "WHAT":  "▣",  // square — the thing itself
    "WHY":   "?",
    "WHO":   "◉",  // who/agent
    "WHEN":  "⏱",
    "WHERE": "⌖",  // crosshair
    "HOW":   "⚙",
  };
  if (sa) slides.push({ id:"5w1h", label:"Situation", icon:"⬡", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.hex}</span>5W1H · Situation</div>
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

  // 3 · Strategic Assessment
  if (s.strategic_assessment) slides.push({ id:"strategic", label:"Strategy", icon:"◈", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.chess}</span>Strategic Assessment</div>
      <p class="slide-prose">${esc(s.strategic_assessment)}</p>
    </div>`
  });

  // 4 · Perspectives — visual political spectrum
  const pm = s.perspective_matrix;
  if (pm) {
    const spectrum = [
      { cls:"lean-left",   label:"Progressive", short:"L", view:pm.left_leaning },
      { cls:"lean-center", label:"Moderate",    short:"C", view:pm.center },
      { cls:"lean-right",  label:"Conservative",short:"R", view:pm.right_leaning },
    ].filter(p => p.view);
    const regional = [
      { cls:"region-in", label:"Indian media",       glyph:"IN", view:pm.indian_media },
      { cls:"region-wi", label:"Western / Intl",     glyph:"WW", view:pm.western_international||pm.global_media },
    ].filter(p => p.view);

    slides.push({ id:"perspectives", label:"Perspectives", icon:"⊞", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.scale}</span>Perspective Matrix</div>

      ${spectrum.length ? `
      <div class="spectrum-wrap">
        <div class="spectrum-axis">
          <span class="spectrum-tag lean-left">LEFT</span>
          <div class="spectrum-bar"></div>
          <span class="spectrum-tag lean-right">RIGHT</span>
        </div>
        <div class="persp-cards">
          ${spectrum.map(p => `
            <div class="persp-card ${p.cls}">
              <div class="persp-card-top">
                <span class="persp-glyph ${p.cls}">${p.short}</span>
                <span class="persp-label ${p.cls}">${p.label}</span>
              </div>
              <div class="persp-card-body">${esc(p.view)}</div>
            </div>`).join("")}
        </div>
      </div>` : ""}

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
    </div>`
    });
  }

  // 5 · Facts vs Claims
  const fc = s.facts_vs_claims;
  if (fc) slides.push({ id:"facts", label:"Facts vs Claims", icon:"⊛", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.fact}</span>Facts vs Claims</div>
      <div class="fc-slide">
        <div class="fc-half facts">
          <div class="fc-title">✓ Verified Facts</div>
          <ul>${(fc.facts||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
        </div>
        <div class="fc-half claims">
          <div class="fc-title">⚠ Claims</div>
          <ul>${(fc.claims||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
        </div>
      </div>
    </div>`
  });

  // 6 · Blind Spot
  if (s.blind_spot) slides.push({ id:"blindspot", label:"Blind Spot", icon:"⚑", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.eye}</span>Blind Spot</div>
      <div class="blindspot">
        <span class="blindspot-icon">⚑ What coverage missed</span>
        ${esc(s.blind_spot)}
      </div>
    </div>`
  });

  // 7 · Editorial & Expert
  const ei = s.editorial_expert_insight;
  if (ei?.opinion || ei?.analysis) slides.push({ id:"editorial", label:"Expert View", icon:"✦", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.quote}</span>Editorial & Expert Insight</div>
      ${ei.opinion ? `<div class="editorial-block"><div class="editorial-label">Opinion</div><div class="editorial-body">${esc(ei.opinion)}</div></div>` : ""}
      ${ei.analysis ? `<div class="editorial-block" style="margin-top:16px"><div class="editorial-label">Analysis</div><div class="editorial-body">${esc(ei.analysis)}</div></div>` : ""}
    </div>`
  });

  // 8 · Stakeholder Impact — visual sentiment cards
  const arrowSvg = {
    up:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 14 12 8 18 14"/></svg>`,
    down:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 10 12 16 18 10"/></svg>`,
    mixed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="18" y2="12"/><polyline points="14 8 18 12 14 16"/></svg>`,
  };
  if (s.stakeholder_impact?.length) slides.push({ id:"impact", label:"Impact", icon:"◎", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.impact}</span>Stakeholder Impact</div>
      <div class="impact-cards">
        ${(s.stakeholder_impact||[]).map(o=>{
          const sent = impactSentiment(o.impact);
          return `
          <div class="impact-card sent-${sent.dir}">
            <div class="impact-card-head">
              <span class="impact-arrow sent-${sent.dir}">${arrowSvg[sent.dir]}</span>
              <span class="impact-stakeholder">${esc(o.stakeholder)}</span>
              <span class="impact-sent-tag sent-${sent.dir}">${sent.label}</span>
            </div>
            <div class="impact-card-body">${esc(o.impact)}</div>
          </div>`;
        }).join("")}
      </div>
    </div>`
  });

  // 9 · Context
  if (s.context_background) slides.push({ id:"context", label:"Context", icon:"⊙", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.timeline}</span>Context & Background</div>
      <p class="slide-prose">${esc(s.context_background)}</p>
    </div>`
  });

  // 10 · Timeline
  if (s.timeline?.length) slides.push({ id:"timeline", label:"Timeline", icon:"⊗", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.clock}</span>Timeline</div>
      <div class="timeline-list">
        ${(s.timeline||[]).map(o=>`
          <div class="tl-item">
            <div class="tl-when">${esc(o.when)}</div>
            <div class="tl-event">${esc(o.event)}</div>
          </div>`).join("")}
      </div>
    </div>`
  });

  // 11 · Plain Terms
  if (s.simple_explanation) slides.push({ id:"simple", label:"Plain Terms", icon:"💡", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.bulb}</span>In Plain Terms</div>
      <div class="simple-explanation">
        <span class="simple-icon-svg">${ICON.bulb}</span>
        <div class="simple-body">${esc(s.simple_explanation)}</div>
      </div>
    </div>`
  });

  // 12 · Sources + Confidence — with visual meter
  const sourceConfLevel = (s.confidence?.level||"").toLowerCase();
  const confFill = sourceConfLevel === "high" ? 100 : sourceConfLevel === "medium" ? 60 : sourceConfLevel === "low" ? 25 : 0;
  slides.push({ id:"sources", label:"Sources", icon:"⊕", html:`
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.link}</span>Sources & Transparency</div>
      ${s.confidence ? `
        <div class="confidence-card">
          <div class="confidence-head">
            <span class="confidence-label">Confidence</span>
            <span class="confidence-badge ${sourceConfLevel}">${esc(s.confidence.level)}</span>
          </div>
          <div class="confidence-meter">
            <div class="confidence-meter-fill ${sourceConfLevel}" style="width:${confFill}%"></div>
          </div>
          <div class="confidence-notes">${esc(s.confidence.notes)}</div>
        </div>` : ""}
      ${sourceDistribution(s.sources)}
      <ul class="sources-list">
        ${(s.sources||[]).map(src=>`
          <li class="source-item">
            <span class="source-dot ${leanClass(src.lean)}"></span>
            <a class="source-name" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.outlet)}</a>
            <span class="source-meta">${esc(src.lean)} · ${esc(src.region)}</span>
          </li>`).join("")}
      </ul>
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

  // Build the extra engagement slide
  const engagementSlide = {
    id: "share",
    label: "Share & Feedback",
    icon: "💬",
    html: `
      <div class="slide-body">
        <div class="slide-section-label"><span class="ssl-icon">💬</span>Engagement</div>
        <div class="mobile-engagement-card-inner">
          <h3 class="engagement-title">Share this Analysis</h3>
          <p class="engagement-subtitle">Keep your network informed with optimized multi-channel sharing.</p>
          
          <div class="mobile-share-grid">
            <button class="mobile-share-btn share-native" id="m-share-native">
              <span class="share-icon-svg">📱</span>
              <span>Share Story</span>
            </button>
            <button class="mobile-share-btn share-copy" id="m-share-copy">
              <span class="share-icon-svg">🔗</span>
              <span>Copy Link</span>
            </button>
            <button class="mobile-share-btn share-x" id="m-share-x">
              <span class="share-icon-svg">𝕏</span>
              <span>Twitter / X</span>
            </button>
            <button class="mobile-share-btn share-wa" id="m-share-wa">
              <span class="share-icon-svg">💬</span>
              <span>WhatsApp</span>
            </button>
          </div>

          <div class="mobile-feedback-box" id="m-feedback-box">
            <h4 class="feedback-title">Was this analysis helpful?</h4>
            <div class="feedback-options">
              <button class="m-feedback-btn" data-val="helpful">👍 Yes</button>
              <button class="m-feedback-btn" data-val="unhelpful">👎 No</button>
              <button class="m-feedback-btn" data-val="suggestion">📝 Edit Suggestion</button>
            </div>
            <div class="feedback-input-area hidden" id="m-feedback-input-area">
              <textarea id="m-feedback-text" placeholder="Share your feedback or corrections..."></textarea>
              <button class="feedback-send-btn" id="m-feedback-send">Submit Feedback</button>
            </div>
            <div class="feedback-success hidden" id="m-feedback-success">
              Thank you! Your feedback has been submitted.
            </div>
          </div>
        </div>
      </div>
    `
  };

  const allSlides = [...slides, engagementSlide];

  container.innerHTML = `
    <!-- Top breadcrumb/header -->
    <div class="mobile-story-header">
      <a class="mobile-back" href="#/day/${esc(date)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
        Briefings
      </a>
      <span class="mobile-date">${fmtHeaderDate(date).toUpperCase()}</span>
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
      <button class="mobile-footer-btn prev" id="m-footer-prev">← Exit</button>
      <div class="mobile-footer-dots">
        ${allSlides.map((_, i) => `
          <span class="dot-indicator ${i === 0 ? "active" : ""}" data-idx="${i}"></span>
        `).join("")}
      </div>
      <button class="mobile-footer-btn next" id="m-footer-next">${allSlides[1]?.label || "Next"} →</button>
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

    // Update footer button labels
    const prevBtn = container.querySelector("#m-footer-prev");
    const nextBtn = container.querySelector("#m-footer-next");

    if (activeTabIdx === 0) {
      prevBtn.textContent = "← Exit";
    } else {
      prevBtn.textContent = "← " + allSlides[activeTabIdx - 1].label;
    }

    if (activeTabIdx === allSlides.length - 1) {
      nextBtn.textContent = "Next Story →";
    } else {
      nextBtn.textContent = allSlides[activeTabIdx + 1].label + " →";
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
          setActiveTab(activeTabIdx - 1);
        } else {
          location.hash = `#/day/${date}`;
        }
      } else {
        // swipe left -> next card
        if (activeTabIdx < allSlides.length - 1) {
          setActiveTab(activeTabIdx + 1);
        } else if (storyIdx < stories.length - 1) {
          location.hash = `#/story/${date}/${stories[storyIdx + 1].id}`;
        }
      }
    }
  });

  // Tap tabs
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveTab(parseInt(btn.dataset.idx));
    });
  });

  // Footer navigation actions
  container.querySelector("#m-footer-prev").addEventListener("click", () => {
    if (activeTabIdx > 0) {
      setActiveTab(activeTabIdx - 1);
    } else {
      location.hash = `#/day/${date}`;
    }
  });

  container.querySelector("#m-footer-next").addEventListener("click", () => {
    if (activeTabIdx < allSlides.length - 1) {
      setActiveTab(activeTabIdx + 1);
    } else if (storyIdx < stories.length - 1) {
      location.hash = `#/story/${date}/${stories[storyIdx + 1].id}`;
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
      window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, "_blank");
    });
  });

  // Share WA
  container.querySelectorAll(".share-wa").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = encodeURIComponent(window.location.href);
      const text = encodeURIComponent(`Check out this deep dive: "${s.headline}" on The Briefing - `);
      window.open(`https://api.whatsapp.com/send?text=${text}${url}`, "_blank");
    });
  });

  // Share LI (for desktop / general)
  container.querySelectorAll(".share-li").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = encodeURIComponent(window.location.href);
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
    });
  });

  // Native share (mobile only)
  container.querySelector(".share-native")?.addEventListener("click", () => {
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

  // Feedback widget
  const feedbackInputArea = container.querySelector(".feedback-input-area");
  const feedbackText = container.querySelector("textarea");
  const feedbackSendBtn = container.querySelector(".feedback-send-btn");
  const feedbackSuccess = container.querySelector(".feedback-success");
  const feedbackOptions = container.querySelector(".feedback-options");

  let selectedVal = "";

  container.querySelectorAll(".d-feedback-btn, .m-feedback-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".d-feedback-btn, .m-feedback-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedVal = btn.dataset.val;
      if (feedbackInputArea) feedbackInputArea.classList.remove("hidden");
    });
  });

  feedbackSendBtn?.addEventListener("click", () => {
    const comment = feedbackText ? feedbackText.value : "";
    const feedbackData = {
      storyId: s.id,
      storyTitle: s.headline,
      feedbackType: selectedVal,
      comment: comment,
      timestamp: new Date().toISOString()
    };

    if (feedbackInputArea) feedbackInputArea.classList.add("hidden");
    if (feedbackOptions) feedbackOptions.style.display = "none";

    const showSuccess = () => {
      if (feedbackSuccess) feedbackSuccess.classList.remove("hidden");
    };

    if (FEEDBACK_ENDPOINT) {
      feedbackSendBtn.disabled = true;
      feedbackSendBtn.textContent = "Sending...";
      fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedbackData)
      })
      .then(() => {
        showSuccess();
      })
      .catch(err => {
        console.error("Error submitting feedback:", err);
        fallbackMailto(s, selectedVal, comment);
        showSuccess();
      });
    } else {
      // Mock submit (saves locally and logs to console)
      const list = JSON.parse(localStorage.getItem("briefing_feedback") || "[]");
      list.push(feedbackData);
      localStorage.setItem("briefing_feedback", JSON.stringify(list));
      console.log("Mock feedback saved to localStorage:", feedbackData);
      showSuccess();
    }
  });
}

function fallbackMailto(s, selectedVal, comment) {
  const email = "feedback@briefing.app";
  const subject = encodeURIComponent(`Briefing Feedback: ${s.headline}`);
  const body = encodeURIComponent(`Story ID: ${s.id}
Story Title: ${s.headline}
Feedback Type: ${selectedVal}

Feedback details:
${comment}

--
Submitted via The Briefing`);
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

/* ══════════════════════════════════════════════════════════════
   DESKTOP LAYOUT — sidebar + scrollable sections
   ══════════════════════════════════════════════════════════════ */
function renderDesktopLayout(slides, s, date, storyIdx, stories) {
  const toc = stories.map((st,i)=>`
    <button class="sidebar-item ${i===storyIdx?"active":""}"
            data-id="${esc(st.id)}" aria-label="${esc(st.headline)}">
      <span class="sidebar-num">${String(i+1).padStart(2,"0")}</span>
      <span class="sidebar-title">${esc(st.headline)}</span>
    </button>`).join("");

  // Cover slide is shown as headline+tldr above; skip it in the section list.
  // Magazine layout: top is 2-col flex masonry, deep sections span full width.
  const sections = slides.filter(sl => sl.id !== "cover");
  // Sections that read better at full width:
  const fullWidthIds = new Set(["blindspot","context","simple","sources"]);
  // Estimated content density per section type for balanced 2-col distribution
  const weight = { "5w1h": 6, "perspectives": 5, "facts": 3, "editorial": 3,
                   "impact": 3, "timeline": 3, "strategic": 2 };
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
  const buckets = sourceBuckets(s.sources || []);
  const centerSources = buckets.center + buckets.other;
  const conf = confidenceScore(s.confidence?.level);
  const terms = keyPhrase(`${s.headline} ${s.tldr} ${s.strategic_assessment || ""}`).slice(0,4);

  const wrap = document.createElement("div");
  wrap.className = "desktop-story-layout";
  wrap.innerHTML = `
    <aside class="story-sidebar">
      <div class="sidebar-hdr">
        <a class="sidebar-back" href="#">← Home</a>
        <span class="sidebar-date">${fmtHeaderDate(date).toUpperCase()}</span>
      </div>
      <div class="sidebar-list">${toc}</div>
    </aside>
    <div class="story-main">
      <div class="story-main-inner">
        <section class="story-dossier">
          <div class="dossier-copy">
            <span class="detail-region ${(s.region||"").toLowerCase()}">${esc((s.region||"").toUpperCase())}</span>
            <h1 class="detail-headline">${esc(s.headline)}</h1>
            <p class="detail-tldr">${esc(s.tldr)}</p>
          </div>
          <div class="dossier-graphic">
            ${storyVisual(s, storyIdx)}
            <div class="dossier-metrics">
              <div><strong>${readMinutes(s)}</strong><span>min read</span></div>
              <div><strong>${s.sources?.length || 0}</strong><span>sources</span></div>
              <div><strong>${slides.length}</strong><span>angles</span></div>
            </div>
            <div class="dossier-spectrum">
              <span style="height:${Math.max(10,buckets.left*18)}px" class="spec-left"></span>
              <span style="height:${Math.max(10,centerSources*18)}px" class="spec-center"></span>
              <span style="height:${Math.max(10,buckets.right*18)}px" class="spec-right"></span>
            </div>
            <div class="dossier-confidence">
              <span>Confidence</span>
              <b style="width:${conf}%"></b>
              <em>${esc(s.confidence?.level || "Unknown")}</em>
            </div>
            <div class="dossier-tags">${terms.map(t=>`<span>${esc(t)}</span>`).join("")}</div>
          </div>
        </section>
        ${allSections}
        
        <!-- Desktop Engagement Card -->
        <div class="desktop-engagement-card">
          <div class="desktop-engagement-inner">
            <div class="desktop-share-block">
              <h4>Share this Analysis</h4>
              <div class="desktop-share-buttons">
                <button class="d-share-btn share-copy" id="d-share-copy">
                  <span>🔗 Copy Link</span>
                </button>
                <button class="d-share-btn share-x" id="d-share-x">
                  <span>𝕏 Twitter / X</span>
                </button>
                <button class="d-share-btn share-wa" id="d-share-wa">
                  <span>💬 WhatsApp</span>
                </button>
                <button class="d-share-btn share-li" id="d-share-li">
                  <span>💼 LinkedIn</span>
                </button>
              </div>
            </div>
            <div class="desktop-feedback-block" id="d-feedback-box">
              <h4>Feedback & Corrections</h4>
              <div class="feedback-options">
                <button class="d-feedback-btn" data-val="helpful">👍 Helpful</button>
                <button class="d-feedback-btn" data-val="unhelpful">👎 Unhelpful</button>
                <button class="d-feedback-btn" data-val="suggestion">📝 Suggest Edit</button>
              </div>
              <div class="feedback-input-area hidden" id="d-feedback-input-area">
                <textarea id="d-feedback-text" placeholder="Type your feedback or corrections here..."></textarea>
                <button class="feedback-send-btn" id="d-feedback-send">Submit Feedback</button>
              </div>
              <div class="feedback-success hidden" id="d-feedback-success">
                Thank you! Feedback details prefilled in your email client.
              </div>
            </div>
          </div>
        </div>

        <div class="desktop-story-nav">
          ${storyIdx > 0 ? `<a class="story-nav-btn prev" href="#/story/${date}/${stories[storyIdx-1].id}">← ${esc(stories[storyIdx-1].headline.slice(0,50))}…</a>` : "<span></span>"}
          ${storyIdx < stories.length-1 ? `<a class="story-nav-btn next" href="#/story/${date}/${stories[storyIdx+1].id}">${esc(stories[storyIdx+1].headline.slice(0,50))}… →</a>` : "<span></span>"}
        </div>
      </div>
    </div>`;

  wrap.querySelectorAll(".sidebar-item").forEach(btn => {
    btn.addEventListener("click", () => {
      location.hash = `#/story/${date}/${btn.dataset.id}`;
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
  await loadIndex();
  if (!date) date = indexEntries[0]?.date;
  if (!date) { app.innerHTML=`<div class="error-state">No briefings yet.</div>`; return; }

  const payload = await loadDay(date);
  const isLatest = date === indexEntries[0]?.date;
  $("header-date").textContent = fmtHeaderDate(date).toUpperCase();

  const hero = $("hero");
  hero.classList.remove("hidden");
  $("hero-title-h1").textContent = fmtLong(date);
  $("hero-meta").textContent = payload.stories.length + " stories" + (isLatest?"":" · Archive");

  const pastBanner = isLatest ? "" : `
    <div class="past-day-banner">
      <span>📅 Viewing archive for ${fmtLong(date)}</span>
      <a href="#">← Today</a>
    </div>`;

  const cards = payload.stories.slice(1).map((s,i) => {
    const region = (s.region||"global").toLowerCase();
    const sourceCount = (s.sources||[]).length;
    const readMin = readMinutes(s);
    const conf = (s.confidence?.level||"").toLowerCase();
    return `
      <div class="story-card" data-id="${esc(s.id)}" data-date="${esc(date)}"
           data-region="${esc(region)}" role="button" tabindex="0">
        <div class="card-accent"></div>
        <div class="card-body">
          <div class="card-top">
            <span class="card-num">${String(i+2).padStart(2,"0")}</span>
            <span class="card-region">${esc(region.toUpperCase())}</span>
            ${conf ? `<span class="card-conf-chip ${conf}"><span class="card-conf-dot"></span>${esc(s.confidence.level)}</span>` : ""}
          </div>
          <h2 class="card-headline">${esc(s.headline)}</h2>
          ${s.tldr ? `<p class="card-tldr">${esc(s.tldr)}</p>` : ""}
          <div class="card-footer">
            <span class="card-stats">
              ${ICON.clock}<span>${readMin} min</span>
              <span class="card-stats-sep">·</span>
              ${ICON.link}<span>${sourceCount} source${sourceCount!==1?"s":""}</span>
            </span>
            <span class="card-arrow">Deep dive →</span>
          </div>
        </div>
        ${storyVisual(s, i+1)}
      </div>`;
  }).join("");

  app.innerHTML = `
    <div class="stories-section">
      ${pastBanner}
      ${renderBriefingBoard(payload)}
      <div class="stories-grid">${cards}</div>
    </div>
    ${renderTimeMachine(date)}`;

  app.querySelectorAll(".story-card").forEach(card => {
    const go = () => { location.hash=`#/story/${card.dataset.date}/${card.dataset.id}`; };
    card.onclick = go;
    card.onkeydown = e => { if(e.key==="Enter"||e.key===" ") go(); };
  });
  app.querySelectorAll(".tm-card").forEach(btn => {
    btn.onclick = () => { location.hash=`#/day/${btn.dataset.date}`; };
  });
  app.querySelector(".past-day-banner a")?.addEventListener("click", e => {
    e.preventDefault(); location.hash="";
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
  await loadIndex();
  const payload = await loadDay(date);
  const stories = payload.stories;
  const storyIdx = stories.findIndex(x => x.id === id);
  if (storyIdx === -1) { app.innerHTML=`<div class="error-state">Story not found.</div>`; return; }
  const s = stories[storyIdx];

  $("header-date").textContent = fmtHeaderDate(date).toUpperCase();
  $("hero").classList.add("hidden");

  const slides = buildSlides(s);
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
  const h = location.hash.slice(1);
  app.innerHTML=`<div class="loading-screen"><div class="spinner"></div></div>`;
  $("hero").classList.add("hidden");
  stopProgress();
  try {
    const m = h.match(/^\/story\/([^/]+)\/(.+)$/);
    const d = h.match(/^\/day\/([^/]+)$/);
    if (m) return await renderStory(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    if (d) return await renderHome(decodeURIComponent(d[1]));
    return await renderHome(null);
  } catch(e) {
    stopProgress();
    app.innerHTML=`<div class="error-state">Couldn't load · ${esc(e.message)}</div>`;
  }
}

window.addEventListener("hashchange", route);
route();
