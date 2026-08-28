---
name: data-pipeline
description: Build and maintain the OpenStreetMap camper-spot pipeline. Use for any task touching data/, the nightly data run, Overpass queries, spot validation, or enrichment. Also use when the nightly run failed and needs diagnosis.
---

# Camper spot data pipeline

## Source

OpenStreetMap via the Overpass API (`https://overpass-api.de/api/interpreter`). Relevant tags:

- `tourism=caravan_site` — dedicated camper/caravan sites (primary)
- `tourism=camp_site` with `caravans=yes` or `motorhome=yes` — campsites that accept campers
- Useful attribute tags: `fee`, `capacity`, `drinking_water`, `power_supply`, `sanitary_dump_station`, `opening_hours`, `website`, `name`

Query one country per request, be polite: sleep 10s between requests, set a descriptive User-Agent (`crowdcampers.com data pipeline`). Start with: NL, BE, DE, FR, ES, IT, PT, AT, CH, DK, NO, SE, HR, SI.

## Pipeline stages (data/pipeline/)

1. `extract.py` — Overpass download per country → `data/raw/{country}.json` (gitignored)
2. `transform.py` — normalize to the spot schema below, drop unusable records (no coordinates, or node deleted), derive `region` from coordinates
3. `validate.py` — schema check + sanity checks (coordinates within country bbox, no duplicate OSM ids, total count within ±20% of previous run). **A failed validation aborts the publish and must open a GitHub issue.**
4. `publish.py` — write `data/processed/spots-{country}.json` + a summary `data/processed/index.json` (counts, last-updated per country)

## Spot schema (data/processed/)

```json
{
  "id": "osm-node-123456",
  "name": "Camperplaats De Weide",
  "lat": 52.1,
  "lon": 4.6,
  "country": "NL",
  "region": "Zuid-Holland",
  "type": "caravan_site",
  "fee": true,
  "amenities": ["drinking_water", "power_supply"],
  "website": "https://...",
  "osm_url": "https://www.openstreetmap.org/node/123456",
  "last_seen": "2026-08-28"
}
```

Keep the schema stable. Additive changes are fine; renames/removals need a migration note in the PR and a version bump in `index.json`.

## Self-healing rules

- Overpass timeouts/HTTP errors: retry 3x with exponential backoff, then fall back to the mirror `https://overpass.kumi.systems/api/interpreter`, then give up for that country and keep yesterday's processed file (stale is better than empty).
- If a country's spot count drops >20% versus the previous run: do NOT publish that country, open an issue titled `data: suspicious drop in {country}`, include both counts and 3 sample missing ids.
- If OSM tag conventions appear to have changed (many records failing transform): open an issue with examples before changing the transform logic.

## Attribution

Every file in `data/processed/` carries `"license": "ODbL", "attribution": "© OpenStreetMap contributors"` at the top level. The site must display this wherever spot data is shown.
