"""Copy validated staged spots into data/processed/ and refresh index.json.

Usage: python publish.py [NL BE ...]   (run validate.py first; this script does not re-check)
"""
import datetime as dt
import sys

from common import ATTRIBUTION, COUNTRIES, PROCESSED, RAW, SCHEMA_VERSION, log, read_json, write_json


def main(argv):
    index = read_json(PROCESSED / "index.json", {"countries": {}})
    index.update(ATTRIBUTION)
    index["schema_version"] = SCHEMA_VERSION
    today = dt.date.today().isoformat()
    for cc in argv or COUNTRIES:
        spots = read_json(RAW / f"{cc}-spots.json")
        if not spots:
            log(f"[{cc}] nothing staged, keeping previous processed file")
            continue
        write_json(PROCESSED / f"spots-{cc}.json", {
            **ATTRIBUTION, "schema_version": SCHEMA_VERSION, "country": cc,
            "updated": today, "count": len(spots), "spots": spots,
        })
        regions = {}
        for s in spots:
            key = s["region"] or "?"
            regions[key] = regions.get(key, 0) + 1
        index["countries"][cc] = {"count": len(spots), "updated": today, "regions": dict(sorted(regions.items()))}
        log(f"[{cc}] published {len(spots)} spots")
    index["countries"] = dict(sorted(index["countries"].items()))
    write_json(PROCESSED / "index.json", index)


if __name__ == "__main__":
    main(sys.argv[1:])
