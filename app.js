/* The Briefing — app.js  (no framework, no build step) */

const DATA = "data/";
const dayCache = {};
let indexEntries = []; // [{date, count}] newest first

/* ── Helpers ─────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const app = $("app");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function leanClass(lean) {
  const l = (lean||"").toLowerCase();
  if (l.includes("left"))  return "lean-left";
  if (l.includes("right")) return "lean-right";
  return "lean-center";
}
function fmtLong(iso) {
  try { return new Date(iso+"T00:00:00").toLocaleDateString("en-IN",
    { weekday:"long", day:"numeric", month:"long", year:"numeric" }); }
  catch { return iso; }
}
function fmtShort(iso) {
  try {
    const d = new Date(iso+"T00:00:00");
    return { day:d.getDate(), month:d.toLocaleDateString("en-IN",{month:"short"}).toUpperCase(),
             year:d.getFullYear(), dow:d.toLocaleDateString("en-IN",{weekday:"short"}).toUpperCase() };
  } catch { return { day:iso, month:"", year:"", dow:"" }; }
}
function fmtHeaderDate(iso) {
  try { return new Date(iso+"T00:00:00").toLocaleDateString("en-IN",
    { day:"numeric", month:"short", year:"numeric" }); }
  catch { return iso; }
}

/* ── Theme ───────────────────────────────────────────────────── */
const saved = localStorage.getItem("theme");
if (saved) document.documentElement.setAttribute("data-theme", saved);
$("theme-toggle").onclick = () => {
  const next = document.documentElement.getAttribute("data-theme")==="dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
};

/* ── Progress bar (story detail) ────────────────────────────── */
let progressActive = false;
function startProgress() {
  progressActive = true;
  const bar = $("progress-bar");
  bar.style.width = "0%";
  function update() {
    if (!progressActive) return;
    const el = document.documentElement;
    const pct = el.scrollTop / (el.scrollHeight - el.clientHeight) * 100;
    bar.style.width = Math.min(pct, 100) + "%";
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}
function stopProgress() {
  progressActive = false;
  $("progress-bar").style.width = "0%";
}

/* ── Data loading ────────────────────────────────────────────── */
async function loadIndex() {
  if (indexEntries.length) return indexEntries;
  const r = await fetch(DATA + "index.json", { cache:"no-store" });
  const raw = await r.json();
  indexEntries = raw.map(x => typeof x==="string" ? {date:x, count:null} : x);
  return indexEntries;
}
async function loadDay(date) {
  if (dayCache[date]) return dayCache[date];
  const r = await fetch(`${DATA}${date}.json`, { cache:"no-store" });
  if (!r.ok) throw new Error("No data for " + date);
  return (dayCache[date] = await r.json());
}

/* ╔══════════════════════════════════════════════════════════════╗
   ║  HOME — story grid                                           ║
   ╚══════════════════════════════════════════════════════════════╝ */
async function renderHome(date) {
  await loadIndex();
  if (!date) date = indexEntries[0]?.date;
  if (!date) { app.innerHTML = `<div class="error-state">No briefings yet.</div>`; return; }

  const payload = await loadDay(date);
  const isLatest = date === indexEntries[0]?.date;

  /* ── Header date ── */
  $("header-date").textContent = fmtHeaderDate(date).toUpperCase();

  /* ── Hero banner ── */
  const hero = $("hero");
  hero.classList.remove("hidden");
  $("hero-meta").textContent =
    fmtLong(date) + " · " + payload.stories.length + " stories" +
    (isLatest ? "" : " · Archive");

  /* ── Past-day banner ── */
  const pastBanner = isLatest ? "" : `
    <div class="past-day-banner">
      <span>📅 You're viewing the archive for ${fmtLong(date)}</span>
      <a href="#">← Today's briefing</a>
    </div>`;

  /* ── Story cards ── */
  const cards = payload.stories.map((s, i) => {
    const tldr = s.tldr ? `<p class="card-tldr">${esc(s.tldr)}</p>` : "";
    const region = (s.region || "global").toLowerCase();
    return `
      <div class="story-card" data-id="${esc(s.id)}" data-date="${esc(date)}"
           data-region="${esc(region)}" role="button" tabindex="0"
           aria-label="${esc(s.headline)}">
        <div class="card-accent"></div>
        <div class="card-body">
          <div class="card-top">
            <span class="card-num">${String(i+1).padStart(2,"0")}</span>
            <span class="card-region">${esc(region.toUpperCase())}</span>
          </div>
          <h2 class="card-headline">${esc(s.headline)}</h2>
          ${tldr}
          <div class="card-footer">
            <span class="card-arrow">Read deep dive →</span>
          </div>
        </div>
      </div>`;
  }).join("");

  app.innerHTML = `
    <div class="stories-section">
      ${pastBanner}
      <div class="stories-grid">${cards}</div>
    </div>
    ${renderTimeMachine(date)}
  `;

  /* ── Wire clicks ── */
  app.querySelectorAll(".story-card").forEach(card => {
    const go = () => { location.hash = `#/story/${card.dataset.date}/${card.dataset.id}`; };
    card.onclick = go;
    card.onkeydown = e => { if (e.key==="Enter"||e.key===" ") go(); };
  });
  app.querySelectorAll(".tm-card").forEach(btn => {
    btn.onclick = () => { location.hash = `#/day/${btn.dataset.date}`; };
  });
  app.querySelector(".past-day-banner a")?.addEventListener("click", e => {
    e.preventDefault(); location.hash = "";
  });

  stopProgress();
  window.scrollTo(0, 0);
}

/* ── Time Machine ────────────────────────────────────────────── */
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

/* ╔══════════════════════════════════════════════════════════════╗
   ║  STORY DETAIL                                                ║
   ╚══════════════════════════════════════════════════════════════╝ */
function sec(label, content) {
  return `
    <div class="section">
      <div class="sec-label">${esc(label)}</div>
      <div class="section-card">${content}</div>
    </div>`;
}

function renderSituational(s) {
  const cell = (k, v) => `
    <div class="w-cell">
      <div class="w-key">${k}</div>
      <div class="w-val">${esc(v)}</div>
    </div>`;
  return sec("5W1H · Situational Analysis", `<div class="w-grid">
    ${cell("What",s.what)}${cell("Why",s.why)}${cell("Who",s.who)}
    ${cell("When",s.when)}${cell("Where",s.where)}${cell("How",s.how)}</div>`);
}

function renderMatrix(m) {
  if (!m) return "";
  const row = (cls, label, val) => val ? `
    <div class="matrix-row">
      <div class="matrix-key ${cls}">${label}</div>
      <div class="matrix-val">${esc(val)}</div>
    </div>` : "";
  // Support both old field names (left_leaning/indian_media/global_media)
  // and new Gemini-import field names (western_international/indian_media)
  return sec("Perspective Matrix", `<div class="matrix">
    ${row("lean-left","Left-leaning", m.left_leaning)}
    ${row("lean-center","Center", m.center)}
    ${row("lean-right","Right-leaning", m.right_leaning)}
    ${row("scope","Indian media", m.indian_media)}
    ${row("scope","Western / International", m.western_international || m.global_media)}
  </div>`);
}

function renderFacts(fc) {
  const items = arr => (arr||[]).map(x=>`<li>${esc(x)}</li>`).join("");
  return sec("Facts vs Claims", `<div class="fc-grid">
    <div class="fc-col facts"><div class="fc-title">✓ Verified Facts</div><ul class="fc-list">${items(fc.facts)}</ul></div>
    <div class="fc-col claims"><div class="fc-title">⚠ Claims / Opinion</div><ul class="fc-list">${items(fc.claims)}</ul></div>
  </div>`);
}

function renderRows(label, arr, keyF, valF, mono) {
  const rows = (arr||[]).map(o=>`
    <div class="row-item">
      <div class="row-lhs ${mono?"mono":""}">${esc(o[keyF])}</div>
      <div class="row-rhs">${esc(o[valF])}</div>
    </div>`).join("");
  return sec(label, `<div class="rows section-card">${rows}</div>`);
}

function renderSources(sources) {
  const items = (sources||[]).map(s=>`
    <li class="source-item">
      <span class="source-dot ${leanClass(s.lean)}"></span>
      <a class="source-name" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.outlet)}</a>
      <span class="source-meta">${esc(s.lean)} · ${esc(s.region)}</span>
    </li>`).join("");
  return sec("Sources & Transparency",`<ul class="sources-list">${items}</ul>`);
}

function renderConfidence(c) {
  if (!c) return "";
  const lvl = (c.level||"").toLowerCase();
  return sec("Confidence Assessment", `
    <div class="section-card">
      <div class="confidence-wrap">
        <span class="confidence-label">Confidence</span>
        <span class="confidence-badge ${lvl}">${esc(c.level)}</span>
        <span class="confidence-notes">${esc(c.notes)}</span>
      </div>
    </div>`);
}

async function renderStory(date, id) {
  await loadIndex();
  const payload = await loadDay(date);
  const s = payload.stories.find(x => x.id === id);
  if (!s) { app.innerHTML = `<div class="error-state">Story not found.</div>`; return; }

  $("header-date").textContent = fmtHeaderDate(date).toUpperCase();
  $("hero").classList.add("hidden");

  const stakeholderContent = (s.stakeholder_impact||[]).map(o=>`
    <div class="row-item">
      <div class="row-lhs">${esc(o.stakeholder)}</div>
      <div class="row-rhs">${esc(o.impact)}</div>
    </div>`).join("");

  const timelineContent = (s.timeline||[]).map(o=>`
    <div class="row-item">
      <div class="row-lhs mono">${esc(o.when)}</div>
      <div class="row-rhs">${esc(o.event)}</div>
    </div>`).join("");

  // Editorial & Expert Insight (new section)
  const editorialHtml = s.editorial_expert_insight ? sec("Editorial & Expert Insight", `
    <div class="editorial-grid">
      ${s.editorial_expert_insight.opinion ? `
        <div class="editorial-block">
          <div class="editorial-label">Opinion</div>
          <div class="editorial-body">${esc(s.editorial_expert_insight.opinion)}</div>
        </div>` : ""}
      ${s.editorial_expert_insight.analysis ? `
        <div class="editorial-block">
          <div class="editorial-label">Analysis</div>
          <div class="editorial-body">${esc(s.editorial_expert_insight.analysis)}</div>
        </div>` : ""}
    </div>`) : "";

  // Context & Background (new section)
  const contextHtml = s.context_background ? sec("Context & Background",
    `<div class="assessment-body">${esc(s.context_background)}</div>`) : "";

  // Simple Explanation (new section)
  const simpleHtml = s.simple_explanation ? `
    <div class="section">
      <div class="sec-label">In Plain Terms</div>
      <div class="simple-explanation">
        <span class="simple-icon">💡</span>
        ${esc(s.simple_explanation)}
      </div>
    </div>` : "";

  app.innerHTML = `
    <div class="detail-wrap">
      <a class="back-link" href="#/day/${esc(date)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        All stories
      </a>

      <span class="detail-region">${esc((s.region||"").toUpperCase())}</span>
      <h1 class="detail-headline">${esc(s.headline)}</h1>
      <p class="detail-tldr">${esc(s.tldr)}</p>

      ${renderSituational(s.situational_analysis)}
      ${sec("Strategic Assessment", `<div class="assessment-body">${esc(s.strategic_assessment)}</div>`)}
      ${renderMatrix(s.perspective_matrix)}
      ${renderFacts(s.facts_vs_claims)}

      <div class="section">
        <div class="sec-label">Blind Spot</div>
        <div class="blindspot">
          <span class="blindspot-icon">⚑ What coverage missed</span>
          ${esc(s.blind_spot)}
        </div>
      </div>

      ${editorialHtml}

      <div class="section">
        <div class="sec-label">Stakeholder Impact</div>
        <div class="section-card"><div class="rows">${stakeholderContent}</div></div>
      </div>

      ${contextHtml}

      <div class="section">
        <div class="sec-label">Timeline & Historical Context</div>
        <div class="section-card"><div class="rows">${timelineContent}</div></div>
      </div>

      ${simpleHtml}
      ${renderConfidence(s.confidence)}
      ${renderSources(s.sources)}
    </div>`;

  startProgress();
  window.scrollTo(0, 0);
}

/* ╔══════════════════════════════════════════════════════════════╗
   ║  Router                                                      ║
   ╚══════════════════════════════════════════════════════════════╝ */
async function route() {
  const h = location.hash.slice(1);
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
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
    app.innerHTML = `<div class="error-state">Couldn't load · ${esc(e.message)}</div>`;
  }
}

window.addEventListener("hashchange", route);
route();
