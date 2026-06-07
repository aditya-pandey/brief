import { TOP_N, RESERVE, INDIA_SHARE } from "./sources.js";
import { structured } from "./llm.js";
import { SELECTION_SCHEMA } from "./schema.js";

const SYSTEM = (
  "You are a senior news editor curating the day's most significant stories " +
  "for an analytical Indian readership. You value substance over noise and " +
  "ignore clickbait, horoscopes, and pure entertainment filler."
);

const TOTAL = TOP_N + RESERVE; // e.g. 14 — first 10 are targets, last 4 are reserves

// Max articles to take per source so no single outlet floods the selection pool.
const MAX_PER_SOURCE = 8;

/**
 * Balance the candidate pool: take up to MAX_PER_SOURCE articles per source,
 * interleaved so every outlet gets fair representation in the list.
 * Returns a subset of allCandidates with its original indices preserved.
 */
function balancedSample(allCandidates) {
  // Group by source
  const bySource = {};
  allCandidates.forEach((c, i) => {
    if (!bySource[c.source]) bySource[c.source] = [];
    bySource[c.source].push({ ...c, _origIdx: i });
  });

  // Round-robin interleave, up to MAX_PER_SOURCE per source
  const buckets = Object.values(bySource).map(arr => arr.slice(0, MAX_PER_SOURCE));
  const result = [];
  const maxRound = MAX_PER_SOURCE;
  for (let r = 0; r < maxRound; r++) {
    for (const bucket of buckets) {
      if (bucket[r]) result.push(bucket[r]);
    }
  }

  return result; // each item has _origIdx = its position in allCandidates
}

export async function selectTopStories(allCandidates) {
  const sampled = balancedSample(allCandidates);
  console.log(`   (balanced pool: ${sampled.length} candidates from ${Object.keys(
    allCandidates.reduce((acc, c) => { acc[c.source] = 1; return acc; }, {})
  ).length} sources, max ${MAX_PER_SOURCE} per source)`);

  const indiaTarget = Math.round(TOP_N * INDIA_SHARE);

  // Titles only — keeps prompt within TPM limits while giving the LLM enough signal
  const lines = sampled.map((c, i) => `[${i}] (${c.region} | ${c.source}) ${c.title}`);

  const prompt =
    `You are curating today's most important news stories. Below are candidate articles from ${sampled.length} feeds.\n\n` +
    lines.join("\n") +
    `\n\n## YOUR TASK\n` +
    `Select exactly ${TOTAL} DISTINCT story topics, ordered most-important first.\n\n` +
    `**Priority rules (in order):**\n` +
    `1. Prefer stories covered by MULTIPLE outlets — cross-source coverage signals genuine importance.\n` +
    `2. Prioritise major national or state-level events: protests, strikes, political decisions, court verdicts, policy changes, disasters, deaths of public figures.\n` +
    `3. Avoid hyper-local or minor bureaucratic stories unless they have national implications.\n` +
    `4. Aim for ~${indiaTarget} India-centric primaries; the rest should be globally significant.\n` +
    `5. Represent GEOGRAPHIC DIVERSITY within India — do not cluster around one state.\n\n` +
    `**For each story:**\n` +
    `- Set article_indices to EVERY index that covers the same event (from as many different outlets as possible).\n` +
    `- The first ${TOP_N} are primaries; the last ${RESERVE} are reserve fallbacks.\n` +
    `- Merge duplicate headlines about the same event into one entry.`;

  const result = await structured(prompt, SELECTION_SCHEMA, { system: SYSTEM });
  // Map sampled indices back to original allCandidates indices
  const n = sampled.length;
  const stories = (result.stories || []).map(s => ({
    ...s,
    article_indices: (s.article_indices || [])
      .filter(i => i >= 0 && i < n)
      .map(i => sampled[i]._origIdx), // remap to original positions
  })).filter(s => s.article_indices.length > 0);

  return stories.slice(0, TOTAL);
}
