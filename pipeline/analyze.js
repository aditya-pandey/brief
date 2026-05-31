import { structured } from "./llm.js";
import { DEEP_DIVE_SCHEMA } from "./schema.js";

const SYSTEM = (
  "You are a rigorous, non-partisan news analyst. You work strictly from the " +
  "source excerpts provided. You never invent facts, quotes, or sources. When " +
  "the sources disagree, you say so. You clearly separate verifiable facts from " +
  "opinion and unverified claims. For the perspective matrix, characterise how " +
  "each lean/region actually frames the story based on the excerpts; if a " +
  "perspective is absent from the sources, say it is not represented rather than " +
  "guessing. Keep each field tight and concrete: 2-5 sentences where prose is " +
  "expected."
);

export async function analyzeStory(title, articles) {
  const usable = articles.filter(a => a.text);
  if (!usable.length) {
    console.log(`    ! no usable text for '${title}', skipping`);
    return null;
  }

  const blocks = usable.map(a =>
    `--- SOURCE: ${a.source} (lean: ${a.lean}, region: ${a.region})\nURL: ${a.url}\n${a.text}`
  );
  const corpus = blocks.join("\n\n");

  const prompt =
    `STORY: ${title}\n\n` +
    `You have ${usable.length} source excerpt(s) below. Produce a complete deep ` +
    `dive strictly from them.\n\n${corpus}`;

  return structured(prompt, DEEP_DIVE_SCHEMA, { system: SYSTEM });
}
