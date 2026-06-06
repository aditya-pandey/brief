/* The Briefing — front-end logic. No framework, no build step. */

const DATA = "data/";
const dayCache = {};       // date string -> payload
let indexEntries = [];     // [{date, count}] newest first

const $ = (id) => document.getElementById(id);
const app = $("app");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function leanClass(lean) {
  const l = (lean || "").toLowerCase();
  if (l.includes("left"))  return "lean-left";
  if (l.includes("right")) return "lean-right";
  return "lean-center";
}
function fmtDate(iso) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-IN",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}
function fmtDateShort(iso) {
  // Returns e.g. { day: "31", month: "MAY", year: "2026", dow: "SAT" }
  try {
    const d = new Date(iso + "T00:00:00");
    return {
      day:   d.getDate(),
      month: d.toLocaleDateString("en-IN", { month: "short" }).toUpperCase(),
      year:  d.getFullYear(),
      dow:   d.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase(),
    };
  } catch { return { day: iso, month: "", year: "", dow: "" }; }
}

async function loadIndex() {
  if (indexEntries.length) return indexEntries;
  const r = await fetch(DATA + "index.json", { cache: "no-store" });
  const raw = await r.json();
  // Support both old format (array of strings) and new ({date, count} objects).
  indexEntries = raw.map(x => typeof x === "string" ? { date: x, count: null } : x);
  return indexEntries;
}
async function loadDay(date) {
  if (dayCache[date]) return dayCache[date];
  const r = await fetch(`${DATA}${date}.json`, { cache: "no-store" });
  if (!r.ok) throw new Error("no data for " + date);
  const payload = await r.json();
  dayCache[date] = payload;
  return payload;
}

/* ---------- Time Machine ---------- */
function renderTimeMachine(currentDate) {
  const past = indexEntries.filter(e => e.date !== currentDate);
  if (!past.length) return "";

  const cards = past.map(e => {
    const f = fmtDateShort(e.date);
    const countBadge = e.count != null
      ? `<div class="tm-count">${e.count} stor${e.count === 1 ? "y" : "ies"}</div>`
      : "";
    return `
      <button class="tm-card" data-date="${esc(e.date)}" aria-label="Briefing for ${fmtDate(e.date)}">
        <div class="tm-dow">${esc(f.dow)}</div>
        <div class="tm-day">${esc(f.day)}</div>
        <div class="tm-mon">${esc(f.month)} ${esc(String(f.year))}</div>
        ${countBadge}
      </button>`;
  }).join("");

  return `
    <div class="time-machine">
      <div class="tm-header">
        <span class="tm-label">Time Machine</span>
      </div>
      <div class="tm-grid">${cards}</div>
    </div>`;
}

/* ---------- home ---------- */
async function renderHome(date) {
  await loadIndex();
  if (!date) date = indexEntries[0]?.date;
  if (!date) { app.innerHTML = `<div class="loading">No briefings published yet.</div>`; return; }

  const payload = await loadDay(date);
  const isToday = date === indexEntries[0]?.date;

  // Update header dateline
  $("dateline-text").textContent = fmtDate(payload.date) + " · " + payload.stories.length + " stories";
  $("date-picker").hidden = true; // replaced by Time Machine section

  const items = payload.stories.map((s, i) => {
    const thumb = s.image_url
      ? `<div class="card-thumb"><img src="${esc(s.image_url)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>`
      : "";
    return `
    <li class="story-card${s.image_url ? " has-image" : ""}" data-id="${esc(s.id)}" data-date="${esc(date)}">
      <div class="num">${String(i + 1).padStart(2, "0")}</div>
      <div class="card-body">
        <h2>${esc(s.headline)}</h2>
        <p class="tldr">${esc(s.tldr)}</p>
        <span class="region-tag">${esc(s.region || "")}</span>
      </div>
      ${thumb}
    </li>`;
  }).join("");

  // On past-day view: show "← Today" link above the list
  const backToToday = !isToday
    ? `<a class="back tm-back-today" href="#">← Today's Briefing</a>`
    : "";

  app.innerHTML = `
    ${backToToday}
    <ul class="story-list">${items}</ul>
    ${renderTimeMachine(date)}
  `;

  // Wire story clicks
  app.querySelectorAll(".story-card").forEach(card => {
    card.onclick = () => { location.hash = `#/story/${card.dataset.date}/${card.dataset.id}`; };
  });
  // Wire Time Machine card clicks
  app.querySelectorAll(".tm-card").forEach(btn => {
    btn.onclick = () => { location.hash = `#/day/${btn.dataset.date}`; };
  });

  window.scrollTo(0, 0);
}

/* ---------- section renderers ---------- */
const sec = (label, body) =>
  `<section class="section"><div class="label">${label}</div>${body}</section>`;

function renderSituational(s) {
  const cell = (k, v) => `<div class="cell"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`;
  return sec("5W1H · Situational Analysis", `<div class="w-grid">
    ${cell("What", s.what)}${cell("Why", s.why)}${cell("Who", s.who)}
    ${cell("When", s.when)}${cell("Where", s.where)}${cell("How", s.how)}</div>`);
}
function renderMatrix(m) {
  const row = (cls, k, v) =>
    `<div class="row"><div class="k ${cls}">${k}</div><div class="v">${esc(v)}</div></div>`;
  return sec("Perspective Matrix", `<div class="matrix">
    ${row("lean-left",  "Left-leaning",  m.left_leaning)}
    ${row("lean-center","Center",         m.center)}
    ${row("lean-right", "Right-leaning",  m.right_leaning)}
    ${row("scope",      "Indian media",   m.indian_media)}
    ${row("scope",      "Global media",   m.global_media)}</div>`);
}
function renderFacts(fc) {
  const li = (a) => (a || []).map(x => `<li>${esc(x)}</li>`).join("");
  return sec("Facts vs Claims", `<div class="fc">
    <div class="col facts"><h4>Facts</h4><ul>${li(fc.facts)}</ul></div>
    <div class="col claims"><h4>Claims / Opinion</h4><ul>${li(fc.claims)}</ul></div></div>`);
}
function renderRows(label, arr, keyField, valField, mono) {
  const rows = (arr || []).map(o =>
    `<div class="r"><div class="lhs ${mono ? "mono" : ""}">${esc(o[keyField])}</div>
     <div>${esc(o[valField])}</div></div>`).join("");
  return sec(label, `<div class="rows">${rows}</div>`);
}
function renderSources(sources) {
  const li = (s) => `<li>
    <span class="dot ${leanClass(s.lean)}"></span>
    <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.outlet)}</a>
    <span class="meta">${esc(s.lean)} · ${esc(s.region)}</span></li>`;
  return sec("Sources & Transparency",
    `<ul class="sources">${(sources || []).map(li).join("")}</ul>`);
}
function renderConfidence(c) {
  if (!c) return "";
  const lvl = (c.level || "").toLowerCase();
  return `<div class="confidence">Confidence
    <span class="badge ${lvl}">${esc(c.level)}</span></div>
    <p style="margin:0 0 30px;color:var(--ink-soft)">${esc(c.notes)}</p>`;
}

/* ---------- story detail ---------- */
async function renderStory(date, id) {
  await loadIndex();
  const payload = await loadDay(date);
  const s = payload.stories.find(x => x.id === id);
  if (!s) { app.innerHTML = `<div class="loading">Story not found.</div>`; return; }

  $("dateline-text").textContent = fmtDate(payload.date);
  $("date-picker").hidden = true;

  const hero = s.image_url
    ? `<div class="story-hero"><img src="${esc(s.image_url)}" alt="${esc(s.headline)}" onerror="this.parentElement.remove()"></div>`
    : "";

  app.innerHTML = `
    <div class="detail">
      <a class="back" href="#/day/${esc(date)}">← All stories</a>
      ${hero}
      <h1>${esc(s.headline)}</h1>
      <p class="tldr">${esc(s.tldr)}</p>

      ${renderSituational(s.situational_analysis)}
      ${sec("Strategic Assessment", `<p>${esc(s.strategic_assessment)}</p>`)}
      ${renderMatrix(s.perspective_matrix)}
      ${renderFacts(s.facts_vs_claims)}
      ${sec("Blind Spot", `<div class="blindspot">${esc(s.blind_spot)}</div>`)}
      ${renderRows("Stakeholder Impact", s.stakeholder_impact, "stakeholder", "impact", false)}
      ${renderRows("Timeline & Historical Context", s.timeline, "when", "event", true)}
      ${sec("Confidence Assessment", renderConfidence(s.confidence))}
      ${renderSources(s.sources)}
    </div>`;
  window.scrollTo(0, 0);
}

/* ---------- router ---------- */
async function route() {
  const h = location.hash.slice(1);
  app.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    const m = h.match(/^\/story\/([^/]+)\/(.+)$/);
    const d = h.match(/^\/day\/([^/]+)$/);
    if (m) return await renderStory(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    if (d) return await renderHome(decodeURIComponent(d[1]));
    return await renderHome(null);
  } catch (e) {
    app.innerHTML = `<div class="loading">Couldn't load that briefing.<br>${esc(e.message)}</div>`;
  }
}

window.addEventListener("hashchange", route);
route();
