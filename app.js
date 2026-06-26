/* The Briefing — app.js */

const DATA = "data/";
const BASE_PATH = (() => {
  const path = window.location.pathname;
  const match = path.match(/^(.*?)\/(?:story|day|editor|briefings|flash|install|saved)(?:\/|$)/);
  if (match) return match[1];
  return path.replace(/\/+$/, "");
})();
const dayCache = {};
let indexEntries = [];
const FEEDBACK_ENDPOINT = ""; // Paste your Formspree, Formspark, or Webhook URL here to receive feedback

/* ── Flash state variables ── */
let currentMode = localStorage.getItem("currentMode") || "briefing";
let flashStories = [];
let activeFlashCategory = "all";
let currentFlashIndex = 0;
const flashReadsSessionSet = new Set();
let selectedFlashStoryId = null;
let physDragCleanup = null;
let deckItems = [];
let isPreloadingNextDay = false;

/* ── Analytics tracking helpers ──────────────────────────────── */
function trackPageView(path, title) {
  if (title) {
    document.title = title;
  }
  if (typeof gtag === "function") {
    gtag("event", "page_view", {
      page_path: path,
      page_title: document.title || "The Briefing",
      page_location: window.location.origin + (BASE_PATH || "") + path
    });
  }
  if (typeof posthog !== "undefined" && posthog.capture) {
    posthog.capture("$pageview", {
      $current_url: window.location.origin + (BASE_PATH || "") + path,
      $title: document.title || "The Briefing"
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
  if (typeof posthog !== "undefined" && posthog.capture) {
    const props = {
      category: category,
      label: label
    };
    if (value !== null) props.value = value;
    posthog.capture(action, props);
  }
}

function getShareUrl(channel, customUrl = null) {
  const targetUrl = customUrl || window.location.href;
  try {
    const urlObj = new URL(targetUrl);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'gclid', 'fbclid', 'msclkid'
    ];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));

    urlObj.searchParams.set('utm_source', channel);
    urlObj.searchParams.set('utm_medium', 'social');
    urlObj.searchParams.set('utm_campaign', 'share');

    return urlObj.toString();
  } catch (e) {
    console.error("Failed to parse share URL:", e);
    return targetUrl;
  }
}


/* ── Helpers ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const app = $("app");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  const l = (lean || "").toLowerCase();
  if (l.includes("left")) return "lean-left";
  if (l.includes("right")) return "lean-right";
  return "lean-center";
}
function sourceBuckets(sources = []) {
  const buckets = { left: 0, center: 0, right: 0, other: 0 };
  sources.forEach(s => {
    const l = (s.lean || "").toLowerCase();
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
  words.forEach(w => { if (!stop.has(w)) counts[w] = (counts[w] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w);
}
function fmtLong(iso) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-IN",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  catch { return iso; }
}
function fmtShort(iso) {
  try {
    const d = new Date(iso + "T00:00:00");
    return {
      day: d.getDate(), month: d.toLocaleDateString("en-IN", { month: "short" }).toUpperCase(),
      year: d.getFullYear(), dow: d.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase()
    };
  } catch { return { day: iso, month: "", year: "", dow: "" }; }
}
function fmtHeaderDate(iso) {
  try {
    if (!iso || iso === "Unknown Date" || !iso.includes("-")) return iso || "Unknown Date";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  }
  catch { return iso; }
}

/* ── Theme ─────────────────────────────────────────────────── */
const saved = localStorage.getItem("theme");
if (saved) document.documentElement.setAttribute("data-theme", saved);
const themeToggleBtn = $("theme-toggle");
if (themeToggleBtn) {
  themeToggleBtn.onclick = () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    trackEvent("theme_toggle", "Preferences", next);
  };
}
const desktopThemeBtn = $("desktop-theme-btn");
if (desktopThemeBtn) {
  desktopThemeBtn.onclick = () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    trackEvent("theme_toggle", "Preferences", next);
  };
}

/* ── Push Notifications ───────────────────────────────────── */
async function initPushNotifications() {
  const trigger = $("notification-trigger");
  if (!trigger) return;

  try {
    const pushService = await import('./push-placeholder.js');

    // Check current state
    const { supported, subscribed } = await pushService.getSubscriptionStatus();
    if (!supported) {
      trigger.style.display = "none";
      return;
    }

    updateBellUI(subscribed);

    trigger.onclick = async () => {
      trigger.disabled = true;
      let attemptingSubscribe = false;
      try {
        const status = await pushService.getSubscriptionStatus();
        attemptingSubscribe = !status.subscribed;
        if (status.subscribed) {
          await pushService.unsubscribeUserFromPush();
          updateBellUI(false);
          showToast("Notifications disabled.");
          trackEvent("push_unsubscribe", "PWA", "Success");
        } else {
          await pushService.subscribeUserToPush();
          updateBellUI(true);
          showToast("Notifications enabled!");
          trackEvent("push_subscribe", "PWA", "Success");
        }
      } catch (err) {
        console.error("Failed to toggle subscription:", err);
        showToast("Error: " + (err.message || "Unknown error"));
        const action = attemptingSubscribe ? "push_subscribe" : "push_unsubscribe";
        trackEvent(action, "PWA", "Error: " + (err.message || "Unknown error"));
      } finally {
        trigger.disabled = false;
      }
    };
  } catch (e) {
    console.error("Failed to load push module:", e);
  }
}

function updateBellUI(subscribed) {
  const trigger = $("notification-trigger");
  const iconOn = $("icon-bell");
  const iconOff = $("icon-bell-off");
  if (!trigger || !iconOn || !iconOff) return;

  if (subscribed) {
    trigger.classList.add("active");
    iconOn.classList.remove("hidden");
    iconOff.classList.add("hidden");
    trigger.title = "Disable Notifications";
  } else {
    trigger.classList.remove("active");
    iconOn.classList.add("hidden");
    iconOff.classList.remove("hidden");
    trigger.title = "Enable Notifications";
  }
}

// Initialize on load
window.addEventListener("DOMContentLoaded", () => {
  initPushNotifications();
});

/* ── Progress bar & Image Resolution ──────────────────────────── */
let progressActive = false;
let scrollProgressActive = false;

async function getHeroImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const json = await res.json();
    const html = json.contents;
    if (!html) return null;

    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (m) {
      let src = m[1].trim();
      if (src && !src.startsWith("data:")) {
        if (!src.startsWith("http")) {
          try {
            src = new URL(src, url).href;
          } catch (e) { }
        }

        // Filter out generic/publication logo/placeholder images
        const lowerSrc = src.toLowerCase();
        const blacklist = [
          'placeholder', 'avatar', 'favicon', 'fallback',
          'default-share', 'default_share', 'social-share', 'social_share',
          'og-default', 'og_default', 'default-og', 'default_og',
          'share-image', 'share_img', 'share-img', 'default-image',
          'default_image', 'dummy-image', 'site-image', 'generic-banner',
          'publication-logo', 'default.jpg', 'default.png', 'default.jpeg',
          'og-image', 'og_image'
        ];

        const isGeneric = blacklist.some(word => lowerSrc.includes(word)) ||
          lowerSrc.includes('/logo') ||
          lowerSrc.includes('_logo') ||
          lowerSrc.includes('-logo') ||
          lowerSrc.includes('/brand') ||
          lowerSrc.includes('/icon') ||
          /\b(logo|brand|icon|placeholder)\b/.test(lowerSrc);

        if (isGeneric) {
          return null;
        }

        return src;
      }
    }
  } catch (e) {
    console.error("Error fetching hero image:", e);
  }
  return null;
}

function setArticleHeroImage(url) {
  const container = document.getElementById("article-hero-container");
  if (!container) return;
  container.innerHTML = `<img src="${url}" alt="Hero Image" style="width: 100%; height: 100%; object-fit: cover; animation: fadeIn 0.4s ease;" />`;
}

function startScrollProgress(totalReadingTime) {
  scrollProgressActive = true;
  const bar = $("progress-bar");
  const headerCenter = $("flash-header-center");

  bar.style.width = "0%";
  if (headerCenter) {
    headerCenter.style.display = "none";
  }

  function update() {
    if (!scrollProgressActive) return;
    const el = document.documentElement;
    const totalHeight = el.scrollHeight - el.clientHeight;
    const pct = totalHeight > 0 ? (window.scrollY / totalHeight) * 100 : 0;
    bar.style.width = Math.min(pct, 100) + "%";

    const minutesLeft = Math.ceil(totalReadingTime * (1 - pct / 100));
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

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
  scrollProgressActive = false;
  $("progress-bar").style.width = "0%";
  const headerCenter = $("flash-header-center");
  if (headerCenter) {
    headerCenter.style.display = "none";
  }
}

function getPreviousFlashDate(currentDate) {
  if (!currentDate || !indexEntries.length) return null;
  const idx = indexEntries.findIndex(e => e.date === currentDate);
  if (idx >= 0 && idx < indexEntries.length - 1) {
    return indexEntries[idx + 1].date;
  }
  return null;
}

/* ── Data loading ──────────────────────────────────────────── */
async function loadIndex() {
  if (indexEntries.length) return indexEntries;
  const r = await fetch(DATA + "index.json", { cache: "no-store" });
  const raw = await r.json();
  const mapped = raw.map(x => typeof x === "string" ? { date: x, count: null } : x);
  const unique = [];
  const seen = new Set();
  for (const entry of mapped) {
    if (!seen.has(entry.date) && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      seen.add(entry.date);
      unique.push(entry);
    }
  }
  indexEntries = unique;

  const sel = $("archive-select");
  if (sel && indexEntries.length > 0) {
    sel.max = indexEntries[0].date;
    sel.min = indexEntries[indexEntries.length - 1].date;
  }
  return indexEntries;
}

function initDatePicker() {
  const sel = $("archive-select");

  if (sel) {
    sel.addEventListener("change", async e => {
      const selected = e.target.value;
      if (selected) {
        if (window.closeSlideMenu) window.closeSlideMenu();
        trackEvent("change_date", "DatePicker", selected);
        const resetDatePickerValue = () => {
          let p = location.pathname;
          if (p.endsWith("/index.html")) p = p.slice(0, -11);
          p = p.replace(/\/+$/, "") || "/";
          if (BASE_PATH && p.startsWith(BASE_PATH)) p = p.slice(BASE_PATH.length) || "/";
          p = p.replace(/\/+$/, "") || "/";

          const briefingsDayMatch = p.match(/^\/briefings\/day\/([^/]+)$/);
          const flashDayMatch = p.match(/^\/flash\/day\/([^/]+)$/);
          const storyMatch = p.match(/^\/story\/([^/]+)\/(.+)$/);

          let curDate = indexEntries[0]?.date;
          if (briefingsDayMatch) curDate = briefingsDayMatch[1];
          else if (flashDayMatch) curDate = flashDayMatch[1];
          else if (storyMatch) curDate = storyMatch[1];

          sel.value = curDate || "";
        };

        if (indexEntries.some(x => x.date === selected)) {
          const latestDate = indexEntries.length > 0 ? indexEntries[0].date : null;
          if (currentMode === "flash") {
            if (selected === latestDate) {
              navigate(`${BASE_PATH}/flash/day/${selected}`);
              return;
            }
            try {
              const r = await fetch(`${BASE_PATH ? BASE_PATH + "/" : ""}data/flash-${selected}.json`, { method: "HEAD", cache: "no-store" });
              if (r.ok) {
                navigate(`${BASE_PATH}/flash/day/${selected}`);
              } else {
                alert(`No Flash stories available for ${selected}.`);
                resetDatePickerValue();
              }
            } catch (err) {
              alert(`No Flash stories available for ${selected}.`);
              resetDatePickerValue();
            }
          } else {
            try {
              const r = await fetch(`${BASE_PATH ? BASE_PATH + "/" : ""}data/${selected}.json`, { method: "HEAD", cache: "no-store" });
              if (r.ok) {
                navigate(`${BASE_PATH}/briefings/day/${selected}`);
              } else {
                alert(`No Briefings available for ${selected}.`);
                resetDatePickerValue();
              }
            } catch (err) {
              alert(`No Briefings available for ${selected}.`);
              resetDatePickerValue();
            }
          }
        } else {
          alert("No content available for this date. Please select a valid date.");
          resetDatePickerValue();
        }
      }
    });
  }
}
function adaptStory(story) {
  if (!story) return null;
  if (story._adapted) return story;

  // Detect if the story is in the new question-based schema format
  const isNewSchema = Array.isArray(story.sections) && story.sections.length > 0;

  if (isNewSchema) {
    const sections = [];

    // Map Q&A sections
    if (story.sections && Array.isArray(story.sections)) {
      story.sections.forEach(sec => {
        if (sec.question && sec.answer) {
          sections.push({
            title: sec.question,
            content: sec.answer
          });
        } else if (sec.title && sec.content) {
          sections.push({
            title: sec.title,
            content: sec.content
          });
        }
      });
    }

    // Map strategic_assessment
    if (story.strategic_assessment) {
      sections.push({
        title: "Strategic Assessment",
        content: story.strategic_assessment
      });
    }

    // Map facts_vs_claims
    if (story.facts_vs_claims) {
      let content = "";
      const fc = story.facts_vs_claims;
      if (fc.facts && fc.facts.length) {
        content += `### Verified Facts\n` + fc.facts.map(f => `- ${f}`).join("\n") + "\n\n";
      }
      if (fc.claims && fc.claims.length) {
        content += `### Contested Claims\n` + fc.claims.map(c => `- ${c}`).join("\n") + "\n\n";
      }
      if (content) {
        sections.push({
          title: "Facts vs Claims",
          content: content.trim()
        });
      }
    }

    // Map confidence_note (optional)
    if (story.confidence_note) {
      sections.push({
        title: "Confidence & Sourcing Notes",
        content: story.confidence_note
      });
    }

    // Map sources
    const sources = (story.sources || []).map(s => {
      let name = s.outlet || s.name || "Source";
      if (s.desk) name += ` / ${s.desk}`;

      let description = s.title || "";
      const tags = [];
      if (s.lean) tags.push(s.lean);
      if (s.region) tags.push(s.region);
      if (tags.length > 0) {
        description += (description ? " " : "") + `(${tags.join(" · ")})`;
      }
      if (!description && s.description) description = s.description;

      const cleanedUrl = cleanSourceUrl(s.url) || s.url || "#";

      return {
        name: name,
        description: description || "Reference source",
        url: cleanedUrl,
        outlet: s.outlet || s.name || name,
        title: s.title || s.description || description || "Reference source",
        desk: s.desk || "",
        lean: s.lean || "center",
        region: s.region || "global"
      };
    });

    return {
      id: story.id,
      headline: story.headline || story.title,
      subtitle: story.subtitle || "",
      overview: story.tldr || story.overview || "",
      tldr: story.tldr || story.overview || "",
      inPlainEnglish: story.simple_explanation || story.inPlainEnglish || "",
      sections: sections,
      sources: sources,
      region: story.region || "global",
      heroImage: story.heroImage || null,
      conclusion: story.conclusion || null,
      _adapted: true
    };
  }

  // Old schema fallback
  const sections = [];

  if (story.situational_analysis) {
    let content = "";
    const sa = story.situational_analysis;
    if (sa.what) content += `**What Happened:** ${sa.what}\n\n`;
    if (sa.why) content += `**Why It Matters:** ${sa.why}\n\n`;
    if (sa.who) content += `**Key Actors:** ${sa.who}\n\n`;
    if (sa.when) content += `**Timeline Context:** ${sa.when}\n\n`;
    if (sa.where) content += `**Geographic Context:** ${sa.where}\n\n`;
    if (sa.how) content += `**Mechanisms:** ${sa.how}\n\n`;
    if (content) sections.push({ title: "Situational Analysis", content: content.trim() });
  }

  if (story.strategic_assessment) {
    sections.push({ title: "Strategic Assessment", content: story.strategic_assessment });
  }

  if (story.perspective_matrix) {
    let content = "";
    const pm = story.perspective_matrix;
    if (pm.western_international || pm.global_media) content += `**International Coverage:** ${pm.western_international || pm.global_media}\n\n`;
    if (pm.indian_media) content += `**Indian Media:** ${pm.indian_media}\n\n`;
    if (pm.left_leaning) content += `**Left Leaning:** ${pm.left_leaning}\n\n`;
    if (pm.center) content += `**Centrist:** ${pm.center}\n\n`;
    if (pm.right_leaning) content += `**Right Leaning:** ${pm.right_leaning}\n\n`;
    if (content) sections.push({ title: "Perspective Matrix", content: content.trim() });
  }

  if (story.facts_vs_claims) {
    let content = "";
    const fc = story.facts_vs_claims;
    if (fc.facts && fc.facts.length) {
      content += `### Verified Facts\n` + fc.facts.map(f => `- ${f}`).join("\n") + "\n\n";
    }
    if (fc.claims && fc.claims.length) {
      content += `### Contested Claims\n` + fc.claims.map(c => `- ${c}`).join("\n") + "\n\n";
    }
    if (content) sections.push({ title: "Facts vs Claims", content: content.trim() });
  }

  if (story.blind_spot) {
    sections.push({ title: "Underreported Angles", content: story.blind_spot });
  }

  if (story.editorial_expert_insight) {
    let content = "";
    const ei = story.editorial_expert_insight;
    if (ei.opinion) content += `**Editorial Opinion:** ${ei.opinion}\n\n`;
    if (ei.analysis) content += `**Expert Analysis:** ${ei.analysis}\n\n`;
    if (content) sections.push({ title: "Expert & Editorial Insight", content: content.trim() });
  }

  if (story.stakeholder_impact && story.stakeholder_impact.length) {
    const content = story.stakeholder_impact.map(s => `- **${s.stakeholder}:** ${s.impact}`).join("\n");
    sections.push({ title: "Stakeholder Impact", content });
  }

  if (story.context_background) {
    sections.push({ title: "Historical Context", content: story.context_background });
  }

  if (story.timeline && story.timeline.length) {
    const content = story.timeline.map(t => `**${t.when}:** ${t.event}`).join("\n\n");
    sections.push({ title: "Timeline of Events", content });
  }

  const sources = (story.sources || []).map(s => {
    const cleanedUrl = cleanSourceUrl(s.url) || s.url || "#";
    const name = s.outlet || s.name || "Source";
    const description = s.description || s.title || `${s.lean || "center"} · ${s.region || "global"}`;
    return {
      name: name,
      description: description,
      url: cleanedUrl,
      outlet: s.outlet || s.name || name,
      title: s.title || s.description || description,
      desk: s.desk || "",
      lean: s.lean || "center",
      region: s.region || "global"
    };
  });

  return {
    id: story.id,
    headline: story.headline || story.title,
    subtitle: story.subtitle || "",
    overview: story.tldr || story.overview || "",
    tldr: story.tldr || story.overview || "",
    inPlainEnglish: story.simple_explanation || story.inPlainEnglish || "",
    sections: sections,
    sources: sources,
    region: story.region || "global",
    heroImage: story.heroImage || null,
    conclusion: story.conclusion || null,
    _adapted: true
  };
}

async function loadDay(date) {
  if (dayCache[date]) return dayCache[date];
  const r = await fetch(`${DATA}${date}.json`, { cache: "no-store" });
  if (!r.ok) throw new Error("No data for " + date);
  const data = await r.json();
  if (data.stories && Array.isArray(data.stories)) {
    data.stories = data.stories.map(s => adaptStory(s));
  }
  return (dayCache[date] = data);
}


/* ══════════════════════════════════════════════════════════════
   ICON LIBRARY — inline SVGs for visual section headers
   ══════════════════════════════════════════════════════════════ */
const ICON = {
  hex: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 7 22 17 12 22 2 17 2 7"/></svg>`,
  chess: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7"/></svg>`,
  scale: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 8h18M6 8l-3 6a3 3 0 0 0 6 0L6 8zM18 8l-3 6a3 3 0 0 0 6 0L18 8z"/></svg>`,
  fact: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="21" x2="21" y2="3"/></svg>`,
  quote: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 6h4v4H8c0 2 1 3 3 3v3c-3 0-4-2-4-4V6zm9 0h4v4h-3c0 2 1 3 3 3v3c-3 0-4-2-4-4V6z"/></svg>`,
  impact: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" opacity=".5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  timeline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="5" cy="12" r="2"/><line x1="5" y1="8" x2="5" y2="10"/><line x1="5" y1="14" x2="5" y2="16"/><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="16" y2="12"/><line x1="9" y1="18" x2="18" y2="18"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c1 .9 1 1.6 1 2.3v1h6v-1c0-.7 0-1.4 1-2.3A7 7 0 0 0 12 2z"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>`,
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
    { cls: "seg-left", n: buckets.left, label: "Left" },
    { cls: "seg-center", n: buckets.center + buckets.other, label: "Center" },
    { cls: "seg-right", n: buckets.right, label: "Right" },
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
        <span><span class="dot lean-center"></span>${buckets.center + buckets.other} Center</span>
        <span><span class="dot lean-right"></span>${buckets.right} Right</span>
        <span class="source-dist-total">${total} source${total !== 1 ? "s" : ""}</span>
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
  if (story.heroImage) {
    return `
      <div class="story-viz" aria-hidden="true" style="overflow:hidden; position:relative; width: 100%; height: 180px; min-height: 180px; border-bottom: 1px solid var(--rule); display: flex; align-items: center; justify-content: center; background: var(--bg-card-h);">
        <img src="${story.heroImage}" alt="" style="width: 100%; height: 100%; object-fit: cover;" />
        <div style="position:absolute; bottom:12px; right:12px; background:rgba(0,0,0,0.4); backdrop-filter:blur(4px); color:#fff; padding:4px 8px; border-radius:4px; font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:.05em;">
          STORY ${String(idx + 1).padStart(2, "0")}
        </div>
      </div>`;
  }

  return `
    <div class="story-viz" aria-hidden="true" style="overflow:hidden; position:relative; width: 100%; height: 180px; min-height: 180px; border-bottom: 1px solid var(--rule); background: var(--bg-card-h);">
      <div style="position:absolute; bottom:12px; right:12px; background:rgba(0,0,0,0.4); backdrop-filter:blur(4px); color:#fff; padding:4px 8px; border-radius:4px; font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:.05em;">
        STORY ${String(idx + 1).padStart(2, "0")}
      </div>
    </div>`;
}



/* Sentiment detection for impact text (heuristic) */
function impactSentiment(text) {
  const t = (text || "").toLowerCase();
  const neg = /(loss|risk|threat|damage|decline|fall|drop|fail|crisis|burden|deficit|erode|harm|suffer|hurt|crash|collapse|cost|hit|sanction|tension|conflict|strain)/g;
  const pos = /(gain|win|benefit|grow|boost|rise|surge|profit|opportunity|stronger|advance|protect|secure|relief|recovery|invest)/g;
  const n = (t.match(neg) || []).length;
  const p = (t.match(pos) || []).length;
  if (p > n + 1) return { dir: "up", label: "Positive" };
  if (n > p + 1) return { dir: "down", label: "Negative" };
  return { dir: "mixed", label: "Mixed" };
}

function firstSentence(text = "", max = 170) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const sentence = clean.match(/^[^.!?]+[.!?]/)?.[0] || clean;
  return sentence.length > max ? sentence.slice(0, max - 1).trim() + "…" : sentence;
}
function metricScore(text = "", positiveWords = [], negativeWords = []) {
  const t = String(text || "").toLowerCase();
  const hit = words => words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
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
  return tiles.map(([k, label, text, cls]) => `
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
    ["benefit", "relief", "recovery"], ["war", "threat", "risk", "crisis", "collapse", "breach", "strike", "inflation"]);
  const impactScore = metricScore(story.stakeholder_impact?.map(x => x.impact).join(" ") || story.strategic_assessment,
    ["gain", "boost", "opportunity"], ["risk", "threat", "loss", "collapse", "strain", "inflation"]);
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
  ].filter(([, v]) => v);

  return [
    {
      id: "overview", label: "Situation", kicker: "CLASSIFIED BRIEFING", tone: "hero",
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
      id: "what", label: "5W1H", kicker: "FIELD NOTES", tone: "tiles",
      summary: `<h2>What Happened</h2><p>${esc(firstSentence(sa.what || story.tldr, 180))}</p><div class="intel-tile-grid">${intelligenceTiles(story)}</div>`,
      detail: `<h2>Full 5W1H Intelligence</h2><div class="intel-report-grid">
        ${[["What", sa.what], ["Who", sa.who], ["When", sa.when], ["Where", sa.where], ["Why", sa.why], ["How", sa.how]].filter(([, v]) => v).map(([k, v]) => `
          <section><strong>${k}</strong><p>${esc(v)}</p></section>`).join("")}
      </div>`
    },
    {
      id: "timeline", label: "Timeline", kicker: "EVENT REEL", tone: "timeline",
      summary: `<h2>Timeline</h2><p>${esc(firstSentence(timelineItems[0]?.event || story.context_background || story.tldr, 170))}</p>
        <div class="story-reel">${timelineItems.slice(0, 3).map((o, i) => `
          <article style="--i:${i}"><span>${esc(o.when)}</span><strong>${esc(firstSentence(o.event, 92))}</strong></article>`).join("")}</div>`,
      detail: `<h2>Event Sequence</h2><div class="intel-timeline">
        ${timelineItems.map((o, i) => `<article><b>${String(i + 1).padStart(2, "0")}</b><span>${esc(o.when)}</span><p>${esc(o.event)}</p></article>`).join("")}
      </div>`
    },
    {
      id: "map", label: "Network", kicker: "RELATIONSHIP MAP", tone: "map",
      summary: `${intelMap(story)}<h2>Relationship Map</h2><p>${esc(firstSentence(sa.who || story.context_background || story.tldr, 180))}</p>`,
      detail: `<h2>Network Reading</h2><p>${esc(sa.who || "The available briefing does not isolate a single actor network.")}</p><p>${esc(story.context_background || "")}</p>`
    },
    {
      id: "perspective", label: "Perspectives", kicker: "NARRATIVE SPLIT", tone: "matrix",
      summary: `<h2>Perspective Matrix</h2><div class="mobile-spectrum"><span>Left</span><b></b><span>Right</span></div>
        <div class="matrix-chips">${perspectiveItems.slice(0, 3).map(([k, v, cls]) => `<article class="${cls}"><strong>${k}</strong><p>${esc(firstSentence(v, 104))}</p></article>`).join("")}</div>`,
      detail: `<h2>Competing Readings</h2><div class="matrix-deep">
        ${perspectiveItems.map(([k, v, cls]) => `<section class="${cls}"><strong>${k}</strong><p>${esc(v)}</p></section>`).join("")}
      </div>`
    },
    {
      id: "facts", label: "Evidence", kicker: "FACTS VS CLAIMS", tone: "evidence",
      summary: `<h2>Evidence Split</h2><div class="evidence-split">
        <article><span>Facts</span><strong>${facts.facts?.length || 0}</strong><p>${esc(firstSentence(facts.facts?.[0] || "No verified fact list provided.", 100))}</p></article>
        <article><span>Claims</span><strong>${facts.claims?.length || 0}</strong><p>${esc(firstSentence(facts.claims?.[0] || "No contested claim list provided.", 100))}</p></article>
      </div>`,
      detail: `<h2>Evidence Ledger</h2><div class="ledger">
        <section><strong>Verified Facts</strong>${(facts.facts || []).map(x => `<p>${esc(x)}</p>`).join("")}</section>
        <section><strong>Claims</strong>${(facts.claims || []).map(x => `<p>${esc(x)}</p>`).join("")}</section>
      </div>`
    },
    {
      id: "impact", label: "Impact", kicker: "STAKEHOLDER RISK", tone: "impact",
      summary: `<h2>Stakeholder Impact</h2><div class="impact-radar" style="--impact:${impactScore}%"><strong>${impactScore}</strong><span>impact</span></div>
        <p>${esc(firstSentence(story.stakeholder_impact?.[0]?.impact || story.strategic_assessment, 180))}</p>`,
      detail: `<h2>Impact Assessment</h2><div class="impact-deep">
        ${(story.stakeholder_impact || []).map(o => `<section><strong>${esc(o.stakeholder)}</strong><p>${esc(o.impact)}</p></section>`).join("") || `<p>${esc(story.strategic_assessment || "")}</p>`}
      </div>`
    },
    {
      id: "context", label: "Context", kicker: "ARCHIVE BACKDROP", tone: "context",
      summary: `<h2>Historical Context</h2><p>${esc(firstSentence(story.context_background || story.simple_explanation, 190))}</p>`,
      detail: `<h2>Background File</h2><p>${esc(story.context_background || "")}</p><h2>Plain Terms</h2><p>${esc(story.simple_explanation || "")}</p>`
    },
    {
      id: "sources", label: "Sources", kicker: "SOURCE ANALYSIS", tone: "sources",
      summary: `<h2>Source Analysis</h2>${sourceDistribution(sources)}<p>Source transparency and outlet leanings are detailed below.</p>`,
      detail: `<h2>Transparency Log</h2><p>Attributed sources used in this briefing:</p><ul class="mobile-source-list">
        ${sources.map(src => `<li><span class="${leanClass(src.lean)}"></span><a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.outlet)}</a><em>${esc(src.lean)} · ${esc(src.region)}</em></li>`).join("")}
      </ul>`
    },
    {
      id: "strategy", label: "Strategy", kicker: "STRATEGIC ASSESSMENT", tone: "strategy",
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
  const region = (s.region || "global").toLowerCase();
  const sourceCount = (s.sources || []).length;
  const readMin = readMinutes(s);

  // 1 · Cover
  const coverVisualHtml = s.heroImage
    ? `<div class="slide-cover-visual"><img src="${s.heroImage}" alt="" style="width: 100%; height: 100%; object-fit: cover;" /></div>`
    : "";

  slides.push({
    id: "cover", label: "Overview", icon: "◉", html: `
    <div class="slide-cover">
      ${coverVisualHtml}
      <div class="slide-cover-content">
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
  const wIcons = { "WHAT": "▣", "WHY": "?", "WHO": "◉", "WHEN": "⏱", "WHERE": "⌖", "HOW": "⚙" };
  if (sa) slides.push({
    id: "situational", label: "Situational Analysis", icon: "⬡", html: `
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.hex}</span>Situational Analysis (5W1H)</div>
      <div class="w-list">
        ${[["WHAT", sa.what], ["WHY", sa.why], ["WHO", sa.who], ["WHEN", sa.when], ["WHERE", sa.where], ["HOW", sa.how]]
        .filter(([, v]) => v).map(([k, v]) => `
          <div class="w-item">
            <div class="w-keyrow">
              <span class="w-glyph" data-k="${k}">${wIcons[k] || "·"}</span>
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
      { cls: "region-in", label: "Indian View", glyph: "IN", view: pm?.indian_media },
      { cls: "region-wi", label: "International View", glyph: "WW", view: pm?.western_international || pm?.global_media },
    ].filter(p => p.view);
    const polLeft = pm?.left_leaning;
    const polRight = pm?.right_leaning;
    const expert = ei?.analysis;

    slides.push({
      id: "perspectives", label: "Perspective Matrix", icon: "⊞", html: `
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
  if (fc) slides.push({
    id: "facts", label: "Facts & Claims", icon: "⊛", html: `
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.fact}</span>Facts & Contested Claims</div>
      <div class="fc-slide">
        <div class="fc-half facts">
          <div class="fc-title">✓ Verified Facts</div>
          <ul>${(fc.facts || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
        </div>
        <div class="fc-half claims">
          <div class="fc-title">⚠ Claims / Disputed Narratives</div>
          <ul>${(fc.claims || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
        </div>
      </div>
    </div>`
  });

  // 5. Impact Analysis
  const arrowSvg = {
    up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 14 12 8 18 14"/></svg>`,
    down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 10 12 16 18 10"/></svg>`,
    mixed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="18" y2="12"/><polyline points="14 8 18 12 14 16"/></svg>`,
  };
  if (s.stakeholder_impact?.length) slides.push({
    id: "impact", label: "Impact", icon: "◎", html: `
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.impact}</span>Impact Analysis</div>
      <div class="impact-cards">
        ${(s.stakeholder_impact || []).map(o => {
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
  if (s.context_background || s.timeline?.length) slides.push({
    id: "context", label: "Historical Context", icon: "⊙", html: `
    <div class="slide-body">
      <div class="slide-section-label"><span class="ssl-icon">${ICON.timeline}</span>Historical Context</div>
      ${s.context_background ? `<p class="slide-prose" style="margin-bottom:24px;">${esc(s.context_background)}</p>` : ""}
      ${s.timeline?.length ? `
      <div class="timeline-list">
        ${s.timeline.map(o => `
          <div class="tl-item">
            <div class="tl-when">${esc(o.when)}</div>
            <div class="tl-event">${esc(o.event)}</div>
          </div>`).join("")}
      </div>` : ""}
    </div>`
  });

  // 7. Blind Spots & Sources
  slides.push({
    id: "blindspot", label: "Blind Spots", icon: "⚑", html: `
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
          ${(s.sources || []).map(src => `
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
      <a class="mobile-back" href="${BASE_PATH}/briefings/day/${esc(date)}">
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
  let storyCompleted = false;
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

    if (activeTabIdx === allSlides.length - 1 && !storyCompleted) {
      storyCompleted = true;
      trackEvent("story_complete", "Engagement", s.headline);
    }

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
          navigate(`${BASE_PATH}/briefings/day/${date}`);
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
      navigate(`${BASE_PATH}/briefings/day/${date}`);
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
      const url = getShareUrl("copy_link");
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
      const url = encodeURIComponent(getShareUrl("twitter"));
      const text = encodeURIComponent(`Check out this deep dive: "${s.headline}" on The Briefing`);
      trackEvent("share_action", "Engagement", "Twitter X", s.headline);
      window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, "_blank");
    });
  });

  // Share WA
  container.querySelectorAll(".share-wa").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = encodeURIComponent(getShareUrl("whatsapp"));
      const text = encodeURIComponent(`Check out this deep dive: "${s.headline}" on The Briefing - `);
      trackEvent("share_action", "Engagement", "WhatsApp", s.headline);
      window.open(`https://api.whatsapp.com/send?text=${text}${url}`, "_blank");
    });
  });

  // Share LI (for desktop / general)
  container.querySelectorAll(".share-li").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = encodeURIComponent(getShareUrl("linkedin"));
      trackEvent("share_action", "Engagement", "LinkedIn", s.headline);
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
    });
  });

  // Native share (mobile only)
  container.querySelector(".share-native")?.addEventListener("click", () => {
    const url = getShareUrl("native_share");
    trackEvent("share_action", "Engagement", "Native Share", s.headline);
    if (navigator.share) {
      navigator.share({
        title: s.headline,
        text: `Check out this deep dive on The Briefing: "${s.headline}"`,
        url: url
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
      <span class="sidebar-num">${String(i + 1).padStart(2, "0")}</span>
      <span class="sidebar-title">${esc(st.headline)}</span>
    </button>`).join("");

  // Cover slide is shown as headline+tldr above; skip it in the section list.
  // Magazine layout: top is 2-col flex masonry, deep sections span full width.
  const sections = slides.filter(sl => sl.id !== "cover");
  const fullWidthIds = new Set(["context", "blindspot"]);
  // Estimated content density per section type for balanced 2-col distribution
  const weight = { "exec_summary": 3, "situational": 6, "perspectives": 6, "facts": 3, "impact": 4, "context": 4, "blindspot": 4 };
  const grid = sections.filter(s => !fullWidthIds.has(s.id));
  const fullWidth = sections.filter(s => fullWidthIds.has(s.id));

  // Sort by weight desc, then greedy place into shorter column
  const sorted = [...grid].sort((a, b) => (weight[b.id] || 3) - (weight[a.id] || 3));
  const colA = [], colB = [];
  let sumA = 0, sumB = 0;
  for (const sl of sorted) {
    const w = weight[sl.id] || 3;
    if (sumA <= sumB) { colA.push(sl); sumA += w; }
    else { colB.push(sl); sumB += w; }
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
          ${s.heroImage ? `<div class="desktop-cover-visual" style="border-radius: 12px; overflow: hidden; height: 320px; margin-bottom: 24px; display: block;"><img src="${s.heroImage}" alt="" style="width: 100%; height: 100%; object-fit: cover;" /></div>` : ""}
          <div class="dossier-copy">
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
          ${storyIdx > 0 ? `<a class="story-nav-btn prev" href="${BASE_PATH}/story/${date}/${stories[storyIdx - 1].id}">← ${esc(stories[storyIdx - 1].headline.slice(0, 50))}…</a>` : "<span></span>"}
          ${storyIdx < stories.length - 1 ? `<a class="story-nav-btn next" href="${BASE_PATH}/story/${date}/${stories[storyIdx + 1].id}">${esc(stories[storyIdx + 1].headline.slice(0, 50))}… →</a>` : "<span></span>"}
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

  // Set up intersection observer to track story completion on desktop
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          trackEvent("story_complete", "Engagement", s.headline);
          observer.disconnect();
        }
      });
    }, { threshold: 0.1 });

    setTimeout(() => {
      const target = wrap.querySelector(".desktop-story-nav");
      if (target) observer.observe(target);
    }, 500);
  }

  return wrap;
}

/* ══════════════════════════════════════════════════════════════
   HOME PAGE
   ══════════════════════════════════════════════════════════════ */
async function renderHome(date) {
  updateModeToggleUI();

  await loadIndex();
  if (!date) date = indexEntries.find(x => x.count > 0)?.date || indexEntries[0]?.date;
  if (!date) { app.innerHTML = `<div class="error-state">No briefings yet.</div>`; return; }

  const payload = await loadDay(date);
  const isLatest = date === indexEntries[0]?.date;

  const pageTitle = isLatest ? "The Briefing — Daily News, Decoded" : `The Briefing — Archive ${fmtHeaderDate(date)}`;
  const pagePath = isLatest ? "/" : `/briefings/day/${date}`;
  trackPageView(pagePath, pageTitle);

  const hdrDateEl = $("header-date");
  if (hdrDateEl) hdrDateEl.textContent = fmtHeaderDate(date).toUpperCase();
  const sel = $("archive-select");
  if (sel) sel.value = date;

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

  const cards = payload.stories.map((s, i) => {
    const region = (s.region || "global").toLowerCase();
    const readMin = readMinutes(s);
    return `
      <div class="story-card" data-id="${esc(s.id)}" data-date="${esc(date)}"
           data-region="${esc(region)}" role="button" tabindex="0">
        ${storyVisual(s, i)}
        <div class="card-accent"></div>
        <div class="card-body">
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
  `;

  app.querySelectorAll(".story-card").forEach(card => {
    const go = () => {
      trackEvent("click_brief_card", "Home Grid", card.dataset.id);
      navigate(`${BASE_PATH}/story/${card.dataset.date}/${card.dataset.id}`);
    };
    card.onclick = go;
    card.onkeydown = e => { if (e.key === "Enter" || e.key === " ") go(); };
  });



  app.querySelector(".past-day-banner a")?.addEventListener("click", e => {
    e.preventDefault();
    trackEvent("click_archive_banner_back", "Home Grid", "Back to Today");
    navigate(`${BASE_PATH}/briefings`);
  });

  stopProgress();
  window.scrollTo(0, 0);
}



/* ══════════════════════════════════════════════════════════════
   STORY ROUTE
   ══════════════════════════════════════════════════════════════ */
async function renderStory(date, id) {
  updateModeToggleUI();

  await loadIndex();
  const payload = await loadDay(date);
  const stories = payload.stories;
  const storyIdx = stories.findIndex(x => x.id === id);
  if (storyIdx === -1) { app.innerHTML = `<div class="error-state">Story not found.</div>`; return; }
  const s = adaptStory(stories[storyIdx]);

  const pageTitle = `The Briefing | ${s.headline}`;
  const pagePath = `/story/${date}/${id}`;
  trackPageView(pagePath, pageTitle);

  const hdrDateEl = $("header-date");
  if (hdrDateEl) hdrDateEl.textContent = fmtHeaderDate(date).toUpperCase();
  const sel = $("archive-select");
  if (sel) sel.value = date;
  $("hero").classList.add("hidden");

  // Build unified vertical layout
  app.innerHTML = "";

  const articleContainer = document.createElement("div");
  articleContainer.className = "longform-article-container";

  const firstSourceUrl = s.heroImage || (s.sources?.[0]?.url);

  const urlParams = new URLSearchParams(window.location.search);
  const fromSaved = urlParams.get('from') === 'saved';

  let backLink = `${BASE_PATH}/briefings`;
  let backLabel = "Back to Today's Deep Dives";
  let kickerLabel = "";
  let prevStoryLink = `<div class="story-nav-empty"></div>`;
  let nextStoryLink = `<div class="story-nav-empty"></div>`;

  if (fromSaved) {
    backLink = `${BASE_PATH}/saved`;
    backLabel = "Back to Saved Items";

    const savedList = getSavedStories().filter(x => x.sections !== undefined);
    const savedIdx = savedList.findIndex(x => x.id === id);
    kickerLabel = `SAVED DEEP DIVE`;

    if (savedIdx >= 0) {
      if (savedIdx > 0) {
        const prevS = savedList[savedIdx - 1];
        prevStoryLink = `
          <a class="story-nav-card prev" href="${BASE_PATH}/story/${prevS.date}/${prevS.id}?from=saved">
            <span class="story-nav-label">&larr; Previous Saved</span>
            <span class="story-nav-title">${esc(prevS.headline)}</span>
          </a>
        `;
      }
      if (savedIdx < savedList.length - 1) {
        const nextS = savedList[savedIdx + 1];
        nextStoryLink = `
          <a class="story-nav-card next" href="${BASE_PATH}/story/${nextS.date}/${nextS.id}?from=saved">
            <span class="story-nav-label">Next Saved &rarr;</span>
            <span class="story-nav-title">${esc(nextS.headline)}</span>
          </a>
        `;
      }
    }
  } else {
    if (storyIdx > 0) {
      prevStoryLink = `
        <a class="story-nav-card prev" href="${BASE_PATH}/story/${date}/${stories[storyIdx - 1].id}">
          <span class="story-nav-label">&larr; Previous Story</span>
          <span class="story-nav-title">${esc(stories[storyIdx - 1].headline)}</span>
        </a>
      `;
    }
    if (storyIdx < stories.length - 1) {
      nextStoryLink = `
        <a class="story-nav-card next" href="${BASE_PATH}/story/${date}/${stories[storyIdx + 1].id}">
          <span class="story-nav-label">Next Story &rarr;</span>
          <span class="story-nav-title">${esc(stories[storyIdx + 1].headline)}</span>
        </a>
      `;
    }
  }

  s.date = date;
  const isBookmarked = getSavedStories().some(x => x.id === id);

  const totalWords = (s.headline + " " + s.overview + " " + s.inPlainEnglish + " " + s.sections.map(sec => sec.title + " " + sec.content).join(" ")).split(/\s+/).length;
  const totalReadingTime = Math.max(1, Math.round(totalWords / 200));

  articleContainer.innerHTML = `
    <article class="longform-article">
      <div class="article-back-row">
        <a href="${backLink}" class="article-back-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12" style="vertical-align: -1px; margin-right: 4px;"><polyline points="15 18 9 12 15 6"/></svg>
          ${esc(backLabel)}
        </a>
      </div>
      ${kickerLabel ? `
      <div class="article-kicker-row">
        <span>${esc(kickerLabel)}</span>
      </div>` : ""}

      <h1 class="article-headline">${esc(s.headline)}</h1>
      ${s.subtitle ? `<p class="article-subtitle">${esc(s.subtitle)}</p>` : ""}
      
      <div class="article-meta">
        <span>${fmtHeaderDate(date)}</span>
        <span>&middot;</span>
        <span>${totalReadingTime} min read</span>
        <div class="article-meta-actions" style="margin-left: auto; display: flex; align-items: center; gap: 16px;">
          <button class="article-bookmark-btn ${isBookmarked ? 'saved' : ''}" id="article-bookmark-btn" aria-label="Save this story">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>${isBookmarked ? 'Saved' : 'Save'}</span>
          </button>
          <button class="article-share-btn" id="article-share-btn" aria-label="Share this story" style="margin-left: 0;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <span>Share</span>
          </button>
        </div>
      </div>

      <div id="article-hero-container">
        <div class="hero-image-loading">
          Loading imagery...
        </div>
      </div>

      <div class="article-overview">
        ${s.overview.split("\n\n").map(p => `<p>${esc(p)}</p>`).join("")}
      </div>

      ${s.inPlainEnglish ? `
        <div class="article-in-plain-english">
          <div class="article-in-plain-english-label">In Plain English</div>
          <p>${esc(s.inPlainEnglish)}</p>
        </div>
      ` : ""}

      <div class="article-chapters">
        ${s.sections.map(sec => `
          <section class="article-chapter">
            <h2 class="chapter-title">${esc(sec.title)}</h2>
            <div class="chapter-content">
              ${sec.content.split("\n\n").map(p => `<p>${esc(p)}</p>`).join("")}
            </div>
          </section>
        `).join("")}
      </div>

      ${s.conclusion ? `
        <div class="article-conclusion">
          <h3 class="conclusion-title">Conclusion</h3>
          <div class="conclusion-content">
            ${s.conclusion.split("\n\n").map(p => `<p>${esc(p)}</p>`).join("")}
          </div>
        </div>
      ` : ""}

      <div class="article-sources">
        <h3 class="sources-title">Sources</h3>
        <div class="sources-grid">
          ${s.sources.map(src => `
            <div class="source-card">
              <div class="source-card-info">
                <h4 class="source-card-name">${esc(src.outlet)}</h4>
                <p class="source-card-desc">${esc(src.title)}</p>
              </div>
              ${src.url ? `<a href="${esc(cleanSourceUrl(src.url) || src.url)}" target="_blank" rel="noopener noreferrer" class="source-card-link">Link &rarr;</a>` : ''}
            </div>
          `).join("")}
        </div>
      </div>

      <nav class="story-bottom-nav">
        ${prevStoryLink}
        ${nextStoryLink}
      </nav>
    </article>
  `;

  app.appendChild(articleContainer);

  articleContainer.querySelectorAll(".story-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const direction = btn.classList.contains("next") ? "Next Story" : "Prev Story";
      trackEvent("navigate_button", "Desktop Navigation", direction);
    });
  });

  articleContainer.querySelector("#article-share-btn")?.addEventListener("click", () => {
    const url = `${window.location.origin}${BASE_PATH}${pagePath}`;
    trackEvent("share_action", "Engagement", "Open Share Sheet", s.headline);
    openShareSheet(url, s.headline, "deep dive");
  });

  articleContainer.querySelector("#article-bookmark-btn")?.addEventListener("click", () => {
    const isSaved = toggleBookmark(s);
    const btn = articleContainer.querySelector("#article-bookmark-btn");
    if (btn) {
      btn.classList.toggle("saved", isSaved);
      const svg = btn.querySelector("svg");
      if (svg) svg.setAttribute("fill", isSaved ? "currentColor" : "none");
      const span = btn.querySelector("span");
      if (span) span.textContent = isSaved ? "Saved" : "Save";
    }
  });

  startScrollProgress(totalReadingTime);

  if (s.heroImage) {
    setArticleHeroImage(s.heroImage);
  } else if (firstSourceUrl && firstSourceUrl.startsWith("http")) {
    getHeroImage(firstSourceUrl).then(imgUrl => {
      if (imgUrl) {
        s.heroImage = imgUrl;
        setArticleHeroImage(imgUrl);
      } else {
        document.getElementById("article-hero-container").style.display = "none";
      }
    });
  } else {
    document.getElementById("article-hero-container").style.display = "none";
  }

  window.scrollTo(0, 0);
}

async function findFlashStoryDate(storyId) {
  if (flashStories && flashStories.some(s => s.id === storyId)) {
    return flashStories.loadedDate;
  }
  const latestDate = indexEntries.length > 0 ? indexEntries[0].date : null;
  try {
    const latestStories = await loadFlash(latestDate);
    if (latestStories.some(s => s.id === storyId)) return latestDate;
  } catch (e) { }

  for (let i = 1; i < indexEntries.length; i++) {
    const d = indexEntries[i].date;
    try {
      const r = await fetch(`${BASE_PATH ? BASE_PATH + "/" : ""}data/flash-${d}.json`);
      if (r.ok) {
        const stories = await r.json();
        if (stories.some(s => s.id === storyId)) {
          return d;
        }
      }
    } catch (e) { }
  }
  return null;
}

/* ── Router ────────────────────────────────────────────────── */
async function route() {
  window.isViewingSavedFlashes = false;
  let p = location.pathname;
  if (p.endsWith("/index.html")) {
    p = p.slice(0, -11);
  }
  p = p.replace(/\/+$/, "") || "/";
  if (BASE_PATH && p.startsWith(BASE_PATH)) {
    p = p.slice(BASE_PATH.length) || "/";
  }
  p = p.replace(/\/+$/, "") || "/";

  // Check if hash-based flash routing is present
  const hash = location.hash;
  if (hash.startsWith("#flash-")) {
    const storyId = hash.slice(7);
    currentMode = "flash";
    updateModeToggleUI();
    app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
    $("hero").classList.add("hidden");
    stopProgress();
    try {
      await loadIndex();
      const storyDate = await findFlashStoryDate(storyId);
      if (storyDate) {
        await loadFlash(storyDate);
        const index = flashStories.findIndex(fs => fs.id === storyId);
        if (index >= 0) {
          currentFlashIndex = index;
          selectedFlashStoryId = storyId;
        }
        await renderFlashView(storyDate);

        // Scroll or highlight if desktop
        const isDesktop = window.innerWidth >= 992;
        if (isDesktop) {
          setTimeout(() => {
            const card = document.querySelector(`[data-id="${storyId}"]`);
            if (card) {
              card.scrollIntoView({ behavior: "smooth", block: "center" });
              card.classList.add("highlighted");
              setTimeout(() => card.classList.remove("highlighted"), 2000);
            }
          }, 300);
        }
        return;
      }
    } catch (err) {
      console.error("Hash routing failed:", err);
    }
  }

  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
  $("hero").classList.add("hidden");
  stopProgress();
  try {
    await loadIndex();
    if (flashStories.length === 0) {
      try { await loadFlash(); } catch (e) { console.error("Preloading flash failed:", e); }
    }

    const flashStoryMatch = p.match(/^\/flash\/story\/([^/]+)$/);
    const storyMatch = p.match(/^\/story\/([^/]+)\/(.+)$/);
    const briefingsDayMatch = p.match(/^\/briefings\/day\/([^/]+)$/);
    const flashDayMatch = p.match(/^\/flash\/day\/([^/]+)$/);

    if (flashStoryMatch) {
      const storyId = decodeURIComponent(flashStoryMatch[1]);
      currentMode = "flash";
      updateModeToggleUI();

      const urlParams = new URLSearchParams(window.location.search);
      const fromSaved = urlParams.get('from') === 'saved';

      if (fromSaved) {
        window.isViewingSavedFlashes = true;
        const savedFlashes = getSavedStories().filter(s => s.sections === undefined);
        flashStories = savedFlashes;
        flashStories.loadedDate = null;

        const index = flashStories.findIndex(fs => fs.id === storyId);
        if (index >= 0) {
          currentFlashIndex = index;
          selectedFlashStoryId = storyId;
        }
        await renderFlashView(null);
        return;
      }

      const storyDate = await findFlashStoryDate(storyId);
      if (storyDate) {
        await loadFlash(storyDate);
        const index = flashStories.findIndex(fs => fs.id === storyId);
        if (index >= 0) {
          currentFlashIndex = index;
          selectedFlashStoryId = storyId;
        }
        await renderFlashView(storyDate);

        // Scroll or highlight if desktop
        const isDesktop = window.innerWidth >= 992;
        if (isDesktop) {
          setTimeout(() => {
            const card = document.querySelector(`[data-id="${storyId}"]`);
            if (card) {
              card.scrollIntoView({ behavior: "smooth", block: "center" });
              card.classList.add("highlighted");
              setTimeout(() => card.classList.remove("highlighted"), 2000);
            }
          }, 300);
        }
        return;
      }
    }

    if (storyMatch) {
      currentMode = "briefing";
      updateModeToggleUI();
      return await renderStory(decodeURIComponent(storyMatch[1]), decodeURIComponent(storyMatch[2]));
    }

    if (briefingsDayMatch) {
      currentMode = "briefing";
      updateModeToggleUI();
      return await renderHome(decodeURIComponent(briefingsDayMatch[1]));
    }

    if (flashDayMatch) {
      currentMode = "flash";
      updateModeToggleUI();
      return await renderFlashView(decodeURIComponent(flashDayMatch[1]));
    }

    if (p === "/saved") {
      stopProgress();
      $("hero").classList.add("hidden");
      await renderSavedPage();
      return;
    }

    if (p === "/install") {
      stopProgress();
      $("hero").classList.add("hidden");
      renderInstallPage();
      return;
    }

    if (p === "/flash") {
      currentMode = "flash";
      updateModeToggleUI();
      return await renderFlashView(null);
    }

    if (p === "/briefings") {
      currentMode = "briefing";
      updateModeToggleUI();
      return await renderHome(null);
    }

    if (p === "/" || p === "") {
      updateModeToggleUI();
      if (currentMode === "flash") {
        return await renderFlashView(null);
      }
      return await renderHome(null);
    }

    // Compatibility fallback for old /day/YYYY-MM-DD route
    const oldDayMatch = p.match(/^\/day\/([^/]+)$/);
    if (oldDayMatch) {
      const selectedDate = decodeURIComponent(oldDayMatch[1]);
      if (currentMode === "flash") {
        navigate(`${BASE_PATH}/flash/day/${selectedDate}`);
      } else {
        navigate(`${BASE_PATH}/briefings/day/${selectedDate}`);
      }
      return;
    }

    navigate(`${BASE_PATH}/briefings`);
  } catch (e) {
    stopProgress();
    app.innerHTML = `<div class="error-state">Couldn't load · ${esc(e.message)}</div>`;
  }
}

/* ══════════════════════════════════════════════════════════════
   ⚡ FLASH LAYOUT & INTERACTION ENGINE
   ══════════════════════════════════════════════════════════════ */
const FLASH_COLORS = {
  all: '#FF5722',
  india: '#FF5722',
  world: '#3B82F6',
  global: '#3B82F6',
  ai: '#06B6D4',
  'ai-tech': '#06B6D4',
  politics: '#8B5CF6',
  business: '#22C55E',
  economics: '#22C55E',
  sports: '#F97316',
  entertainment: '#EC4899',
  culture: '#A78BFA',
  science: '#F59E0B',
  health: '#34D399'
};

const FLASH_LABELS = {
  all: 'All',
  india: 'India',
  world: 'Global',
  global: 'Global',
  ai: 'AI & Tech',
  'ai-tech': 'AI & Tech',
  politics: 'Politics',
  business: 'Economics',
  economics: 'Economics',
  sports: 'Sports',
  entertainment: 'Entertainment',
  culture: 'Culture',
  science: 'Science',
  health: 'Health'
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

function getFlashIllustration(cat, storyId, indexOverride = null) {
  let c = (cat || "").toLowerCase();
  if (c === "world") c = "global";
  if (c === "business") c = "economics";
  if (c === "ai") c = "ai-tech";
  if (c === "tech") c = "ai-tech";

  const idx = indexOverride !== null ? indexOverride : Math.abs(hashStr(storyId || "default")) % 4;
  const common = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

  const library = {
    india: [
      `<circle cx="100" cy="100" r="45" ${common} />
       <circle cx="100" cy="100" r="6" fill="currentColor" />
       <path d="M 100 55 L 100 145 M 55 100 L 145 100 M 68 68 L 132 132 M 68 132 L 132 68 M 83 60 L 117 140 M 83 140 L 117 60 M 60 83 L 140 117 M 60 117 L 140 83" ${common} />`,
      `<path d="M 100 140 C 70 120, 50 100, 50 80 C 50 60, 70 75, 100 110 C 130 75, 150 60, 150 80 C 150 100, 130 120, 100 140 Z M 100 140 C 85 110, 80 90, 100 60 C 120 90, 115 110, 100 140 Z M 100 140 C 80 135, 70 130, 65 120 C 60 105, 80 115, 100 125 C 120 115, 140 105, 135 120 C 130 130, 120 135, 100 140 Z" ${common} />`,
      `<path d="M 60 150 L 60 65 L 75 50 L 125 50 L 140 65 L 140 150 M 80 150 L 80 95 C 80 85, 120 85, 120 95 L 120 150 M 55 65 L 145 65 M 70 50 L 130 50" ${common} />
       <line x1="50" y1="135" x2="150" y2="135" ${common} />`,
      `<path d="M 50 70 Q 100 45, 150 70 M 50 100 Q 100 75, 150 100 M 50 130 Q 100 105, 150 130 M 75 60 L 125 60 M 75 90 L 125 90 M 75 120 L 125 120" ${common} />`
    ],
    global: [
      `<circle cx="100" cy="100" r="45" ${common} />
       <ellipse cx="100" cy="100" rx="45" ry="16" ${common} />
       <ellipse cx="100" cy="100" rx="16" ry="45" ${common} />
       <line x1="55" y1="100" x2="145" y2="100" ${common} />
       <line x1="100" y1="55" x2="100" y2="145" ${common} />`,
      `<circle cx="65" cy="75" r="5" fill="currentColor" />
       <circle cx="135" cy="70" r="5" fill="currentColor" />
       <circle cx="100" cy="135" r="5" fill="currentColor" />
       <circle cx="90" cy="60" r="3" fill="currentColor" />
       <circle cx="130" cy="120" r="3" fill="currentColor" />
       <line x1="65" y1="75" x2="135" y2="70" ${common} />
       <line x1="65" y1="75" x2="100" y2="135" ${common} />
       <line x1="135" y1="70" x2="100" y2="135" ${common} />
       <line x1="90" y1="60" x2="65" y2="75" ${common} />
       <line x1="130" y1="120" x2="100" y2="135" ${common} />
       <line x1="130" y1="120" x2="135" y2="70" ${common} />`,
      `<circle cx="100" cy="100" r="45" ${common} />
       <polygon points="100,60 112,100 100,140 88,100" ${common} />
       <line x1="55" y1="100" x2="145" y2="100" ${common} />
       <line x1="100" y1="55" x2="100" y2="145" ${common} stroke-dasharray="2 3" />`,
      `<ellipse cx="100" cy="100" rx="50" ry="20" transform="rotate(30 100 100)" ${common} />
       <ellipse cx="100" cy="100" rx="50" ry="20" transform="rotate(-30 100 100)" ${common} />
       <circle cx="100" cy="100" r="8" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`
    ],
    politics: [
      `<polygon points="100,45 50,75 150,75" ${common} />
       <rect x="60" y="75" width="12" height="65" ${common} />
       <rect x="94" y="75" width="12" height="65" ${common} />
       <rect x="128" y="75" width="12" height="65" ${common} />
       <rect x="45" y="140" width="110" height="10" ${common} />`,
      `<rect x="65" y="80" width="70" height="65" rx="4" ${common} />
       <path d="M 85 80 L 85 55 L 115 55 L 115 80" ${common} />
       <line x1="90" y1="55" x2="110" y2="55" ${common} />
       <line x1="80" y1="105" x2="120" y2="105" ${common} />
       <line x1="80" y1="115" x2="110" y2="115" ${common} />`,
      `<line x1="100" y1="50" x2="100" y2="145" ${common} />
       <line x1="55" y1="70" x2="145" y2="70" ${common} />
       <path d="M 55 70 L 40 115 L 70 115 Z" ${common} />
       <path d="M 145 70 L 130 115 L 160 115 Z" ${common} />
       <line x1="80" y1="145" x2="120" y2="145" ${common} />`,
      `<rect x="60" y="100" width="30" height="50" ${common} />
       <rect x="110" y="85" width="30" height="65" ${common} />
       <path d="M 75 100 L 75 80 C 75 75, 85 75, 85 80" ${common} />
       <path d="M 125 85 L 125 65 C 125 60, 135 60, 135 65" ${common} />
       <circle cx="85" cy="80" r="3" fill="currentColor" />
       <circle cx="135" cy="65" r="3" fill="currentColor" />`
    ],
    economics: [
      `<rect x="60" y="115" width="16" height="35" ${common} />
       <rect x="92" y="85" width="16" height="65" ${common} />
       <rect x="124" y="55" width="16" height="95" ${common} />
       <path d="M 45 135 Q 75 110, 105 85 T 155 40" ${common} />
       <polyline points="142,40 155,40 155,53" ${common} />`,
      `<circle cx="100" cy="100" r="45" ${common} />
       <circle cx="100" cy="100" r="28" ${common} />
       <circle cx="100" cy="100" r="12" fill="currentColor" />
       <line x1="100" y1="45" x2="100" y2="155" ${common} stroke-dasharray="2 3" />
       <line x1="45" y1="100" x2="155" y2="100" ${common} stroke-dasharray="2 3" />`,
      `<circle cx="100" cy="100" r="40" ${common} stroke-dasharray="4 2" />
       <path d="M 85 85 L 115 85 M 100 85 L 100 115 M 85 100 L 115 100" ${common} />
       <path d="M 70 70 Q 100 40, 130 70" ${common} />
       <polyline points="120,68 130,70 128,60" ${common} />
       <path d="M 130 130 Q 100 160, 70 130" ${common} />
       <polyline points="80,132 70,130 72,140" ${common} />`,
      `<ellipse cx="100" cy="65" rx="35" ry="10" ${common} />
       <path d="M 65 65 L 65 92 A 35 10 0 0 0 135 92 L 135 65" ${common} />
       <path d="M 65 92 L 65 119 A 35 10 0 0 0 135 119 L 135 92" ${common} />
       <path d="M 65 119 L 65 142 A 35 10 0 0 0 135 142 L 135 119" ${common} />
       <line x1="100" y1="65" x2="100" y2="142" ${common} stroke-dasharray="1 4" />`
    ],
    'ai-tech': [
      `<rect x="65" y="65" width="70" height="70" rx="6" ${common} />
       <rect x="85" y="85" width="30" height="30" rx="2" ${common} />
       <path d="M 78 65 L 78 52 M 100 65 L 100 52 M 122 65 L 122 52 M 78 135 L 78 148 M 100 135 L 100 148 M 122 135 L 122 148 M 65 78 L 52 78 M 65 100 L 52 100 M 65 122 L 52 122 M 135 78 L 148 78 M 135 100 L 148 100 M 135 122 L 148 122" ${common} />`,
      `<circle cx="70" cy="70" r="5" fill="currentColor" />
       <circle cx="70" cy="130" r="5" fill="currentColor" />
       <circle cx="130" cy="70" r="5" fill="currentColor" />
       <circle cx="130" cy="130" r="5" fill="currentColor" />
       <circle cx="100" cy="100" r="8" ${common} />
       <line x1="75" y1="70" x2="125" y2="70" ${common} />
       <line x1="75" y1="130" x2="125" y2="130" ${common} />
       <line x1="70" y1="75" x2="70" y2="125" ${common} />
       <line x1="130" y1="75" x2="130" y2="125" ${common} />
       <line x1="74" y1="74" x2="94" y2="94" ${common} />
       <line x1="126" y1="74" x2="106" y2="94" ${common} />
       <line x1="74" y1="126" x2="94" y2="106" ${common} />
       <line x1="126" y1="126" x2="106" y2="106" ${common} />`,
      `<path d="M 60 85 L 140 85 C 145 85, 145 115, 140 115 L 125 115 C 120 115, 115 105, 100 105 C 85 105, 80 115, 75 115 L 60 115 C 55 115, 55 85, 60 85 Z" ${common} />
       <circle cx="80" cy="100" r="5" fill="currentColor" />
       <circle cx="120" cy="100" r="5" fill="currentColor" />
       <path d="M 50 100 L 55 100 M 145 100 L 150 100" ${common} />`,
      `<polyline points="75,70 55,100 75,130" ${common} />
       <polyline points="125,70 145,100 125,130" ${common} />
       <line x1="110" y1="65" x2="90" y2="135" ${common} />`
    ],
    science: [
      `<circle cx="100" cy="100" r="8" fill="currentColor" />
       <ellipse cx="100" cy="100" rx="48" ry="16" transform="rotate(30 100 100)" ${common} />
       <ellipse cx="100" cy="100" rx="48" ry="16" transform="rotate(-30 100 100)" ${common} />
       <ellipse cx="100" cy="100" rx="48" ry="16" transform="rotate(90 100 100)" ${common} />
       <circle cx="140" cy="120" r="3" fill="currentColor" />
       <circle cx="60" cy="80" r="3" fill="currentColor" />`,
      `<path d="M 85 50 L 115 50 M 90 50 L 90 80 L 60 140 C 55 150, 65 155, 75 155 L 125 155 C 135 155, 145 150, 140 140 L 110 80 L 110 50" ${common} />
       <line x1="70" y1="130" x2="130" y2="130" ${common} />
       <circle cx="85" cy="105" r="3" fill="currentColor" />
       <circle cx="110" cy="115" r="4" fill="currentColor" />`,
      `<path d="M 80 50 Q 100 75, 120 100 T 80 150" ${common} />
       <path d="M 120 50 Q 100 75, 80 100 T 120 150" ${common} />
       <line x1="90" y1="62" x2="110" y2="62" ${common} />
       <line x1="82" y1="87" x2="118" y2="87" ${common} />
       <line x1="82" y1="112" x2="118" y2="112" ${common} />
       <line x1="90" y1="137" x2="110" y2="137" ${common} />`,
      `<line x1="70" y1="130" x2="135" y2="65" ${common} stroke-width="3" />
       <line x1="100" y1="100" x2="80" y2="150" ${common} />
       <line x1="100" y1="100" x2="120" y2="150" ${common} />
       <polygon points="145,50 150,55 145,60 140,55" fill="currentColor" />
       <polygon points="120,40 123,43 120,46 117,43" fill="currentColor" />`
    ],
    sports: [
      `<circle cx="100" cy="100" r="45" ${common} />
       <polygon points="100,83 113,92 108,108 92,108 87,92" ${common} />
       <line x1="100" y1="83" x2="100" y2="55" ${common} />
       <line x1="113" y1="92" x2="139" y2="101" ${common} />
       <line x1="108" y1="108" x2="124" y2="131" ${common} />
       <line x1="92" y1="108" x2="76" y2="131" ${common} />
       <line x1="87" y1="92" x2="61" y2="101" ${common} />`,
      `<path d="M 70 50 L 130 50 L 125 100 C 120 120, 80 120, 75 100 Z" ${common} />
       <path d="M 100 120 L 100 145 M 80 145 L 120 145" ${common} />
       <path d="M 70 65 C 55 65, 55 90, 72 90 M 130 65 C 145 65, 145 90, 128 90" ${common} />`,
      `<path d="M 50 145 L 50 90 A 50 50 0 0 1 150 90 L 150 145 M 75 145 L 75 90 A 25 25 0 0 1 125 90 L 125 145" ${common} />
       <line x1="40" y1="145" x2="160" y2="145" ${common} />`,
      `<circle cx="100" cy="105" r="35" ${common} />
       <path d="M 90 70 L 110 70 M 100 70 L 100 60" ${common} />
       <line x1="100" y1="105" x2="118" y2="87" ${common} />
       <circle cx="125" cy="80" r="4" fill="currentColor" />`
    ],
    entertainment: [
      `<rect x="65" y="82" width="70" height="63" rx="4" ${common} />
       <line x1="65" y1="104" x2="135" y2="104" ${common} />
       <path d="M 65 82 L 135 68 L 132 58 L 65 72 Z" ${common} />
       <line x1="78" y1="79" x2="86" y2="70" ${common} />
       <line x1="98" y1="75" x2="106" y2="66" ${common} />
       <line x1="118" y1="71" x2="126" y2="62" ${common} />`,
      `<path d="M 70 50 Q 95 90, 70 115 T 90 150 M 110 50 Q 135 90, 110 115 T 130 150" ${common} />
       <line x1="72" y1="70" x2="112" y2="70" ${common} />
       <line x1="78" y1="95" x2="118" y2="95" ${common} />
       <line x1="72" y1="120" x2="112" y2="120" ${common} />`,
      `<path d="M 65 70 C 65 55, 135 55, 135 70 C 135 115, 100 135, 100 135 C 100 135, 65 115, 65 70 Z" ${common} />
       <circle cx="85" cy="85" r="4" fill="currentColor" />
       <circle cx="115" cy="85" r="4" fill="currentColor" />
       <path d="M 82 110 Q 100 125, 118 110" ${common} />`,
      `<circle cx="75" cy="120" r="8" fill="currentColor" />
       <circle cx="120" cy="110" r="8" fill="currentColor" />
       <line x1="83" y1="120" x2="83" y2="55" ${common} />
       <line x1="128" y1="110" x2="128" y2="45" ${common} />
       <polygon points="83,55 128,45 128,55 83,65" fill="currentColor" />`
    ],
    culture: [
      `<path d="M 60 110 C 60 70, 130 60, 140 100 C 145 125, 110 145, 80 140 C 65 138, 55 125, 60 110 Z" ${common} />
       <circle cx="80" cy="85" r="5" fill="currentColor" />
       <circle cx="110" cy="90" r="5" fill="currentColor" />
       <circle cx="95" cy="115" r="5" fill="currentColor" />
       <path d="M 130 70 L 65 135" ${common} stroke-width="3" />`,
      `<path d="M 100 50 L 78 110 L 78 145 L 122 145 L 122 110 Z" ${common} />
       <line x1="100" y1="50" x2="100" y2="110" ${common} />
       <circle cx="100" cy="110" r="3" fill="currentColor" />`,
      `<path d="M 100 140 C 75 125, 50 125, 45 135 L 45 65 C 50 55, 75 55, 100 70 C 125 55, 150 55, 155 65 L 155 135 C 150 125, 125 125, 100 140 Z" ${common} />
       <line x1="100" y1="70" x2="100" y2="140" ${common} />`,
      `<path d="M 80 50 L 120 50 M 90 50 Q 60 95, 90 130 L 90 145 L 110 145 L 110 130 Q 140 95, 110 50" ${common} />
       <ellipse cx="100" cy="95" rx="15" ry="6" ${common} />`
    ],
    health: [
      `<path d="M 80 60 L 80 100 A 20 20 0 0 0 120 100 L 120 60" ${common} />
       <circle cx="80" cy="55" r="4" fill="currentColor" />
       <circle cx="120" cy="55" r="4" fill="currentColor" />
       <path d="M 100 120 L 100 142 A 20 20 0 0 0 120 142" ${common} />
       <circle cx="125" cy="142" r="6" ${common} />`,
      `<path d="M 100 145 C 50 105, 40 70, 70 50 C 90 35, 100 60, 100 60 C 100 60, 110 35, 130 50 C 160 70, 150 105, 100 145 Z" ${common} />
       <polyline points="65,95 85,95 92,75 100,115 108,85 115,95 135,95" ${common} />`,
      `<path d="M 60 60 L 140 60 L 140 100 C 140 135, 100 155, 100 155 C 100 155, 60 135, 60 100 Z" ${common} />
       <path d="M 100 80 L 100 120 M 80 100 L 120 100" ${common} />`,
      `<path d="M 100 50 C 60 80, 60 130, 100 150 C 140 130, 140 80, 100 50 Z" ${common} />
       <path d="M 100 50 L 100 150 M 100 90 Q 75 80, 75 80 M 100 110 Q 125 100, 125 100" ${common} />`
    ]
  };

  const icons = library[c] || library['global'];
  return `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%;">
    ${icons[idx]}
  </svg>`;
}

function openShareSheet(url, headline, contentType = "Flash news") {
  const modal = $("share-sheet-modal");
  if (!modal) return;

  modal.classList.add("active");

  const wa = $("share-opt-wa");
  const x = $("share-opt-x");
  const copy = $("share-opt-copy");
  const native = $("share-opt-native");
  const backdrop = $("share-sheet-backdrop");
  const closeBtn = $("share-sheet-close");

  const closeSheet = () => modal.classList.remove("active");
  backdrop.onclick = closeSheet;
  closeBtn.onclick = closeSheet;

  if (wa) {
    wa.onclick = () => {
      const shareUrl = encodeURIComponent(getShareUrl("whatsapp", url));
      const text = encodeURIComponent(`Check out this ${contentType} on The Briefing: "${headline}" - `);
      if (typeof trackEvent === 'function') trackEvent("share_action", "Engagement", "WhatsApp", headline);
      window.open(`https://api.whatsapp.com/send?text=${text}${shareUrl}`, "_blank");
      closeSheet();
    };
  }
  if (x) {
    x.onclick = () => {
      const shareUrl = encodeURIComponent(getShareUrl("twitter", url));
      const text = encodeURIComponent(`Check out this ${contentType}: "${headline}" on The Briefing`);
      if (typeof trackEvent === 'function') trackEvent("share_action", "Engagement", "Twitter X", headline);
      window.open(`https://twitter.com/intent/tweet?url=${shareUrl}&text=${text}`, "_blank");
      closeSheet();
    };
  }
  if (copy) {
    // "Share Anywhere" — use native system share sheet, fallback to clipboard
    copy.onclick = () => {
      if (navigator.share) {
        const shareUrl = getShareUrl("native_share", url);
        if (typeof trackEvent === 'function') trackEvent("share_action", "Engagement", "Share Anywhere", headline);
        navigator.share({
          title: headline,
          text: `Check out this ${contentType} on The Briefing: "${headline}"`,
          url: shareUrl
        }).catch(err => console.log("Share cancelled:", err));
      } else {
        const shareUrl = getShareUrl("copy_link", url);
        if (typeof trackEvent === 'function') trackEvent("share_action", "Engagement", "Copy Link", headline);
        navigator.clipboard.writeText(shareUrl).then(() => {
          showToast("Copied shareable link to clipboard");
        }).catch(() => {
          showToast("Failed to copy link");
        });
      }
      closeSheet();
    };
  }
  if (native) {
    // "Copy Link" fallback button
    native.style.display = "flex";
    native.onclick = () => {
      const shareUrl = getShareUrl("copy_link", url);
      if (typeof trackEvent === 'function') trackEvent("share_action", "Engagement", "Copy Link", headline);
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast("Copied link to clipboard");
      }).catch(() => {
        showToast("Failed to copy link");
      });
      closeSheet();
    };
  }
}

async function loadFlash(date = null) {
  const latestDate = indexEntries.length > 0 ? indexEntries[0].date : null;
  const targetDate = date || latestDate;

  // If loading the latest day, load root flash.json
  if (!targetDate || targetDate === latestDate) {
    if (flashStories.length > 0 && flashStories.loadedDate === targetDate) {
      return flashStories;
    }
    const r = await fetch(`${BASE_PATH ? BASE_PATH : ""}/flash.json`, { cache: "no-store" });
    if (!r.ok) throw new Error("Failed to load Flash stories.");
    flashStories = await r.json();
    flashStories.loadedDate = targetDate;
    return flashStories;
  }

  // If we already have the requested date loaded in memory, return it
  if (flashStories.length > 0 && flashStories.loadedDate === targetDate) {
    return flashStories;
  }

  // Try to load date-specific flash file only
  const r = await fetch(`${BASE_PATH ? BASE_PATH + "/" : ""}data/flash-${targetDate}.json`, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`No Flash data available for ${targetDate}`);
  }
  flashStories = await r.json();
  flashStories.loadedDate = targetDate;
  return flashStories;
}

function getFlashCatPillSvg(catId) {
  const s = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const icons = {
    'india': `<circle cx="8" cy="8" r="6" ${s}/><circle cx="8" cy="8" r="2" fill="currentColor"/><path d="M8 2v2M8 14v2M2 8H0M16 8h-2" ${s}/>`,
    'global': `<circle cx="8" cy="8" r="6" ${s}/><ellipse cx="8" cy="8" rx="6" ry="3" ${s}/><line x1="2" y1="8" x2="14" y2="8" ${s}/>`,
    'politics': `<polygon points="8,2 2,6 14,6" ${s}/><rect x="4" y="6" width="2" height="6" ${s}/><rect x="7" y="6" width="2" height="6" ${s}/><rect x="10" y="6" width="2" height="6" ${s}/><line x1="2" y1="12" x2="14" y2="12" ${s}/>`,
    'economics': `<polyline points="2,12 5,7 8,9 11,4 14,2" ${s}/><polyline points="11,2 14,2 14,5" ${s}/>`,
    'ai-tech': `<rect x="3" y="3" width="10" height="10" rx="2" ${s}/><rect x="6" y="6" width="4" height="4" ${s}/><path d="M6 3V1M10 3V1M6 13v2M10 13v2M3 6H1M3 10H1M13 6h2M13 10h2" ${s}/>`,
    'science': `<circle cx="8" cy="8" r="2" fill="currentColor"/><ellipse cx="8" cy="8" rx="7" ry="3" ${s}/><ellipse cx="8" cy="8" rx="7" ry="3" transform="rotate(60 8 8)" ${s}/><ellipse cx="8" cy="8" rx="7" ry="3" transform="rotate(120 8 8)" ${s}/>`,
    'sports': `<circle cx="8" cy="8" r="6" ${s}/><polygon points="8,5 9.5,7.5 8,10 6.5,7.5" ${s}/>`,
    'entertainment': `<rect x="2" y="5" width="12" height="9" rx="1" ${s}/><path d="M2 8h12" ${s}/><path d="M2 5L14 2l-.5-2L2 3z" ${s}/>`,
    'culture': `<path d="M8 2l-5 8h10z" ${s}/><line x1="8" y1="10" x2="8" y2="14" ${s}/><line x1="5" y1="14" x2="11" y2="14" ${s}/>`,
    'health': `<path d="M8 13C4 10 2 7 2 5a3 3 0 0 1 6 0 3 3 0 0 1 6 0c0 2-2 5-6 8z" ${s}/><polyline points="4,7 6,7 7,5 8,9 9,6 10,7 12,7" ${s}/>`
  };
  const paths = icons[catId] || icons['global'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" style="display:inline-block;vertical-align:text-bottom;margin-right:5px;stroke:currentColor;fill:none;flex-shrink:0;">${paths}</svg>`;
}

function renderFlashCategoryPills() {
  const cats = [
    { id: "all", label: "All" },
    { id: "india", label: "India" },
    { id: "global", label: "Global" },
    { id: "politics", label: "Politics" },
    { id: "economics", label: "Economics" },
    { id: "ai-tech", label: "AI & Tech" },
    { id: "science", label: "Science" },
    { id: "sports", label: "Sports" },
    { id: "entertainment", label: "Entertainment" },
    { id: "culture", label: "Culture" },
    { id: "health", label: "Health" }
  ];

  return cats.map(c => {
    const active = c.id === activeFlashCategory;
    const col = getCategoryColor(c.id);
    const rgb = getCategoryColorRgb(c.id);

    let style = "";
    if (active) {
      style = `style="--cat-color: ${col}; --cat-color-rgb: ${rgb};"`;
    }

    const iconHtml = c.id !== "all" ? getFlashCatPillSvg(c.id) : "";

    return `
      <button class="flash-cat-pill ${active ? 'active' : ''}" data-cat="${c.id}" ${style}>
        ${iconHtml}${esc(c.label)}
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
      trackEvent("select_category", "Flash Navigation", activeFlashCategory);
      renderFlashView();
    }
  });
}

function wireFlashNavigation() {
  const stage = $('flash-card-stage');
  if (!stage) return;

  stage.addEventListener('click', e => {
    const bookmarkBtn = e.target.closest('.flash-bookmark-btn');
    const shareBtn = e.target.closest('.flash-share-btn');

    const getStory = (id) => {
      const found = deckItems.find(item => item.type === 'story' && item.data.id === id);
      return found ? found.data : null;
    };

    if (bookmarkBtn) {
      const storyId = bookmarkBtn.dataset.id;
      const story = getStory(storyId);
      if (!story) return;
      const active = toggleBookmark(story);
      const col = getCategoryColor(story.cat);
      stage.querySelectorAll('.flash-bookmark-btn').forEach(btn => {
        if (btn.dataset.id !== storyId) return;
        btn.classList.toggle('saved', active);
        btn.style.color = active ? col : '';
        const svg = btn.querySelector('svg');
        if (svg) svg.setAttribute('fill', active ? 'currentColor' : 'none');
        const label = btn.querySelector('span');
        if (label) label.textContent = active ? 'Saved' : 'Save';
      });
      updateSavedBadge();
    }

    if (shareBtn) {
      const storyId = shareBtn.dataset.id;
      const story = getStory(storyId);
      if (!story) return;
      const url = `${window.location.origin}${BASE_PATH}/flash/story/${storyId}`;
      openShareSheet(url, story.headline || story.hl);
    }
  });
}

function updateFlashCounter(index, total) {
  const ctr = $("flash-header-counter");
  if (!ctr) return;
  if (total === 0) {
    ctr.textContent = "0 / 0";
  } else if (index >= total) {
    ctr.textContent = "Completed";
  } else {
    ctr.textContent = `${index + 1} / ${total}`;
  }

}

function buildInitialDeckItems(stories, date) {
  deckItems = stories.map(s => ({
    type: "story",
    date: s.date || date || flashStories.loadedDate || (indexEntries[0] && indexEntries[0].date) || new Date().toISOString().split("T")[0],
    data: s
  }));
  if (deckItems.length > 0) {
    deckItems.push({
      type: "alldone",
      date: date || deckItems[0].date
    });
  }
}

async function fetchFlashStoriesForDate(targetDate) {
  const latestDate = indexEntries.length > 0 ? indexEntries[0].date : null;
  let url = "";
  if (!targetDate || targetDate === latestDate) {
    url = `${BASE_PATH ? BASE_PATH : ""}/flash.json`;
  } else {
    url = `${BASE_PATH ? BASE_PATH + "/" : ""}data/flash-${targetDate}.json`;
  }
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`No Flash data available for ${targetDate}`);
  return await r.json();
}

async function triggerNextDayPreload() {
  if (window.isViewingSavedFlashes || isPreloadingNextDay) return;

  if (deckItems.length === 0) return;
  const lastItem = deckItems[deckItems.length - 1];
  const lastDate = lastItem.date;

  const prevDate = getPreviousFlashDate(lastDate);
  if (!prevDate) return;

  isPreloadingNextDay = true;
  try {
    const newStories = await fetchFlashStoriesForDate(prevDate);
    const filteredNew = activeFlashCategory === "all"
      ? newStories
      : newStories.filter(s => {
        const cat = s.cat?.toLowerCase();
        if (activeFlashCategory === "global" && (cat === "global" || cat === "world")) return true;
        if (activeFlashCategory === "economics" && (cat === "economics" || cat === "business")) return true;
        if (activeFlashCategory === "ai-tech" && (cat === "ai-tech" || cat === "ai")) return true;
        return cat === activeFlashCategory;
      });

    const mapped = filteredNew.map(s => ({
      type: "story",
      date: prevDate,
      data: s
    }));

    deckItems.push(...mapped);
    deckItems.push({
      type: "alldone",
      date: prevDate
    });
  } catch (e) {
    console.error("Failed to preload next day flashes:", e);
  } finally {
    isPreloadingNextDay = false;
  }
}

function updateFlashUrlAndHeader(item) {
  if (!item) return;
  const targetDate = item.date;

  const sel = $("archive-select");
  if (sel && targetDate) {
    sel.value = targetDate;
  }

  const headerDateEl = $("header-date");
  if (window.isViewingSavedFlashes) {
    if (headerDateEl) headerDateEl.textContent = "SAVED ITEMS";
  } else {
    if (headerDateEl && targetDate) {
      headerDateEl.textContent = fmtHeaderDate(targetDate).toUpperCase();
    }
  }

  if (!window.isViewingSavedFlashes) {
    const latestDate = indexEntries.length > 0 ? indexEntries[0].date : null;
    let newPath = "";
    if (targetDate === latestDate) {
      newPath = `${BASE_PATH}/flash`;
    } else {
      newPath = `${BASE_PATH}/flash/day/${targetDate}`;
    }
    if (location.pathname !== newPath) {
      history.replaceState(null, "", newPath);
    }

    const pageTitle = targetDate ? `The Briefing | Flash — ${fmtHeaderDate(targetDate)}` : "The Briefing | Flash";
    document.title = pageTitle;
  }
}

function updateJumpToTodayButton(item) {
  const btn = $("jump-to-today-btn");
  if (!btn) return;

  if (currentMode === "flash" && !window.isViewingSavedFlashes && item && indexEntries.length > 0) {
    const latestDate = indexEntries[0].date;
    if (item.date !== latestDate) {
      btn.classList.remove("hidden");
      return;
    }
  }
  btn.classList.add("hidden");
}

function navigateFlash(direction, filtered) {
  const newIdx = currentFlashIndex + direction;
  const total = deckItems.length;

  if (newIdx < 0 || newIdx >= total) return;
  currentFlashIndex = newIdx;

  const isDesktop = window.innerWidth >= 992;
  if (isDesktop) {
    const item = deckItems[newIdx];
    if (item && item.type === "story") {
      const card = document.querySelector(`[data-id="${item.data.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("highlighted");
        setTimeout(() => card.classList.remove("highlighted"), 2000);
      }
    }
  } else {
    renderFlashView(deckItems[currentFlashIndex]?.date);
  }
}

function updateFlashProgressUI() {
  if (deckItems.length === 0) return;
  const currentItem = deckItems[currentFlashIndex];
  if (!currentItem) return;

  updateFlashUrlAndHeader(currentItem);
  updateJumpToTodayButton(currentItem);

  const currentDayStories = deckItems.filter(item => item.date === currentItem.date && item.type === "story");
  const totalStoriesForDay = currentDayStories.length;

  const fill = document.querySelector(".flash-progress-fill");
  const ctr = $("flash-header-counter");

  if (currentItem.type === "story") {
    const storyIdx = currentDayStories.findIndex(item => item.data.id === currentItem.data.id);
    const progressPct = totalStoriesForDay > 0 ? ((storyIdx + 1) / totalStoriesForDay) * 100 : 0;

    if (fill) fill.style.width = `${Math.min(progressPct, 100)}%`;
    if (ctr) ctr.textContent = `${storyIdx + 1} / ${totalStoriesForDay}`;
  } else if (currentItem.type === "alldone") {
    if (fill) fill.style.width = "100%";
    if (ctr) ctr.textContent = "Completed";
  }
}

/* ── Physical card drag — 1:1 finger tracking with spring physics ── */
function attachPhysicalDrag() {
  const stage = $('flash-card-stage');
  if (!stage) return;

  if (physDragCleanup) { physDragCleanup(); physDragCleanup = null; }

  let dragging = false, isVert = null, animating = false;
  let startY = 0, startX = 0, deltaY = 0;
  let lastY = 0, lastT = 0, velY = 0;
  let curCard = null, nxtCard = null, prvCard = null;
  let stageH = 0;

  const EXIT_T = '250ms cubic-bezier(0.16, 1, 0.3, 1)';
  const SNAPB_T = '280ms cubic-bezier(0.16, 1, 0.3, 1)';

  function trans(el, t) { if (el) el.style.transition = t; }

  function setRole(el, role) {
    if (!el) return;
    el.style.transition = '';
    if (role === 'current') {
      Object.assign(el.style, { zIndex: '20', transform: 'translateY(0) scale(1)', opacity: '1', pointerEvents: 'auto' });
    } else if (role === 'next') {
      Object.assign(el.style, { zIndex: '10', transform: 'translateY(0) scale(0.94)', opacity: '0.85', pointerEvents: 'none' });
    } else if (role === 'prev') {
      Object.assign(el.style, { zIndex: '30', transform: 'translateY(-100%) scale(1)', opacity: '0', pointerEvents: 'none' });
    }
  }

  function mkStory(s, role, idxInDeck) {
    const col = getCategoryColor(s.cat);
    const rgb = getCategoryColorRgb(s.cat);
    const saved = getSavedStories().some(fs => fs.id === s.id);
    const el = document.createElement('div');
    el.className = 'flash-card';
    el.dataset.id = s.id;
    el.dataset.idx = String(idxInDeck);
    el.style.cssText = `--cat-color:${col};--cat-color-rgb:${rgb};`;
    el.innerHTML = buildFlashCardInnerHTML(s, col, saved);
    setRole(el, role);
    return el;
  }

  function mkAllDone(role, idxInDeck, date) {
    const el = document.createElement('div');
    el.className = 'flash-card all-done-card';
    el.dataset.idx = String(idxInDeck);
    
    const isSaved = window.isViewingSavedFlashes;
    const title = isSaved ? "All Saved Flashes Read" : "You're All Caught Up!";
    const description = isSaved 
      ? "You've read all of your bookmarked flash updates.<br>Go back to the saved list or check out new briefings."
      : "You've read all of today's speed news updates.<br>Check back later for more quick updates.";
    const buttonLabel = isSaved ? "Back to Saved Items" : "Explore Deep Dives";
    const buttonSvg = isSaved
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/></svg>`;

    el.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; text-align:center; height: 100%; justify-content: space-between; width:100%; padding: 10px 0 6px 0; box-sizing: border-box; position: relative;">
        <!-- Checkmark SVG badge container -->
        <div style="margin-top: auto; margin-bottom: 8px;">
          <svg width="130" height="130" viewBox="0 0 150 150" style="display: block; margin: 0 auto;">
            <!-- Spark lines -->
            <line x1="40" y1="45" x2="35" y2="40" stroke="var(--ink-3)" stroke-width="1.8" stroke-linecap="round" opacity="0.4" />
            <line x1="110" y1="45" x2="115" y2="40" stroke="var(--ink-3)" stroke-width="1.8" stroke-linecap="round" opacity="0.4" />
            <line x1="28" y1="84" x2="22" y2="86" stroke="var(--ink-3)" stroke-width="1.8" stroke-linecap="round" opacity="0.4" />
            <line x1="122" y1="84" x2="128" y2="86" stroke="var(--ink-3)" stroke-width="1.8" stroke-linecap="round" opacity="0.4" />
            <line x1="56" y1="115" x2="52" y2="120" stroke="var(--ink-3)" stroke-width="1.8" stroke-linecap="round" opacity="0.4" />
            <line x1="94" y1="115" x2="98" y2="120" stroke="var(--ink-3)" stroke-width="1.8" stroke-linecap="round" opacity="0.4" />
            
            <!-- Background circle for checkmark -->
            <circle cx="75" cy="75" r="28" fill="#e6f6f4" />
            <circle cx="75" cy="75" r="28" stroke="#0f9b8e" stroke-width="1.5" stroke-dasharray="3 3" fill="none" opacity="0.35" />
            
            <!-- Checkmark path -->
            <path d="M66 74l6 6 12-12" stroke="#0f9b8e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            
            <!-- Colorful sparkles -->
            <circle cx="28" cy="70" r="3" fill="#f59e0b" />
            <circle cx="122" cy="72" r="3" fill="#a855f7" />
            <polygon points="56,36 58,40 56,44 54,40" fill="#f59e0b" transform="rotate(15 56 40)" />
            <polygon points="38,54 41,56 38,58 35,56" fill="#06b6d4" />
            <polygon points="108,36 110,40 108,44 106,40" fill="#a855f7" />
            <polygon points="118,103 121,105 118,107 115,105" fill="#22c55e" />
          </svg>
        </div>
        
        <!-- Text Section -->
        <div style="margin-bottom: 20px; padding: 0 10px;">
          <h2 class="flash-headline" style="font-size: 23px; font-weight: 700; color: var(--ink); margin: 0 0 10px 0; font-family: 'Manrope', var(--sans); letter-spacing: -0.01em;">${title}</h2>
          <p style="font-family: var(--sans); font-weight: 400; font-size: 13px; color: var(--ink-2); line-height: 1.55; margin: 0;">
            ${description}
          </p>
        </div>
        
        <!-- Action Buttons -->
        <div style="display:flex; flex-direction:column; gap:10px; width:100%; max-width: 280px; margin-bottom: auto; padding: 0 10px; box-sizing: border-box;">
          <!-- Explore / Saved Button -->
          <button class="desktop-action-btn" id="all-done-briefings-btn" style="width: 100%; height: 42px; border-radius: 8px; border: none; background: var(--ink); color: var(--bg); font-family: var(--sans); font-weight: 500; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            ${buttonSvg}
            ${buttonLabel}
          </button>
          <!-- Back to First Card -->
          <button class="desktop-action-btn" id="all-done-restart-btn" style="width: 100%; height: 42px; border-radius: 8px; border: 1px solid var(--rule); background: var(--bg-card); color: var(--ink); font-family: var(--sans); font-weight: 500; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-card-h)'" onmouseout="this.style.backgroundColor='var(--bg-card)'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
            Back to First Card
          </button>
        </div>
        
        <!-- Illustration Section -->
        <div style="margin-top: auto; margin-bottom: 20px; width: 100%; pointer-events: none; user-select: none;">
          <img src="/newspaper-illustration.png" alt="Newspaper Illustration" style="width: 90%; max-width: 290px; height: auto; max-height: 145px; display: block; margin: 0 auto; opacity: 0.95; object-fit: contain;" />
        </div>
        
        <!-- Solid bottom accent line -->
        <div style="position: absolute; bottom: -8px; left: -12px; right: -12px; height: 4px; background: var(--accent); border-radius: 0 0 var(--radius) var(--radius);"></div>
      </div>`;
    setRole(el, role);
    return el;
  }

  function wireAllDone() {
    const r = stage.querySelector('#all-done-restart-btn');
    const b = stage.querySelector('#all-done-briefings-btn');
    if (r) r.onclick = () => { currentFlashIndex = 0; renderFlashView(); };
    if (b) b.onclick = () => {
      if (window.isViewingSavedFlashes) {
        navigate(`${BASE_PATH}/saved`);
      } else {
        switchToBriefingMode();
        navigate(`${BASE_PATH}/briefings`);
      }
    };
  }

  function createCard(idx, role) {
    const item = deckItems[idx];
    if (item.type === 'story') {
      return mkStory(item.data, role, idx);
    } else {
      return mkAllDone(role, idx, item.date);
    }
  }

  function buildDeck() {
    stage.innerHTML = '';
    stageH = stage.clientHeight || 600;
    const idx = currentFlashIndex;
    const total = deckItems.length;

    prvCard = idx > 0 ? createCard(idx - 1, 'prev') : null;
    if (prvCard) stage.appendChild(prvCard);

    nxtCard = idx + 1 < total ? createCard(idx + 1, 'next') : null;
    if (nxtCard) stage.appendChild(nxtCard);

    curCard = idx < total ? createCard(idx, 'current') : null;
    if (curCard) stage.appendChild(curCard);

    if (curCard && deckItems[idx].type === 'alldone') {
      wireAllDone();
    } else if (curCard) {
      trackViewCount(deckItems[idx].data.id);
      window.flashSessionViewedIds.add(deckItems[idx].data.id);
      checkAndShowNudge();
    }
  }

  buildDeck();
  wireFlashNavigation();

  function onStart(e) {
    if (e.touches.length !== 1 || animating) return;
    dragging = true; isVert = null; deltaY = 0; velY = 0;
    const t = e.touches[0];
    startY = lastY = t.clientY; startX = t.clientX;
    lastT = e.timeStamp;
    stageH = stage.clientHeight || stageH;
    trans(curCard, ''); trans(nxtCard, ''); trans(prvCard, '');
  }

  function onMove(e) {
    if (!dragging || e.touches.length !== 1) {
      if (dragging) { dragging = false; snapBack(); }
      return;
    }
    const t = e.touches[0];
    const dy = t.clientY - startY, dx = t.clientX - startX;
    if (isVert === null && (Math.abs(dy) > 4 || Math.abs(dx) > 4)) {
      isVert = Math.abs(dy) > Math.abs(dx);
    }
    if (!isVert) return;
    if (e.cancelable) e.preventDefault();
    const now = e.timeStamp, dt = now - lastT;
    if (dt > 0) velY = (t.clientY - lastY) / dt;
    lastY = t.clientY; lastT = now; deltaY = dy;
    updateVis(dy);
  }

  function updateVis(dy) {
    if (!curCard) return;
    let edy = dy;
    if (dy < 0 && !nxtCard) edy = dy * 0.25;
    if (dy > 0 && !prvCard) edy = dy * 0.25;
    const p = Math.min(Math.abs(edy) / stageH, 1);

    if (edy < 0) {
      curCard.style.transform = `translateY(${edy}px) scale(${1 - p * 0.02})`;
      if (nxtCard) {
        nxtCard.style.transform = `translateY(0) scale(${0.94 + p * 0.06})`;
        nxtCard.style.opacity = String(0.85 + p * 0.15);
      }
      if (prvCard) {
        prvCard.style.transform = 'translateY(-100%) scale(1)';
        prvCard.style.opacity = '0';
      }
    } else {
      curCard.style.transform = `translateY(0) scale(${1 - p * 0.06})`;
      if (prvCard) {
        prvCard.style.transform = `translateY(${-stageH + edy}px) scale(1)`;
        prvCard.style.opacity = '1';
      }
      if (nxtCard) {
        nxtCard.style.transform = 'translateY(0) scale(0.94)';
        nxtCard.style.opacity = String(0.85 * (1 - p));
      }
    }
  }

  function onEnd() {
    if (!dragging) return; dragging = false;
    if (!isVert) return;
    const DIST = stageH * 0.28, VEL = 0.35;
    if ((deltaY < -DIST || velY < -VEL) && nxtCard) completeNav(1);
    else if ((deltaY > DIST || velY > VEL) && prvCard) completeNav(-1);
    else snapBack();
  }

  function onCancel() { dragging = false; snapBack(); }

  function completeNav(dir) {
    animating = true;
    const outgoing = curCard;
    const incoming = dir > 0 ? nxtCard : prvCard;
    trans(outgoing, EXIT_T);
    if (outgoing) {
      if (dir > 0) {
        outgoing.style.transform = `translateY(${-(stageH + 30)}px) scale(0.96)`;
        outgoing.style.opacity = '0';
      } else {
        outgoing.style.transform = 'translateY(0) scale(0.94)';
        outgoing.style.opacity = '0.85';
      }
    }
    trans(incoming, EXIT_T);
    if (incoming) {
      incoming.style.transform = 'translateY(0) scale(1)';
      incoming.style.opacity = '1';
    }

    const newIdx = currentFlashIndex + dir;
    currentFlashIndex = newIdx;

    updateFlashProgressUI();

    let done = false;
    function finalize() {
      if (done) return; done = true;
      animating = false;
      Array.from(stage.children).forEach(c => { if (c !== incoming) stage.removeChild(c); });
      curCard = incoming;
      if (curCard) { curCard.style.zIndex = '20'; trans(curCard, ''); curCard.style.pointerEvents = 'auto'; }

      const total = deckItems.length;
      if (newIdx + 1 < total) {
        nxtCard = createCard(newIdx + 1, 'next');
        if (nxtCard) stage.insertBefore(nxtCard, curCard);
      } else {
        nxtCard = null;
      }

      if (newIdx > 0) {
        prvCard = createCard(newIdx - 1, 'prev');
        if (prvCard) stage.insertBefore(prvCard, nxtCard || curCard);
      } else {
        prvCard = null;
      }

      if (curCard && deckItems[newIdx].type === 'alldone') {
        wireAllDone();
      } else if (curCard) {
        trackViewCount(deckItems[newIdx].data.id);
        window.flashSessionViewedIds.add(deckItems[newIdx].data.id);
        checkAndShowNudge();
      }

      if (newIdx >= total - 2) {
        triggerNextDayPreload();
      }
    }
    if (outgoing) outgoing.addEventListener('transitionend', finalize, { once: true });
    setTimeout(finalize, 300);
  }

  function snapBack() {
    if (curCard) { trans(curCard, SNAPB_T); curCard.style.transform = 'translateY(0) scale(1)'; curCard.style.opacity = '1'; }
    if (nxtCard) { trans(nxtCard, EXIT_T); nxtCard.style.transform = 'translateY(0) scale(0.94)'; nxtCard.style.opacity = '0.85'; }
    if (prvCard) { trans(prvCard, EXIT_T); prvCard.style.transform = 'translateY(-100%) scale(1)'; prvCard.style.opacity = '0'; }
  }

  stage.addEventListener('touchstart', onStart, { passive: true });
  stage.addEventListener('touchmove', onMove, { passive: false });
  stage.addEventListener('touchend', onEnd, { passive: true });
  stage.addEventListener('touchcancel', onCancel, { passive: true });

  physDragCleanup = () => {
    stage.removeEventListener('touchstart', onStart);
    stage.removeEventListener('touchmove', onMove);
    stage.removeEventListener('touchend', onEnd);
    stage.removeEventListener('touchcancel', onCancel);
  };
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
  } catch (e) { }

  if (isFirstView) {
    localReads[storyId] = (localReads[storyId] || 0) + 1;
    localStorage.setItem("flash_reads_fallback", JSON.stringify(localReads));
  }

  let views = localReads[storyId] || 0;

  // Track page view and event in Google Analytics
  const story = flashStories.find(s => s.id === storyId);
  if (story) {
    const pageTitle = `The Briefing | Flash — ${story.headline || story.hl}`;
    const pagePath = `/flash/story/${storyId}`;
    trackPageView(pagePath, pageTitle);
    trackEvent("view_flash_story", "Flash News", story.cat);
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
    trackEvent("bookmark_remove", "Engagement", story.headline || story.hl || story.id);
    return false; // not saved
  } else {
    if (!story.date) {
      story.date = (typeof flashStories !== 'undefined' && flashStories?.loadedDate) || (typeof indexEntries !== 'undefined' && indexEntries[0]?.date) || new Date().toISOString().split('T')[0];
    }
    saved.push(story);
    localStorage.setItem("flash_saved", JSON.stringify(saved));
    showToast("Saved to bookmarks");
    trackEvent("bookmark_add", "Engagement", story.headline || story.hl || story.id);
    return true; // saved
  }
}

function getSavedStories() {
  try {
    return JSON.parse(localStorage.getItem("flash_saved") || "[]");
  } catch (e) {
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
    const hl = s.headline || s.hl;
    const source = s.source || s.src;
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
          ${source ? `<span class="saved-item-date">${esc(source)}</span>` : ''}
        </div>
        <div class="saved-item-headline">${esc(hl)}</div>
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

async function renderSavedPage() {
  updateModeToggleUI();
  $("hero").classList.add("hidden");
  app.innerHTML = "";

  const savedContainer = document.createElement("div");
  savedContainer.className = "saved-page-container";

  const saved = getSavedStories();
  const deepDives = saved.filter(s => s.sections !== undefined);
  const flashes = saved.filter(s => s.sections === undefined);

  let contentHtml = "";
  if (saved.length === 0) {
    contentHtml = `
      <div class="saved-empty-state-page">
        <div class="saved-empty-icon-page">◦</div>
        <h2 class="saved-empty-title-page">No Saved Stories</h2>
        <p class="saved-empty-text-page">Stories you save will appear here for easy reading later.</p>
      </div>`;
  } else {
    contentHtml = `
      <h1 class="saved-page-title">Saved Items</h1>
      <div class="saved-page-sections">
        
        <!-- Deep Dives Section -->
        <section class="saved-section">
          <h2 class="saved-section-title">📰 Deep Dives</h2>
          ${deepDives.length === 0 ? `
            <div class="saved-section-empty">
              <p>No saved deep dives yet.</p>
            </div>
          ` : `
            <div class="saved-page-grid">
              ${deepDives.map(s => {
                const col = getCategoryColor(s.cat);
                const hl = s.headline || s.hl;
                const source = s.source || s.src;
                return `
                  <div class="saved-page-card" data-id="${esc(s.id)}" data-type="briefing" data-date="${esc(s.date || '')}">
                    <div class="saved-page-card-header">
                      <span class="saved-page-cat" style="color: ${col};">${esc((FLASH_LABELS[s.cat] || s.cat || 'NEWS').toUpperCase())}</span>
                      ${source ? `<span class="saved-page-source">${esc(source)}</span>` : ""}
                    </div>
                    <h3 class="saved-page-headline">${esc(hl)}</h3>
                    <div class="saved-page-actions">
                      <span class="saved-page-type-badge">Deep Dive</span>
                      <button class="saved-page-remove-btn" data-id="${esc(s.id)}" aria-label="Remove bookmark">
                        Remove
                      </button>
                    </div>
                  </div>`;
              }).join("")}
            </div>
          `}
        </section>

        <!-- Flash News Section -->
        <section class="saved-section" style="margin-top: 40px;">
          <h2 class="saved-section-title">⚡ Flash News</h2>
          ${flashes.length === 0 ? `
            <div class="saved-section-empty">
              <p>No saved flash news yet.</p>
            </div>
          ` : `
            <div class="saved-page-grid">
              ${flashes.map(s => {
                const col = getCategoryColor(s.cat);
                const hl = s.headline || s.hl;
                const source = s.source || s.src;
                return `
                  <div class="saved-page-card" data-id="${esc(s.id)}" data-type="flash" data-date="${esc(s.date || '')}">
                    <div class="saved-page-card-header">
                      <span class="saved-page-cat" style="color: ${col};">${esc((FLASH_LABELS[s.cat] || s.cat || 'NEWS').toUpperCase())}</span>
                      ${source ? `<span class="saved-page-source">${esc(source)}</span>` : ""}
                    </div>
                    <h3 class="saved-page-headline">${esc(hl)}</h3>
                    <div class="saved-page-actions">
                      <span class="saved-page-type-badge">Flash</span>
                      <button class="saved-page-remove-btn" data-id="${esc(s.id)}" aria-label="Remove bookmark">
                        Remove
                      </button>
                    </div>
                  </div>`;
              }).join("")}
            </div>
          `}
        </section>

      </div>`;
  }

  savedContainer.innerHTML = contentHtml;
  app.appendChild(savedContainer);

  // Wire click event on cards
  savedContainer.querySelectorAll(".saved-page-card").forEach(card => {
    card.onclick = (e) => {
      if (e.target.closest(".saved-page-remove-btn")) return;
      const id = card.dataset.id;
      const type = card.dataset.type;
      const date = card.dataset.date;
      if (type === "briefing") {
        navigate(`${BASE_PATH}/story/${date}/${id}?from=saved`);
      } else {
        navigate(`${BASE_PATH}/flash/story/${id}?from=saved`);
      }
    };
  });

  // Wire remove buttons
  savedContainer.querySelectorAll(".saved-page-remove-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const storyId = btn.dataset.id;
      const savedList = getSavedStories();
      const story = savedList.find(s => s.id === storyId);
      if (story) {
        toggleBookmark(story);
        renderSavedPage();
      }
    };
  });

  trackPageView("/saved", "The Briefing | Saved Items");
  window.scrollTo(0, 0);
}

function openFlashStory(storyId) {
  currentMode = "flash";
  localStorage.setItem("currentMode", "flash");
  updateModeToggleUI();
  activeFlashCategory = "all";
  navigate(`${BASE_PATH}/#flash-${storyId}`);
}

function renderRelatedFlashCards(s) {
  const briefCat = getBriefStoryCategory(s);
  const related = flashStories.filter(fs => fs.cat === briefCat).slice(0, 5);

  if (related.length === 0) return "";

  const cardsHtml = related.map(fs => {
    const col = getCategoryColor(fs.cat);
    const rgb = getCategoryColorRgb(fs.cat);
    const hl = fs.headline || fs.hl;
    const body = fs.summary || fs.body;
    const source = fs.source || fs.src;
    return `
      <div class="related-flash-item" data-id="${esc(fs.id)}">
        <div class="related-flash-item-top">
          <span class="related-flash-item-cat" style="background: rgba(${rgb}, 0.15); color: ${col};">${esc(FLASH_LABELS[fs.cat] || fs.cat)}</span>
          ${source ? `<span class="related-flash-item-time">${esc(source)}</span>` : ''}
        </div>
        <div class="related-flash-item-headline">${esc(hl)}</div>
        <div class="related-flash-item-summary">${esc(body)}</div>
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

async function renderFlashView(date = null) {
  stopProgress();

  updateModeToggleUI();

  await loadIndex();
  const latestDate = indexEntries.length > 0 ? indexEntries[0].date : null;
  const targetDate = date || latestDate;

  // Make sure the archive datepicker shows the selected date
  const sel = $("archive-select");
  if (sel && targetDate) {
    sel.value = targetDate;
  }
  const headerDateEl = $("header-date");
  if (window.isViewingSavedFlashes) {
    if (headerDateEl) headerDateEl.textContent = "SAVED ITEMS";
  } else {
    if (headerDateEl && targetDate) {
      headerDateEl.textContent = fmtHeaderDate(targetDate).toUpperCase();
    }
  }

  // Reset category starting index on date change
  if (!window.isViewingSavedFlashes && flashStories.loadedDate !== targetDate) {
    currentFlashIndex = 0;
  }

  if (!window.isViewingSavedFlashes) {
    try {
      await loadFlash(targetDate);

      // Track page view for the Flash feed / daily archive
      const pageTitle = targetDate ? `The Briefing | Flash — ${fmtHeaderDate(targetDate)}` : "The Briefing | Flash";
      const pagePath = targetDate ? `/flash/day/${targetDate}` : "/flash";
      trackPageView(pagePath, pageTitle);
    } catch (err) {
      app.innerHTML = `<div class="error-state">Couldn't load Flash stories for ${esc(targetDate || 'today')} · ${esc(err.message)}</div>`;
      return;
    }
  } else {
    trackPageView("/saved/flash", "The Briefing | Saved Flash News");
  }

  const filtered = activeFlashCategory === "all"
    ? flashStories
    : flashStories.filter(s => {
      const cat = s.cat?.toLowerCase();
      if (activeFlashCategory === "global" && (cat === "global" || cat === "world")) return true;
      if (activeFlashCategory === "economics" && (cat === "economics" || cat === "business")) return true;
      if (activeFlashCategory === "ai-tech" && (cat === "ai-tech" || cat === "ai")) return true;
      return cat === activeFlashCategory;
    });

  const total = filtered.length;

  // Build the initial deck items for both mobile and desktop
  buildInitialDeckItems(filtered, window.isViewingSavedFlashes ? null : targetDate);

  // If a specific story ID was targeted (from deep link), find its index in the deck
  if (selectedFlashStoryId) {
    const idx = deckItems.findIndex(item => item.type === 'story' && item.data.id === selectedFlashStoryId);
    if (idx >= 0) {
      currentFlashIndex = idx;
    }
    selectedFlashStoryId = null; // consume
  }

  // Responsive branch check
  const isDesktop = window.innerWidth >= 992;

  // Update Header Progress
  const progressText = $("flash-header-center");
  if (progressText) {
    const activeCats = new Set(filtered.map(fs => fs.cat));
    progressText.textContent = `Showing ${total} stories · ${activeCats.size} categories`;
  }

  // Update bookmark badge
  updateSavedBadge();

  if (isDesktop) {
    renderFlashDesktopLayout(filtered, targetDate);
  } else {
    renderFlashMobileLayout(targetDate);
  }
}

function cleanSourceUrl(raw) {
  if (!raw) return null;
  raw = raw.trim();

  // Detect markdown link: [text](url)
  const mdMatch = raw.match(/^\[([\s\S]*?)\]\(([\s\S]*?)\)$/);
  if (mdMatch) {
    const text = mdMatch[1].trim();
    const url = mdMatch[2].trim();

    // Helper to check if a string is a valid absolute HTTP/HTTPS URL
    const isValidUrl = (str) => {
      try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch (e) {
        return false;
      }
    };

    // If the destination URL is a Google search redirect, try to extract the real URL from the q parameter
    if (url.startsWith('https://www.google.com/search') || url.startsWith('http://www.google.com/search')) {
      try {
        const parsedUrl = new URL(url);
        const q = parsedUrl.searchParams.get('q');
        if (q && isValidUrl(q)) {
          return q;
        }
      } catch (e) { }
    }

    // If the destination URL is valid, return it
    if (isValidUrl(url)) {
      return url;
    }

    // Otherwise, if the link text is a valid URL (not truncated), return that
    if (isValidUrl(text)) {
      return text;
    }
  }

  // Fallback: if the whole raw string has a URL inside parentheses at the end
  const parenMatch = raw.match(/\((https?:\/\/[^\s)]+)\)/);
  if (parenMatch) {
    return parenMatch[1];
  }

  // Fallback: if the whole raw string has a URL inside brackets at the start
  const bracketMatch = raw.match(/^\[(https?:\/\/[^\s\]]+)\]/);
  if (bracketMatch) {
    return bracketMatch[1];
  }

  return raw;
}

function getFlashSourceHtml(s, timeClass = 'flash-time') {
  if (!s.source && !s.src) return '';
  const sourceText = esc(s.source || s.src);
  const newspaperSvg = `<svg viewBox="0 0 24 24" width="10.5" height="10.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -1px; opacity: 0.8; display: inline-block;"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"></path></svg>`;
  const label = `<span style="opacity: 0.65; font-weight: normal; margin-right: 3px;">Source:</span>`;
  const cleanUrl = cleanSourceUrl(s.source_url);
  if (cleanUrl) {
    return `<span class="${timeClass}">${newspaperSvg}${label}<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="flash-source-link"><span class="flash-source-name-text">${sourceText}</span>&nbsp;↗</a></span>`;
  }
  if (s.source_search) {
    return `<span class="${timeClass}">${newspaperSvg}${label}<a href="https://www.google.com/search?q=${encodeURIComponent(s.source_search)}" target="_blank" rel="noopener noreferrer" class="flash-source-link"><span class="flash-source-name-text">${sourceText}</span>&nbsp;↗</a></span>`;
  }
  return `<span class="${timeClass}">${newspaperSvg}${label}<span>${sourceText}</span></span>`;
}

/* ── Mobile Layout Renderer ── */
/* ── Flash card inner-HTML builder (reused by animation + render) ── */
function buildFlashCardInnerHTML(s, col, isSaved) {
  const rgb = getCategoryColorRgb(s.cat);
  const actionsHtml = `
    <div class="flash-why-actions">
      <button class="flash-float-btn flash-bookmark-btn ${isSaved ? 'saved' : ''}" data-id="${esc(s.id)}" aria-label="Save story"${isSaved ? ` style="color:${col};"` : ''}>
        <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" stroke-width="2.2" fill="${isSaved ? 'currentColor' : 'none'}" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>
      <button class="flash-float-btn flash-share-btn" data-id="${esc(s.id)}" aria-label="Share story">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
        </svg>
      </button>
    </div>`;

  const whyItMattersHtml = s.why_it_matters ? `
    <div class="flash-why-it-matters" style="--cat-color:${col}; --cat-color-rgb:${rgb};">
      <div class="flash-why-header-row">
        <div class="flash-why-label-group">
          <svg class="flash-why-icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span class="flash-why-label">Why It Matters</span>
        </div>
        ${actionsHtml}
      </div>
      <span class="flash-why-value">${esc(s.why_it_matters)}</span>
    </div>` : '';

  return `
    <div class="flash-card-content-area" style="--cat-color: ${col}; --cat-color-rgb: ${rgb};">
      <div class="flash-card-top-row">
        <div class="flash-card-icon-badge" style="background: rgba(${rgb}, 0.08); border: 1px solid rgba(${rgb}, 0.15);">
          <div class="flash-card-visual" style="width: 28px; height: 28px; color: ${col}; background: none; border: none; padding: 0;">
            ${getFlashIllustration(s.cat, s.id)}
          </div>
        </div>
        <span class="flash-cat-badge" style="background:rgba(${rgb},0.12); color:${col}; border: 1px solid rgba(${rgb},0.25);">${esc(FLASH_LABELS[s.cat] || s.cat)}</span>
      </div>
      <h2 class="flash-headline">${esc(s.headline || s.hl)}</h2>
      <div class="flash-summary"><p>${esc(s.summary || s.body)}</p></div>
      ${whyItMattersHtml}
      <div class="flash-card-source-bottom">
        ${getFlashSourceHtml(s, 'flash-time')}
        ${!s.why_it_matters ? actionsHtml : ''}
      </div>
    </div>`;
}

function renderFlashMobileLayout(targetDate) {
  const total = deckItems.length;
  currentFlashIndex = Math.max(0, Math.min(total - 1, currentFlashIndex));

  if (total === 0) {
    app.innerHTML = `
      <div class="flash-container">
        <div class="flash-categories-bar" id="flash-cats">
          ${renderFlashCategoryPills()}
        </div>
        <div class="flash-card-stage">
          <div class="flash-card" style="justify-content:center;align-items:center;">
            <div class="saved-empty-icon">◦</div>
            <div class="saved-empty-text">No stories available in this category.</div>
          </div>
        </div>
        <div class="flash-progress-track">
          <div class="flash-progress-fill" style="width:0%;"></div>
        </div>
      </div>`;
    updateFlashCounter(0, 0);
    wireFlashCategories();
    return;
  }

  const firstStory = deckItems.find(item => item.type === 'story');
  const firstCol = firstStory ? getCategoryColor(firstStory.data.cat) : '#3E3E50';
  const firstRgb = firstStory ? getCategoryColorRgb(firstStory.data.cat) : '62,62,80';

  app.innerHTML = `
    <div class="flash-container" style="--cat-color:${firstCol};--cat-color-rgb:${firstRgb}; position: relative;">
      <div class="flash-categories-bar" id="flash-cats">
        ${renderFlashCategoryPills()}
      </div>
      <div class="flash-card-stage" id="flash-card-stage"></div>
      <div class="flash-progress-track">
        <div class="flash-progress-fill" style="width:0%;"></div>
      </div>
    </div>`;

  wireFlashCategories();
  attachPhysicalDrag();
  updateFlashProgressUI();

  if (currentFlashIndex >= total - 2) {
    triggerNextDayPreload();
  }
}

/* ── Desktop Layout Renderer ── */
function renderFlashDesktopLayout(filtered, targetDate) {
  app.innerHTML = `
    <div class="flash-desktop-container">

      
      <div class="flash-categories-bar-container">
        <div class="flash-categories-bar" id="flash-cats">
          ${renderFlashCategoryPills()}
        </div>
      </div>
      <div class="flash-feed-info" style="text-align: center; font-family: var(--mono); font-size: 11px; color: var(--ink-3); margin-top: -8px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.06em;">
        Showing ${filtered.length} stories · ${new Set(filtered.map(fs => fs.cat)).size} categories
      </div>
      
      <div class="flash-grid-container">
        ${renderDesktopGrid(filtered, targetDate)}
      </div>
    </div>
  `;

  wireFlashCategories();
  wireFlashDesktopEvents(filtered, targetDate);
  if (filtered.length > 0) {
    filtered.slice(0, 5).forEach(s => window.flashSessionViewedIds.add(s.id));
    checkAndShowNudge();
  }
}

function renderDesktopGrid(filtered, targetDate) {
  if (filtered.length === 0) {
    return `
      <div class="saved-empty-state" style="margin-top: 60px; text-align: center;">
        <div class="saved-empty-icon" style="font-size: 32px; color: var(--ink-3);">◦</div>
        <div class="saved-empty-text" style="font-family: var(--sans); color: var(--ink-2); font-size: 14px; margin-top: 8px;">No stories available in this category.</div>
      </div>`;
  }

  const heroStory = filtered[0];
  const gridStories = filtered.slice(1);

  const heroCol = getCategoryColor(heroStory.cat);
  const heroRgb = getCategoryColorRgb(heroStory.cat);
  const heroSaved = getSavedStories().some(fs => fs.id === heroStory.id);

  const heroBenefitsChips = (heroStory.who_benefits || []).map(b => `
    <span class="desktop-benefit-chip" style="border-color: rgba(${heroRgb}, 0.25); color: ${heroCol};">${esc(b)}</span>
  `).join("");

  // Resolve views
  let localReads = {};
  try {
    localReads = JSON.parse(localStorage.getItem("flash_reads_fallback") || "{}");
  } catch (e) { }
  const heroViews = localReads[heroStory.id] || 1;

  // Check if hero story has deep dive
  const heroGoDeeper = heroStory.hasDeepDive || dayCache[targetDate]?.stories.some(ts => ts.id === heroStory.id);

  const heroHl = heroStory.headline || heroStory.hl;
  const heroBody = heroStory.summary || heroStory.body;
  const heroSource = heroStory.source || heroStory.src;

  const heroWhyHtml = heroStory.why_it_matters
    ? `<div class="hero-why-box" style="border-left: 2px solid ${heroCol}; padding-left: 10px; margin-top: 12px; font-family: var(--body); font-size: 15px; color: var(--ink-2); line-height: 1.5;">
         <strong style="color: var(--accent); font-family: var(--mono); font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; margin-right: 4px;">Why it matters:</strong> ${esc(heroStory.why_it_matters)}
       </div>`
    : "";


  const heroHtml = `
    <div class="desktop-hero-card" data-id="${esc(heroStory.id)}" style="--cat-color: ${heroCol}; --cat-color-rgb: ${heroRgb};">
      <div class="hero-card-header">
        <div class="flash-card-icon-badge" style="background: rgba(${heroRgb}, 0.08); border: 1px solid rgba(${heroRgb}, 0.15);">
          <div class="flash-card-visual" style="width: 28px; height: 28px; color: ${heroCol}; background: none; border: none; padding: 0;">
            ${getFlashIllustration(heroStory.cat, heroStory.id)}
          </div>
        </div>
        <span class="hero-cat-badge" style="background: rgba(${heroRgb}, 0.1); color: ${heroCol};">${esc(FLASH_LABELS[heroStory.cat] || heroStory.cat)}</span>
        <span style="flex:1;"></span>
        ${getFlashSourceHtml(heroStory, 'hero-time')}
      </div>
      <h2 class="hero-headline">${esc(heroHl)}</h2>
      <p class="hero-summary">${esc(heroBody)}</p>
      
      ${heroWhyHtml}
      ${heroBenefitsChips ? `
        <div class="hero-benefits-row">
          <span class="hero-benefits-label">Benefits:</span>
          ${heroBenefitsChips}
        </div>` : ''}
      
      <div class="hero-card-footer">
        <span class="hero-views-count" style="display: inline-flex; align-items: center; gap: 4px;">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="stroke: currentColor;">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span id="views-${esc(heroStory.id)}">${heroViews}</span> reads
        </span>
        <div class="desktop-card-actions">
          <button class="desktop-action-btn ${heroSaved ? 'saved' : ''} action-save-btn" data-id="${esc(heroStory.id)}" style="color: ${heroSaved ? heroCol : ''}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="${heroSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>${heroSaved ? 'Saved' : 'Save'}</span>
          </button>
          
          <button class="desktop-action-btn action-share-btn" data-id="${esc(heroStory.id)}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <span>Share</span>
          </button>

          ${heroGoDeeper ? `
            <button class="desktop-action-btn desktop-go-deeper-btn" data-id="${esc(heroStory.id)}">
              Go Deeper &rarr;
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  const gridHtml = gridStories.map(s => {
    const col = getCategoryColor(s.cat);
    const rgb = getCategoryColorRgb(s.cat);
    const isSaved = getSavedStories().some(fs => fs.id === s.id);

    const benefitsChips = (s.who_benefits || []).map(b => `
      <span class="desktop-benefit-chip" style="border-color: rgba(${rgb}, 0.25); color: ${col};">${esc(b)}</span>
    `).join("");

    const sViews = localReads[s.id] || 1;
    const sGoDeeper = s.hasDeepDive || dayCache[targetDate]?.stories.some(ts => ts.id === s.id);
    const sHl = s.headline || s.hl;
    const sBody = s.summary || s.body;

    const sWhyHtml = s.why_it_matters
      ? `<div class="grid-why-box" style="border-left: 2px solid ${col}; padding-left: 8px; margin-top: 10px; font-family: var(--body); font-size: 14.5px; color: var(--ink-2); line-height: 1.5;">
           <strong style="color: var(--accent); font-family: var(--mono); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; margin-right: 4px;">Why it matters:</strong> ${esc(s.why_it_matters)}
         </div>`
      : "";

    return `
      <div class="desktop-grid-card" data-id="${esc(s.id)}" style="--cat-color: ${col}; --cat-color-rgb: ${rgb};">
        <div class="grid-card-header">
          <div class="flash-card-icon-badge" style="background: rgba(${rgb}, 0.08); border: 1px solid rgba(${rgb}, 0.15);">
            <div class="flash-card-visual" style="width: 24px; height: 24px; color: ${col}; background: none; border: none; padding: 0;">
              ${getFlashIllustration(s.cat, s.id)}
            </div>
          </div>
          <span class="grid-cat-badge" style="background: rgba(${rgb}, 0.1); color: ${col};">${esc(FLASH_LABELS[s.cat] || s.cat)}</span>
          <span style="flex:1;"></span>
          ${getFlashSourceHtml(s, 'grid-time')}
        </div>
        <h3 class="grid-headline">${esc(sHl)}</h3>
        <p class="grid-summary">${esc(sBody)}</p>
        
        ${sWhyHtml}
        ${benefitsChips ? `
          <div class="grid-benefits-row">
            ${benefitsChips}
          </div>` : ''}
        
        <div class="grid-card-footer">
          <span class="grid-views-count" style="display: inline-flex; align-items: center; gap: 4px;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="stroke: currentColor;">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span id="views-${esc(s.id)}">${sViews}</span> reads
          </span>
          <div class="desktop-card-actions">
            <button class="desktop-action-btn ${isSaved ? 'saved' : ''} action-save-btn" data-id="${esc(s.id)}" style="color: ${isSaved ? col : ''}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>${isSaved ? 'Saved' : 'Save'}</span>
            </button>
            
            <button class="desktop-action-btn action-share-btn" data-id="${esc(s.id)}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              <span>Share</span>
            </button>

            ${sGoDeeper ? `
              <button class="desktop-action-btn desktop-go-deeper-btn" data-id="${esc(s.id)}">
                Go Deeper &rarr;
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    ${heroHtml}
    <div class="flash-grid">
      ${gridHtml}
    </div>
  `;
}

function wireFlashDesktopEvents(filtered, targetDate) {
  // 1. Share buttons clicks
  const shareBtns = document.querySelectorAll(".action-share-btn");
  shareBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const story = flashStories.find(fs => fs.id === id);
      if (story) {
        const url = `${window.location.origin}${BASE_PATH}/flash/story/${story.id}`;
        const headline = story.headline || story.hl;
        openShareSheet(url, headline);
      }
    };
  });

  // 2. Save buttons clicks inside grid cards
  const saveBtns = document.querySelectorAll(".action-save-btn");
  saveBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const story = flashStories.find(fs => fs.id === id);
      if (story) {
        const isSaved = toggleBookmark(story);
        const col = getCategoryColor(story.cat);
        btn.classList.toggle("saved", isSaved);
        btn.style.color = isSaved ? col : "";
        const svg = btn.querySelector("svg");
        if (svg) svg.setAttribute("fill", isSaved ? "currentColor" : "none");
        const span = btn.querySelector("span");
        if (span) span.textContent = isSaved ? "Saved" : "Save";

        updateSavedBadge();
      }
    };
  });

  // 3. Go Deeper buttons
  const goDeeperBtns = document.querySelectorAll(".desktop-go-deeper-btn");
  goDeeperBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const story = flashStories.find(fs => fs.id === id);
      if (story && targetDate) {
        switchToBriefingMode();
        navigate(`${BASE_PATH}/story/${targetDate}/${story.id}`);
      }
    };
  });

  // 4. Increment view counts on load (since they are visible directly)
  filtered.forEach(s => {
    trackViewCount(s.id).then(resolvedViews => {
      const vSpan = $(`views-${s.id}`);
      if (vSpan) {
        vSpan.textContent = resolvedViews;
      }
    });
  });
}

function updateSavedBadge() {
  const badge = $("saved-count-badge");
  const bottomBadge = $("bottom-nav-saved-badge");
  const desktopBadge = $("desktop-saved-badge");
  const savedCount = getSavedStories().length;
  if (badge) {
    badge.textContent = savedCount;
    badge.style.display = savedCount > 0 ? "inline-flex" : "none";
  }
  if (bottomBadge) {
    bottomBadge.textContent = savedCount;
    bottomBadge.style.display = savedCount > 0 ? "flex" : "none";
  }
  if (desktopBadge) {
    desktopBadge.style.display = savedCount > 0 ? "block" : "none";
  }
}

function switchToBriefingMode() {
  currentMode = "briefing";
  localStorage.setItem("currentMode", "briefing");
  updateModeToggleUI();
}

window.flashSessionViewedIds = window.flashSessionViewedIds || new Set();
window.flashTimeSpentInFlash = window.flashTimeSpentInFlash || 0;
window.flashTimer = window.flashTimer || null;

function checkAndShowNudge() {
  if (currentMode !== "flash") {
    const nudge = $("flash-nudge-card");
    if (nudge) nudge.classList.remove("active");
    return;
  }

  if (sessionStorage.getItem("nudgeDismissed") === "true") {
    const nudge = $("flash-nudge-card");
    if (nudge) nudge.classList.remove("active");
    return;
  }

  const viewedCount = window.flashSessionViewedIds ? window.flashSessionViewedIds.size : 0;
  const timeSpent = window.flashTimeSpentInFlash || 0;

  if (viewedCount >= 10 || timeSpent >= 25) {
    let nudge = $("flash-nudge-card");
    if (!nudge) {
      nudge = document.createElement("div");
      nudge.id = "flash-nudge-card";
      nudge.className = "flash-nudge-card";
      nudge.innerHTML = `
        <button class="flash-nudge-close" id="flash-nudge-close" aria-label="Dismiss nudge">×</button>
        <div class="flash-nudge-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
        </div>
        <div class="flash-nudge-body">
          <div class="flash-nudge-title">Want deeper insights?</div>
          <div class="flash-nudge-text">Explore today's key stories with more context and analysis.</div>
          <div class="flash-nudge-counter" id="flash-nudge-counter">You've viewed ${viewedCount} stories</div>
        </div>
        <button class="flash-nudge-btn" id="flash-nudge-btn">
          Explore Deep Dives <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left:2px; stroke: currentColor;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
      `;
      document.body.appendChild(nudge);

      const closeBtn = nudge.querySelector("#flash-nudge-close");
      if (closeBtn) {
        closeBtn.onclick = () => {
          sessionStorage.setItem("nudgeDismissed", "true");
          nudge.classList.remove("active");
        };
      }

      const ctaBtn = nudge.querySelector("#flash-nudge-btn");
      if (ctaBtn) {
        ctaBtn.onclick = () => {
          sessionStorage.setItem("nudgeDismissed", "true");
          nudge.classList.remove("active");
          switchToBriefingMode();
          navigate(`${BASE_PATH}/briefings`);
        };
      }
    } else {
      const counterEl = nudge.querySelector("#flash-nudge-counter");
      if (counterEl) {
        counterEl.textContent = `You've viewed ${viewedCount} stories`;
      }
    }

    setTimeout(() => {
      nudge.classList.add("active");
    }, 50);
  }
}

function updateModeToggleUI() {
  const segFlash = $("seg-flash");
  const segBriefing = $("seg-briefing");
  const wordmark = $("wordmark-link");
  const bottomFlash = $("bottom-nav-flash");
  const bottomBriefing = $("bottom-nav-briefing");
  const bottomSaved = $("bottom-nav-saved");
  const jumpTodayBtn = $("jump-to-today-btn");

  if (jumpTodayBtn) {
    jumpTodayBtn.classList.add("hidden");
  }

  if (bottomFlash) bottomFlash.classList.remove("active");
  if (bottomBriefing) bottomBriefing.classList.remove("active");
  if (bottomSaved) bottomSaved.classList.remove("active");

  let path = window.location.pathname;
  if (path.endsWith("/index.html")) {
    path = path.slice(0, -11);
  }
  path = path.replace(/\/+$/, "") || "/";
  if (BASE_PATH && path.startsWith(BASE_PATH)) {
    path = path.slice(BASE_PATH.length) || "/";
  }
  path = path.replace(/\/+$/, "") || "/";

  if (path === "/saved" || path === "/install") {
    if (path === "/saved" && bottomSaved) bottomSaved.classList.add("active");
    document.body.classList.remove("mode-flash-active");
    document.documentElement.classList.remove("mode-flash-active");
    if (segFlash) segFlash.classList.remove("active");
    if (segBriefing) segBriefing.classList.remove("active");
    if (bottomFlash) bottomFlash.classList.remove("active");
    if (bottomBriefing) bottomBriefing.classList.remove("active");
  } else if (currentMode === "flash") {
    document.body.classList.add("mode-flash-active");
    document.documentElement.classList.add("mode-flash-active");
    if (segFlash) { segFlash.classList.add("active"); }
    if (segBriefing) { segBriefing.classList.remove("active"); }
    if (wordmark) { wordmark.href = `${BASE_PATH}/flash`; }
    if (bottomFlash) bottomFlash.classList.add("active");

    if (!window.flashTimer) {
      window.flashTimer = setInterval(() => {
        if (currentMode === "flash") {
          window.flashTimeSpentInFlash++;
          checkAndShowNudge();
        } else {
          clearInterval(window.flashTimer);
          window.flashTimer = null;
        }
      }, 1000);
    }
  } else {
    document.body.classList.remove("mode-flash-active");
    document.documentElement.classList.remove("mode-flash-active");
    if (segFlash) { segFlash.classList.remove("active"); }
    if (segBriefing) { segBriefing.classList.add("active"); }
    if (wordmark) { wordmark.href = `${BASE_PATH}/briefings`; }
    if (bottomFlash) bottomFlash.classList.remove("active");
    if (bottomBriefing) bottomBriefing.classList.add("active");
    const ctr = $("flash-header-counter");
    if (ctr) ctr.textContent = "";

    const nudge = $("flash-nudge-card");
    if (nudge) {
      nudge.classList.remove("active");
    }
    if (window.flashTimer) {
      clearInterval(window.flashTimer);
      window.flashTimer = null;
    }
  }
}

function initModeToggle() {
  const segFlash = $("seg-flash");
  const segBriefing = $("seg-briefing");

  function handleModeSwitch(newMode) {
    if (currentMode === newMode) return;
    currentMode = newMode;
    localStorage.setItem("currentMode", currentMode);
    updateModeToggleUI();

    let p = location.pathname;
    if (p.endsWith("/index.html")) p = p.slice(0, -11);
    p = p.replace(/\/+$/, "") || "/";
    if (BASE_PATH && p.startsWith(BASE_PATH)) p = p.slice(BASE_PATH.length) || "/";
    p = p.replace(/\/+$/, "") || "/";

    const storyMatch = p.match(/^\/story\/([^/]+)\/(.+)$/);
    const briefingsDayMatch = p.match(/^\/briefings\/day\/([^/]+)$/);
    const flashDayMatch = p.match(/^\/flash\/day\/([^/]+)$/);

    if (storyMatch) {
      if (currentMode === "flash") navigate(`${BASE_PATH}/flash/day/${storyMatch[1]}`);
      else route();
    } else if (briefingsDayMatch) {
      navigate(`${BASE_PATH}/flash/day/${briefingsDayMatch[1]}`);
    } else if (flashDayMatch) {
      navigate(`${BASE_PATH}/briefings/day/${flashDayMatch[1]}`);
    } else {
      if (currentMode === "flash") navigate(`${BASE_PATH}/flash`);
      else navigate(`${BASE_PATH}/briefings`);
    }
  }

  if (segFlash) segFlash.onclick = () => handleModeSwitch("flash");
  if (segBriefing) segBriefing.onclick = () => handleModeSwitch("briefing");

  updateModeToggleUI();
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
      trackEvent("click_related_flash", "Engagement", storyId);
      openFlashStory(storyId);
    }
  });
}

function renderInstallPage() {
  // Lock body scroll removal to ensure natural scrolling
  document.body.classList.remove("mode-flash-active");
  document.documentElement.classList.remove("mode-flash-active");

  app.innerHTML = `
    <div class="install-page-container">
      <div class="install-page-header">
        <h1 class="install-title">Install The Briefing</h1>
        <p class="install-subtitle">Add The Briefing to your home screen for a fast, native, app-like experience with offline capabilities.</p>
      </div>

      <div class="install-cta-section-top">
        <button id="pwa-main-install-btn" class="install-cta-btn-large">Install Now</button>
        <p class="install-cta-subtext">Quick setup for Chrome, Safari, Edge, and Samsung Internet.</p>
      </div>

      <h2 class="install-section-title">Manual Setup Instructions</h2>
      <div class="install-cards-grid">
        <div class="install-card">
          <div class="install-card-logo-row">
            <div class="install-logo-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style="color: #3DDC84;">
                <path d="M17.6 9.48l1.84-3.18c.16-.28.07-.64-.21-.8-.28-.16-.64-.07-.8.21l-1.88 3.24C15.24 8.36 13.68 8 12 8s-3.24.36-4.55.95L5.57 5.71c-.16-.28-.52-.37-.8-.21-.28.16-.37.52-.21.8l1.84 3.18C3.84 11.23 2 13.91 2 17h20c0-3.09-1.84-5.77-4.4-7.52zM7 14.75c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25zm10 0c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"/>
              </svg>
            </div>
            <h3 class="install-card-title">Android</h3>
          </div>
          <ol class="install-steps">
            <li>Open the browser settings menu (three dots <strong>⋮</strong>).</li>
            <li>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li>
            <li>Confirm the prompt to pin it to your apps drawer.</li>
          </ol>
        </div>

        <div class="install-card">
          <div class="install-card-logo-row">
            <div class="install-logo-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style="color: var(--ink);">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.82M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.82 1.45-.6.69-1.12 1.84-.98 2.94.1.08 1.15.08 2.81-1.33z"/>
              </svg>
            </div>
            <h3 class="install-card-title">iPhone / iOS</h3>
          </div>
          <ol class="install-steps">
            <li>Tap Safari's bottom **Share** icon (square with arrow up <strong>⎋</strong>).</li>
            <li>Scroll down and tap **Add to Home Screen**.</li>
            <li>Confirm by tapping **Add** in the top-right corner.</li>
          </ol>
        </div>

        <div class="install-card">
          <div class="install-card-logo-row">
            <div class="install-logo-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style="color: #4285F4;">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H4v-4h11v4zm0-5H4V9h11v4zm5 5h-4V9h4v9z"/>
              </svg>
            </div>
            <h3 class="install-card-title">Desktop</h3>
          </div>
          <ol class="install-steps">
            <li>Click the install icon on the right side of the URL address bar.</li>
            <li>Click **Install** on the popup confirmation message.</li>
          </ol>
        </div>
      </div>
    </div>
  `;

  const installBtn = document.getElementById("pwa-main-install-btn");
  if (installBtn) {
    installBtn.onclick = async () => {
      trackEvent("pwa_install_page_click", "PWA", "Page CTA Clicked");
      if (window.showInstallPrompt) {
        const accepted = await window.showInstallPrompt();
        if (accepted) {
          showToast("Installation started!");
        } else {
          showToast("Prompt closed. Follow the manual steps below to install.");
        }
      } else {
        showToast("Install prompt is not supported by your browser. Please follow the manual steps below.");
      }
    };
  }
}

function initSlideMenu() {
  const trigger = $("menu-trigger");
  const close = $("menu-close");
  const overlay = $("menu-overlay");
  const menu = $("slide-menu");

  if (!menu) return;

  function openMenu() {
    menu.classList.add("open");
    if (overlay) overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    renderMenuSavedItems();
    updateMenuThemeUI();
  }

  function closeMenu() {
    menu.classList.remove("open");
    if (overlay) overlay.classList.remove("open");
    document.body.style.overflow = "";
  }
  window.closeSlideMenu = closeMenu;
  window.openSlideMenu = openMenu;

  if (trigger) trigger.onclick = openMenu;
  if (close) close.onclick = closeMenu;
  if (overlay) overlay.onclick = closeMenu;

  // ESC to close
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && menu.classList.contains("open")) closeMenu();
  });

  // Search trigger inside menu
  const menuSearchTrigger = $("menu-search-trigger");
  if (menuSearchTrigger) {
    menuSearchTrigger.onclick = () => {
      closeMenu();
      if (window.openGlobalSearch) window.openGlobalSearch();
    };
  }

  // Install trigger
  const installTrigger = $("menu-install-trigger");
  if (installTrigger) {
    installTrigger.onclick = () => {
      closeMenu();
      navigate(`${BASE_PATH}/install`);
    };
  }

  // Theme control inside menu
  const lightBtn = $("menu-theme-light");
  const darkBtn = $("menu-theme-dark");

  function updateMenuThemeUI() {
    const activeTheme = document.documentElement.getAttribute("data-theme") || "light";
    if (lightBtn) lightBtn.classList.toggle("active", activeTheme === "light");
    if (darkBtn) darkBtn.classList.toggle("active", activeTheme === "dark");
  }

  if (lightBtn) {
    lightBtn.onclick = () => {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
      trackEvent("theme_toggle_menu", "Preferences", "light");
      updateMenuThemeUI();
    };
  }
  if (darkBtn) {
    darkBtn.onclick = () => {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
      trackEvent("theme_toggle_menu", "Preferences", "dark");
      updateMenuThemeUI();
    };
  }

  function renderMenuSavedItems() {
    const savedList = $("menu-saved-list");
    if (!savedList) return;
    const saved = getSavedStories();
    if (saved.length === 0) {
      savedList.innerHTML = `<div style="font-family:var(--sans); font-size:11px; color:var(--ink-3); padding: 4px 0;">No saved items yet.</div>`;
      return;
    }
    const grouped = {};
    saved.forEach(s => {
      const date = s.date || "Unknown Date";
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(s);
    });
    const dates = Object.keys(grouped).sort().reverse();

    let html = "";
    dates.forEach(d => {
      html += `<div class="menu-saved-group">
        <div class="menu-saved-date">${fmtHeaderDate(d)}</div>`;
      grouped[d].forEach(s => {
        const isFlash = s.cat && s.cat !== "briefing";
        const typeLabel = isFlash ? "Flash" : "Deep Dive";
        const link = isFlash ? `${BASE_PATH}/flash/story/${s.id}` : `${BASE_PATH}/story/${d}/${s.id}`;
        html += `
          <a href="${link}" class="menu-saved-item" data-id="${esc(s.id)}" data-date="${esc(d)}" data-type="${isFlash ? 'flash' : 'briefing'}">
            <span class="menu-saved-type-badge">${typeLabel}</span>
            <span class="menu-saved-title-text">${esc(s.headline || s.hl)}</span>
          </a>
        `;
      });
      html += `</div>`;
    });
    savedList.innerHTML = html;

    savedList.querySelectorAll('.menu-saved-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        closeMenu();
        const href = item.getAttribute('href');
        navigate(href);
      });
    });
  }

  updateMenuThemeUI();
}

// Global keydown listner for desktop arrow keys
window.addEventListener("keydown", e => {
  if (currentMode !== "flash") return;
  if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;

  const filtered = activeFlashCategory === "all"
    ? flashStories
    : flashStories.filter(s => s.cat === activeFlashCategory);

  if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    navigateFlash(-1, filtered);
  } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    navigateFlash(1, filtered);
  }
});

window.addEventListener("popstate", route);
window.addEventListener("hashchange", route);
document.body.addEventListener("click", e => {
  const a = e.target.closest("a");
  if (a && a.href && a.href.startsWith(window.location.origin) && !a.hasAttribute("target")) {
    e.preventDefault();
    history.pushState(null, "", a.href);
    route();
  }
});

// Window resize handler to switch layouts dynamically between mobile reels and desktop grid
let isDesktopLayout = window.innerWidth >= 992;
window.addEventListener("resize", () => {
  const check = window.innerWidth >= 992;
  if (check !== isDesktopLayout) {
    isDesktopLayout = check;
    if (currentMode === "flash") {
      let p = location.pathname;
      if (p.endsWith("/index.html")) p = p.slice(0, -11);
      p = p.replace(/\/+$/, "") || "/";
      if (BASE_PATH && p.startsWith(BASE_PATH)) p = p.slice(BASE_PATH.length) || "/";
      p = p.replace(/\/+$/, "") || "/";
      const d = p.match(/^\/day\/([^/]+)$/);
      const activeDate = d ? decodeURIComponent(d[1]) : null;
      renderFlashView(activeDate);
    }
  }
});

// ── Search Engine ─────────────────────────────────────────────
function initSearch() {
  const trigger = $("search-trigger");
  const overlay = $("search-overlay");
  const closeBtn = $("search-close");
  const input = $("search-input");

  if (!overlay) return;

  function openSearch() {
    overlay.classList.add("open");
    setTimeout(() => { if (input) input.focus(); }, 50);
    document.body.style.overflow = "hidden";
  }
  window.openGlobalSearch = openSearch;

  function closeSearch() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    if (input) { input.value = ""; renderSearchResults([]); }
    const empty = $("search-empty");
    if (empty) empty.style.display = "flex";
  }

  if (trigger) trigger.onclick = openSearch;
  const desktopSearchBtn = $("desktop-search-btn");
  if (desktopSearchBtn) desktopSearchBtn.onclick = openSearch;
  if (closeBtn) closeBtn.onclick = closeSearch;

  // ESC to close
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeSearch();
  });

  // Live search on input
  let debounceTimer;
  if (input) {
    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      const empty = $("search-empty");
      if (!q) {
        renderSearchResults([]);
        if (empty) empty.style.display = "flex";
        return;
      }
      if (empty) empty.style.display = "none";
      debounceTimer = setTimeout(() => {
        const results = searchAll(q);
        trackEvent("search", "Engagement", q);
        renderSearchResults(results, q);
      }, 120);
    });
  }
}

function searchAll(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results = [];

  // ── Flash stories ──────────────────────────────────────────
  const allFlash = Array.isArray(flashStories) ? flashStories : [];
  for (const s of allFlash) {
    const hl = (s.headline || s.hl || "").toLowerCase();
    const sum = (s.summary || s.body || "").toLowerCase();
    const cat = (FLASH_LABELS[s.cat] || s.cat || "").toLowerCase();
    const why = (s.why_it_matters || "").toLowerCase();
    const hlScore = hl.includes(q) ? 3 : 0;
    const sumScore = sum.includes(q) ? 1 : 0;
    const catScore = cat.includes(q) ? 1 : 0;
    const whyScore = why.includes(q) ? 1 : 0;
    const score = hlScore + sumScore + catScore + whyScore;
    if (score > 0) {
      results.push({
        type: "flash",
        score,
        id: s.id,
        cat: s.cat,
        headline: s.headline || s.hl,
        meta: `${FLASH_LABELS[s.cat] || s.cat}${s.source ? " · " + s.source : ""}`,
      });
    }
  }

  // ── Briefing deep dives ────────────────────────────────────
  for (const entry of (indexEntries || [])) {
    const payload = dayCache[entry.date];
    if (!payload || !Array.isArray(payload.stories)) continue;
    for (const s of payload.stories) {
      const hl = (s.headline || "").toLowerCase();
      const tldr = (s.tldr || s.summary || "").toLowerCase();
      const hlScore = hl.includes(q) ? 3 : 0;
      const tlScore = tldr.includes(q) ? 1 : 0;
      const score = hlScore + tlScore;
      if (score > 0) {
        results.push({
          type: "briefing",
          score,
          id: s.id,
          date: entry.date,
          headline: s.headline,
          meta: `Deep Dive · ${entry.date}`,
        });
      }
    }
  }

  // Sort by score desc, then alphabetically
  results.sort((a, b) => b.score - a.score || a.headline.localeCompare(b.headline));
  return results.slice(0, 30);
}

function renderSearchResults(results, query) {
  const list = $("search-results-list");
  if (!list) return;
  if (!results.length) {
    list.innerHTML = query
      ? `<div class="search-no-results">No results found for "<strong>${esc(query)}</strong>"</div>`
      : "";
    return;
  }

  const flashItems = results.filter(r => r.type === "flash");
  const briefingItems = results.filter(r => r.type === "briefing");

  function highlight(text, q) {
    if (!q || !text) return esc(text || "");
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return esc(text);
    return esc(text.slice(0, idx)) +
      `<mark style="background:rgba(255,87,34,.18);color:var(--accent);border-radius:2px;">` +
      esc(text.slice(idx, idx + q.length)) +
      `</mark>` + esc(text.slice(idx + q.length));
  }

  let html = "";
  if (flashItems.length) {
    html += `<div class="search-group-label">⚡ Flash News</div>`;
    for (const r of flashItems) {
      html += `<div class="search-result-item" data-type="flash" data-id="${esc(r.id)}" data-cat="${esc(r.cat)}">
        <span class="search-result-badge flash-badge">${esc(FLASH_LABELS[r.cat] || r.cat)}</span>
        <div class="search-result-content">
          <div class="search-result-headline">${highlight(r.headline, query)}</div>
          <div class="search-result-meta">${esc(r.meta)}</div>
        </div>
      </div>`;
    }
  }
  if (briefingItems.length) {
    html += `<div class="search-group-label">📰 Deep Dives</div>`;
    for (const r of briefingItems) {
      html += `<div class="search-result-item" data-type="briefing" data-id="${esc(r.id)}" data-date="${esc(r.date)}">
        <span class="search-result-badge brief-badge">Briefing</span>
        <div class="search-result-content">
          <div class="search-result-headline">${highlight(r.headline, query)}</div>
          <div class="search-result-meta">${esc(r.meta)}</div>
        </div>
      </div>`;
    }
  }
  list.innerHTML = html;

  // Wire clicks
  list.querySelectorAll(".search-result-item").forEach(item => {
    item.addEventListener("click", () => {
      const type = item.dataset.type;
      const id = item.dataset.id;
      trackEvent("click_search_result", "Engagement", `${type}:${id}`);
      const overlay = $("search-overlay");
      const input = $("search-input");
      if (overlay) overlay.classList.remove("open");
      document.body.style.overflow = "";
      if (input) input.value = "";
      renderSearchResults([]);

      if (type === "flash") {
        // Jump to the Flash card with that id
        const idx = flashStories.findIndex(s => s.id === id);
        if (idx >= 0) {
          currentFlashIndex = idx;
          activeFlashCategory = "all";
        }
        navigate(`${BASE_PATH}/flash`);
      } else {
        const date = item.dataset.date;
        navigate(`${BASE_PATH}/story/${date}/${id}`);
      }
    });
  });
}

initSearch();

initModeToggle();
initSavedStories();
initSlideMenu();
initDatePicker();

function initBottomNav() {
  const briefingBtn = $("bottom-nav-briefing");
  const flashBtn = $("bottom-nav-flash");
  const savedBtn = $("bottom-nav-saved");
  const menuBtn = $("bottom-nav-menu");
  const jumpTodayBtn = $("jump-to-today-btn");

  if (briefingBtn) {
    briefingBtn.onclick = () => {
      currentMode = "briefing";
      localStorage.setItem("currentMode", "briefing");
      updateModeToggleUI();
      navigate(`${BASE_PATH}/briefings`);
    };
  }

  if (flashBtn) {
    flashBtn.onclick = () => {
      currentMode = "flash";
      localStorage.setItem("currentMode", "flash");
      updateModeToggleUI();
      currentFlashIndex = 0;
      window.isViewingSavedFlashes = false;
      navigate(`${BASE_PATH}/flash`);
    };
  }

  if (jumpTodayBtn) {
    jumpTodayBtn.onclick = () => {
      currentFlashIndex = 0;
      window.isViewingSavedFlashes = false;
      navigate(`${BASE_PATH}/flash`);
    };
  }

  if (savedBtn) {
    savedBtn.onclick = () => {
      navigate(`${BASE_PATH}/saved`);
    };
  }

  if (menuBtn) {
    menuBtn.onclick = () => {
      if (typeof window.openSlideMenu === "function") {
        window.openSlideMenu();
      } else {
        const menu = $("slide-menu");
        const overlay = $("menu-overlay");
        if (menu && overlay) {
          menu.classList.add("open");
          overlay.classList.add("open");
          document.body.style.overflow = "hidden";
        }
      }
    };
  }
}

initBottomNav();
route();

window.showPwaBanner = function () {
  const dismissed = localStorage.getItem('pwa_install_dismissed');
  if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

  if (document.getElementById('pwa-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.className = 'pwa-install-banner';

  const iconPath = window.location.pathname.includes('/flash') || window.location.pathname.includes('/story') ? '../icon-192.png' : './icon-192.png';

  banner.innerHTML = `
    <div class="pwa-install-icon">
      <img src="${iconPath}" alt="Icon">
    </div>
    <div class="pwa-install-text">
      <h4>Install The Briefing</h4>
      <p>Get daily deep dives right on your home screen.</p>
    </div>
    <div class="pwa-install-actions">
      <button id="pwa-install-btn" class="pwa-btn">Install</button>
      <button id="pwa-dismiss-btn" class="pwa-btn secondary">Not Now</button>
    </div>
  `;
  document.body.appendChild(banner);
  trackEvent("pwa_banner_shown", "PWA", "Banner Displayed");

  requestAnimationFrame(() => {
    banner.classList.add('visible');
  });

  const removeBanner = () => {
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 400);
  };

  document.getElementById('pwa-install-btn').onclick = async () => {
    trackEvent("pwa_install_click", "PWA", "Install Clicked");
    if (window.showInstallPrompt) {
      await window.showInstallPrompt();
    }
    removeBanner();
  };

  document.getElementById('pwa-dismiss-btn').onclick = () => {
    trackEvent("pwa_install_dismiss", "PWA", "Not Now Clicked");
    localStorage.setItem('pwa_install_dismissed', Date.now().toString());
    removeBanner();
  };
};

window.addEventListener("DOMContentLoaded", () => {
  if (window.__pwaBannerReady) {
    window.showPwaBanner();
  }
});

/* ── Calendar Date Picker ── */
function initCalendarDatePicker() {
  let wrapper = $("header-date-wrapper");
  let trigger = $("header-date-trigger");
  let dropdown = $("calendar-dropdown");

  if (!wrapper) {
    const hdrDate = $("header-date");
    if (!hdrDate) return;

    wrapper = document.createElement("div");
    wrapper.className = "header-date-wrapper";
    wrapper.id = "header-date-wrapper";

    hdrDate.parentNode.insertBefore(wrapper, hdrDate);

    wrapper.innerHTML = `
      <button class="header-date-trigger" id="header-date-trigger" aria-label="Open date picker">
        <span class="header-date-cal-icon">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </span>
        <span id="header-date" class="header-top-date">${hdrDate.innerHTML}</span>
        <svg class="header-date-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <div class="calendar-dropdown" id="calendar-dropdown">
        <div class="calendar-header">
          <button class="cal-nav-btn" id="cal-prev-month" aria-label="Previous month">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <span class="cal-month-year" id="cal-month-year"></span>
          <button class="cal-nav-btn" id="cal-next-month" aria-label="Next month">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
        <div class="cal-weekdays" id="cal-weekdays"></div>
        <div class="cal-grid" id="cal-grid"></div>
        <div class="cal-footer">
          <button class="cal-today-btn" id="cal-today-btn">Today</button>
        </div>
      </div>
    `;

    hdrDate.parentNode.removeChild(hdrDate);

    trigger = wrapper.querySelector("#header-date-trigger");
    dropdown = wrapper.querySelector("#calendar-dropdown");
  }

  const monthYearLabel = wrapper.querySelector("#cal-month-year");
  const weekdaysEl = wrapper.querySelector("#cal-weekdays");
  const gridEl = wrapper.querySelector("#cal-grid");
  const prevBtn = wrapper.querySelector("#cal-prev-month");
  const nextBtn = wrapper.querySelector("#cal-next-month");
  const todayBtn = wrapper.querySelector("#cal-today-btn");

  if (!wrapper || !trigger || !dropdown) return;

  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  let calViewMonth, calViewYear;
  let selectedDateStr = "";
  let backdropEl = null;

  // Get the set of available dates from indexEntries
  function getAvailableDates() {
    const dates = new Set();
    if (typeof indexEntries !== "undefined" && Array.isArray(indexEntries)) {
      indexEntries.forEach(e => dates.add(e.date));
    }
    return dates;
  }

  // Get current date from the archive-select or URL
  function getCurrentDateStr() {
    const sel = $("archive-select");
    if (sel && sel.value) return sel.value;
    if (typeof indexEntries !== "undefined" && indexEntries.length > 0) return indexEntries[0].date;
    return new Date().toISOString().split("T")[0];
  }

  // Render weekday headers (once)
  function renderWeekdays() {
    if (!weekdaysEl) return;
    weekdaysEl.innerHTML = WEEKDAYS.map(d => `<span class="cal-weekday">${d}</span>`).join("");
  }

  // Render the month grid
  function renderMonth() {
    if (!gridEl || !monthYearLabel) return;

    monthYearLabel.textContent = `${MONTHS[calViewMonth]} ${calViewYear}`;

    const availableDates = getAvailableDates();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
    const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

    let html = "";

    // Empty cells before the first day
    for (let i = 0; i < firstDay; i++) {
      html += `<button class="cal-day empty" disabled></button>`;
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDateStr;
      const hasData = availableDates.has(dateStr);

      // Dates in the future without data are disabled
      const dateObj = new Date(calViewYear, calViewMonth, d);
      const isFuture = dateObj > today && !hasData;

      let classes = "cal-day";
      if (isToday) classes += " today";
      if (isSelected) classes += " selected";
      if (hasData) classes += " has-data";
      if (isFuture) classes += " disabled";

      html += `<button class="${classes}" data-date="${dateStr}"${isFuture ? " disabled" : ""}>${d}</button>`;
    }

    gridEl.innerHTML = html;

    // Attach click listeners
    gridEl.querySelectorAll(".cal-day:not(.disabled):not(.empty)").forEach(btn => {
      btn.addEventListener("click", () => {
        const dateStr = btn.dataset.date;
        selectDate(dateStr);
      });
    });
  }

  function selectDate(dateStr) {
    selectedDateStr = dateStr;
    closeCalendar();

    // Trigger navigation via archive-select
    const archiveSelect = $("archive-select");
    if (archiveSelect) {
      archiveSelect.value = dateStr;
      archiveSelect.dispatchEvent(new Event("change"));
    }
  }

  function openCalendar() {
    const curDate = getCurrentDateStr();
    selectedDateStr = curDate;

    const d = new Date(curDate + "T00:00:00");
    calViewMonth = isNaN(d.getTime()) ? new Date().getMonth() : d.getMonth();
    calViewYear = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();

    renderWeekdays();
    renderMonth();

    wrapper.classList.add("open");
    dropdown.classList.add("open");

    // Create backdrop
    if (!backdropEl) {
      backdropEl = document.createElement("div");
      backdropEl.className = "calendar-backdrop";
      backdropEl.addEventListener("click", closeCalendar);
    }
    wrapper.appendChild(backdropEl);
  }

  function closeCalendar() {
    wrapper.classList.remove("open");
    dropdown.classList.remove("open");
    if (backdropEl && backdropEl.parentNode) {
      backdropEl.parentNode.removeChild(backdropEl);
    }
  }

  function toggleCalendar() {
    if (wrapper.classList.contains("open")) {
      closeCalendar();
    } else {
      openCalendar();
    }
  }

  // Event listeners
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCalendar();
  });

  if (prevBtn) {
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      calViewMonth--;
      if (calViewMonth < 0) {
        calViewMonth = 11;
        calViewYear--;
      }
      renderMonth();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      calViewMonth++;
      if (calViewMonth > 11) {
        calViewMonth = 0;
        calViewYear++;
      }
      renderMonth();
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      // Check if today has data
      const availableDates = getAvailableDates();
      if (availableDates.has(todayStr)) {
        selectDate(todayStr);
      } else {
        // Navigate to the latest available date
        if (typeof indexEntries !== "undefined" && indexEntries.length > 0) {
          selectDate(indexEntries[0].date);
        } else {
          closeCalendar();
        }
      }
    });
  }

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && wrapper.classList.contains("open")) {
      closeCalendar();
    }
  });

  // Expose for external use
  window.openCalendarPicker = openCalendar;
  window.closeCalendarPicker = closeCalendar;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCalendarDatePicker);
} else {
  initCalendarDatePicker();
}

