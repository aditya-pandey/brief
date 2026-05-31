"""
Step 3 — Scrape the chosen articles.

For each selected story we fetch the full text of its member articles using
trafilatura (clean main-content extraction). This text is used ONLY as input
to the analysis model. It is never stored or published verbatim — the site
publishes your analysis plus links + attribution back to each source, which is
exactly the transparency model you described.
"""

from __future__ import annotations
import trafilatura

# Cap text per article so prompts stay small (keeps you well inside free limits).
MAX_CHARS = 6000


def fetch_text(url: str) -> str:
    try:
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            return ""
        text = trafilatura.extract(
            downloaded, include_comments=False, include_tables=False
        ) or ""
        return text.strip()[:MAX_CHARS]
    except Exception as exc:
        print(f"    ! scrape failed for {url}: {exc}")
        return ""
