// Photo selection: the source article's own photo, checked and cleaned up.
// Photos are always linked from the outlet (never copied into the repo) and shown with a credit.
import { REAL_UA } from './feeds.js';

// Outlets whose photos we never show (e.g. after a complaint). Matched against the article host.
export const NO_IMAGE_OUTLETS = [];

const GENERIC = /placeholder|avatar|favicon|fallback|default[-_]?(share|og|image)|social[-_]share|share[-_]?(image|img)|og[-_]default|dummy|site-image|generic-banner|publication-logo|\/logo|[-_]logo|\/brand|\/icon|\bdefault\.(jpe?g|png)/i;
// Real news photos can be well-compressed (DW: ~19 KB); logos and placeholders are usually under 10 KB.
const MIN_BYTES = 12000;

// Per-outlet fixes: swap a branded variant for the clean one.
function cleanup(url) {
  // BBC: same photo without the "BBC NEWS" / "BBC SPORT" logo
  return url.replace(/\/ace\/branded_(news|sport)\//, '/ace/standard/');
}

/**
 * Check a candidate photo URL. Returns the cleaned URL if it is a real, reasonably large image, else null.
 * @param {string|null} url
 * @param {string} [articleUrl] page the photo came from (used for NO_IMAGE_OUTLETS)
 */
export async function checkImage(url, articleUrl = '') {
  if (!url || !/^https?:\/\//.test(url)) return null;
  url = cleanup(url); // before the logo filter: BBC's "/ace/branded_news/" path would look like a logo
  if (/gstatic\.com|googleusercontent\.com\/proxy/.test(url)) return null; // Google thumbnails: small, not the real photo
  if (GENERIC.test(url)) return null;
  if (NO_IMAGE_OUTLETS.some((d) => articleUrl.includes(d))) return null;
  // Old library/stock photo (e.g. ".../2019/06/artificial-intelligence.jpg" on a 2026 story): not a news photo.
  const year = Number(url.match(/\/(20\d\d)\/(0[1-9]|1[0-2])\//)?.[1]);
  if (year && year < new Date().getFullYear() - 1) return null;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': REAL_UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return null;
    const bytes = Number(res.headers.get('content-length')) || (await res.arrayBuffer()).byteLength;
    return bytes >= MIN_BYTES ? url : null;
  } catch {
    return null;
  }
}

// "Photo: The Hindu". Credit names the outlet whose article the photo came from.
export const creditFor = (outlet) => `Photo: ${outlet}`;
