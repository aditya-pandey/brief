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
   SLIDE BUILDER — each section becomes a self-contained slide
   ══════════════════════════════════════════════════════════════ */
function buildSlides(s) {
  const slides = [];

  // 1 · Cover
  slides.push({ id:"cover", label:"Overview", icon:"◉", html:`
    <div class="slide-cover">
      <div class="slide-cover-top">
        <span class="detail-region ${(s.region||'global').toLowerCase()}">${esc((s.region||"").toUpperCase())}</span>
      </div>
      <h1 class="slide-headline">${esc(s.headline)}</h1>
      <p class="slide-tldr">${esc(s.tldr)}</p>
      <div class="swipe-hint">Swipe ← to explore deep dive</div>
    </div>`
  });

  // 2 · 5W1H
  const sa = s.situational_analysis;
  if (sa) slides.push({ id:"5w1h", label:"Situation", icon:"⬡", html:`
    <div class="slide-body">
      <div class="slide-section-label">5W1H · Situation</div>
      <div class="w-list">
        ${[["WHAT",sa.what],["WHY",sa.why],["WHO",sa.who],["WHEN",sa.when],["WHERE",sa.where],["HOW",sa.how]]
          .filter(([,v])=>v).map(([k,v])=>`
          <div class="w-item"><div class="w-key">${k}</div><div class="w-val">${esc(v)}</div></div>`).join("")}
      </div>
    </div>`
  });

  // 3 · Strategic Assessment
  if (s.strategic_assessment) slides.push({ id:"strategic", label:"Strategy", icon:"◈", html:`
    <div class="slide-body">
      <div class="slide-section-label">Strategic Assessment</div>
      <p class="slide-prose">${esc(s.strategic_assessment)}</p>
    </div>`
  });

  // 4 · Perspectives
  const pm = s.perspective_matrix;
  if (pm) slides.push({ id:"perspectives", label:"Perspectives", icon:"⊞", html:`
    <div class="slide-body">
      <div class="slide-section-label">Perspective Matrix</div>
      <div class="persp-list">
        ${[
          ["lean-left","Left-leaning", pm.left_leaning],
          ["lean-center","Center",      pm.center],
          ["lean-right","Right-leaning",pm.right_leaning],
          ["scope","Indian media",      pm.indian_media],
          ["scope","Western / Intl",    pm.western_international||pm.global_media],
        ].filter(([,,v])=>v).map(([cls,label,val])=>`
          <div class="persp-item">
            <div class="persp-key ${cls}">${label}</div>
            <div class="persp-val">${esc(val)}</div>
          </div>`).join("")}
      </div>
    </div>`
  });

  // 5 · Facts vs Claims
  const fc = s.facts_vs_claims;
  if (fc) slides.push({ id:"facts", label:"Facts vs Claims", icon:"⊛", html:`
    <div class="slide-body">
      <div class="slide-section-label">Facts vs Claims</div>
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
      <div class="slide-section-label">Blind Spot</div>
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
      <div class="slide-section-label">Editorial & Expert Insight</div>
      ${ei.opinion ? `<div class="editorial-block"><div class="editorial-label">Opinion</div><div class="editorial-body">${esc(ei.opinion)}</div></div>` : ""}
      ${ei.analysis ? `<div class="editorial-block" style="margin-top:16px"><div class="editorial-label">Analysis</div><div class="editorial-body">${esc(ei.analysis)}</div></div>` : ""}
    </div>`
  });

  // 8 · Stakeholder Impact
  if (s.stakeholder_impact?.length) slides.push({ id:"impact", label:"Impact", icon:"◎", html:`
    <div class="slide-body">
      <div class="slide-section-label">Stakeholder Impact</div>
      <div class="rows">
        ${(s.stakeholder_impact||[]).map(o=>`
          <div class="row-item">
            <div class="row-lhs">${esc(o.stakeholder)}</div>
            <div class="row-rhs">${esc(o.impact)}</div>
          </div>`).join("")}
      </div>
    </div>`
  });

  // 9 · Context
  if (s.context_background) slides.push({ id:"context", label:"Context", icon:"⊙", html:`
    <div class="slide-body">
      <div class="slide-section-label">Context & Background</div>
      <p class="slide-prose">${esc(s.context_background)}</p>
    </div>`
  });

  // 10 · Timeline
  if (s.timeline?.length) slides.push({ id:"timeline", label:"Timeline", icon:"⊗", html:`
    <div class="slide-body">
      <div class="slide-section-label">Timeline</div>
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
      <div class="slide-section-label">In Plain Terms</div>
      <div class="simple-explanation">
        <span class="simple-icon">💡</span>
        ${esc(s.simple_explanation)}
      </div>
    </div>`
  });

  // 12 · Sources + Confidence
  slides.push({ id:"sources", label:"Sources", icon:"⊕", html:`
    <div class="slide-body">
      <div class="slide-section-label">Sources & Transparency</div>
      ${s.confidence ? `
        <div class="confidence-wrap" style="margin-bottom:20px">
          <span class="confidence-label">Confidence</span>
          <span class="confidence-badge ${(s.confidence.level||"").toLowerCase()}">${esc(s.confidence.level)}</span>
          <span class="confidence-notes">${esc(s.confidence.notes)}</span>
        </div>` : ""}
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

  function renderDots() {
    return slides.map((sl,i)=>`
      <button class="dot ${i===cur?"active":""}" data-i="${i}" aria-label="${sl.label}"></button>
    `).join("");
  }

  function renderTopBar() {
    return `
      <div class="deck-topbar">
        <a class="deck-back" href="#/day/${esc(date)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
          Stories
        </a>
        <div class="deck-progress-track">
          <div class="deck-progress-fill" style="width:${((cur+1)/slides.length*100).toFixed(1)}%"></div>
        </div>
        <div class="deck-slide-label">${slides[cur].label}</div>
      </div>`;
  }

  function renderBottomBar() {
    const hasPrev = cur > 0;
    const hasNext = cur < slides.length - 1;
    const prevStory = storyIdx > 0 ? stories[storyIdx-1] : null;
    const nextStory = storyIdx < stories.length-1 ? stories[storyIdx+1] : null;
    return `
      <div class="deck-bottombar">
        <button class="deck-btn deck-prev ${hasPrev?"":"muted"}" id="slide-prev">
          ${hasPrev ? `← ${slides[cur-1].label}` : (prevStory ? `↑ Prev story` : "")}
        </button>
        <div class="deck-dots">${renderDots()}</div>
        <button class="deck-btn deck-next ${hasNext?"":"muted"}" id="slide-next">
          ${hasNext ? `${slides[cur+1].label} →` : (nextStory ? `Next story ↓` : "End")}
        </button>
      </div>`;
  }

  const container = document.createElement("div");
  container.className = "deck-container";
  container.innerHTML = `
    ${renderTopBar()}
    <div class="slide-deck" id="slide-deck">
      ${slides.map((sl,i)=>`
        <div class="slide ${i===0?"is-active":i===1?"is-next":"is-far"}" data-idx="${i}">
          <div class="slide-inner">${sl.html}</div>
        </div>`).join("")}
    </div>
    ${renderBottomBar()}`;

  function update(newIdx, dir) {
    const prev = cur;
    cur = Math.max(0, Math.min(slides.length-1, newIdx));
    if (cur === prev) return;

    const deck = container.querySelector("#slide-deck");
    const allSlides = deck.querySelectorAll(".slide");

    allSlides.forEach((el, i) => {
      el.className = "slide";
      if (i === cur) el.classList.add("is-active");
      else if (dir === "next" && i === prev) el.classList.add("is-out-left");
      else if (dir === "prev" && i === prev) el.classList.add("is-out-right");
      else if (i > cur) el.classList.add("is-next");
      else el.classList.add("is-far");
    });

    // Update top bar + bottom bar
    container.querySelector(".deck-topbar").outerHTML = renderTopBar();
    container.querySelector(".deck-bottombar").outerHTML = renderBottomBar();
    // Re-render (simpler than patching)
    container.innerHTML = `
      ${renderTopBar()}
      <div class="slide-deck" id="slide-deck">
        ${slides.map((sl,i)=>`
          <div class="slide ${i===cur?"is-active":i<cur?"is-far":"is-next"}" data-idx="${i}">
            <div class="slide-inner">${sl.html}</div>
          </div>`).join("")}
      </div>
      ${renderBottomBar()}`;
    wireButtons();
  }

  function wireButtons() {
    container.querySelector("#slide-prev")?.addEventListener("click", () => {
      if (cur > 0) update(cur-1, "prev");
      else if (storyIdx > 0) {
        location.hash = `#/story/${date}/${stories[storyIdx-1].id}`;
      }
    });
    container.querySelector("#slide-next")?.addEventListener("click", () => {
      if (cur < slides.length-1) update(cur+1, "next");
      else if (storyIdx < stories.length-1) {
        location.hash = `#/story/${date}/${stories[storyIdx+1].id}`;
      }
    });
    container.querySelectorAll(".dot").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.i);
        update(i, i > cur ? "next" : "prev");
      });
    });
  }

  wireButtons();

  // Swipe gesture
  const deck = () => container.querySelector("#slide-deck");
  let sx = 0, sy = 0, dragging = false;
  container.addEventListener("touchstart", e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    dragging = true;
  }, {passive:true});
  container.addEventListener("touchmove", e => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) e.preventDefault();
  }, {passive:false});
  container.addEventListener("touchend", e => {
    if (!dragging) return;
    dragging = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 55) {
      if (dx < 0) {
        if (cur < slides.length-1) update(cur+1, "next");
        else if (storyIdx < stories.length-1)
          location.hash = `#/story/${date}/${stories[storyIdx+1].id}`;
      } else {
        if (cur > 0) update(cur-1, "prev");
        else if (storyIdx > 0)
          location.hash = `#/story/${date}/${stories[storyIdx-1].id}`;
      }
    }
  });

  // Arrow keys
  function onKey(e) {
    if (e.key==="ArrowRight"||e.key==="ArrowDown") {
      if (cur<slides.length-1) update(cur+1,"next");
    } else if (e.key==="ArrowLeft"||e.key==="ArrowUp") {
      if (cur>0) update(cur-1,"prev");
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

  // Cover slide is shown as headline+tldr above; skip it in the section list
  const allSections = slides.filter(sl => sl.id !== "cover").map(sl=>`
    <div class="desktop-section" id="section-${sl.id}">
      ${sl.html}
    </div>`).join("");

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
        <span class="detail-region ${(s.region||"").toLowerCase()}">${esc((s.region||"").toUpperCase())}</span>
        <h1 class="detail-headline">${esc(s.headline)}</h1>
        <p class="detail-tldr">${esc(s.tldr)}</p>
        <div class="desktop-sections">${allSections}</div>
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
    return `
      <div class="story-card" data-id="${esc(s.id)}" data-date="${esc(date)}"
           data-region="${esc(region)}" role="button" tabindex="0">
        <div class="card-accent"></div>
        <div class="card-body">
          <div class="card-top">
            <span class="card-num">${String(i+1).padStart(2,"0")}</span>
            <span class="card-region">${esc(region.toUpperCase())}</span>
          </div>
          <h2 class="card-headline">${esc(s.headline)}</h2>
          ${s.tldr ? `<p class="card-tldr">${esc(s.tldr)}</p>` : ""}
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
