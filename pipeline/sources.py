"""
RSS sources, each tagged by political lean and region.

This list is the backbone of two of your sections:
  - Perspective Matrix  -> we know each article's lean + region, so the model
                           builds the matrix from REAL outlet text, not guesses.
  - Sources & Transparency -> every story lists exactly which outlets fed it.

Lean tags ("left" / "center" / "right") for Indian media are necessarily rough
-- there is no clean, agreed bias dataset for India the way AllSides/Ad Fontes
exist for the US. Treat these as a starting point and tune them yourself.
Add/remove feeds freely; the pipeline reads whatever is here.
"""

SOURCES = [
    # ---- India ----
    {"name": "The Hindu",          "lean": "center", "region": "india",
     "feed": "https://www.thehindu.com/news/national/feeder/default.rss"},
    {"name": "The Indian Express", "lean": "center", "region": "india",
     "feed": "https://indianexpress.com/section/india/feed/"},
    {"name": "Times of India",     "lean": "center", "region": "india",
     "feed": "https://timesofindia.indiatimes.com/rssfeedstopstories.cms"},
    {"name": "NDTV",               "lean": "left",   "region": "india",
     "feed": "https://feeds.feedburner.com/ndtvnews-top-stories"},
    {"name": "The Wire",           "lean": "left",   "region": "india",
     "feed": "https://thewire.in/rss"},
    {"name": "The Print",          "lean": "center", "region": "india",
     "feed": "https://theprint.in/feed/"},
    {"name": "Firstpost",          "lean": "right",  "region": "india",
     "feed": "https://www.firstpost.com/rss/india.xml"},
    {"name": "OpIndia",            "lean": "right",  "region": "india",
     "feed": "https://www.opindia.com/feed/"},

    # ---- Global ----
    {"name": "Reuters",            "lean": "center", "region": "global",
     "feed": "https://www.reutersagency.com/feed/?best-topics=top-news&post_type=best"},
    {"name": "BBC News",           "lean": "center", "region": "global",
     "feed": "https://feeds.bbci.co.uk/news/world/rss.xml"},
    {"name": "The Guardian",       "lean": "left",   "region": "global",
     "feed": "https://www.theguardian.com/world/rss"},
    {"name": "Al Jazeera",         "lean": "left",   "region": "global",
     "feed": "https://www.aljazeera.com/xml/rss/all.xml"},
    {"name": "Associated Press",   "lean": "center", "region": "global",
     "feed": "https://feeds.apnews.com/rss/apf-topnews"},
]

# How many of the day's top stories to publish.
TOP_N = 8

# Bias the selection toward India per your spec ("majorly India, but global too").
# Roughly this share of the TOP_N should be India-centric stories.
INDIA_SHARE = 0.65
