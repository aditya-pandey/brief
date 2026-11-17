// Write data files exactly as editor.html does, so automated and manual publishing stay interchangeable.
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); };

// Today's date in India (the site's publishing day), YYYY-MM-DD.
export const istDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
export const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

export const flashPath = (date) => path.join(DATA, `flash-${date}.json`);
export const flashDraftPath = (date) => path.join(DATA, 'drafts', `flash-${date}.json`);

// Flash stories already published (or drafted) in the `days` days before `date`, plus `date` itself.
export function recentFlash(date, days = 3) {
  const out = [];
  for (let i = 0; i <= days; i++) {
    const d = addDays(date, -i);
    for (const p of [flashPath(d), flashDraftPath(d)]) {
      const arr = readJson(p, []);
      if (Array.isArray(arr)) out.push(...arr);
    }
  }
  return out;
}

export function writeFlashDraft(date, stories, meta = {}) {
  writeJson(flashDraftPath(date), stories);
  if (Object.keys(meta).length) writeJson(path.join(DATA, 'drafts', `flash-${date}.report.json`), meta);
  return flashDraftPath(date);
}

// Same as editor.html publishFlashToGitHub with "merge" on:
// existing stories kept, same id or same headline replaced in place, new ones appended;
// index.json gets {date, count: null}, deduped and sorted newest first;
// root flash.json is rewritten when this date is the latest.
export function publishFlash(date, stories) {
  const existing = readJson(flashPath(date), []);
  const merged = Array.isArray(existing) ? [...existing] : [];
  for (const s of stories) {
    const i = merged.findIndex((m) => m.id === s.id || (m.headline || '').trim().toLowerCase() === s.headline.trim().toLowerCase());
    if (i >= 0) merged[i] = s; else merged.push(s);
  }
  writeJson(flashPath(date), merged);

  const index = updateIndex(date, null);
  const isLatest = index.length > 0 && date >= index[0].date;
  if (isLatest) writeJson(path.join(ROOT, 'flash.json'), merged);
  return { path: flashPath(date), total: merged.length, rootUpdated: isLatest };
}

function updateIndex(date, count) {
  const p = path.join(DATA, 'index.json');
  const index = readJson(p, []);
  if (!index.some((x) => x.date === date)) index.push({ date, count });
  const seen = new Set();
  const unique = index.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && !seen.has(e.date) && seen.add(e.date));
  unique.sort((a, b) => b.date.localeCompare(a.date));
  writeJson(p, unique);
  return unique;
}
