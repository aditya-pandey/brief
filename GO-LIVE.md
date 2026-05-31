# GO-LIVE checklist

The Node.js pipeline is fully working locally. These are the remaining manual steps.

## 1. Create the GitHub repo and push

```bash
cd /Users/macbook/Documents/news-deepdive-pkg
git init
git add .
git commit -m "Initial commit — Node.js pipeline"
# Create a new repo at github.com (do NOT initialise with README)
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 2. Add the API key secret

**Settings → Secrets and variables → Actions → New repository secret**
- Name:  `GEMINI_API_KEY`
- Value: your Gemini key (the one used in the local test)

## 3. Enable GitHub Pages

**Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: `main`, folder `/ (root)`

Your site will be live at `https://<you>.github.io/<repo>/` within a minute.

## 4. Trigger the first cloud run

**Actions → Daily Briefing → Run workflow**

This will generate a fresh `data/<today>.json`, commit it, and the Pages site will update automatically.

## 5. Verify the Actions workflow uses Node

The workflow in `.github/workflows/daily.yml` already uses `actions/setup-node@v4` and `npm ci`. No changes needed.

---

## Feeds to review

The following feeds had issues and were replaced. Review periodically:

| Removed | Why | Replacement |
|---|---|---|
| The Wire | Malformed RSS XML (403 + XML parse error) | India Today |
| The Print | 403 blocked | Hindustan Times |
| Firstpost | Feed format not recognised | — (dropped; OpIndia covers right-India) |
| Reuters (direct) | DNS dead (`feeds.reuters.com`) | `news.google.com/rss` search for "reuters" |
| Associated Press (direct) | DNS dead (`feeds.apnews.com`) | Bundled into Reuters GNews slot |

**Lean tags to tune** — these are rough starting points, especially for Indian outlets:
- `India Today` — tagged `center`; leans editorially toward establishment, some would tag `right-center`
- `OpIndia` — tagged `right`; widely considered far-right/Hindu-nationalist; review if you want that voice
- `Hindustan Times` — tagged `center`; considered broadly pro-establishment by critics

## Optional overrides

Set `GEMINI_MODEL` as an Actions secret or env var to switch models, e.g.:
- `gemini-2.5-flash` (default) — best free-tier quality
- `gemini-2.0-flash-lite` — faster/cheaper if you hit rate limits
