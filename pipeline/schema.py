"""
The nine-section deep-dive format, expressed as a strict schema.

By handing this schema to Gemini as a `response_schema`, the model is FORCED to
return valid JSON with exactly these fields. That kills the "quality of
responses is not very good / parsing breaks" problem you hit before: the model
can no longer drift in format, and the front end can render it blindly.
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional

class Section(BaseModel):
    question: str = Field(description="The analytical question ending in ?")
    answer: str = Field(description="Verbatim answer to that question")

class FactsVsClaims(BaseModel):
    facts: List[str] = Field(default_factory=list)
    claims: List[str] = Field(default_factory=list)

class Source(BaseModel):
    outlet: str = Field(description="The publication or institution name")
    desk: str = Field(description="The desk, wire, or author")
    lean: str = Field(description="left, center, or right")
    region: str = Field(description="india or global")
    title: str = Field(description="Title / description of the source article")
    url: str = Field(description="URL to the source article")

class DeepDive(BaseModel):
    """One fully analysed story in the question-based structured format."""
    id: str = Field(description="kebab-case-slug-of-headline")
    headline: str = Field(description="Punchy, specific, informative headline (not clickbait)")
    tldr: str = Field(description="Overview / TL;DR text")
    region: str = Field(description="india or global")
    simple_explanation: str = Field(description="In plain English explanation using simple analogies")
    sections: List[Section] = Field(description="Analytical question-answer sections")
    strategic_assessment: str = Field(description="Verbatim answer to the final strategic/horizon question")
    facts_vs_claims: FactsVsClaims = Field(description="Facts vs claims extraction")
    confidence_note: str = Field(description="Confidence notes details")
    sources: List[Source] = Field(description="Sources used in the analysis")

