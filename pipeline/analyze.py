"""
Step 4 — Analyse each story.

For one story we assemble the real text of its source articles, each clearly
labelled with outlet / lean / region, and ask Gemini to produce the full
nine-section deep dive grounded ONLY in that material. Grounding the model in
actual cross-spectrum coverage is what fixes both quality and the Perspective
Matrix — the model is now summarising real reporting, not improvising.
"""

from __future__ import annotations

from .schema import DeepDive
from . import llm

_SYSTEM = (
    "You are a rigorous, non-partisan news analyst. You work strictly from the "
    "source excerpts provided. You never invent facts, quotes, or sources. When "
    "the sources disagree, you say so. You clearly separate verifiable facts from "
    "opinion and unverified claims. For the perspective matrix, characterise how "
    "each lean/region actually frames the story based on the excerpts; if a "
    "perspective is absent from the sources, say it is not represented rather than "
    "guessing. Keep each field tight and concrete: 2-5 sentences where prose is "
    "expected."
)


def analyze_story(title: str, articles: list[dict]) -> DeepDive | None:
    """`articles` is a list of dicts with keys: source, lean, region, url, text."""
    usable = [a for a in articles if a.get("text")]
    if not usable:
        print(f"    ! no usable text for '{title}', skipping")
        return None

    blocks = []
    for a in usable:
        blocks.append(
            f"--- SOURCE: {a['source']} (lean: {a['lean']}, region: {a['region']})\n"
            f"URL: {a['url']}\n{a['text']}"
        )
    corpus = "\n\n".join(blocks)

    prompt = (
        f"STORY: {title}\n\n"
        f"You have {len(usable)} source excerpt(s) below. Produce a complete deep "
        f"dive strictly from them.\n\n{corpus}"
    )
    return llm.structured(prompt, DeepDive, system=_SYSTEM)
