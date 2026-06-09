/* The Briefing — app.js */

const DATA = "data/";
const dayCache = {};
let indexEntries = [];
const FEEDBACK_ENDPOINT = ""; // Paste your Formspree, Formspark, or Webhook URL here to receive feedback

/* ── Analytics tracking helpers ──────────────────────────────── */
function trackPageView(path) {
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
    <section class="briefing-board ${hasRecap ? "two-cols" : "one-col"}" aria-label="Daily briefing dashboard">
      <div class="board-lead" onclick="location.hash='#/story/${esc(payload.date)}/${esc(lead.id)}'" role="button" tabindex="0" style="cursor: pointer;">
        <div class="board-label">Today's signal</div>
        <h2>${esc(lead.headline)}</h2>
        <p>${esc(lead.tldr)}</p>
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
      ${ei.opinion ? `<div class="editorial-block"><div class="editorial-label">Opinion</div><div class="editorial-body">${formatMdText(ei.opinion)}</div></div>` : ""}
      ${ei.analysis ? `<div class="editorial-block" style="margin-top:16px"><div class="editorial-label">Analysis</div><div class="editorial-body">${formatMdText(ei.analysis)}</div></div>` : ""}
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
      ${s.confidence?.notes ? `
        <div class="confidence-card">
          <div class="confidence-notes" style="margin-top: 0;">${esc(s.confidence.notes)}</div>
        </div>` : ""}
      ${sourceDistribution(s.sources)}
      <ul class="sources-list">
        ${(s.sources||[]).map(src=>`
          <li class="source-item">
            <span class="source-dot ${leanClass(src.lean)}"></span>
            <span class="source-name">${esc(src.outlet)}</span>
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

  const allSlides = slides;

  container.innerHTML = `
    <!-- Top breadcrumb/header -->
    <div class="mobile-story-header">
      <a class="mobile-back" href="#/day/${esc(date)}">
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
          <div class="dossier-copy">
            <span class="detail-region ${(s.region||"").toLowerCase()}">${esc((s.region||"").toUpperCase())}</span>
            <h1 class="detail-headline">${esc(s.headline)}</h1>
            <p class="detail-tldr">${esc(s.tldr)}</p>
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
    const terms = keyPhrase(`${s.headline} ${s.tldr}`).slice(0, 2);
    return `
      <div class="story-card" data-id="${esc(s.id)}" data-date="${esc(date)}"
           data-region="${esc(region)}" role="button" tabindex="0">
        <div class="card-accent"></div>
        <div class="card-body">
          <div class="card-top">
            <span class="card-num">${String(i+2).padStart(2,"0")}</span>
            <span class="card-region">${esc(region.toUpperCase())}</span>
          </div>
          <h2 class="card-headline">${esc(s.headline)}</h2>
          ${s.tldr ? `<p class="card-tldr">${esc(s.tldr)}</p>` : ""}
          <div class="card-tags">
            ${terms.map(t => `<span class="card-tag">${esc(t)}</span>`).join("")}
          </div>
          <div class="card-source-bar-wrapper">
            ${miniSourceBar(s.sources)}
          </div>
          <div class="card-footer">
            <span class="card-stats">
              ${ICON.clock}<span>${readMin} min</span>
              <span class="card-stats-sep">·</span>
              ${ICON.link}<span>${sourceCount} source${sourceCount!==1?"s":""}</span>
            </span>
            <span class="card-arrow">Deep dive →</span>
          </div>
        </div>
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
    const go = () => {
      trackEvent("click_brief_card", "Home Grid", card.dataset.id);
      location.hash=`#/story/${card.dataset.date}/${card.dataset.id}`;
    };
    card.onclick = go;
    card.onkeydown = e => { if(e.key==="Enter"||e.key===" ") go(); };
  });
  app.querySelectorAll(".tm-card").forEach(btn => {
    btn.onclick = () => {
      trackEvent("click_time_machine", "Time Machine", btn.dataset.date);
      location.hash=`#/day/${btn.dataset.date}`;
    };
  });
  app.querySelector(".past-day-banner a")?.addEventListener("click", e => {
    e.preventDefault();
    trackEvent("click_archive_banner_back", "Home Grid", "Back to Today");
    location.hash="";
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
    trackPageView(h || "/");
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
