// RSS feeds → recent items → clusters of the same story → score.
// Shared by Flash and the deep dive picker.
import Parser from 'rss-parser';

export const REAL_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const customFields = { item: [['media:content', 'mediaContent'], ['enclosure', 'enclosure']] };
// Sites disagree: ESPN rejects browser-like requests, Nature sometimes rejects the default ones.
// So each feed is tried with the default headers first, then once with browser headers.
const parser = new Parser({ customFields });
const browserParser = new Parser({ customFields, headers: { 'User-Agent': REAL_UA, Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' } });

// Verified working as of 2026-06-26. Dropped: The Print, Business Standard, DNA India (bot-blocked,
// 403 even with a browser UA), Down To Earth (malformed XML), OpIndia/Swarajya (credibility), Cricbuzz (dead RSS).
export const FEEDS = [
  // India
  { url: 'https://www.thehindu.com/feeder/default.rss', cat: 'india', source: 'The Hindu', weight: 1.0 },
  { url: 'https://feeds.feedburner.com/ndtvnews-top-stories', cat: 'india', source: 'NDTV', weight: 0.85 },
  { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', cat: 'india', source: 'Times of India', weight: 0.8 },
  { url: 'https://indianexpress.com/section/india/feed/', cat: 'india', source: 'Indian Express', weight: 0.9 },
  { url: 'http://feeds.bbci.co.uk/news/world/asia/india/rss.xml', cat: 'india', source: 'BBC', weight: 0.95 },
  { url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml', cat: 'india', source: 'Hindustan Times', weight: 0.85 },

  // Global
  { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', cat: 'global', source: 'BBC', weight: 1.0 },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', cat: 'global', source: 'Al Jazeera', weight: 0.85 },
  { url: 'https://www.theguardian.com/world/rss', cat: 'global', source: 'The Guardian', weight: 0.9 },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', cat: 'global', source: 'NYT', weight: 1.0 },
  { url: 'http://rss.cnn.com/rss/cnn_world.rss', cat: 'global', source: 'CNN', weight: 0.85 },
  { url: 'https://moxie.foxnews.com/google-publisher/world.xml', cat: 'global', source: 'Fox News', weight: 0.7 },
  { url: 'https://rss.dw.com/rdf/rss-en-all', cat: 'global', source: 'DW', weight: 0.9 },
  { url: 'https://www.france24.com/en/rss', cat: 'global', source: 'France24', weight: 0.85 },
  { url: 'https://www.euronews.com/rss?level=theme&name=news', cat: 'global', source: 'Euronews', weight: 0.8 },

  // Politics (India-focused per the editorial brief)
  { url: 'https://indianexpress.com/section/political-pulse/feed/', cat: 'politics', source: 'Indian Express', weight: 0.9 },

  // Economics
  { url: 'https://www.livemint.com/rss/economy', cat: 'economics', source: 'Livemint', weight: 0.9 },
  { url: 'https://www.moneycontrol.com/rss/business.xml', cat: 'economics', source: 'Moneycontrol', weight: 0.85 },
  { url: 'https://economictimes.indiatimes.com/rssfeedsdefault.cms', cat: 'economics', source: 'Economic Times', weight: 0.85 },
  { url: 'https://www.thehindubusinessline.com/feeder/default.rss', cat: 'economics', source: 'Hindu BusinessLine', weight: 0.9 },

  // AI & Tech
  { url: 'https://techcrunch.com/feed/', cat: 'ai-tech', source: 'TechCrunch', weight: 0.9 },
  { url: 'https://www.theverge.com/rss/index.xml', cat: 'ai-tech', source: 'The Verge', weight: 0.85 },
  { url: 'http://feeds.arstechnica.com/arstechnica/index', cat: 'ai-tech', source: 'Ars Technica', weight: 0.9 },
  { url: 'https://inc42.com/feed/', cat: 'ai-tech', source: 'Inc42', weight: 0.85 },

  // Science
  { url: 'https://www.nasa.gov/feed/', cat: 'science', source: 'NASA', weight: 0.95 },
  { url: 'https://www.sciencedaily.com/rss/all.xml', cat: 'science', source: 'ScienceDaily', weight: 0.8 },
  { url: 'https://www.nature.com/nature.rss', cat: 'science', source: 'Nature', weight: 1.0 },

  // Health (1–2 a day): WHO plus two broader feeds so the daily minimum can be met (added 2026-11-17)
  { url: 'https://www.who.int/rss-feeds/news-english.xml', cat: 'health', source: 'WHO', weight: 0.95 },
  { url: 'https://feeds.bbci.co.uk/news/health/rss.xml', cat: 'health', source: 'BBC', weight: 0.9 },
  { url: 'https://www.sciencedaily.com/rss/health_medicine.xml', cat: 'health', source: 'ScienceDaily', weight: 0.75 },

  // Culture
  { url: 'http://feeds.feedburner.com/ScrollinArticles.rss', cat: 'culture', source: 'Scroll.in', weight: 0.85 },
  { url: 'https://feeds.npr.org/1008/rss.xml', cat: 'culture', source: 'NPR', weight: 0.8 },
  { url: 'https://www.theguardian.com/society/rss', cat: 'culture', source: 'The Guardian', weight: 0.85 },

  // Entertainment
  { url: 'https://variety.com/feed/', cat: 'entertainment', source: 'Variety', weight: 0.85 },
  { url: 'https://indianexpress.com/section/entertainment/feed/', cat: 'entertainment', source: 'Indian Express', weight: 0.75 },

  // Sports
  { url: 'https://www.espn.com/espn/rss/news', cat: 'sports', source: 'ESPN', weight: 0.85 },
  { url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', cat: 'sports', source: 'ESPNcricinfo', weight: 0.9 },
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', cat: 'sports', source: 'BBC Sport', weight: 0.9 },
];

const FEED_TIMEOUT_MS = 8000;

export function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms fetching ${label}`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function feedImage(item) {
  return item.enclosure?.url || item.mediaContent?.$?.url || null;
}

export async function fetchAllFeeds(log = console.log) {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await withTimeout(parser.parseURL(feed.url), FEED_TIMEOUT_MS, feed.url)
        .catch(() => withTimeout(browserParser.parseURL(feed.url), FEED_TIMEOUT_MS, feed.url));
      return (parsed.items || []).map((item) => ({
        title: item.title || '',
        link: item.link || '',
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        snippet: (item.contentSnippet || item.summary || '').slice(0, 500),
        source: feed.source,
        cat: feed.cat,
        weight: feed.weight,
        image: feedImage(item),
      }));
    })
  );
  const items = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else log(`  ✗ ${FEEDS[i].source} (${FEEDS[i].cat}): ${r.reason?.message || r.reason}`);
  });
  log(`Fetched ${items.length} items from ${results.filter((r) => r.status === 'fulfilled').length}/${FEEDS.length} feeds.`);
  return items;
}

function normalizeTitle(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function titleSimilarity(a, b) {
  const setA = new Set(normalizeTitle(a).split(' ').filter((w) => w.length > 3));
  const setB = new Set(normalizeTitle(b).split(' ').filter((w) => w.length > 3));
  if (setA.size < 3 || setB.size < 3) return 0;
  let overlap = 0;
  for (const w of setA) if (setB.has(w)) overlap++;
  if (overlap < 2) return 0;
  return overlap / Math.min(setA.size, setB.size);
}

// Keep items from the last `lookbackHours`, then group near-identical headlines into one cluster.
export function clusterRecent(items, { lookbackHours = 30, log = console.log } = {}) {
  const cutoff = Date.now() - lookbackHours * 3600 * 1000;
  const recent = items.filter((i) => i.pubDate.getTime() >= cutoff);
  const clusters = [];
  for (const item of recent) {
    const match = clusters.find((c) => titleSimilarity(item.title, c.primary.title) >= 0.5);
    if (match) {
      match.items.push(item);
      match.sources.add(item.source);
    } else {
      clusters.push({ primary: item, items: [item], sources: new Set([item.source]) });
    }
  }
  for (const c of clusters) c.score = scoreCluster(c, lookbackHours);
  clusters.sort((a, b) => b.score - a.score);
  log(`${recent.length} items in the last ${lookbackHours}h → ${clusters.length} distinct stories.`);
  return clusters;
}

export function scoreCluster(cluster, lookbackHours = 30) {
  const ageHours = (Date.now() - cluster.primary.pubDate.getTime()) / 3600000;
  const recency = Math.max(0, 1 - ageHours / lookbackHours);
  const trust = Math.max(...cluster.items.map((i) => i.weight));
  const multiSourceBonus = Math.min(cluster.sources.size - 1, 3) * 0.1;
  return recency * 0.5 + trust * 0.4 + multiSourceBonus;
}

// Strip Markdown link wrapping and tracking parameters from a URL.
export function cleanSourceUrl(raw) {
  if (!raw) return raw;
  let url = raw.trim();
  const md = url.match(/^\[([\s\S]*?)\]\(([\s\S]*?)\)$/);
  if (md) url = md[2].trim();
  try {
    const u = new URL(url);
    for (const p of ['at_medium', 'at_campaign', 'ex_cid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'cmpid', 'ref', 'hl', 'maca', 'fbclid', 'gclid']) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return url;
  }
}

export function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'story';
}

export function relativeTime(date) {
  const hours = (Date.now() - date.getTime()) / 3600000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return 'Yesterday';
}
