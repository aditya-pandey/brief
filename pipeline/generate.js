import { existsSync, writeFileSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchCandidates } from "./retrieve.js";
import { selectTopStories } from "./select.js";
import { fetchText } from "./scrape.js";
import { analyzeStory } from "./analyze.js";
import { structured } from "./llm.js";
import { RECAP_SCHEMA } from "./schema.js";
import { TOP_N } from "./sources.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");

function slug(text) {
  let s = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s.slice(0, 60) || "story";
}

function refreshIndex() {
  const entries = readdirSync(DATA_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => {
      const date = f.replace(".json", "");
      try {
        const { stories } = JSON.parse(readFileSync(`${DATA_DIR}/${f}`, "utf8"));
        return { date, count: stories?.length ?? 0 };
      } catch {
        return { date, count: 0 };
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  writeFileSync(`${DATA_DIR}/index.json`, JSON.stringify(entries, null, 2));
  console.log(`   index updated: ${entries.length} day(s)`);
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  const outPath = `${DATA_DIR}/${today}.json`;

  if (existsSync(outPath) && !process.env.FORCE_REGEN) {
    console.log(`== data/${today}.json already exists — nothing to do.`);
    console.log(`   (set FORCE_REGEN=1 to regenerate today's briefing)`);
    refreshIndex();
    return;
  }

  console.log(`== Generating deep dives for ${today} (target: ${TOP_N} stories) ==`);

  console.log("1) Retrieving candidates...");
  const candidates = await fetchCandidates();
  if (!candidates.length) {
    console.log("No candidates found — aborting (check feeds/network).");
    return;
  }

  console.log("2) Selecting stories (primaries + reserves)...");
  const selected = await selectTopStories(candidates);
  console.log(`   pool: ${selected.length} stories (${TOP_N} target + up to ${selected.length - TOP_N} reserves)`);

  // ── Backfill loop ────────────────────────────────────────────────────────
  // Work through the pool in priority order. Stop as soon as TOP_N stories
  // have been successfully scraped + analysed. Any reserves beyond that are
  // never even fetched, keeping API usage minimal.
  const storiesOut = [];

  for (let n = 0; n < selected.length; n++) {
    if (storiesOut.length >= TOP_N) break; // ✓ hit the target — stop

    const sel = selected[n];
    const isReserve = n >= TOP_N;
    const label = isReserve ? `reserve-${n - TOP_N + 1}` : String(n + 1);
    console.log(`\n${label}) ${sel.title}`);

    // Scrape all articles for this story
    const articles = [];
    for (const idx of sel.article_indices) {
      const c = candidates[idx];
      console.log(`      scraping ${c.source}...`);
      const text = await fetchText(c.url);
      articles.push({ ...c, text });
    }

    // Skip if nothing scraped (no text to analyse)
    const usable = articles.filter(a => a.text);
    if (!usable.length) {
      console.log(`    ! no usable text — ${isReserve ? "reserve" : "trying next reserve"}`);
      continue;
    }

    let deep;
    try {
      deep = await analyzeStory(sel.title, articles);
    } catch (err) {
      console.log(`    ! analysis failed: ${err.message?.slice(0, 120)} — ${isReserve ? "reserve" : "trying next reserve"}`);
      continue;
    }
    if (!deep) continue;

    const sourcesUsed = articles
      .filter(a => a.text)
      .map(a => ({ outlet: a.source, lean: a.lean, region: a.region, title: a.title, url: a.url }));

    storiesOut.push({
      ...deep,
      id: slug(deep.headline),
      region: sel.region,
      sources: sourcesUsed,
    });

    console.log(`    ✓ story ${storiesOut.length}/${TOP_N} done (${sourcesUsed.length} source${sourcesUsed.length > 1 ? "s" : ""})`);
  }

  if (!storiesOut.length) {
    console.log("No stories produced — aborting write.");
    return;
  }

  if (storiesOut.length < TOP_N) {
    console.log(`\n⚠  Only ${storiesOut.length}/${TOP_N} stories produced — pool exhausted.`);
  }

  const payload = {
    date: today,
    generated_at: new Date().toISOString(),
    stories: storiesOut,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\n   wrote ${outPath} (${storiesOut.length} stories)`);

  refreshIndex();
  console.log("== Done ==");
}

run().catch(err => { console.error(err); process.exit(1); });
