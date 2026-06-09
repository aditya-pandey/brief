/* The Briefing — app.js */

const DATA = "data/";
const dayCache = {};
let indexEntries = [];

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
  return `
    <section class="briefing-board" aria-label="Daily briefing dashboard">
      <div class="board-lead">
        <div class="board-label">Today's signal</div>
        <h2>${esc(lead.headline)}</h2>
        <p>${esc(lead.tldr)}</p>
        <div class="board-stat-row">
          <span><strong>${stories.length}</strong> stories</span>
          <span><strong>${avgSources}</strong> avg sources</span>
          <span><strong>${avgRead}</strong> avg min</span>
        </div>
      </div>
      <div class="board-map">
        <div class="map-ring">
          <span class="map-count">${stories.length}</span>
          <span class="map-caption">briefs</span>
        </div>
        <div class="map-bars">
          <div class="map-bar"><span>Global</span><b style="width:${(global/stories.length*100).toFixed(0)}%"></b><em>${global}</em></div>
          <div class="map-bar india"><span>India</span><b style="width:${(india/stories.length*100).toFixed(0)}%"></b><em>${india}</em></div>
        </div>
      </div>
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
      </div>
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
  let cur = 0;
  let expanded = false;
  const cards = mobileBriefingCards(s, slides);

  function renderDots() {
    return cards.map((card,i)=>`
      <button class="dot ${i===cur?"active":""}" data-i="${i}" aria-label="${card.label}"></button>
    `).join("");
  }

  function renderTopBar() {
    return `
      <div class="deck-topbar dossier-topbar">
        <a class="deck-back" href="#/day/${esc(date)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
          Stories
        </a>
        <div class="deck-progress-track">
          <div class="deck-progress-fill" style="width:${((cur+1)/cards.length*100).toFixed(1)}%"></div>
        </div>
        <div class="deck-slide-label">${cards[cur].label}</div>
      </div>`;
  }

  function renderBottomBar() {
    const hasPrev = cur > 0;
    const hasNext = cur < cards.length - 1;
    const prevStory = storyIdx > 0 ? stories[storyIdx-1] : null;
    const nextStory = storyIdx < stories.length-1 ? stories[storyIdx+1] : null;
    return `
      <div class="deck-bottombar dossier-bottombar">
        <button class="deck-btn deck-prev ${hasPrev?"":"muted"}" id="slide-prev">
          ${hasPrev ? `← ${cards[cur-1].label}` : (prevStory ? `↑ Prev story` : "")}
        </button>
        <div class="deck-dots">${renderDots()}</div>
        <button class="deck-btn deck-next ${hasNext?"":"muted"}" id="slide-next">
          ${hasNext ? `${cards[cur+1].label} →` : (nextStory ? `Next story ↓` : "End")}
        </button>
      </div>`;
  }

  const container = document.createElement("div");
  container.className = "deck-container intel-deck-container";
  container.innerHTML = `
    ${renderTopBar()}
    <div class="slide-deck intel-stack" id="slide-deck">
      ${cards.map((card,i)=>`
        <div class="slide intel-card ${i===0?"is-active":i===1?"is-next-one":i===2?"is-next-two":"is-away"} tone-${card.tone}" data-idx="${i}">
          <div class="intel-card-chrome">
            <span>${esc(card.kicker)}</span>
            <b>${String(i+1).padStart(2,"0")}/${String(cards.length).padStart(2,"0")}</b>
          </div>
          <div class="intel-summary">${card.summary}</div>
          <div class="intel-deep">
            <div class="intel-folder-tab">DEEP ANALYSIS</div>
            ${card.detail}
          </div>
          <div class="intel-gesture-hint">
            <span>Swipe sideways</span>
            <b></b>
            <span>Swipe up to unfold</span>
          </div>
        </div>`).join("")}
    </div>
    ${renderBottomBar()}`;

  function cardEls() { return container.querySelectorAll(".intel-card"); }
  function paintStack() {
    const all = cardEls();
    all.forEach((el, i) => {
      el.className = `slide intel-card tone-${cards[i].tone}`;
      el.style.cssText = "";
      el.dataset.depth = String(i - cur);
      if (i === cur) el.classList.add("is-active");
      else if (i === cur + 1) el.classList.add("is-next-one");
      else if (i === cur + 2) el.classList.add("is-next-two");
      else if (i < cur) el.classList.add("is-prev");
      else el.classList.add("is-away");
      el.classList.toggle("is-expanded", i === cur && expanded);
    });
    container.querySelector(".deck-topbar").outerHTML = renderTopBar();
    container.querySelector(".deck-bottombar").outerHTML = renderBottomBar();
    wireButtons();
  }

  function update(newIdx) {
    const prev = cur;
    cur = Math.max(0, Math.min(cards.length-1, newIdx));
    if (cur === prev) return;
    expanded = false;
    paintStack();
  }

  function setExpanded(next) {
    expanded = next;
    cardEls().forEach((el, i) => el.classList.toggle("is-expanded", i === cur && expanded));
  }

  function wireButtons() {
    container.querySelector("#slide-prev")?.addEventListener("click", () => {
      if (cur > 0) update(cur-1);
      else if (storyIdx > 0) {
        location.hash = `#/story/${date}/${stories[storyIdx-1].id}`;
      }
    });
    container.querySelector("#slide-next")?.addEventListener("click", () => {
      if (cur < cards.length-1) update(cur+1);
      else if (storyIdx < stories.length-1) {
        location.hash = `#/story/${date}/${stories[storyIdx+1].id}`;
      }
    });
    container.querySelectorAll(".dot").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.i);
        update(i);
      });
    });
    container.querySelectorAll(".intel-tile").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        btn.classList.toggle("is-open");
      });
    });
    container.querySelectorAll(".intel-gesture-hint").forEach(hint => {
      hint.addEventListener("click", e => {
        e.stopPropagation();
        if (hint.closest(".intel-card")?.classList.contains("is-active")) {
          setExpanded(!expanded);
        }
      });
    });
  }

  wireButtons();

  // Live drag-follow swipe with dossier-stack physics.
  let sx = 0, sy = 0, dragging = false, axis = null;
  let activeEl = null, neighborEl = null, neighborDir = 0;

  container.addEventListener("touchstart", e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    dragging = true; axis = null;
    const all = cardEls();
    activeEl = all[cur];
    if (activeEl) activeEl.style.transition = "none";
  }, {passive:true});

  container.addEventListener("touchmove", e => {
    if (!dragging || !activeEl) return;
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (axis === null) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10)
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axis !== "x" && axis !== "y") return;
    if (axis === "y" && expanded && activeEl?.querySelector(".intel-deep")?.scrollTop > 0 && dy > -12) return;
    e.preventDefault();

    if (axis === "y") {
      const lift = Math.max(-150, Math.min(120, dy));
      const pct = Math.min(1, Math.abs(lift) / 140);
      if (activeEl) {
        activeEl.style.transform = `translate3d(0, ${lift * .18}px, 0) scale(${1 + pct * .012}) rotateX(${lift < 0 ? -pct * 4 : pct * 3}deg)`;
        activeEl.style.filter = `brightness(${1 + pct * .05})`;
      }
      return;
    }

    // Resistance at boundaries
    const goingNext = dx < 0;
    const canGo = goingNext ? (cur < cards.length-1) : (cur > 0);
    const resist = canGo ? 1 : 0.32;
    const offset = dx * resist;
    const pct = offset / window.innerWidth;
    const rot = -pct * 14;
    activeEl.style.transform = `translate3d(${offset}px, 0, 90px) rotateY(${rot}deg) scale(${1 - Math.min(.04, Math.abs(pct) * .07)})`;
    activeEl.style.opacity = String(1 - Math.min(0.35, Math.abs(pct) * 0.6));

    const newDir = goingNext ? 1 : -1;
    if (canGo && newDir !== neighborDir) {
      neighborDir = newDir;
      const slidesEls = cardEls();
      const n = slidesEls[cur + newDir];
      if (neighborEl && neighborEl !== n) { neighborEl.style.cssText = ""; }
      neighborEl = n;
      if (neighborEl) {
        neighborEl.style.transition = "none";
        neighborEl.style.zIndex = "1";
        neighborEl.style.opacity = "1";
      }
    }
    if (canGo && neighborEl) {
      const w = window.innerWidth;
      const nxOffset = newDir > 0 ? (w * .42 + offset * .42) : (-w * .42 + offset * .42);
      const nRot = newDir > 0 ? (10 + rot * .35) : (-10 + rot * .35);
      neighborEl.style.transform = `translate3d(${nxOffset}px, 12px, 20px) rotateY(${nRot}deg) scale(.94)`;
    }
  }, {passive:false});

  container.addEventListener("touchend", e => {
    if (!dragging) return;
    dragging = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    const wasAxisX = axis === "x";
    const wasAxisY = axis === "y";
    axis = null;

    // Re-enable transitions
    if (activeEl) activeEl.style.transition = "";
    if (neighborEl) neighborEl.style.transition = "";

    if (wasAxisY) {
      const threshold = 66;
      if (dy < -threshold) setExpanded(true);
      else if (dy > threshold) setExpanded(false);
      if (activeEl) { activeEl.style.transform = ""; activeEl.style.opacity = ""; activeEl.style.filter = ""; }
      neighborEl = null; neighborDir = 0; activeEl = null;
      return;
    }

    if (!wasAxisX) {
      if (activeEl) { activeEl.style.transform = ""; activeEl.style.opacity = ""; }
      return;
    }

    const threshold = window.innerWidth * 0.22;
    if (dx < -threshold) {
      if (cur < cards.length - 1) {
        if (activeEl) activeEl.style.cssText = "";
        if (neighborEl) neighborEl.style.cssText = "";
        update(cur + 1);
      } else if (storyIdx < stories.length - 1) {
        location.hash = `#/story/${date}/${stories[storyIdx+1].id}`;
      } else {
        if (activeEl) { activeEl.style.transform = ""; activeEl.style.opacity = ""; }
      }
    } else if (dx > threshold) {
      if (cur > 0) {
        if (activeEl) activeEl.style.cssText = "";
        if (neighborEl) neighborEl.style.cssText = "";
        update(cur - 1);
      } else if (storyIdx > 0) {
        location.hash = `#/story/${date}/${stories[storyIdx-1].id}`;
      } else {
        if (activeEl) { activeEl.style.transform = ""; activeEl.style.opacity = ""; }
      }
    } else {
      // Snap back
      if (activeEl) { activeEl.style.transform = ""; activeEl.style.opacity = ""; }
      if (neighborEl) { neighborEl.style.cssText = ""; }
    }
    neighborEl = null; neighborDir = 0; activeEl = null;
  });

  // Arrow keys
  function onKey(e) {
    if (e.key==="ArrowRight") {
      if (cur<cards.length-1) update(cur+1);
    } else if (e.key==="ArrowLeft") {
      if (cur>0) update(cur-1);
    } else if (e.key==="ArrowUp") {
      setExpanded(true);
    } else if (e.key==="ArrowDown") {
      setExpanded(false);
    } else if (e.key==="Escape") {
      location.hash=`#/day/${date}`;
    }
  }
  document.addEventListener("keydown", onKey);
  // Clean up on nav away
  window.addEventListener("hashchange", () => document.removeEventListener("keydown", onKey), {once:true});

  return container;
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
  $("hero-meta").textContent = fmtLong(date) + " · " + payload.stories.length + " stories" + (isLatest?"":" · Archive");

  const pastBanner = isLatest ? "" : `
    <div class="past-day-banner">
      <span>📅 Viewing archive for ${fmtLong(date)}</span>
      <a href="#">← Today</a>
    </div>`;

  const cards = payload.stories.map((s,i) => {
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
            <span class="card-num">${String(i+1).padStart(2,"0")}</span>
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
        ${storyVisual(s, i)}
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
