export const SOURCES = [
  // ---- India ----
  { name: "The Hindu",          lean: "center", region: "india",
    feed: "https://www.thehindu.com/news/national/feeder/default.rss" },
  { name: "The Indian Express", lean: "center", region: "india",
    feed: "https://indianexpress.com/section/india/feed/" },
  { name: "Times of India",     lean: "center", region: "india",
    feed: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms" },
  { name: "NDTV",               lean: "left",   region: "india",
    feed: "https://feeds.feedburner.com/ndtvnews-top-stories" },
  { name: "India Today",        lean: "center", region: "india",
    feed: "https://www.indiatoday.in/rss/home" },
  { name: "Hindustan Times",    lean: "center", region: "india",
    feed: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml" },
  { name: "OpIndia",            lean: "right",  region: "india",
    feed: "https://www.opindia.com/feed/" },

  // ---- Global ----
  { name: "BBC News",           lean: "center", region: "global",
    feed: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "The Guardian",       lean: "left",   region: "global",
    feed: "https://www.theguardian.com/world/rss" },
  { name: "Al Jazeera",         lean: "left",   region: "global",
    feed: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "DW English",         lean: "center", region: "global",
    feed: "https://rss.dw.com/xml/rss-en-world" },
  { name: "Reuters (via GNews)", lean: "center", region: "global",
    feed: "https://news.google.com/rss/search?q=reuters&hl=en-IN&gl=IN&ceid=IN:en" },
];

export const TOP_N = 8;
export const INDIA_SHARE = 0.65;
