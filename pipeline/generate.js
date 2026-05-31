import { existsSync, writeFileSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchCandidates } from "./retrieve.js";
import { selectTopStories } from "./select.js";
import { fetchText } from "./scrape.js";
import { analyzeStory } from "./analyze.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");

function slug(text) {
  let s = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s.slice(0, 60) || "story";
}

function refreshIndex() {
  // index.json stores [{date, count}] objects so the Time Machine UI can show
  // story counts without having to fetch every day's full JSON.
  const entries = readdirSync(DATA_DIR)
    .filter(f => f.endsWith(".json") && f !== "index.json")
    .map(f => {
      const date = f.replace(".json", "");
      try {
        const { stories } = JSON.parse(readFileSync(`${DATA_DIR}/${f}`, "utf8"));
        return { date, count: stories?.length ?? 0 };
      } catch {
        return { date, count: 0 };
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first
  writeFileSync(`${DATA_DIR}/index.json`, JSON.stringify(entries, null, 2));
  console.log(`   index updated: ${entries.length} day(s)`);
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  const outPath = `${DATA_DIR}/${today}.json`;

  // Skip if today's file already exists — avoids redundant API calls during local dev.
  // Set FORCE_REGEN=1 to override (e.g. after a partial run or a source change).
  if (existsSync(outPath) && !process.env.FORCE_REGEN) {
    console.log(`== data/${today}.json already exists — nothing to do.`);
    console.log(`   (set FORCE_REGEN=1 to regenerate today's briefing)`);
    refreshIndex(); // keep index in sync even on a skip
    return;
  }

  console.log(`== Generating deep dives for ${today} ==`);

  console.log("1) Retrieving candidates...");
  const candidates = await fetchCandidates();
  if (!candidates.length) {
    console.log("No candidates found — aborting (check feeds/network).");
    return;
  }

  console.log("2) Selecting top stories...");
  const selected = await selectTopStories(candidates);
  console.log(`   selected ${selected.length} stories`);

  const storiesOut = [];
  for (let n = 0; n < selected.length; n++) {
    const sel = selected[n];
    console.log(`3.${n + 1}) Story: ${sel.title}`);
    const articles = [];
    for (const idx of sel.article_indices) {
      const c = candidates[idx];
      console.log(`      scraping ${c.source}...`);
      const text = await fetchText(c.url);
      articles.push({ ...c, text });
    }

    let deep;
    try {
      deep = await analyzeStory(sel.title, articles);
    } catch (err) {
      console.log(`    ! analysis failed for '${sel.title}': ${err.message?.slice(0, 120)} — skipping`);
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
  }

  if (!storiesOut.length) {
    console.log("No stories produced — aborting write.");
    return;
  }

  const payload = {
    date: today,
    generated_at: new Date().toISOString(),
    stories: storiesOut,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`   wrote ${outPath}`);

  refreshIndex();
  console.log("== Done ==");
}

run().catch(err => { console.error(err); process.exit(1); });
