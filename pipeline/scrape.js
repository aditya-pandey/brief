import { extract } from "@extractus/article-extractor";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const MAX_CHARS = 6000;

/**
 * Extract og:image / twitter:image from an HTML string.
 * Returns an absolute URL string, or null.
 */
function extractOgImage(html, pageUrl) {
  try {
    // Quick regex — avoids a full DOM parse just for a meta tag
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (!m) return null;
    const src = m[1].trim();
    if (!src || src.startsWith("data:")) return null;
    // Make relative URLs absolute
    return src.startsWith("http") ? src : new URL(src, pageUrl).href;
  } catch {
    return null;
  }
}

async function fetchRaw(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsBriefingBot/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return res.text();
}

/**
 * Fetch article text and the best available cover image (og:image).
 * Returns { text: string, imageUrl: string|null }.
 */
export async function fetchArticle(url) {
  // ── Primary: article-extractor ──────────────────────────────────────────
  try {
    const article = await extract(url, {
      wordsPerMinute: 300,
      signal: AbortSignal.timeout(15000),
    });
    const text = (article?.content ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // article-extractor surfaces image / twitterImage directly
    const imageUrl = article?.image || article?.twitterImage || null;
    if (text.length > 200) {
      return { text: text.slice(0, MAX_CHARS), imageUrl };
    }
  } catch (_) {}

  // ── Fallback: Readability + og:image from raw HTML ──────────────────────
  try {
    const html = await fetchRaw(url);
    if (!html) return { text: "", imageUrl: null };

    const imageUrl = extractOgImage(html, url);
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    const text = (article?.textContent ?? "").trim();
    return { text: text.slice(0, MAX_CHARS), imageUrl };
  } catch (err) {
    console.log(`    ! scrape failed for ${url}: ${err.message}`);
    return { text: "", imageUrl: null };
  }
}

// Convenience wrapper kept for any code that only wants text
export async function fetchText(url) {
  return (await fetchArticle(url)).text;
}
