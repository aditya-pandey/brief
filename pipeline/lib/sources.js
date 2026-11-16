// Approved outlets and Bing News search restricted to them.
// Review this list: only these outlets (plus official .gov sites) can be used as deep-dive sources.
import * as cheerio from 'cheerio';
import { REAL_UA } from './feeds.js';

export const GLOBAL_A = ['apnews.com', 'reuters.com', 'bbc.com', 'bbc.co.uk', 'theguardian.com', 'npr.org', 'cbsnews.com', 'nbcnews.com', 'cnn.com', 'aljazeera.com', 'dw.com'];
export const GLOBAL_B = ['politico.com', 'axios.com', 'cnbc.com', 'france24.com', 'euronews.com', 'scmp.com', 'abcnews.go.com', 'foxnews.com', 'theverge.com', 'techcrunch.com', 'arstechnica.com', 'nature.com'];
// Allowed if readable, never searched first.
export const PAYWALLED = ['nytimes.com', 'washingtonpost.com', 'wsj.com', 'ft.com', 'bloomberg.com', 'economist.com'];
export const INDIA = ['thehindu.com', 'indianexpress.com', 'hindustantimes.com', 'livemint.com', 'economictimes.indiatimes.com', 'timesofindia.indiatimes.com',
  'ndtv.com', 'scroll.in', 'theprint.in', 'thehindubusinessline.com', 'newindianexpress.com', 'deccanherald.com', 'indiatoday.in', 'moneycontrol.com'];
export const APPROVED = [...GLOBAL_A, ...GLOBAL_B, ...INDIA, ...PAYWALLED];

export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const matches = (host, domain) => host === domain || host.endsWith('.' + domain);
export const isGov = (url) => /\.gov(\.[a-z]{2})?$/.test(hostOf(url)) || hostOf(url) === 'pib.gov.in';
export const isApproved = (url) => isGov(url) || APPROVED.some((d) => matches(hostOf(url), d));
export const isIndian = (url) => INDIA.some((d) => matches(hostOf(url), d));
// Lower is better: .gov first, then the order of APPROVED.
export const rank = (url) => {
  if (isGov(url)) return 0;
  const i = APPROVED.findIndex((d) => matches(hostOf(url), d));
  return i === -1 ? 999 : i + 1;
};

// Bing News RSS restricted to the given sites. Undocumented endpoint: returns [] on any failure.
export async function bingNews(query, sites, mkt = 'en-US') {
  const q = `${query} (${sites.map((s) => `site:${s}`).join(' OR ')})`;
  try {
    const res = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&mkt=${mkt}&setlang=en`, {
      headers: { 'User-Agent': REAL_UA }, signal: AbortSignal.timeout(15000),
    });
    const $ = cheerio.load(await res.text(), { xmlMode: true });
    return $('item').map((_, el) => {
      const link = $(el).find('link').text();
      const real = new URL(link).searchParams.get('url') || link;
      return { title: $(el).find('title').text(), url: real, source: $(el).find('News\\:Source').text() || hostOf(real) };
    }).get();
  } catch {
    return [];
  }
}
