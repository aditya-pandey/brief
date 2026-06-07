import { GoogleGenAI } from "@google/genai";
import { createHash } from "crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// gemini-2.0-flash: 1500 req/day free tier per project — well above the ~11 calls/day this pipeline needs.
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

// ── API key rotation ──────────────────────────────────────────────────────────
// Reads GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, … (up to 9 extra).
// When a key returns 429 (quota exhausted), the next key is tried automatically.
// This way a single run can span multiple free-tier projects.
function loadKeys() {
  const keys = [];
  const primary = process.env.GEMINI_API_KEY;
  if (primary) keys.push(primary);
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  return keys;
}

// One GoogleGenAI client per key, lazily created.
const _clients = {};
function clientForKey(apiKey) {
  if (!_clients[apiKey]) _clients[apiKey] = new GoogleGenAI({ apiKey });
  return _clients[apiKey];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isQuotaError(err) {
  return err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED");
}

/**
 * Call Gemini with a responseSchema for forced JSON output.
 * Results are cached in .cache/ so re-runs skip the API entirely.
 * Set LLM_CACHE=0 to force live calls (e.g. in CI).
 *
 * Key rotation: if a key is quota-exhausted (429), the next key is tried
 * immediately (no sleep). Per-key retries handle transient rate limits.
 */
export async function structured(prompt, schema, { system, retries = 3 } = {}) {
  const ck = cacheKey(prompt, schema, system);
  const cached = cacheGet(ck);
  if (cached !== null) return cached;

  const keys = loadKeys();
  if (!keys.length) throw new Error(
    "No GEMINI_API_KEY set. Create a free key at https://aistudio.google.com/apikey and export it."
  );

  let lastErr;

  for (let ki = 0; ki < keys.length; ki++) {
    const apiKey = keys[ki];
    const keyLabel = ki === 0 ? "key-1" : `key-${ki + 1}`;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const config = {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.4,
        };
        if (system) config.systemInstruction = system;

        const response = await clientForKey(apiKey).models.generateContent({
          model: MODEL,
          contents: prompt,
          config,
        });

        const text = response.text;
        if (text) {
          const result = JSON.parse(text);
          cacheSet(ck, result);
          return result;
        }
        lastErr = new Error("empty response text");
      } catch (err) {
        lastErr = err;

        if (isQuotaError(err)) {
          // Quota exhausted on this key — skip remaining retries, try next key
          console.log(`    [${keyLabel}] quota exhausted — trying next key…`);
          break;
        }

        // Transient error — honour retryDelay from the 429 body, else back off
        let wait = 15000 * (attempt + 1);
        try {
          const body = JSON.parse(err.message.replace(/^.*?(\{)/, "$1"));
          const retryInfo = body?.error?.details?.find(d => d["@type"]?.endsWith("RetryInfo"));
          if (retryInfo?.retryDelay) {
            const secs = parseFloat(retryInfo.retryDelay);
            if (secs > 0) wait = Math.ceil(secs * 1000) + 2000;
          }
        } catch {}
        console.log(`    [${keyLabel}] retry ${attempt + 1}/${retries}: ${err.message?.slice(0, 80)} (sleep ${Math.round(wait / 1000)}s)`);
        await sleep(wait);
      }
    }
  }

  throw new Error(`Gemini call failed on all ${keys.length} key(s): ${lastErr}`);
}
