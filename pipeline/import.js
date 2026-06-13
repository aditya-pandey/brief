/**
 * pipeline/import.js
 *
 * Parses the Gemini app's markdown briefing output into the site's JSON schema.
 *
 * Usage (pipe from clipboard on macOS):
 *   pbpaste | node pipeline/import.js
 *
 * Or from a saved file:
 *   node pipeline/import.js < output.md
 *
 * Or pass a date override (defaults to today):
 *   pbpaste | node pipeline/import.js 2026-06-07
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = resolve(__dirname, "../data");

// ── Helpers ────────────────────────────────────────────────────────────────────

function slug(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "story";
}

function stripMd(s = "") {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")  // bold
    .replace(/\*([^*]+)\*/g, "$1")       // italic
    .replace(/^#+\s*/gm, "")            // headers
    .trim();
}

// Split markdown into top-level sections by ### header
function parseSections(md) {
  const map = {};
  const parts = md.split(/\n###\s+/);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    if (nl === -1) continue;
    const key = part.slice(0, nl).trim().toLowerCase();
    const body = part.slice(nl + 1).trim();
    map[key] = body;
  }
  return map;
}

// Parse bullet lines like: * **Label:** Content
function parseBullets(text = "") {
  const result = {};
  const lines = text.split("\n");
  let lastKey = null;
  for (const line of lines) {
    const m = line.match(/^\*\s+\*\*([^*:]+)[*:]+\*?\*?\s*(.*)/);
    if (m) {
      lastKey = m[1].trim().toLowerCase();
      result[lastKey] = stripMd(m[2].trim());
    } else if (lastKey && line.trim() && !line.startsWith("*")) {
      // continuation line
      result[lastKey] += " " + stripMd(line.trim());
    }
  }
  return result;
}

// Parse bullet list into array of strings
function parseBulletList(text = "") {
  return text.split("\n")
    .map(l => l.replace(/^\*+\s*/, "").trim())
    .filter(l => l.length > 2)
    .map(stripMd);
}

// Detect region from story content
function detectRegion(title = "", content = "") {
  const combined = (title + " " + content).toLowerCase();
  const indiaSignals = [
    "india", "indian", "delhi", "mumbai", "modi", "bjp", "congress",
    "rupee", "₹", "nda", "lok sabha", "rajya sabha", "supreme court of india",
    "rbi", "isro", "neet", "iit", "ias", "ips", "kerala", "maharashtra",
    "rajasthan", "gujarat", "tamil", "bengal", "assam", "manipur", "punjab",
    "andhra", "telangana", "karnataka", "odisha", "jharkhand", "chhattisgarh",
    "uttarakhand", "himachal", "jammu", "kashmir", "northeast india",
  ];
  const hits = indiaSignals.filter(s => combined.includes(s)).length;
  return hits >= 2 ? "india" : "global";
}

// ── Story parser ───────────────────────────────────────────────────────────────

function parseStory(frontBlock, index) {
  // frontBlock starts with "Front N: Title\n..."
  const titleMatch = frontBlock.match(/^Front\s+\d+[:.]\s*(.+)/i);
  const rawTitle = titleMatch ? titleMatch[1].trim() : `Story ${index + 1}`;

  const sec = parseSections(frontBlock);

  // TL;DR
  const tldr = stripMd(sec["tl;dr"] || sec["tldr"] || "");

  // 5W1H
  const w = parseBullets(sec["5w1h breakdown"] || sec["5w1h"] || "");
  const situational_analysis = {
    what:  w["what"]  || "",
    why:   w["why"]   || "",
    who:   w["who"]   || "",
    when:  w["when & where"] || w["when"]  || "",
    where: w["where"] || w["when & where"] || "",
    how:   w["how"]   || "",
  };

  // Strategic / Impact
  const strategic_assessment = stripMd(sec["strategic assessment"] || sec["impact analysis"] || "");

  // Perspective matrix
  const pm = parseBullets(sec["multi-perspective coverage"] || sec["perspective matrix"] || "");
  const perspective_matrix = {
    western_international: pm["western / international media view"] || pm["western/international"] || pm["international"] || "",
    indian_media:          pm["indian media view"] || pm["indian media"] || "",
    left_leaning:          pm["left-leaning narrative"] || pm["left-leaning"] || pm["left"] || "",
    center:                pm["center narrative"] || pm["center"] || pm["centrist"] || "",
    right_leaning:         pm["right-leaning narrative"] || pm["right-leaning"] || pm["right"] || "",
  };

  // Facts vs Claims
  const fvRaw = sec["key facts vs claims"] || sec["facts vs claims"] || "";
  const fvBullets = parseBullets(fvRaw);
  // Also handle as two separate paragraphs separated by a blank line
  const facts_vs_claims = {
    facts:  fvBullets["facts"] ? [fvBullets["facts"]] :
            parseBulletList((fvRaw.match(/\*\*facts[^:]*\*\*[:\n]+([\s\S]*?)(?=\*\*|$)/i) || [])[1] || ""),
    claims: fvBullets["claims / disputed points"] || fvBullets["claims"] ?
            [fvBullets["claims / disputed points"] || fvBullets["claims"]] :
            parseBulletList((fvRaw.match(/\*\*claims[^:]*\*\*[:\n]+([\s\S]*?)(?=\*\*|$)/i) || [])[1] || ""),
  };

  // Blind spot
  const blind_spot = stripMd(
    sec["blind spots / underreported angles"] ||
    sec["blind spot"] ||
    sec["underreported angles"] || ""
  );

  // Editorial & expert insight
  const ei = parseBullets(sec["editorial & expert insight"] || sec["editorial and expert insight"] || "");
  const editorial_expert_insight = {
    opinion:  ei["opinion"]  || "",
    analysis: ei["analysis"] || "",
  };

  // Stakeholder impact — convert paragraph/bullets to array
  const impactRaw = sec["impact analysis"] || "";
  const stakeholder_impact = parseBulletList(impactRaw).map(line => {
    const colon = line.indexOf(":");
    if (colon > 0 && colon < 60) {
      return { stakeholder: line.slice(0, colon).trim(), impact: line.slice(colon + 1).trim() };
    }
    return { stakeholder: "General", impact: line };
  }).filter(x => x.impact);

  // Context & background
  const context_background = stripMd(
    sec["context & background"] ||
    sec["context and background"] ||
    sec["background"] || ""
  );

  // Timeline — not always present in Gemini output; parse if available
  const tlRaw = sec["timeline"] || sec["timeline & historical context"] || "";
  const timeline = parseBulletList(tlRaw).map(line => {
    const m = line.match(/^([^:–—]+)[:–—]\s*(.*)/);
    return m ? { when: m[1].trim(), event: m[2].trim() } : { when: "–", event: line };
  }).filter(x => x.event);

  // Simple explanation
  const simple_explanation = stripMd(sec["simple explanation"] || "");

  // Sources — parse outlet names from paragraph
  const sourcesRaw = sec["sources & transparency"] || sec["sources and transparency"] || "";
  const sources = [];
  // Look for known outlet names mentioned in the sources section
  const knownOutlets = [
    "al jazeera", "bbc", "reuters", "the hindu", "indian express", "ndtv",
    "times of india", "hindustan times", "india today", "opindia", "the guardian",
    "dw", "new york times", "washington post", "bloomberg", "financial times",
    "haaretz", "associated press", "ap ", "miami herald", "the economist",
    "business standard", "mint", "economic times", "scroll", "the wire",
    "first post", "news18", "zee news", "republic", "deccan herald",
  ];
  for (const outlet of knownOutlets) {
    if (sourcesRaw.toLowerCase().includes(outlet)) {
      const name = outlet.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      if (!sources.find(s => s.outlet.toLowerCase() === outlet)) {
        sources.push({ outlet: name, lean: "center", region: "global", title: "", url: "#" });
      }
    }
  }



  // Headline — use raw title from front header
  const headline = stripMd(rawTitle);

  // Region detection
  const allText = [tldr, situational_analysis.what, situational_analysis.where, headline].join(" ");
  const region = detectRegion(headline, allText);

  return {
    id: slug(headline),
    headline,
    tldr,
    region,
    situational_analysis,
    strategic_assessment,
    perspective_matrix,
    facts_vs_claims,
    blind_spot,
    editorial_expert_insight,
    stakeholder_impact,
    context_background,
    timeline,
    simple_explanation,
    sources,
  };
}



// ── Main ───────────────────────────────────────────────────────────────────────

function refreshIndex() {
  const entries = readdirSync(DATA_DIR)
    .filter(f => f.endsWith(".json") && f !== "index.json" && !f.startsWith("flash-"))
    .map(f => {
      const date = f.replace(".json","");
      try {
        const { stories } = JSON.parse(readFileSync(`${DATA_DIR}/${f}`, "utf8"));
        return { date, count: stories?.length ?? 0 };
      } catch { return { date, count: 0 }; }
    })
    .sort((a,b) => b.date.localeCompare(a.date));
  writeFileSync(`${DATA_DIR}/index.json`, JSON.stringify(entries, null, 2));
  console.log(`   index updated: ${entries.length} day(s)`);
}

function run() {
  const dateArg = process.argv[2];
  const today   = dateArg || new Date().toISOString().slice(0, 10);
  const outPath = `${DATA_DIR}/${today}.json`;

  // Read from stdin
  const input = readFileSync("/dev/stdin", "utf8");
  if (!input.trim()) {
    console.error("No input. Pipe the Gemini output: pbpaste | node pipeline/import.js");
    process.exit(1);
  }

  console.log(`== Parsing Gemini output for ${today} ==`);

  // Split into per-story blocks at "## Front N:"
  const frontBlocks = input.split(/\n##\s+(?=Front\s+\d)/i).filter(b => b.trim());

  const stories = [];
  for (const block of frontBlocks) {
    if (!block.match(/^Front\s+\d/i)) continue; // skip preamble
    try {
      const story = parseStory(block, stories.length);
      stories.push(story);
      console.log(`  ✓ [${story.region.toUpperCase()}] ${story.headline}`);
    } catch(err) {
      console.log(`  ! failed to parse a story block: ${err.message}`);
    }
  }

  if (!stories.length) {
    console.error("No stories parsed. Make sure you copied the full Gemini output.");
    process.exit(1);
  }

  const payload = {
    date:         today,
    generated_at: new Date().toISOString(),
    source:       "gemini-app",
    stories,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\n   wrote ${outPath} (${stories.length} stories)`);

  refreshIndex();
  console.log("== Done ==");
}

run();
