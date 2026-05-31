import { extract } from "@extractus/article-extractor";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const MAX_CHARS = 6000;

async function fetchWithReadability(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsBriefingBot/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return "";
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  return article?.textContent?.trim() ?? "";
}

export async function fetchText(url) {
  try {
    const article = await extract(url, {
      wordsPerMinute: 300,
      signal: AbortSignal.timeout(15000),
    });
    const text = article?.content
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? "";
    if (text.length > 200) return text.slice(0, MAX_CHARS);
  } catch (_) {}

  // Fallback: Readability
  try {
    const text = await fetchWithReadability(url);
    return text.slice(0, MAX_CHARS);
  } catch (err) {
    console.log(`    ! scrape failed for ${url}: ${err.message}`);
    return "";
  }
}
