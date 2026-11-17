# Automation Build Plan: Flash + Deep Dive

**Status:** Approved 2026-11-14, updated 2026-11-16 · **Cost:** about $6/month, covered by the Google AI Pro $10/month Cloud credit

**Decisions:**
- Flash runs once daily (07:00 IST, 25 stories) and goes live after 3 days of drafts.
- 1 deep dive per day, capped at ~1,200 words. Recap is dropped (generated but never shown on the site).
- Deep dive uses the paid key with Google Search. Flash uses the free key.
- Photos on Flash cards (option A: photo strip) and on deep dives. Flash summaries drop to 45–50 words.

## Goal

Replace the daily manual Gem workflow with scheduled automation that keeps Gem-level quality and adds proper images. Today the workflow is Briefing Gem → Formatter Gem → editor → publish, plus Flash Gem → editor → publish.

- **Flash** publishes itself every day, with a photo on each card.
- **Deep dive** is written automatically and saved as a draft, with a cover photo. You review it in the editor and publish, until you trust it enough to switch on auto-publish.

## What the tests proved

| Test | Result |
|---|---|
| Free tier access | `gemini-4-hydrogen` and `gemini-3.5-flash` work. Pro models and Google Search have **zero** free quota. `gemini-2.5-flash` is closed to new keys. |
| Flash quality (hydrogen, free) | 8/8 stories well-formed; strong `why_it_matters`. Better than 3.5-flash on every measure. |
| Flash fact check | 50/50 claims across 5 stories traced to the source article. **One defect:** a second outlet in `source` ("BBC · DW") is invented. |
| Deep dive, free (articles only) | Equal to or deeper than the Gem on the same story (FAA ground stop). 16/16 quotes traced to sources. But 2,563 words, and 146s with several 503s. |
| Deep dive, paid + Google Search (2026-11-16) | 108s, no 503s. Added the GAO audit, the L3Harris contractor angle and an India angle (Air India, stranded Indians). 8 articles + 13 search sources. **$0.17 per run.** Most claims missing from our articles were found on the search pages; 3 were on pages that block bots (GAO, Washington Post). 1,477 words, so the length cap must be enforced in code. |
| Source photos | 15/16 test articles offer a usable photo (mostly 1200px, 40–650 KB). BBC photos carry a logo; the unbranded version is at the same URL with `/standard/` in place of `/branded_news/`. |

Key insight: your Gem runs on hydrogen too. The model is the same, so the only real difference is research. Full article text from approved outlets plus Google Search closes that gap. Every link comes from data we fetched or from Google's search results, never from the model's memory.

## Architecture

```
GitHub Action (cron)  ──►  node pipeline/run.js <flash|deepdive>
                              │
   feeds (38 RSS) ──► cluster + score ──► pick ──► full article text + photo
                                            │     (+ Bing News, approved outlets, for deep dive)
                                            ▼
          Gemini hydrogen (Flash: free key · Deep dive: paid key + Google Search)
                                            ▼
                code validation + automatic fact check + image check
                                            ▼
                     write data files exactly as editor.html does
                                            ▼
          npm run ssg (same job) ──► commit + push ──► Netlify deploy ──► push notification
```

**Why SSG runs in the same job:** a push made by a GitHub Action's own token does not trigger other workflows, so `ssg.yml` would never fire after an automated commit.

### Files

| Path | Purpose |
|---|---|
| `pipeline/lib/feeds.js` | The 38 feeds (34 + BBC Health, ScienceDaily Health, BBC Sport, Guardian Society added 2026-11-17), fetch, recency filter, clustering, scoring (moved from `scripts/flash-test.mjs`). |
| `pipeline/lib/articles.js` | Full-text extraction (cheerio), paywall/short-text detection. Returns text **and** `og:image` from the same fetch. |
| `pipeline/lib/images.js` | Picks and checks the photo, swaps out branded versions, falls back to Wikimedia Commons (see Images). |
| `pipeline/lib/sources.js` | Approved outlet list (global, India, `.gov`), Bing News `site:` search, outlet → lean/region table. |
| `pipeline/lib/gemini.js` | Calls with key choice (free/paid), Google Search tool, 503/429 backoff, JSON mode, thinking level, token/cost logging, resolves Google's search redirect links to real URLs. |
| `pipeline/lib/factcheck.js` | Quotes / numbers / names must appear in the article text or the search pages (handles curly quotes and HTML entities). |
| `pipeline/lib/publish.js` | Writes `data/flash-<date>.json`, `flash.json`, `data/<date>.json`, `data/index.json` with the editor's exact merge rules. |
| `pipeline/lib/markdown.js` | Briefing Markdown → editor JSON. Extends the editor's existing `parseMarkdownBriefing`. |
| `pipeline/prompts/flash.md`, `briefing.md` | Your Gem prompts, verbatim, plus a short research override. |
| `pipeline/flash-auto.js`, `pipeline/deepdive-auto.js` | The two pipelines. |
| `.github/workflows/automate.yml` | Cron schedules, manual run button with `dry_run` option. |

## Images

**Rule:** a real news photo or an honest illustration, never an AI-generated picture of a real event.

**Order of preference:**
1. **Source article photo.** Taken from `og:image` / `twitter:image` during the article fetch the pipeline already does, so it needs no extra requests. Checks:
   - the response really is an image, larger than about 12 KB;
   - it passes the existing `isGenericImage` filter (no logos or placeholders);
   - it is not a Google thumbnail (`gstatic.com`);
   - per-outlet cleanup, for example BBC `/branded_news/` → `/standard/`.
2. **Wikimedia Commons.** Search for the main person, place or organisation in the story. Openly licensed; credit taken from Commons.
3. **The existing generated illustration.** The page also falls back to it if a photo fails to load later.

**Flash:**
- Each item gets `image` and `image_credit` (for example "Photo: BBC"), taken from the article we summarised.
- **Card layout (option A, revised):** a photo strip about 22% of the card height. The category badge sits on the photo and the credit is in the corner. The summary is capped at **45–50 words** so everything fits on a phone; the mockup confirmed all cards fit.
- If no photo is found, the card keeps today's category icon.
- The Flash share preview uses the photo when there is one.

**Deep dive:**
- `heroImage` comes from the best photo across the 8 sources: largest, preferring wire services and major outlets.
- A new `heroCredit` field is shown under the cover.
- The SSG backfill stays as a safety net.
- **Editor:** rejects `gstatic.com` thumbnail URLs and fills the cover automatically.
- **One-off cleanup:** replace the 26 existing deep-dive covers that use Google thumbnails with the real source photo.

**Copyright:**
- Photos are shown by linking to the outlet's own image URL, never copied into the repo, always with a credit and a link to the article. This is the normal practice for aggregators and link previews.
- It is still not risk-free, because outlets often license photos from AP, Reuters or Getty.
- If an outlet objects, add it to a `NO_IMAGE_OUTLETS` list and its stories fall back to Wikimedia Commons or the illustration.

## Phase 0: Housekeeping (before any build) ✅ done 2026-11-16

Shared code is now in `pipeline/lib/` (feeds, articles, sources, gemini, factcheck), the Briefing prompt is in `pipeline/prompts/briefing.md`, and the test scripts became `npm run trial:flash` / `npm run trial:deepdive`, which write to `scratch/` (not committed). The user kept the existing keys as GitHub secrets rather than rotating them.

1. **You:** delete all three keys pasted in chat. Create two fresh ones:
   - one in a free project → GitHub secret `GEMINI_API_KEY`;
   - one in the paid project → GitHub secret `GEMINI_API_KEY_PAID`.

   Add them in GitHub → Settings → Secrets and variables → Actions. Optionally add `ADMIN_SECRET` (same value as Netlify) so the Action can send push notifications.
2. **You:** in Google Cloud Billing, set a **budget alert at $10/month** on the paid project's billing account.
3. **Me:**
   - move the parked test work into `pipeline/`;
   - delete the obsolete pieces (`netlify/functions/flash-pipeline-test.js`, `flash-test-output.json`, the `deepdive-test-output*` files);
   - commit it all as one change.

## Phase 1: Flash on autopilot

**Schedule:** once a day at 07:00 IST, 25 stories, the same product as today. An evening top-up can come later.

**Steps**
1. Fetch the 38 feeds, keep the last 30h ("Yesterday" is the oldest ts the Gem allows), cluster, score.
2. Build a shortlist per category, with headroom above your min/max table (about 1.5× the max per category).
3. Fetch full article text and photo for each candidate.
4. Hydrogen (free key) writes the stories in **3 batches** (~10 categories split into groups). One giant call was the latency problem seen earlier.
5. **Code, not the model, decides:**
   - `source`: the outlet that actually published the article. A second outlet only if our cluster really contained it.
   - `source_url`: must be exactly one of the candidate URLs.
   - `image` and `image_credit`: from that same article (see Images).
   - `ts`: computed from the article's publish time.
   - Category minimums and maximums, and interleaving (no two adjacent stories from the same category).
   - Dedupe against the last 3 days of Flash.
6. **Validation gates** (a failing story is dropped and replaced from the reserve pool):
   - Summary **45–50 words**, `why_it_matters` one sentence of 20–35 words, banned phrases ("highlights"/"underscores" allowed).
   - Fact check: every number and proper name in the summary must appear in that story's article text.
7. **Publish rule:** at least 20 valid stories → publish. Fewer → save to `data/drafts/flash-<date>.json`, don't publish, and the run is marked failed (GitHub emails you).
8. Run SSG, commit, push, send a push notification.
9. **Fallback:** if the free key stays busy after retries, the same calls go to the paid key, costing about $0.20.

**Site change (`app.js` + `styles.css`):** add the photo strip to `buildFlashCardInnerHTML`, lazy-loaded, falling back to the category icon on error. Old Flash days without `image` look exactly as they do now.

**Rollout**
- 3 days with the Action in draft mode: it writes `data/drafts/flash-<date>.json` (plus a `.report.json` with rejected stories and the run log) only, viewable in `flash-test.html` (with photos), so you can compare it with your Gem.
- Then switch on auto-publish: set the repository variable `FLASH_MODE` to `publish` (GitHub → Settings → Secrets and variables → Actions → Variables). Deleting it returns to drafts.
- Manual runs: Actions → Automated Flash → Run workflow, with a draft/publish choice and a dry-run option.

**Build notes (2026-11-17):** code in `pipeline/flash-auto.js`, `pipeline/lib/{images,publish}.js`, `.github/workflows/automate.yml`; the prompt is your Flash Gem prompt verbatim in `pipeline/prompts/flash.md` plus an override block. The summary gate allows 44–52 words (the prompt asks for 45–50) to absorb word-counting differences.

## Phase 2: Deep dive drafts

**Schedule:** 06:00 IST daily. **Count:** 1 per day (setting `DEEP_DIVES_PER_DAY`, can be 2).

**Steps**
1. Hydrogen picks the day's deep-dive story from the clustered candidates, using the Briefing Gem's selection criteria (consequential in a month, India taken seriously). Excludes sports and entertainment.
2. Starting research: Bing News restricted with `site:` to approved outlets (global A/B groups plus India group; India group first for India stories). Max 2 articles per outlet, 8 articles total.
3. Hydrogen (**paid key**, high thinking, **Google Search on**) writes the deep dive with your Briefing prompt verbatim, plus:
   - a research override: the articles are the starting point; search is for verifying, updating and filling gaps; quality outlets only;
   - sources found by search are listed by outlet and headline only, and **code adds the verified links** from Google's search results (the model never writes a URL it was not given);
   - **a length cap of about 1,200 words.** Code rejects anything over 1,350 and asks once for a tighter rewrite (about +$0.05);
   - a closing `### Conclusion` section (2 sentences, no new facts), the one field the Formatter Gem composed.
4. `recap` is written as an empty array: the site never displays it.
5. Code converts Markdown to the editor's JSON (replacing the Formatter Gem):
   - Fix the existing parser: accept `-` and `*` source bullets, tables, strip `[Claimed]`-style tags, produce `question/answer` plus `title/content` section fields.
   - `lean` and `region` per source from a fixed outlet table, not guessed.
   - `heroImage` and `heroCredit` from the best source photo.
6. Fact check: quotes, numbers and names are checked against the articles **and** the search pages. **Flagged items are listed at the top of the draft** for you to review. Claims from pages that block bots (for example GAO, Washington Post) are marked "unverified", not dropped.
7. Search sources not on the approved list are flagged in the draft.
8. Save to `data/drafts/<date>.json`. That path does not trigger publishing.
9. **Editor change:** a "Load today's draft" button. You read, edit, and press Publish as usual.

**Later (Phase 3):** auto-publish deep dives once a couple of weeks of drafts need no fixes.

## Daily load and cost

| | Key | Calls/day | Cost/day |
|---|---|---|---|
| Flash | Free | ~4 | $0 (≈$0.20 on days it falls back to paid) |
| Deep dive | Paid | 2 (pick + write), +1 if a rewrite is needed | ≈$0.19 |
| Google Search | Paid | ~6 searches | $0 (5,000/month free) |

- **Monthly:** about $6, inside the $10 AI Pro credit. Every run logs its tokens and cost.
- **The budget alert does not stop spending.** The code also enforces a daily limit (`MAX_DAILY_USD`, default $0.60) and stops calling the paid key once reached.
- **GitHub Actions:** about 15 min/day ≈ 450 min/month. Free for public repos; private repos get 2,000 free minutes/month.
- **Two keys, two projects:** one free, one paid. This is normal use, not spreading work across several free keys to get more quota.

## Risks and fallbacks

| Risk | Mitigation |
|---|---|
| Hydrogen busy (503) | Backoff up to ~2 min × 6 attempts. Flash then moves to the paid key; deep dive retries next hour. |
| Hydrogen renamed or removed (it is not a stable model name) | Model name is a single setting; failure emails you. |
| Paid spend runs over | $10 budget alert + `MAX_DAILY_USD` hard stop in code + cost logged per run. |
| AI Pro credit stops (subscription ends) | Deep dive falls back to the free key without search (the 14 Nov setup, already tested). |
| Bing News RSS changes (undocumented endpoint) | Deep dive relies on feed articles plus Google Search; flagged if fewer than 4 sources. |
| Paywalls (NYT, WSJ, FT, Bloomberg) | Skipped automatically; free outlets are searched first. |
| Broken or hotlink-blocked photo | Checked at publish time; the page falls back to the icon or illustration if it fails later. |
| Photo copyright complaint | Credit + link on every photo; `NO_IMAGE_OUTLETS` list to switch an outlet off. |
| Free-tier data may be used by Google | Acceptable: all inputs are public news. Paid-tier data is not used for training. |
| Bad story slips through | Fact-check gate + Flash draft period + deep dives stay drafts until you opt in. |

## Still open

- **Approved outlets:** review the list in `pipeline/lib/sources.js` once written. Proposed additions from the paid test: PBS, CTV, Business Standard. Investing.com and others are flagged, not approved.
