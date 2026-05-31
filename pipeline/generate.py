"""
Orchestrator — run with:  python -m pipeline.generate

Flow:
  retrieve candidates  ->  select top stories (1 LLM call)
  ->  scrape each story's sources  ->  analyse each story (1 LLM call each)
  ->  write data/YYYY-MM-DD.json and refresh data/index.json

Total LLM calls per run ≈ TOP_N + 1. At TOP_N=8 that's ~9 calls/day, far below
the free-tier daily allowance.
"""

from __future__ import annotations
import datetime as dt
import json
import pathlib

from . import retrieve, scrape
from .select import select_top_stories
from .analyze import analyze_story

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"


def _slug(text: str) -> str:
    keep = [c.lower() if c.isalnum() else "-" for c in text]
    s = "".join(keep)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")[:60] or "story"


def run() -> None:
    today = dt.date.today().isoformat()
    print(f"== Generating deep dives for {today} ==")

    print("1) Retrieving candidates...")
    candidates = retrieve.fetch_candidates()
    if not candidates:
        print("No candidates found — aborting (check feeds/network).")
        return

    print("2) Selecting top stories...")
    selected = select_top_stories(candidates)
    print(f"   selected {len(selected)} stories")

    stories_out = []
    for n, sel in enumerate(selected, 1):
        print(f"3.{n}) Story: {sel.title}")
        articles = []
        for idx in sel.article_indices:
            c = candidates[idx]
            print(f"      scraping {c['source']}...")
            text = scrape.fetch_text(c["url"])
            articles.append({**c, "text": text})

        deep = analyze_story(sel.title, articles)
        if deep is None:
            continue

        sources_used = [
            {"outlet": a["source"], "lean": a["lean"], "region": a["region"],
             "title": a["title"], "url": a["url"]}
            for a in articles if a.get("text")
        ]
        story = deep.model_dump()
        story["id"] = _slug(deep.headline)
        story["region"] = sel.region
        story["sources"] = sources_used
        stories_out.append(story)

    if not stories_out:
        print("No stories produced — aborting write.")
        return

    payload = {
        "date": today,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "stories": stories_out,
    }

    DATA_DIR.mkdir(exist_ok=True)
    out_path = DATA_DIR / f"{today}.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f"   wrote {out_path}")

    # Refresh the index of available dates (newest first).
    dates = sorted(
        (p.stem for p in DATA_DIR.glob("*.json") if p.stem != "index"),
        reverse=True,
    )
    (DATA_DIR / "index.json").write_text(json.dumps(dates, indent=2))
    print(f"   index updated: {len(dates)} day(s)")
    print("== Done ==")


if __name__ == "__main__":
    run()
