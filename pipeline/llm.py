"""
Tiny wrapper around the Gemini API (google-genai SDK).

Everything here runs comfortably inside Gemini's FREE tier at your volume
(roughly TOP_N + 1 calls per day, versus a free allowance of ~1000-1500
requests/day). No billing required — just an API key from Google AI Studio.

Set the key as an environment variable / GitHub secret named GEMINI_API_KEY.
Optionally override the model with GEMINI_MODEL.
"""

from __future__ import annotations
import os
import time
from google import genai
from google.genai import types

# gemini-2.5-flash is a good free-tier default. You can switch to a cheaper/
# lighter model (e.g. a flash-lite) or a stronger one via the GEMINI_MODEL env var.
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

_client: genai.Client | None = None


def client() -> genai.Client:
    global _client
    if _client is None:
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Create a free key at "
                "https://aistudio.google.com/apikey and export it."
            )
        _client = genai.Client(api_key=key)
    return _client


def structured(prompt: str, schema, system: str | None = None, retries: int = 3):
    """Call Gemini and parse the response straight into `schema` (a Pydantic model).

    Returns the parsed object (`response.parsed`). Retries with backoff on
    transient errors / rate limits so a single hiccup doesn't fail the run.
    """
    cfg = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        system_instruction=system,
        temperature=0.4,
    )
    last = None
    for attempt in range(retries):
        try:
            resp = client().models.generate_content(
                model=MODEL, contents=prompt, config=cfg,
            )
            if resp.parsed is not None:
                return resp.parsed
            last = RuntimeError("empty parse")
        except Exception as exc:
            last = exc
            wait = 5 * (attempt + 1)
            print(f"    retry {attempt + 1}/{retries} after error: {exc} (sleep {wait}s)")
            time.sleep(wait)
    raise RuntimeError(f"Gemini call failed after {retries} tries: {last}")
