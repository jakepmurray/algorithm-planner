# Port Authority Bid Tracker

A small static site for tracking the 2026 USAU Club Mixed Division Nationals bid race
in the Mid-Atlantic region, from Pittsburgh Port Authority's perspective.

Live once deployed via GitHub Pages: `https://<your-username>.github.io/<repo-name>/`

## What's here

- **`index.html`** — Dashboard: current Mid-Atlantic Algorithm rankings, the region's
  Nationals bid count, all-region bid allocation for context, and a historical
  baseline of how many bids Mid-Atlantic has earned in recent years.
- **`simulator.html`** — "What if" score simulator. Enter hypothetical results for
  Port Authority's remaining regular-season tournaments (SFI-East, ESC) and see a
  projected rating and region-standing impact.
- **`data/`** — JSON files the pages read from. `rankings.json` is scraper output;
  `bid_history.json` and `meta.json` are hand-maintained.
- **`scraper/scrape_rankings.py`** — Python scraper that refreshes `data/rankings.json`
  from USA Ultimate's public rankings page.
- **`.github/workflows/update-rankings.yml`** — Runs the scraper weekly during the
  season and commits any changes automatically.

## Running locally

No build step — it's plain HTML/CSS/JS. You just need something serving the files
over HTTP (not `file://`, since the pages `fetch()` the JSON files):

```
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Updating the data

**Automatically:** the GitHub Action in `.github/workflows/update-rankings.yml` runs
every Monday during the season and can also be triggered manually from the Actions tab
("Run workflow"). It re-scrapes and commits `data/rankings.json` if anything changed.

**Manually:**

```
pip install -r scraper/requirements.txt
python scraper/scrape_rankings.py
```

`data/bid_history.json` (past years' bid counts) and `data/meta.json` (team/region,
tournament dates, season dates) are not scraped — edit them by hand as new
information becomes available (e.g. once 2026 Regionals bid counts are finalized,
add a `2026` entry to `bid_history.json`).

### Why the scraper targets usaultimate.org and not play.usaultimate.org

The same rankings/bid-allocation data is published on both `usaultimate.org/club/rankings/`
and the underlying `play.usaultimate.org` tool. `play.usaultimate.org/robots.txt`
explicitly disallows Anthropic's crawlers (`ClaudeBot`, `anthropic-ai`, etc.), so the
scraper only requests `usaultimate.org`, whose robots.txt has no such restriction.
If you fork this for another purpose, please keep that distinction in place.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Repo Settings → Pages → **Deploy from a branch** → branch `main`, folder `/ (root)`.
3. No build step is required; the static files serve as-is.
4. Make sure the Action above has permission to push (`Settings → Actions → General →
   Workflow permissions → Read and write permissions`), or its scheduled commits will fail.

## How the simulator works (and its limits)

USA Ultimate's real Algorithm rankings are computed by iterating every Division team's
full game log to convergence — it isn't something that can be reproduced exactly in a
browser. The simulator instead uses the algorithm's documented per-game rating formula
([source](https://ultiworld.com/2015/04/01/faq-about-the-usa-ultimate-college-rankings-and-algorithm/)):

```
game_PR = opponent_rating ± 400 / max(2/3, 2.5 * (losing_score / winning_score)^2)
```

(added for the winner, subtracted for the loser), then blends the new game(s) into a
team's current rating as a weighted average against their games played so far. This
mirrors the documented method ("power rating is a weighted average of individual game
PR scores") but is a simplification — it doesn't model recency weighting, the blowout
exclusion rule precisely, or the connectivity/convergence across the full national
schedule.

Two modes:

- **Baseline (default):** only Port Authority's own hypothetical games are simulated;
  every other team's rating is held at its last-scraped value. This is the
  recommended mode — it's the most defensible use of the historical/current data
  without guessing at other teams' results.
- **Beta:** lets you also enter hypothetical games for the other Mid-Atlantic
  contenders (Rally, AMP, Anthem, etc.), so you can model full region movement. This
  is inherently speculative — garbage in, garbage out — and is offered as an
  exploratory tool, not a forecast.

Regardless of mode, remember that regional bid **counts** depend on how every region's
top teams perform nationally (not just Mid-Atlantic), and a team's actual Nationals
berth is decided at the Regional Championship tournament itself, not by rating alone.

Not affiliated with or endorsed by USA Ultimate.
