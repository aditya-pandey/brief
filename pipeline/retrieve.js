import Parser from "rss-parser";
import { SOURCES } from "./sources.js";

const LOOKBACK_HOURS = 30;
const parser = new Parser({ timeout: 15000 });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function fetchCandidates() {
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000);
  const out = [];

  for (const src of SOURCES) {
    try {
      const feed = await parser.parseURL(src.feed);
      let count = 0;
      for (const entry of feed.items || []) {
        const pub = entry.pubDate ? new Date(entry.pubDate) : null;
        if (pub && pub < cutoff) continue;
        const url = entry.link;
        const title = (entry.title || "").trim();
        if (!url || !title) continue;
        out.push({
          title,
          url,
          source: src.name,
          lean: src.lean,
          region: src.region,
          summary: ((entry.contentSnippet || entry.summary || "").slice(0, 400)),
          published: pub ? pub.toISOString() : null,
        });
        count++;
      }
      console.log(`  - ${src.name}: ${feed.items?.length ?? 0} items (${count} within window)`);
    } catch (err) {
      console.log(`  ! failed to parse ${src.name}: ${err.message}`);
    }
    await sleep(300);
  }

  console.log(`  => ${out.length} candidate articles within ${LOOKBACK_HOURS}h`);
  return out;
}
