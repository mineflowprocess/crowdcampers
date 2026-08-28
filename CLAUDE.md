# CrowdCampers

AI-built and AI-maintained camper trip planner. One human reviews PRs; everything else is done by Claude Code, interactively or via scheduled GitHub Actions.

## What this project is

- **Product**: a free web app at crowdcampers.com where travelers describe a camper trip in plain language ("2 weeks through southern France in May, €30/night max, quiet nature spots, with kids") and get back a day-by-day route with real overnight spots, driving distances, and alternatives.
- **Data**: camper/caravan sites from OpenStreetMap (see `data/`). We NEVER scrape Park4Night, Campercontact, or any other proprietary source. OSM attribution ("© OpenStreetMap contributors, ODbL") must appear on every page that shows OSM-derived data.
- **Stack**: static site in `site/` (plain HTML/CSS/JS, no framework, no build step), deployed to Cloudflare Pages. The planner calls a Cloudflare Worker (`planner/`) which calls the Claude API with relevant spot data as context.
- **Positioning**: this repo is also a public showcase of an AI-operated product. Keep the git history clean and readable — it IS the marketing.

## Ground rules for every run

1. **Small, reviewable changes.** One concern per PR. Never rewrite a file wholesale when a targeted edit works.
2. **Never commit secrets.** API keys live in GitHub Actions secrets and Cloudflare env vars only.
3. **Data is regenerated, not hand-edited.** Files in `data/processed/` are pipeline output. Fix the pipeline, not the output.
4. **No new dependencies without a reason written in the PR description.** Default is zero-dependency.
5. **Dutch-first UI, English code.** Site copy in Dutch (informal "je"), code/comments/commits in English.
6. **When a scheduled run fails**, open a GitHub issue with the error and your diagnosis before attempting a fix. Fixes go through a PR, never direct to main.
7. **Legal lines that are never crossed**: no scraping of proprietary platforms, no storing of personal data beyond an email address for the waitlist, OSM attribution always present.
8. **Cost lines that are never crossed**: the planner endpoint ships only with ALL protections from the planner-api skill (Turnstile, rate limiting, input caps, caching, small model, kill switch). Bulk data never flows through a model — scripts process data, the model writes scripts. Any change that could increase per-request or per-run token cost gets called out explicitly in the PR description.

## Repository layout

```
CLAUDE.md                  ← you are here; read fully before any task
.claude/skills/            ← how-to knowledge per domain (pipeline, site, content)
.github/workflows/         ← scheduled agent runs
data/
  raw/                     ← Overpass API downloads (gitignored, regenerated)
  processed/               ← cleaned spot data as JSON, committed
  pipeline/                ← Python scripts that raw→processed (agent-maintained)
planner/                   ← Cloudflare Worker + system prompt for the trip planner
site/                      ← static site, deployed as-is
```

## Definition of done

A task is done when: the change is on a branch, tests/checks pass (`data/pipeline/validate.py` for data changes, a link check for site changes), the PR description explains what and why in 3 sentences or less, and no ground rule above is violated.

## Agent roles

This repo is operated by cooperating agent runs. Issues and PRs are the shared memory between them — agents never coordinate outside GitHub.

- **Product agent** (`product-agent.yml`): turns issues labeled `idee` into a build-ready spec, relabels to `bouwklaar` or escalates to `human`.
- **Builder** (`builder.yml`): builds `bouwklaar` specs into a single PR. Never exceeds the spec's scope.
- **Reviewer** (`reviewer.yml`): reviews every PR per the risk ladder in the reviewer skill. Class 1-3 it may merge itself; Class 4 (workflows, CLAUDE.md, skills, planner protections, spend behavior) is ALWAYS escalated to the human — an agent never approves changes to its own instructions or permissions.
- **Weekly data & maintenance runs**: as before.

**The human's role**: shares ideas and architecture preferences via issues, and decides on everything labeled `human`. That label is the only queue they are expected to watch.

