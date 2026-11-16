// Fetch a news article once and return its readable text plus its preview photo (og:image).
import * as cheerio from 'cheerio';
import { REAL_UA } from './feeds.js';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&quot;/g, '"');

// Returns { text, image } or null when the page is blocked, paywalled or too short.
export async function fetchArticle(url, { maxChars = 9000, minChars = 800, timeoutMs = 15000 } = {}) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': REAL_UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const $ = cheerio.load(await res.text());

    const meta = (sel) => $(sel).attr('content')?.trim();
    let image = meta('meta[property="og:image"]') || meta('meta[name="og:image"]') || meta('meta[name="twitter:image"]') || meta('meta[property="twitter:image"]') || null;
    if (image) {
      image = decode(image);
      try { image = new URL(image, url).href; } catch { image = null; }
    }

    $('script, style, nav, footer, header, aside, form, iframe, noscript, figure').remove();
    let text = $('article p').map((_, el) => $(el).text()).get().join('\n');
    if (text.length < minChars) text = $('p').map((_, el) => $(el).text()).get().join('\n');
    text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    if (text.length < minChars) return null;
    return { text: text.slice(0, maxChars), image };
  } catch {
    return null;
  }
}
