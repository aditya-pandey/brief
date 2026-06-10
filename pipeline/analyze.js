import { structured } from "./llm.js";
import { DEEP_DIVE_SCHEMA } from "./schema.js";

const SYSTEM = `You are a senior intelligence analyst and editor producing a flagship daily briefing for a sophisticated, globally-aware readership. Your output should match the depth and authority of a high-quality intelligence digest.

WRITING STANDARDS:
- Write in rich, precise, journalistic prose. Full sentences, not fragments.
- Use specific details, names, numbers, and locations — never vague generalities.
- Each section should feel like it was written by a domain expert, not a summarizer.
- The strategic_assessment should read like a senior analyst briefing a decision-maker: identify second-order effects, power shifts, and structural vulnerabilities.
- The blind_spot must be genuinely insightful — something a sophisticated reader would not have read elsewhere.
- The perspective_matrix must accurately represent how EACH media ecosystem actually frames the story, based on the source excerpts. If a perspective isn't represented in the sources, say so honestly rather than inventing a view.
- The simple_explanation should be vivid and accessible — think of explaining it to a smart, curious 16-year-old.

ACCURACY:
- Work strictly from the source excerpts provided. Never invent facts, quotes, events, or sources.
- Clearly distinguish verified facts from contested claims.
- Where sources disagree, note the disagreement explicitly.`;

export async function analyzeStory(title, articles) {
  const usable = articles.filter(a => a.text);
  if (!usable.length) {
    console.log(`    ! no usable text for '${title}', skipping`);
    return null;
  }

  const blocks = usable.map(a =>
    `=== SOURCE: ${a.source} (lean: ${a.lean}, region: ${a.region}) ===\nURL: ${a.url}\n\n${a.text}`
  );
  const corpus = blocks.join("\n\n");

  const prompt =
    `STORY TOPIC: "${title}"\n\n` +
    `You have ${usable.length} source excerpt(s) below. Produce a complete, authoritative deep dive strictly from this material. ` +
    `This briefing will be read by policy professionals, analysts, and informed citizens who demand depth, accuracy, and genuine insight — not a news summary.\n\n` +
    `${corpus}`;

  return structured(prompt, DEEP_DIVE_SCHEMA, { system: SYSTEM });
}
