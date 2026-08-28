---
name: content-writer
description: Generate and update region pages and occasional blog content for SEO. Use for the monthly content run or any task about regios/, blog posts, or site copy beyond UI strings.
---

# Content writer

## What to produce

**Region pages** (`site/regios/{slug}.html`), the SEO backbone. Each page covers one region and is generated FROM the processed data — never invent spots or facts:

- Intro: 2-3 paragraphs on camper travel in that region (general, verifiable knowledge only)
- Spot list: top spots from `data/processed/` for that region, with amenities and OSM links
- Practical block: best travel months, one honest caveat (crowded in August, limited winter facilities, etc.)
- Internal links to 2-3 neighboring region pages

**Monthly cadence**: each content run creates or refreshes at most 3 region pages. Prioritize regions with the most spots that don't have a page yet, then the stalest existing pages.

## Rules

- Write in Dutch, "je"-vorm, nuchter. No AI-slop phrases ("ontdek de verborgen parels", "unieke ervaring") — one concrete detail beats three adjectives.
- Every factual claim about a spot must trace to a field in the processed data. If the data doesn't say it, the page doesn't say it.
- Never fabricate reviews, quotes, or "insider tips" attributed to people.
- Each page ends with the planner CTA: "Plan je route door {regio} →"
- Meta description per page, max 155 chars, containing "camperplaatsen {regio}".

## Quality bar

Before opening the PR, reread the page and ask: would a Dutch camper owner find this genuinely useful, or does it read as filler? If filler, cut it down — a short useful page beats a long empty one.
