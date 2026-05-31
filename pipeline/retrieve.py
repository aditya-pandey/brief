"""
Step 1 — Retrieve.

Pull recent items from every feed in sources.py. We only collect lightweight
metadata here (title, url, source, lean, region, summary, published time).
Full article text is fetched later, and only for the stories we actually pick,
so we never waste bandwidth scraping articles we won't use.
"""

from __future__ import annotations
import datetime as dt
import time
import feedparser

from .sources import SOURCES

# Only consider articles published within this many hours.
LOOKBACK_HOURS = 30


def _published(entry) -> dt.datetime | None:
    for key in ("published_parsed", "updated_parsed"):
        t = entry.get(key)
        if t:
            return dt.datetime.fromtimestamp(time.mktime(t), tz=dt.timezone.utc)
    return None


def fetch_candidates() -> list[dict]:
    """Return a flat list of recent article dicts across all sources."""
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=LOOKBACK_HOURS)
    out: list[dict] = []

    for src in SOURCES:
        try:
            parsed = feedparser.parse(src["feed"])
        except Exception as exc:  # one bad feed should never kill the run
            print(f"  ! failed to parse {src['name']}: {exc}")
            continue

        for entry in parsed.entries:
            pub = _published(entry)
            if pub and pub < cutoff:
                continue
            url = entry.get("link")
            title = (entry.get("title") or "").strip()
            if not url or not title:
                continue
            out.append({
                "title": title,
                "url": url,
                "source": src["name"],
                "lean": src["lean"],
                "region": src["region"],
                "summary": (entry.get("summary") or "")[:400],
                "published": pub.isoformat() if pub else None,
            })

        print(f"  - {src['name']}: {len(parsed.entries)} items")
        time.sleep(0.3)  # be polite

    print(f"  => {len(out)} candidate articles within {LOOKBACK_HOURS}h")
    return out
