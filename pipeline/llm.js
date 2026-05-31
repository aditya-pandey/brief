import { GoogleGenAI } from "@google/genai";
import { createHash } from "crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// gemini-2.0-flash: 1500 req/day free tier — well above the 9 calls/day this pipeline needs.
// gemini-2.5-flash: only 20 req/day on the free tier, exhausted quickly during testing.
// Override with the GEMINI_MODEL env var if you want a different model.
export const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

// File-based cache: .cache/<hash>.json
// Set LLM_CACHE=0 to disable (e.g. in CI/production).
const CACHE_ENABLED = process.env.LLM_CACHE !== "0";
const CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../.cache");

function cacheKey(prompt, schema, system) {
  // Deliberately excludes MODEL so cache hits survive model switches during local dev.
  return createHash("sha256")
    .update((system ?? "") + "\n" + JSON.stringify(schema) + "\n" + prompt)
    .digest("hex");
}

function cacheGet(key) {
  if (!CACHE_ENABLED) return null;
  const file = `${CACHE_DIR}/${key}.json`;
  if (!existsSync(file)) return null;
  try {
    const result = JSON.parse(readFileSync(file, "utf8"));
    console.log(`    [cache hit]`);
    return result;
  } catch { return null; }
}

function cacheSet(key, value) {
  if (!CACHE_ENABLED) return;
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(`${CACHE_DIR}/${key}.json`, JSON.stringify(value, null, 2));
}

let _client = null;

function client() {
  if (!_client) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error(
      "GEMINI_API_KEY is not set. Create a free key at https://aistudio.google.com/apikey and export it."
    );
    _client = new GoogleGenAI({ apiKey: key });
  }
  return _client;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Call Gemini with a responseSchema for forced JSON output.
 * Results are cached in .cache/ so re-runs skip the API entirely.
 * Set LLM_CACHE=0 to force live calls (e.g. in CI).
 */
export async function structured(prompt, schema, { system, retries = 3 } = {}) {
  const key = cacheKey(prompt, schema, system);
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  // No cache hit — need the API key.
  if (!process.env.GEMINI_API_KEY) throw new Error(
    "GEMINI_API_KEY is not set. Create a free key at https://aistudio.google.com/apikey and export it."
  );

  let last;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const config = {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.4,
      };
      if (system) config.systemInstruction = system;

      const response = await client().models.generateContent({
        model: MODEL,
        contents: prompt,
        config,
      });

      const text = response.text;
      if (text) {
        const result = JSON.parse(text);
        cacheSet(key, result);
        return result;
      }
      last = new Error("empty response text");
    } catch (err) {
      last = err;
      // Honour the retryDelay the API embeds in the 429 body, otherwise back off.
      let wait = 15000 * (attempt + 1);
      try {
        const body = JSON.parse(err.message.replace(/^.*?(\{)/, "$1"));
        const retryInfo = body?.error?.details?.find(d => d["@type"]?.endsWith("RetryInfo"));
        if (retryInfo?.retryDelay) {
          const secs = parseFloat(retryInfo.retryDelay);
          if (secs > 0) wait = Math.ceil(secs * 1000) + 2000; // +2s buffer
        }
      } catch {}
      console.log(`    retry ${attempt + 1}/${retries} after error: ${err.message?.slice(0,80)} (sleep ${Math.round(wait/1000)}s)`);
      await sleep(wait);
    }
  }
  throw new Error(`Gemini call failed after ${retries} tries: ${last}`);
}
