# The Briefing — an AI-generated daily news deep-dive

One place where the day's top stories are each broken into a structured deep
dive: a TL;DR, 5W1H situational analysis, strategic assessment, a perspective
matrix across the spectrum, facts vs claims, blind spots, stakeholder impact,
timeline, and a transparent source list. Generated **once a day** by a small
pipeline and served as a **static site** — so it costs essentially nothing and
scales to any number of readers.

> Inspired by structured-news apps like Knappily. The reason that model was hard
> to sustain was the human labour of writing so many quality breakdowns daily.
> That's exactly the part this automates.

## How it works (and why it's basically free)

```
GitHub Actions (free daily cron)
        │
        ▼
  pipeline/generate.js
   1. retrieve   RSS feeds (free)                     → candidate headlines
   2. select     1 Gemini call                        → top N distinct stories
   3. scrape     article-extractor + Readability      → full text
   4. analyse    1 Gemini call per story              → 9-section deep dive (forced JSON schema)
        │
        ▼
  data/YYYY-MM-DD.json   ← committed back into the repo (the repo IS the database)
        │
        ▼
  static site (index.html + app.js)  ← served free by GitHub Pages
```

**Total LLM calls per day ≈ N + 1** (default N=8 → ~9 calls/day).
Default model is `gemini-2.0-flash` — free tier allows **1,500 req/day**, so
you use less than 1% of it.

| Piece            | Service                  | Cost |
|------------------|--------------------------|------|
| Scheduling       | GitHub Actions           | Free |
| News retrieval   | Outlet RSS feeds         | Free |
| Article text     | article-extractor (OSS)  | Free |
| Analysis         | Gemini API free tier     | Free |
| Storage          | JSON in the repo         | Free |
| Hosting          | GitHub Pages             | Free |

## Setup — step by step

### 1. Get a free Gemini API key
Go to <https://aistudio.google.com/apikey>, create a key. No billing needed.

### 2. Run it locally once (optional but recommended)
```bash
npm install
export GEMINI_API_KEY="your-key-here"
node pipeline/generate.js
```
This writes `data/<today>.json` and updates `data/index.json`.

Re-running the same day is free — the pipeline skips if the file already exists.
Use `FORCE_REGEN=1 node pipeline/generate.js` to regenerate.

### 3. Preview the site locally
```bash
npx serve .
# open http://localhost:3000
```
Three sample days (`data/2026-05-29.json` through `2026-05-31.json`) ship with
the repo, so the site — including the Time Machine — renders before your first
real run.

### 4. Put it on GitHub
- Create a new repo and push this folder.
- **Settings → Secrets and variables → Actions → New repository secret**
  - Name: `GEMINI_API_KEY`  Value: your key.
- **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
  branch `main`, folder `/ (root)`. Your site goes live at
  `https://<user>.github.io/<repo>/`.

### 5. Let it run daily
The workflow in `.github/workflows/daily.yml` runs every morning at 07:00 IST
automatically. To trigger a run now: **Actions → Daily Briefing → Run workflow**.

## Time Machine

Every day's briefing is stored as `data/YYYY-MM-DD.json`. The home page shows
a **Time Machine** section below the day's stories — click any past date to see
that day's exact snapshot: same headlines, same deep dives, same sources.

## Customise

- **Sources & political leans** — edit `pipeline/sources.js`. The lean tags for
  Indian outlets are rough starting points; adjust them to your own judgement.
- **How many stories / India-vs-global mix** — `TOP_N` and `INDIA_SHARE` in
  `pipeline/sources.js`.
- **The deep-dive format** — `pipeline/schema.js` defines the nine sections. Add
  or remove a section here and update the matching renderer in `app.js`.
- **Model** — set `GEMINI_MODEL` env var (default: `gemini-2.0-flash`).
- **Run time** — change the `cron` in `daily.yml` (it's in UTC).

## Important caveats

- **Accuracy**: AI analysis can be wrong or miss nuance. The footer says so and
  every story links its sources — keep that prominent.
- **No verbatim republishing**: the pipeline feeds article text to the model as
  input only; it stores and publishes *analysis + links*, never the source prose.
- **Perspective matrix honesty**: if a lean isn't present in the day's sources,
  the model says so rather than inventing a view.

## File map
```
pipeline/sources.js    feeds tagged by lean/region + knobs (TOP_N, INDIA_SHARE)
pipeline/retrieve.js   fetch RSS candidates
pipeline/select.js     LLM: cluster candidates → top stories
pipeline/scrape.js     article-extractor + Readability extraction
pipeline/schema.js     the 9-section JSON schema (strict)
pipeline/analyze.js    LLM: produce one deep dive
pipeline/llm.js        Gemini wrapper (structured output, retries, local cache)
pipeline/generate.js   orchestrator — entry point: node pipeline/generate.js
index.html/app.js/styles.css   the static site + Time Machine UI
data/                  generated JSON (the "database")
.github/workflows/daily.yml    the free daily automation
```
