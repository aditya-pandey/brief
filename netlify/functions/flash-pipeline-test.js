import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    item: [['media:content', 'mediaContent'], ['enclosure', 'enclosure']]
  }
});

// Starting feed list across the existing Flash categories. Swap any of
// these out freely — this is a test harness, nothing here is load-bearing.
const FEEDS = [
  { url: 'https://www.thehindu.com/news/national/feeder/default.rss', cat: 'india', source: 'The Hindu', weight: 1.0 },
  { url: 'https://feeds.feedburner.com/ndtvnews-india-news', cat: 'india', source: 'NDTV', weight: 0.9 },
  { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', cat: 'global', source: 'BBC', weight: 1.0 },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', cat: 'global', source: 'Al Jazeera', weight: 0.85 },
  { url: 'https://techcrunch.com/feed/', cat: 'ai-tech', source: 'TechCrunch', weight: 0.9 },
  { url: 'https://www.theverge.com/rss/index.xml', cat: 'ai-tech', source: 'The Verge', weight: 0.85 },
  { url: 'https://www.livemint.com/rss/economy', cat: 'economics', source: 'Livemint', weight: 0.9 },
  { url: 'https://www.moneycontrol.com/rss/business.xml', cat: 'economics', source: 'Moneycontrol', weight: 0.8 },
  { url: 'https://www.politico.com/rss/politics08.xml', cat: 'politics', source: 'Politico', weight: 0.85 },
  { url: 'https://www.espn.com/espn/rss/news', cat: 'sports', source: 'ESPN', weight: 0.85 },
  { url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', cat: 'sports', source: 'ESPNcricinfo', weight: 0.85 },
  { url: 'https://www.nasa.gov/feed/', cat: 'science', source: 'NASA', weight: 0.9 },
  { url: 'https://www.sciencedaily.com/rss/all.xml', cat: 'science', source: 'ScienceDaily', weight: 0.75 },
  { url: 'https://www.who.int/rss-feeds/news-english.xml', cat: 'health', source: 'WHO', weight: 0.9 },
  { url: 'https://www.medicalnewstoday.com/rss', cat: 'health', source: 'Medical News Today', weight: 0.7 },
  { url: 'https://variety.com/feed/', cat: 'entertainment', source: 'Variety', weight: 0.8 },
  { url: 'https://www.bollywoodhungama.com/rss/news.xml', cat: 'entertainment', source: 'Bollywood Hungama', weight: 0.7 },
  { url: 'https://feeds.npr.org/1008/rss.xml', cat: 'culture', source: 'NPR', weight: 0.8 },
];

const MAX_PER_CATEGORY = 3;
const TOTAL_TARGET = 18;
const LOOKBACK_HOURS = 30;

function log(lines, msg) {
  lines.push(msg);
  console.log(msg);
}

function extractImage(item) {
  if (item.enclosure?.url) return item.enclosure.url;
  if (item.mediaContent?.$?.url) return item.mediaContent.$.url;
  return null;
}

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const setA = new Set(normalizeTitle(a).split(' ').filter(w => w.length > 3));
  const setB = new Set(normalizeTitle(b).split(' ').filter(w => w.length > 3));
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const w of setA) if (setB.has(w)) overlap++;
  return overlap / Math.min(setA.size, setB.size);
}

const FEED_TIMEOUT_MS = 12000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms fetching ${label}`)), ms)),
  ]);
}

async function fetchAllFeeds(lines) {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await withTimeout(parser.parseURL(feed.url), FEED_TIMEOUT_MS, feed.url);
      return (parsed.items || []).map((item) => ({
        title: item.title || '',
        link: item.link || '',
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        snippet: (item.contentSnippet || item.summary || '').slice(0, 500),
        source: feed.source,
        cat: feed.cat,
        weight: feed.weight,
        image: extractImage(item),
      }));
    })
  );

  const items = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      log(lines, `  ✓ ${FEEDS[i].source}: ${r.value.length} items`);
      items.push(...r.value);
    } else {
      log(lines, `  ✗ ${FEEDS[i].source}: failed — ${r.reason?.message || r.reason}`);
    }
  });
  return items;
}

function dedupeAndCluster(items, lines) {
  const cutoff = Date.now() - LOOKBACK_HOURS * 3600 * 1000;
  const recent = items.filter((i) => i.pubDate.getTime() >= cutoff);
  log(lines, `Filtered to ${recent.length} items within last ${LOOKBACK_HOURS}h (from ${items.length} total).`);

  const clusters = [];
  for (const item of recent) {
    let matched = null;
    for (const cluster of clusters) {
      if (titleSimilarity(item.title, cluster.primary.title) >= 0.5) {
        matched = cluster;
        break;
      }
    }
    if (matched) {
      matched.items.push(item);
      if (!matched.sources.has(item.source)) matched.sources.add(item.source);
    } else {
      clusters.push({ primary: item, items: [item], sources: new Set([item.source]) });
    }
  }
  log(lines, `Clustered into ${clusters.length} distinct stories.`);
  return clusters;
}

function scoreCluster(cluster) {
  const ageHours = (Date.now() - cluster.primary.pubDate.getTime()) / 3600000;
  const recencyScore = Math.max(0, 1 - ageHours / LOOKBACK_HOURS);
  const trustScore = Math.max(...cluster.items.map((i) => i.weight));
  const multiSourceBonus = Math.min(cluster.sources.size - 1, 3) * 0.1;
  return recencyScore * 0.5 + trustScore * 0.4 + multiSourceBonus;
}

function selectTop(clusters, lines) {
  const scored = clusters
    .map((c) => ({ cluster: c, score: scoreCluster(c) }))
    .sort((a, b) => b.score - a.score);

  const perCatCount = {};
  const selected = [];
  for (const { cluster, score } of scored) {
    if (selected.length >= TOTAL_TARGET) break;
    const cat = cluster.primary.cat;
    perCatCount[cat] = perCatCount[cat] || 0;
    if (perCatCount[cat] >= MAX_PER_CATEGORY) continue;
    perCatCount[cat]++;
    selected.push({ ...cluster, score });
  }
  log(lines, `Selected ${selected.length} stories (capped at ${MAX_PER_CATEGORY}/category, target ${TOTAL_TARGET}): ${JSON.stringify(perCatCount)}`);
  return selected;
}

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'story';
}

function relativeTime(date) {
  const hours = Math.max(1, Math.round((Date.now() - date.getTime()) / 3600000));
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

async function callGemini(selected, apiKey, lines) {
  const payload = selected.map((c, idx) => ({
    index: idx,
    title: c.primary.title,
    snippet: c.items.map((i) => i.snippet).filter(Boolean).join(' / ').slice(0, 600),
    category: c.primary.cat,
  }));

  const prompt = `You are a news editor writing for "Flash" — a fast-scroll speed-news feed read mainly by an Indian audience. For each item below, return a JSON array (same order, same "index") with:
- "index": the input index (number)
- "headline": a punchy, specific headline, max 14 words, no clickbait
- "summary": 3-4 plain sentences covering what happened, no speculation beyond the source material
- "why_it_matters": ONE sentence on why this matters to the reader
- "cat": confirm or correct the category — must be exactly one of: india, global, ai-tech, economics, politics, sports, science, health, entertainment, culture

Items:
${JSON.stringify(payload, null, 2)}

Return ONLY the JSON array, no other text.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content — possible rate limit or safety block.');

  log(lines, `Gemini call succeeded (${payload.length} items sent in one batch).`);
  return JSON.parse(text);
}

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const lines = [];
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured.', log: lines }), { status: 500, headers });
    }

    log(lines, `Fetching ${FEEDS.length} feeds...`);
    const items = await fetchAllFeeds(lines);

    const clusters = dedupeAndCluster(items, lines);
    const selected = selectTop(clusters, lines);

    if (selected.length === 0) {
      return new Response(JSON.stringify({ log: lines, items: [] }), { status: 200, headers });
    }

    const llmResults = await callGemini(selected, apiKey, lines);

    const finalItems = llmResults.map((r) => {
      const cluster = selected[r.index];
      const sourceNames = Array.from(cluster.sources).join(' · ');
      const headline = r.headline || cluster.primary.title;
      return {
        id: slugify(headline),
        cat: r.cat || cluster.primary.cat,
        headline,
        summary: r.summary || '',
        why_it_matters: r.why_it_matters || '',
        source: sourceNames,
        source_url: cluster.primary.link,
        ts: relativeTime(cluster.primary.pubDate),
        source_search: `${headline} ${sourceNames}`,
        image: cluster.items.find((i) => i.image)?.image || null,
      };
    });

    log(lines, `Done. ${finalItems.length} Flash-ready items produced (display only, nothing published).`);

    return new Response(JSON.stringify({ log: lines, items: finalItems }), { status: 200, headers });
  } catch (e) {
    log(lines, `Fatal error: ${e.message}`);
    console.error('[flash-pipeline-test] Error:', e);
    return new Response(JSON.stringify({ error: e.message, log: lines }), { status: 500, headers });
  }
};
