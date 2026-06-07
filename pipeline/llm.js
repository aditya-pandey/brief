import Groq from "groq-sdk";
import { createHash } from "crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// llama-3.3-70b-versatile: reliable JSON output, 6K TPM on free tier.
// Override with GROQ_MODEL env var if needed (e.g. openai/gpt-oss-120b on paid tier).
export const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

// File-based cache: .cache/<hash>.json
// Set LLM_CACHE=0 to disable (e.g. in CI/production).
const CACHE_ENABLED = process.env.LLM_CACHE !== "0";
const CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../.cache");

function cacheKey(prompt, schema, system) {
  // Deliberately excludes MODEL so cache hits survive model switches.
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
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error(
      "GROQ_API_KEY is not set. Create a free key at https://console.groq.com/keys"
    );
    _client = new Groq({ apiKey: key });
  }
  return _client;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Call Groq with JSON schema response format for structured output.
 * Results are cached in .cache/ so re-runs skip the API entirely.
 * Set LLM_CACHE=0 to force live calls (e.g. in CI).
 */
export async function structured(prompt, schema, { system, retries = 3 } = {}) {
  const ck = cacheKey(prompt, schema, system);
  const cached = cacheGet(ck);
  if (cached !== null) return cached;

  if (!process.env.GROQ_API_KEY) throw new Error(
    "GROQ_API_KEY is not set. Create a free key at https://console.groq.com/keys"
  );

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  let last;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Embed the schema in the system prompt so any model can follow it,
      // then request json_object mode for guaranteed valid JSON output.
      const messagesWithSchema = [...messages];
      const schemaInstruction = `\nRespond with a single valid JSON object matching this schema:\n${JSON.stringify(schema, null, 2)}`;
      if (messagesWithSchema[0]?.role === "system") {
        messagesWithSchema[0] = {
          ...messagesWithSchema[0],
          content: messagesWithSchema[0].content + schemaInstruction,
        };
      } else {
        messagesWithSchema.unshift({ role: "system", content: schemaInstruction.trim() });
      }

      const response = await client().chat.completions.create({
        model: MODEL,
        messages: messagesWithSchema,
        response_format: { type: "json_object" },
        temperature: 0.4,
      });

      const text = response.choices[0]?.message?.content;
      if (text) {
        const result = JSON.parse(text);
        cacheSet(ck, result);
        return result;
      }
      last = new Error("empty response");
    } catch (err) {
      last = err;

      // Parse retry-after from 429 headers or message
      let wait = 15000 * (attempt + 1);
      const retryAfter = err?.headers?.["retry-after"] || err?.headers?.["x-ratelimit-reset-requests"];
      if (retryAfter) {
        const secs = parseFloat(retryAfter);
        if (secs > 0) wait = Math.ceil(secs * 1000) + 2000;
      }

      console.log(`    retry ${attempt + 1}/${retries}: ${err.message?.slice(0, 80)} (sleep ${Math.round(wait / 1000)}s)`);
      await sleep(wait);
    }
  }

  throw new Error(`Groq call failed after ${retries} tries: ${last}`);
}
