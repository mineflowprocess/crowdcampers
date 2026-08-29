"""Download camper spots and admin regions per country from Overpass into data/raw/ (gitignored).

Usage: python extract.py [NL BE ...]   (default: all configured countries)
"""
import sys
import time

from common import COUNTRIES, POLITE_SLEEP, RAW, log, overpass, write_json

SPOTS_QUERY = """
[out:json][timeout:180];
area["ISO3166-1"="{cc}"][admin_level=2]->.c;
(
  nwr["tourism"="caravan_site"](area.c);
  nwr["tourism"="camp_site"]["caravans"="yes"](area.c);
  nwr["tourism"="camp_site"]["motorhome"="yes"](area.c);
);
out tags center;
"""

# First-level subdivisions (provinces, Bundeslaender, regions, ...) with full geometry,
# used by transform.py to derive `region` via point-in-polygon. Cached across runs.
REGIONS_QUERY = """
[out:json][timeout:300];
area["ISO3166-1"="{cc}"][admin_level=2]->.c;
relation["boundary"="administrative"]["admin_level"="4"](area.c);
out geom;
"""


def fetch_country(cc):
    spots = overpass(SPOTS_QUERY.format(cc=cc), label=f"{cc} spots")
    write_json(RAW / f"{cc}.json", spots)
    log(f"[{cc}] {len(spots.get('elements', []))} raw spot elements")
    time.sleep(POLITE_SLEEP)
    regions_path = RAW / f"{cc}-regions.json"
    if not regions_path.exists():
        regions = overpass(REGIONS_QUERY.format(cc=cc), label=f"{cc} regions")
        write_json(regions_path, regions)
        log(f"[{cc}] {len(regions.get('elements', []))} admin regions")
        time.sleep(POLITE_SLEEP)


def main(argv):
    failed = []
    for cc in argv or COUNTRIES:
        try:
            fetch_country(cc)
        except Exception as e:  # keep going: stale data for one country beats no run at all
            log(f"[{cc}] EXTRACT FAILED: {e}")
            failed.append(cc)
    if failed:
        log("failed countries: " + ", ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
