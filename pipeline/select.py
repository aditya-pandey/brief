"""
Step 2 — Select the top stories.

We hand Gemini every candidate headline (with its source/lean/region) and ask
it to do two things at once, in ONE cheap call:
  1. Identify the TOP_N most significant *distinct* stories of the day,
     biased toward India per your spec.
  2. For each story, list which candidate articles (by index) cover it — across
     outlets and across the political spectrum.

That grouping is what lets the analysis step build a real Perspective Matrix
from multiple sources instead of a single article.
"""

from __future__ import annotations
from pydantic import BaseModel, Field

from .sources import TOP_N, INDIA_SHARE
from . import llm


class SelectedStory(BaseModel):
    title: str = Field(description="Short, neutral working title for the story")
    region: str = Field(description="'india' or 'global'")
    article_indices: list[int] = Field(
        description="Indices into the candidate list of articles covering this story"
    )


class Selection(BaseModel):
    stories: list[SelectedStory]


_SYSTEM = (
    "You are a senior news editor curating the day's most significant stories "
    "for an analytical Indian readership. You value substance over noise and "
    "ignore clickbait, horoscopes, and pure entertainment filler."
)


def select_top_stories(candidates: list[dict]) -> list[SelectedStory]:
    india_target = round(TOP_N * INDIA_SHARE)
    lines = [
        f"[{i}] ({c['region']}/{c['source']}) {c['title']}"
        for i, c in enumerate(candidates)
    ]
    prompt = (
        f"Here are today's candidate news items, one per line, prefixed by index:\n\n"
        + "\n".join(lines)
        + f"\n\nPick the {TOP_N} most significant DISTINCT stories of the day. "
        f"Aim for about {india_target} India-centric stories and the rest globally "
        f"significant. Merge duplicate coverage of the same event into one story. "
        f"For each story, return its article_indices: every candidate index that "
        f"covers that same event (pull from as many different outlets and leans as "
        f"genuinely apply). Order stories most-important first."
    )
    result = llm.structured(prompt, Selection, system=_SYSTEM)
    # Guard against an index the model might invent.
    n = len(candidates)
    for s in result.stories:
        s.article_indices = [i for i in s.article_indices if 0 <= i < n]
    return [s for s in result.stories if s.article_indices][:TOP_N]
