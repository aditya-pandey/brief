// Automatic fact check: quotes, numbers and names in the generated text must appear in the source text.
// Normalises curly quotes, dashes and HTML entities first; without that, real quotes show as false misses.

export const normalize = (s) => String(s)
  .replace(/[‘’‛′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—]/g, '-')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;| /g, ' ')
  .replace(/\s+/g, ' ')
  .toLowerCase();

// Title-case runs that are sentence starters or section headings, not names.
const NOT_A_NAME = /^(The|In|This|That|What|Why|How|Who|When|Where|Plain English|Front|Overview|But|And|If|It|For|A|At|As|By|During|On|Is|Conclusion)\b/;

/**
 * @param {string} text      generated text (exclude the Sources list before passing it in)
 * @param {string[]} corpus  source texts to check against
 */
export function factCheck(text, corpus) {
  const hay = normalize(corpus.join('\n'));
  const body = normalize(text).replace(/\s+/g, ' ');
  const raw = String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const has = (s) => hay.includes(normalize(s).replace(/[,.;:]+$/, ''));

  const quotes = [...raw.matchAll(/"([^"\n]{12,240})"/g)].map((m) => m[1]);
  const numbers = [...new Set([...raw.matchAll(/\b\d[\d,.]*\d%?|\b\d%?\b/g)].map((m) => m[0].replace(/[.,]$/, '')))]
    .filter((n) => n.replace(/[^\d]/g, '').length >= 2);
  const names = [...new Set([...raw.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g)].map((m) => m[1]))]
    .filter((n) => !NOT_A_NAME.test(n));
  // Headings are not claims: drop names that only occur inside Markdown headings.
  const headingText = normalize([...raw.matchAll(/^#+ .*$|^[A-Z][^\n.]{0,120}$/gm)].map((m) => m[0]).join(' '));
  const inBody = (n) => body.split(normalize(n)).length - 1 > headingText.split(normalize(n)).length - 1;

  return {
    quotes: quotes.map((q) => ({ value: q, found: has(q) })),
    numbers: numbers.map((n) => ({ value: n, found: has(n) })),
    names: names.filter(inBody).map((n) => ({ value: n, found: has(n) })),
  };
}

export const tally = (arr) => `${arr.filter((x) => x.found).length}/${arr.length}`;
export const misses = (report) => Object.entries(report).flatMap(([kind, arr]) => arr.filter((x) => !x.found).map((x) => ({ kind, value: x.value })));
