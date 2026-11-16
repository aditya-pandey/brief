// Deep dive trial run: feeds → pick 1 story → approved-outlet articles → Briefing prompt on hydrogen → fact check.
// Display only: writes scratch/deepdive-trial.md and .json, never touches data/ or publishes.
//
// Run: npm run trial:deepdive
// Env:
//   GEMINI_API_KEY_PAID  paid key (default: used for both calls, with Google Search)
//   FREE=1               use the free key without Google Search instead (the 14 Nov setup)
//   TOPIC="..." QUERIES="q1|q2"   skip the pick step and force a story
//   DRY=1                stop after gathering sources (no writing call, no cost)
import fs from 'fs';
import { fetchAllFeeds, clusterRecent, cleanSourceUrl } from '../lib/feeds.js';
import { fetchArticle } from '../lib/articles.js';
import { GLOBAL_A, GLOBAL_B, INDIA, hostOf, isApproved, isIndian, rank, bingNews } from '../lib/sources.js';
import { gemini, resolveGroundingSources, usageSummary } from '../lib/gemini.js';
import { factCheck, tally, misses } from '../lib/factcheck.js';

const FREE = !!process.env.FREE;
const KEY = FREE ? 'free' : 'paid';
const SEARCH = !FREE;
const MAX_ARTICLES = 8;
const MAX_WORDS = 1350;
const OUT_MD = new URL('../../scratch/deepdive-trial.md', import.meta.url);
const OUT_JSON = new URL('../../scratch/deepdive-trial.json', import.meta.url);
const log = (m) => console.log(m);

// 1. Candidates from the same feeds Flash uses (no sports or entertainment).
const clusters = clusterRecent(await fetchAllFeeds(log), { log })
  .filter((c) => !['sports', 'entertainment'].includes(c.primary.cat))
  .slice(0, 45);

// 2. Pick the story, using the Briefing Gem's selection criteria.
let pick, chosen;
if (process.env.TOPIC) {
  pick = { why: 'forced topic', queries: process.env.QUERIES ? process.env.QUERIES.split('|') : [process.env.TOPIC] };
  chosen = { primary: { title: process.env.TOPIC, cat: 'forced' }, items: [] };
} else {
  const { text } = await gemini({
    key: KEY, json: true, log, timeoutMs: 300000,
    user: `You are the Editor-in-Chief of The Briefing choosing today's ONE deep dive.
Choose the most consequential story of the last 24 hours, one whose effects will still matter in a month and that rewards deep analysis (mechanisms, stakes, accountability), not a one-off incident. Cover India as seriously as the world: prefer a consequential Indian story when one exists, by judgment, never as a quota.
Candidates:
${clusters.map((c, i) => `[${i}] (${c.primary.cat}, ${[...c.sources].join(', ')}) ${c.primary.title} — ${c.primary.snippet.slice(0, 200)}`).join('\n')}

Return JSON: {"index": number, "why": "one sentence", "queries": ["news search query for this exact event", "second query for background/analysis/reaction on it"]}`,
  });
  pick = JSON.parse(text);
  chosen = clusters[pick.index];
}
log(`\nChosen: "${chosen.primary.title}"\n  why: ${pick.why}\n  queries: ${pick.queries.join(' | ')}`);

// 3. Sources: feed articles in the cluster + Bing News limited to approved outlets.
const candidates = chosen.items.map((i) => ({ title: i.title, url: cleanSourceUrl(i.link), source: i.source }));
for (const q of pick.queries) {
  candidates.push(...await bingNews(q, GLOBAL_A), ...await bingNews(q, GLOBAL_B), ...await bingNews(q, INDIA, 'en-IN'));
}
const indiaFirst = ['india', 'politics'].includes(chosen.primary.cat);
const seen = new Set(), perHost = {};
const unique = candidates
  .map((c) => ({ ...c, url: cleanSourceUrl(c.url) }))
  .filter((c) => c.url?.startsWith('http') && isApproved(c.url) && !/\/videos?\/|\/live\/|live-blog|live-news|live-updates/.test(c.url))
  .sort((a, b) => (indiaFirst ? isIndian(b.url) - isIndian(a.url) : 0) || rank(a.url) - rank(b.url))
  .filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    perHost[hostOf(c.url)] = (perHost[hostOf(c.url)] || 0) + 1;
    return perHost[hostOf(c.url)] <= 2;
  });
const articles = [];
for (const c of unique) {
  if (articles.length >= MAX_ARTICLES) break;
  const a = await fetchArticle(c.url);
  log(`  ${a ? '✓' : '✗'} ${c.source} — ${c.url.slice(0, 100)}`);
  if (a) articles.push({ ...c, ...a });
}
log(`Using ${articles.length} articles.`);
if (articles.length < 3) { console.error('Too few readable sources for a deep dive; stopping.'); process.exit(1); }
if (process.env.DRY) { log('DRY run: stopping before the writing call.'); process.exit(0); }

// 4. Write with the Briefing Gem prompt verbatim, plus a research override and the length cap.
const gemPrompt = fs.readFileSync(new URL('../prompts/briefing.md', import.meta.url), 'utf8');
const lengthRule = `LENGTH: the whole piece must be about 1,200 words (hard maximum ${MAX_WORDS}), excluding the Sources list. Prefer fewer, deeper sections over many thin ones.
End the story (before Sources) with a "### Conclusion" section: exactly 2 sentences, no new facts.`;
const override = SEARCH
  ? `RESEARCH OVERRIDE FOR THIS RUN:
The source articles in the user message are your starting research. You also have Google Search: use it to verify, update and fill gaps (latest developments, official statements, background, India angle), preferring wire services, major newspapers, broadcasters and official .gov sources. Never use content farms, aggregators or partisan blogs. Any fact, name, figure or quote must come from a provided article or a search result you actually retrieved.
SOURCES LIST: for provided articles, copy their URL exactly. For sources you found through search, write "Outlet — headline" with NO URL (the system adds verified links). Never invent a URL.
Cover exactly ONE story: the one the articles are about. Number it Front 1.
${lengthRule}

`
  : `RESEARCH OVERRIDE FOR THIS RUN (takes precedence over any instruction to search the web):
You do not have web search. The source articles provided in the user message ARE your research. Every source you list must be one of the provided URLs, copied exactly. Any fact, name, figure, or quote not present in the provided articles must not appear. Cover exactly ONE story. Number it Front 1.
${lengthRule}

`;
const userMsg = `Today's date: ${new Date().toDateString()}.
Write today's deep dive on this story: ${chosen.primary.title}

SOURCE ARTICLES:
${articles.map((a, i) => `\n=== SOURCE ${i + 1} ===\nOutlet: ${a.source}\nTitle: ${a.title}\nURL: ${a.url}\n\n${a.text}`).join('\n')}`;
const { text: md0, grounding } = await gemini({ system: override + gemPrompt, user: userMsg, key: KEY, search: SEARCH, thinking: 'high', log });
let md = md0;

// 5. Verified links for search sources, then fetch those pages so the fact check can use them.
const searched = SEARCH ? await resolveGroundingSources(grounding) : [];
const searchPages = [];
for (const s of searched) {
  s.approved = isApproved(s.url);
  const page = await fetchArticle(s.url, { minChars: 300, maxChars: 30000 });
  s.readable = !!page;
  if (page) searchPages.push(page.text);
}
if (searched.length) {
  log(`Search: ${grounding?.webSearchQueries?.length || 0} queries, ${searched.length} sources (${searched.filter((s) => s.approved).length} approved, ${searched.filter((s) => s.readable).length} readable)`);
  md += `\n\n#### Sources found by search (verified links)\n${searched.map((s) => `- [${s.title}](${s.url})${s.approved ? '' : ' — not on approved list'}`).join('\n')}\n`;
}
fs.mkdirSync(new URL('.', OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, md);

// 6. Fact check against the articles and the search pages we could read.
const body = md.split(/###\s*Sources/i)[0];
const report = factCheck(body, [...articles.map((a) => a.text), ...searchPages]);
const words = body.split(/\s+/).filter(Boolean).length;
const photo = articles.find((a) => a.image)?.image || null;
fs.writeFileSync(OUT_JSON, JSON.stringify({
  chosen: chosen.primary.title, pick, words, photo,
  articles: articles.map(({ text, ...a }) => ({ ...a, chars: text.length })),
  searched, report,
}, null, 2));

log(`\n=== FACT CHECK ===\nQuotes ${tally(report.quotes)} · Numbers ${tally(report.numbers)} · Names ${tally(report.names)}`);
for (const m of misses(report)) log(`  ✗ ${m.kind}: ${m.value}`);
log(`\n${words} words${words > MAX_WORDS ? ` (OVER the ${MAX_WORDS} cap)` : ''} · cover photo: ${photo || 'none'}`);
log(usageSummary());
log(`Wrote ${OUT_MD.pathname}`);
