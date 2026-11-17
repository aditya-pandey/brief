// Gemini API calls: free or paid key, optional Google Search, patient retries on 503/429,
// token and cost logging, and a hard daily spend limit for the paid key.
//
// Keys come from the environment only:
//   GEMINI_API_KEY       free-tier project (Flash)
//   GEMINI_API_KEY_PAID  paid project, covered by the Google AI Pro credit (deep dive, Google Search)

export const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-4-hydrogen';
// Paid prices for gemini-4-hydrogen, USD per 1M tokens. Thinking tokens bill as output.
const PRICE_IN = 1.5;
const PRICE_OUT = 7.5;
const MAX_RUN_USD = Number(process.env.MAX_DAILY_USD || 0.6);

export const usage = { calls: 0, input: 0, output: 0, thinking: 0, searches: 0, paidUsd: 0 };

const keyFor = (tier) => (tier === 'paid' ? process.env.GEMINI_API_KEY_PAID : process.env.GEMINI_API_KEY);

/**
 * @param {object} o
 * @param {string} [o.system]   system instruction
 * @param {string} o.user       user message
 * @param {'free'|'paid'} [o.key='free']
 * @param {boolean} [o.json]    ask for a JSON response
 * @param {boolean} [o.search]  enable Google Search (paid key only)
 * @param {string} [o.thinking] thinking level, e.g. "high"
 * @param {boolean} [o.fallbackToPaid] if the free key stays busy, retry once on the paid key
 * @returns {Promise<{text: string, grounding: object|null, tier: string}>}
 */
export async function gemini({ system, user, key = 'free', json = false, search = false, thinking, model = DEFAULT_MODEL,
  timeoutMs = 900000, maxAttempts = 6, fallbackToPaid = false, log = console.log }) {
  const apiKey = keyFor(key);
  if (!apiKey) throw new Error(`No API key for the ${key} tier (set ${key === 'paid' ? 'GEMINI_API_KEY_PAID' : 'GEMINI_API_KEY'})`);
  if (search && key !== 'paid') throw new Error('Google Search needs the paid key');
  if (key === 'paid' && usage.paidUsd >= MAX_RUN_USD) throw new Error(`Paid spend limit reached ($${usage.paidUsd.toFixed(2)} ≥ $${MAX_RUN_USD})`);

  const t0 = Date.now();
  const canFallBack = fallbackToPaid && key === 'free' && !!process.env.GEMINI_API_KEY_PAID;
  const toPaid = (why) => {
    log(`  Free key ${why}; switching to the paid key.`);
    return gemini({ system, user, key: 'paid', json, search, thinking, model, timeoutMs, maxAttempts: 4, log });
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ role: 'user', parts: [{ text: user }] }],
          ...(search ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: {
            ...(json ? { responseMimeType: 'application/json' } : {}),
            ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (attempt === maxAttempts) {
        if (canFallBack) return toPaid(`network errors (${e.message})`);
        throw e;
      }
      log(`  Gemini network error (${e.message}), retrying...`);
      await sleep(30);
      continue;
    }

    if (res.status === 503 || res.status === 429) {
      const body = await res.text();
      // A free-tier quota error will not clear in minutes: move to the paid key at once.
      if (res.status === 429 && canFallBack && /quota/i.test(body)) return toPaid('is out of quota');
      if (attempt < maxAttempts) {
        const waitS = Math.min(120, attempt * 30);
        log(`  Gemini ${res.status} (busy), retrying in ${waitS}s (attempt ${attempt}/${maxAttempts})...`);
        await sleep(waitS);
        continue;
      }
      if (canFallBack) return toPaid('still busy');
      throw new Error(`Gemini ${res.status} after ${maxAttempts} attempts: ${body.slice(0, 200)}`);
    }

    const j = await res.json();
    if (j.error) throw new Error(`Gemini ${j.error.code}: ${j.error.message}`);
    const cand = j.candidates?.[0];
    const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    if (!text) throw new Error(`Gemini returned no text (finishReason: ${cand?.finishReason || 'unknown'})`);

    const u = j.usageMetadata || {};
    const inTok = u.promptTokenCount || 0, outTok = u.candidatesTokenCount || 0, thinkTok = u.thoughtsTokenCount || 0;
    const grounding = cand.groundingMetadata || null;
    usage.calls++; usage.input += inTok; usage.output += outTok; usage.thinking += thinkTok;
    usage.searches += grounding?.webSearchQueries?.length || 0;
    const cost = key === 'paid' ? (inTok * PRICE_IN + (outTok + thinkTok) * PRICE_OUT) / 1e6 : 0;
    usage.paidUsd += cost;
    log(`  Gemini ${model} (${key}) ${((Date.now() - t0) / 1000).toFixed(1)}s: in ${inTok}, out ${outTok}, thinking ${thinkTok}${cost ? `, $${cost.toFixed(3)}` : ''}`);
    return { text, grounding, tier: key };
  }
}

// Google Search results come back as vertexaisearch redirect links. Resolve them to the real article URLs.
export async function resolveGroundingSources(grounding) {
  const out = [];
  for (const c of grounding?.groundingChunks || []) {
    if (!c.web?.uri) continue;
    let url = c.web.uri;
    try {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
      url = r.headers.get('location') || url;
    } catch {}
    if (!out.some((s) => s.url === url)) out.push({ title: c.web.title, url });
  }
  return out;
}

export function usageSummary() {
  return `${usage.calls} call(s): ${usage.input} in, ${usage.output} out, ${usage.thinking} thinking tokens; ${usage.searches} searches; paid cost $${usage.paidUsd.toFixed(3)}`;
}

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
