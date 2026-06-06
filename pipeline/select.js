import { TOP_N, RESERVE, INDIA_SHARE } from "./sources.js";
import { structured } from "./llm.js";
import { SELECTION_SCHEMA } from "./schema.js";

const SYSTEM = (
  "You are a senior news editor curating the day's most significant stories " +
  "for an analytical Indian readership. You value substance over noise and " +
  "ignore clickbait, horoscopes, and pure entertainment filler."
);

const TOTAL = TOP_N + RESERVE; // e.g. 14 — first 10 are targets, last 4 are reserves

export async function selectTopStories(candidates) {
  const indiaTarget = Math.round(TOP_N * INDIA_SHARE);
  const lines = candidates.map((c, i) => `[${i}] (${c.region}/${c.source}) ${c.title}`);
  const prompt =
    `Here are today's candidate news items, one per line, prefixed by index:\n\n` +
    lines.join("\n") +
    `\n\nSelect ${TOTAL} DISTINCT stories ordered most-important first. ` +
    `The top ${TOP_N} are your primary picks; the last ${RESERVE} are reserves used ` +
    `as fallbacks if a primary story fails to retrieve. ` +
    `Aim for about ${indiaTarget} India-centric stories among the primaries, with ` +
    `the remaining primaries covering globally significant events. ` +
    `Merge duplicate coverage of the same event into one story. ` +
    `For each story, return its article_indices: every candidate index that ` +
    `covers that same event (pull from as many different outlets and leans as ` +
    `genuinely apply).`;

  const result = await structured(prompt, SELECTION_SCHEMA, { system: SYSTEM });
  const n = candidates.length;
  const stories = (result.stories || []).map(s => ({
    ...s,
    article_indices: (s.article_indices || []).filter(i => i >= 0 && i < n),
  })).filter(s => s.article_indices.length > 0);

  return stories.slice(0, TOTAL);
}
