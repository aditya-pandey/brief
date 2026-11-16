// Flash trial run: feeds → shortlist → full article text → one Gemini call → items.
// Display only: writes scratch/flash-trial.json, never touches data/ or publishes.
// Run: npm run trial:flash   (needs GEMINI_API_KEY in .env or the environment)
import fs from 'fs';
import { fetchAllFeeds, clusterRecent, cleanSourceUrl, slugify, relativeTime } from '../lib/feeds.js';
import { fetchArticle } from '../lib/articles.js';
import { gemini, usageSummary } from '../lib/gemini.js';

const MAX_PER_CATEGORY = 2;
const SHORTLIST_FACTOR = 1.5;
const OUT = new URL('../../scratch/flash-trial.json', import.meta.url);

const lines = [];
const log = (m) => { lines.push(m); console.log(m); };

const SELECTION_RULES = `SELECTION RULES — you must actively reject candidates, not write up everything given to you:

You have been given more candidates than slots available, specifically so you can reject the weak ones. Only return a candidate if it clears ALL of these bars:
- It is a genuine development, decision, outcome, or result — not a preview, a squad/injury update with no result, a routine process update, or speculation.
- Sports: only actual results and significant developments. "Player ruled out" or "Team prepares for match" does NOT qualify. "Team won/lost by X" does.
- Entertainment: industry-level significance only (major release, box office record, major award, significant controversy) — never gossip.
- It is not PR, sponsored content, or a press release dressed as news (check the article_text and given_source — if it reads like a promotional announcement, reject it).
- You have enough real information in article_text to write a complete, specific summary — if the text is too thin to say anything concrete, reject it rather than pad it.

It is correct and expected to return FEWER items than you were given. Do not force a weak candidate through just to fill a slot.`;

const FIELD_RULES = `FIELD RULES (apply exactly — these are non-negotiable quality bars):

headline: 8-12 words. Specific, honest, intriguing — tells the reader what happened and hints at why it matters, without sensationalising.
Never use: clickbait superlatives ("shocking", "bombshell", "jaw-dropping"), vague nouns ("situation", "development", "move"), false urgency.

summary: 45-50 words. Complete, not a teaser — the reader must understand what happened, who did it, and what it means without clicking anything.
Active voice. Lead with the most important information. Include at least one specific detail (a number, a name, a date, a place) in the first sentence. The last sentence should add consequence or context, not restate the first.
Banned phrases — never use any of these: "this highlights", "this underscores", "this development comes amid", "experts say", "it remains to be seen", "only time will tell", "in a major development", "landmark", "historic" (unless it genuinely is).

why_it_matters: ONE sentence, 20-35 words. Answers: "why should a busy reader care?" Must add NEW information — never repeat the headline or summary.

cat: must be exactly one of: india, global, ai-tech, politics, economics, sports, entertainment, culture, science, health.`;

const apiKeySet = !!process.env.GEMINI_API_KEY;
if (!apiKeySet) { console.error('GEMINI_API_KEY not set.'); process.exit(1); }

let items = [];
let error = null;
try {
  const clusters = clusterRecent(await fetchAllFeeds(log), { log });
  const cap = Math.ceil(MAX_PER_CATEGORY * SHORTLIST_FACTOR);
  const perCat = {};
  const shortlist = clusters.filter((c) => (perCat[c.primary.cat] = (perCat[c.primary.cat] || 0) + 1) <= cap);
  log(`Shortlisted ${shortlist.length} candidates (up to ${cap}/category).`);

  for (const c of shortlist) c.article = await fetchArticle(c.primary.link, { maxChars: 2500, minChars: 200 });
  log(`Got article text for ${shortlist.filter((c) => c.article).length}/${shortlist.length}.`);

  const payload = shortlist.map((c, index) => ({
    index,
    given_headline: c.primary.title,
    given_cat: c.primary.cat,
    article_text: c.article?.text || c.items.map((i) => i.snippet).filter(Boolean).join(' / '),
  }));
  const { text } = await gemini({
    key: 'free',
    json: true,
    fallbackToPaid: !!process.env.GEMINI_API_KEY_PAID,
    log,
    user: `You are the Editor of Flash by The Briefing — a daily short-form news product built for intelligent, busy readers, mainly in India.

Below are ${payload.length} candidate stories with their article text. Select the best ones and write them up to spec, using only what is in article_text.

${SELECTION_RULES}

${FIELD_RULES}

CANDIDATES:
${JSON.stringify(payload, null, 2)}

Return a JSON array of ONLY the selected candidates (same "index"), each with exactly: index, cat, headline, summary, why_it_matters.`,
  });

  const kept = {};
  for (const r of JSON.parse(text)) {
    const c = shortlist[r.index];
    if (!c) continue;
    const cat = r.cat || c.primary.cat;
    kept[cat] = (kept[cat] || 0) + 1;
    if (kept[cat] > MAX_PER_CATEGORY) continue;
    // Source, URL, time and photo are set by code from the article we actually used, never by the model.
    items.push({
      id: slugify(r.headline),
      cat,
      headline: r.headline,
      summary: r.summary,
      why_it_matters: r.why_it_matters,
      source: c.primary.source,
      source_url: cleanSourceUrl(c.primary.link),
      ts: relativeTime(c.primary.pubDate),
      source_search: `${r.headline} ${c.primary.source}`,
      image: c.article?.image || c.items.find((i) => i.image)?.image || null,
      summary_words: r.summary.split(/\s+/).length,
    });
  }
  log(`Done: ${items.length} items. ${usageSummary()}`);
} catch (e) {
  error = e.message;
  log(`Fatal: ${e.message}`);
}

fs.mkdirSync(new URL('.', OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), log: lines, items, error }, null, 2));
console.log(`Wrote ${OUT.pathname}`);
