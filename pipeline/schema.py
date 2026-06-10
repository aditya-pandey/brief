"""
The nine-section deep-dive format, expressed as a strict schema.

By handing this schema to Gemini as a `response_schema`, the model is FORCED to
return valid JSON with exactly these fields. That kills the "quality of
responses is not very good / parsing breaks" problem you hit before: the model
can no longer drift in format, and the front end can render it blindly.
"""

from __future__ import annotations
from pydantic import BaseModel, Field


class Situational(BaseModel):
    what: str
    why: str
    who: str
    when: str
    where: str
    how: str


class Perspective(BaseModel):
    left_leaning: str = Field(description="How left-leaning outlets frame it")
    center: str = Field(description="How centrist outlets frame it")
    right_leaning: str = Field(description="How right-leaning outlets frame it")
    indian_media: str = Field(description="How Indian media is covering it")
    global_media: str = Field(description="How global media is covering it")


class FactsClaims(BaseModel):
    facts: list[str] = Field(description="Verifiable facts stated in coverage")
    claims: list[str] = Field(description="Opinions / assertions / unverified claims")


class Stakeholder(BaseModel):
    stakeholder: str
    impact: str


class TimelineEvent(BaseModel):
    when: str
    event: str


class SourceRef(BaseModel):
    outlet: str
    lean: str
    region: str
    title: str
    url: str


class DeepDive(BaseModel):
    """One fully analysed story."""
    headline: str
    tldr: str
    situational_analysis: Situational
    strategic_assessment: str
    perspective_matrix: Perspective
    facts_vs_claims: FactsClaims
    blind_spot: str
    stakeholder_impact: list[Stakeholder]
    timeline: list[TimelineEvent]
