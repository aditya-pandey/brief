// Daily Flash: feeds → shortlist per category → full article text → hydrogen in 3 batches →
// code-side validation, fact check, photos, category balance, interleaving → draft or publish.
//
// Usage: node pipeline/flash-auto.js [--mode=draft|publish] [--dry]
//   draft   (default) writes data/drafts/flash-<date>.json for review in flash-test.html
//   publish writes data/flash-<date>.json, data/index.json and flash.json like the editor does
//   --dry   writes to scratch/ only, touches nothing in data/
// Env: GEMINI_API_KEY (free), GEMINI_API_KEY_PAID (fallback when the free key stays busy), FLASH_MODE.
import fs from 'fs';
import { fetchAllFeeds, clusterRecent, cleanSourceUrl, slugify, relativeTime, titleSimilarity } from './lib/feeds.js';
import { fetchArticle } from './lib/articles.js';
import { checkImage, creditFor } from './lib/images.js';
import { gemini, usageSummary } from './lib/gemini.js';
import { factCheck } from './lib/factcheck.js';
import { istDate, recentFlash, writeFlashDraft, publishFlash } from './lib/publish.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const MODE = args.mode || process.env.FLASH_MODE || 'draft';
const DRY = !!args.dry;
const DATE = istDate();

// From the Flash Gem prompt's category table.
const CATS = {
  india: [4, 6], global: [3, 5], 'ai-tech': [3, 4], politics: [2, 3], economics: [3, 4],
  sports: [2, 3], entertainment: [1, 2], culture: [1, 2], science: [2, 3], health: [1, 2],
};
const TARGET = 25;
const MIN_TO_PUBLISH = 20;
const LOOKBACK_HOURS = 30; // "Yesterday" (18–30h) is the oldest ts the Gem allows
// Send well over the maximum per category: many candidates get rejected (stale, PR, thin, failed checks).
const SHORTLIST_FACTOR = 2.5;
const BATCHES = [['india', 'politics', 'global'], ['ai-tech', 'economics', 'science'], ['sports', 'entertainment', 'culture', 'health']];
// The prompt asks for 45–50 words; the gate allows a little slack for word-counting differences.
const SUMMARY_WORDS = [44, 52];
const WHY_WORDS = [15, 40];
const BANNED = ['this highlights', 'this underscores', 'this development comes amid', 'experts say', 'it remains to be seen',
  'only time will tell', 'in a major development', 'landmark', 'shocking', 'bombshell', 'jaw-dropping'];

const logLines = [];
const log = (m) => { logLines.push(m); console.log(m); };
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// ---------- 1. Candidates ----------
log(`Flash ${DATE} · mode: ${DRY ? 'dry' : MODE}`);
const recent = recentFlash(DATE, 3);
const seenHeadline = (title) => recent.some((r) => titleSimilarity(title, r.headline || '') >= 0.5);
const clusters = clusterRecent(await fetchAllFeeds(log), { lookbackHours: LOOKBACK_HOURS, log })
  .filter((c) => !seenHeadline(c.primary.title));

const perCat = {};
const shortlist = clusters.filter((c) => {
  const cap = Math.ceil((CATS[c.primary.cat]?.[1] || 2) * SHORTLIST_FACTOR);
  perCat[c.primary.cat] = (perCat[c.primary.cat] || 0) + 1;
  return perCat[c.primary.cat] <= cap;
});
log(`Shortlist: ${shortlist.length} stories not already run in the last 3 days.`);

// ---------- 2. Full article text (try the next outlet in the cluster if the first is blocked) ----------
await mapLimit(shortlist, 8, async (c) => {
  for (const item of [c.primary, ...c.items.filter((i) => i !== c.primary)].slice(0, 3)) {
    const a = await fetchArticle(item.link, { maxChars: 3000, minChars: 400 });
    if (a) { c.used = item; c.article = a; return; }
  }
});
const readable = shortlist.filter((c) => c.article);
log(`Article text for ${readable.length}/${shortlist.length}.`);

// ---------- 3. Hydrogen writes, in 3 batches ----------
const gemPrompt = fs.readFileSync(new URL('./prompts/flash.md', import.meta.url), 'utf8');
const override = (cats) => `

AUTOMATED RUN OVERRIDE (takes precedence over the instructions above wherever they conflict):
- You do NOT have web search. The candidates in the user message, with their article text, are your complete research. Use only facts that appear in article_text. All candidates are from the last ${LOOKBACK_HOURS} hours; still reject roundups, explainers, look-backs, previews and PR.
- This call covers only part of today's Flash: ${cats.join(', ')}. Do not produce 25 stories. For each of these categories select up to the number given, best first. Returning fewer is correct when candidates are weak.
  ${cats.map((c) => `${c}: up to ${CATS[c][1] + 2}`).join(' · ')}
- cat: confirm or correct each candidate's category; any of the 10 values is allowed if it fits better.
- summary: 45–50 words (this replaces 55–70). Every word must carry weight.
- Output a JSON array of objects with exactly these fields: index, cat, headline, summary, why_it_matters. Do NOT output id, source, source_url or ts: the system sets them from the article.`;

// The three batches run in parallel: each waits out "busy" errors on its own.
const picked = [];
await Promise.all(BATCHES.map(async (cats) => {
  const pool = readable.filter((c) => cats.includes(c.primary.cat));
  if (!pool.length) { log(`Batch ${cats.join('/')}: no candidates`); return; }
  const payload = pool.map((c, index) => ({ index, given_cat: c.primary.cat, given_headline: c.used.title, article_text: c.article.text }));
  try {
    const { text } = await gemini({
      system: gemPrompt + override(cats),
      user: `CANDIDATES:\n${JSON.stringify(payload, null, 2)}`,
      key: 'free', json: true, fallbackToPaid: !!process.env.GEMINI_API_KEY_PAID, timeoutMs: 600000, log,
    });
    const out = JSON.parse(text);
    out.forEach((r, rank) => { if (pool[r.index]) picked.push({ ...r, rank, cluster: pool[r.index] }); });
    log(`Batch ${cats.join('/')}: ${out.length} written from ${pool.length} candidates`);
  } catch (e) {
    log(`Batch ${cats.join('/')} failed: ${e.message}`);
  }
}));

// ---------- 4. Validation gates ----------
const rejected = [];
const valid = [];
for (const r of picked) {
  const c = r.cluster;
  const reasons = [];
  if (!CATS[r.cat]) reasons.push(`unknown cat "${r.cat}"`);
  const sw = words(r.summary), ww = words(r.why_it_matters), hw = words(r.headline);
  if (sw < SUMMARY_WORDS[0] || sw > SUMMARY_WORDS[1]) reasons.push(`summary ${sw} words`);
  if (ww < WHY_WORDS[0] || ww > WHY_WORDS[1]) reasons.push(`why_it_matters ${ww} words`);
  if (/[.!?]["”']?\s+[A-Z]/.test(r.why_it_matters || '')) reasons.push('why_it_matters is more than one sentence');
  if (hw < 6 || hw > 14) reasons.push(`headline ${hw} words`);
  const text = `${r.headline} ${r.summary} ${r.why_it_matters}`;
  const banned = BANNED.filter((b) => text.toLowerCase().includes(b));
  if (banned.length) reasons.push(`banned phrase: ${banned.join(', ')}`);
  if (/[*_`<>]/.test(text)) reasons.push('markdown or HTML in text');
  const fc = factCheck(`${r.headline}\n${r.summary}`, [c.article.text, c.used.title]);
  const badNums = fc.numbers.filter((x) => !x.found).map((x) => x.value);
  const badNames = fc.names.filter((x) => !x.found).map((x) => x.value);
  if (badNums.length) reasons.push(`numbers not in article: ${badNums.join(', ')}`);
  if (badNames.length > 1) reasons.push(`names not in article: ${badNames.join(', ')}`);
  if (seenHeadline(r.headline)) reasons.push('already ran in the last 3 days');
  if (valid.some((v) => titleSimilarity(v.headline, r.headline) >= 0.5 || v.cluster === c)) reasons.push('duplicate of another story today');

  if (reasons.length) rejected.push({ headline: r.headline, cat: r.cat, reasons });
  else valid.push(r);
}
log(`Valid: ${valid.length} · rejected: ${rejected.length}`);
for (const x of rejected) log(`  ✗ [${x.cat}] ${x.headline} — ${x.reasons.join('; ')}`);

// ---------- 5. Category balance: minimums first, then fill to 25 within maximums ----------
const byRank = [...valid].sort((a, b) => a.rank - b.rank || b.cluster.score - a.cluster.score);
const chosen = [];
const count = (cat) => chosen.filter((s) => s.cat === cat).length;
for (const [cat, [min]] of Object.entries(CATS)) {
  for (const s of byRank.filter((v) => v.cat === cat)) if (count(cat) < min) chosen.push(s);
}
for (const s of byRank) {
  if (chosen.length >= TARGET) break;
  if (!chosen.includes(s) && count(s.cat) < CATS[s.cat][1]) chosen.push(s);
}
const shortfalls = Object.entries(CATS).filter(([cat, [min]]) => count(cat) < min).map(([cat, [min]]) => `${cat} ${count(cat)}/${min}`);
if (shortfalls.length) log(`Below category minimum: ${shortfalls.join(', ')}`);

// ---------- 6. Interleave: no two consecutive stories from the same category ----------
const queues = Object.fromEntries(Object.keys(CATS).map((c) => [c, chosen.filter((s) => s.cat === c)]));
const ordered = [];
while (ordered.length < chosen.length) {
  const last = ordered.at(-1)?.cat;
  const options = Object.keys(queues).filter((c) => queues[c].length && c !== last);
  const cat = (options.length ? options : Object.keys(queues).filter((c) => queues[c].length))
    .sort((a, b) => queues[b].length - queues[a].length || (a === 'india' ? -1 : b === 'india' ? 1 : 0))[0];
  ordered.push(queues[cat].shift());
}

// ---------- 7. Final fields: source, URL, time and photo come from the article we used ----------
const stories = await mapLimit(ordered, 6, async (r) => {
  const c = r.cluster;
  const outlet = c.used.source;
  const second = [...c.sources].find((s) => s !== outlet);
  const image = (await checkImage(c.article.image, c.used.link)) || (await checkImage(c.items.find((i) => i.image)?.image, c.used.link));
  return {
    id: slugify(r.headline),
    cat: r.cat,
    headline: r.headline.trim(),
    summary: r.summary.trim(),
    why_it_matters: r.why_it_matters.trim(),
    source: second ? `${outlet} · ${second}` : outlet,
    source_url: cleanSourceUrl(c.used.link),
    ts: relativeTime(c.used.pubDate),
    source_search: `${r.headline.trim()} ${outlet}`,
    ...(image ? { image, image_credit: creditFor(outlet) } : {}),
  };
});
// ids must be unique within the day
const ids = new Set();
for (const s of stories) { let id = s.id, n = 2; while (ids.has(id)) id = `${s.id.slice(0, 57)}-${n++}`; s.id = id; ids.add(id); }

log(`Final: ${stories.length} stories, ${stories.filter((s) => s.image).length} with photos. ${usageSummary()}`);

// ---------- 8. Write ----------
const report = { date: DATE, generatedAt: new Date().toISOString(), mode: MODE, count: stories.length, shortfalls, rejected, log: logLines };
const ok = stories.length >= MIN_TO_PUBLISH;
let published = false;
if (DRY) {
  fs.mkdirSync('scratch', { recursive: true });
  fs.writeFileSync('scratch/flash-auto.json', JSON.stringify({ stories, report }, null, 2));
  log('Dry run: wrote scratch/flash-auto.json');
} else if (MODE === 'publish' && ok) {
  const res = publishFlash(DATE, stories);
  published = true;
  log(`Published ${res.path} (${res.total} stories)${res.rootUpdated ? ' and flash.json' : ''}.`);
} else {
  const p = writeFlashDraft(DATE, stories, report);
  log(`Draft written: ${p}${MODE === 'publish' ? ` (not published: only ${stories.length} valid stories, need ${MIN_TO_PUBLISH})` : ''}`);
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `published=${published}\ndate=${DATE}\ncount=${stories.length}\n`);
if (!ok) console.error(`Only ${stories.length} valid stories (need ${MIN_TO_PUBLISH}).`);
// Exit explicitly: a feed server that never closes its connection must not keep the scheduled job alive.
process.exit(ok ? 0 : 1);
