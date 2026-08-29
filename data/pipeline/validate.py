"""Validate staged spots (data/raw/{cc}-spots.json) before publish. Exits 1 on any failure.

Usage: python validate.py [NL BE ...]
"""
import sys

from common import BBOX, COUNTRIES, PROCESSED, RAW, log, read_json

REQUIRED = {"id": str, "lat": float, "lon": float, "country": str, "type": str,
            "amenities": list, "osm_url": str, "last_seen": str}
MAX_DROP = 0.20  # refuse to publish a >20% drop versus the previous run
MAX_ERRORS_PER_COUNTRY = 20


def validate_country(cc):
    spots = read_json(RAW / f"{cc}-spots.json")
    if spots is None:
        return [f"{cc}: no staged file"]
    if not spots:
        return [f"{cc}: zero spots"]
    errors = []
    ids = set()
    lat0, lon0, lat1, lon1 = BBOX[cc]
    for s in spots:
        for k, t in REQUIRED.items():
            if not isinstance(s.get(k), t):
                errors.append(f"{cc}: {s.get('id')} field {k} missing or not {t.__name__}")
        if s["id"] in ids:
            errors.append(f"{cc}: duplicate id {s['id']}")
        ids.add(s["id"])
        if not (lat0 <= s["lat"] <= lat1 and lon0 <= s["lon"] <= lon1):
            errors.append(f"{cc}: {s['id']} outside country bbox ({s['lat']}, {s['lon']})")
        if len(errors) > MAX_ERRORS_PER_COUNTRY:
            errors.append(f"{cc}: more errors truncated")
            break
    prev = read_json(PROCESSED / f"spots-{cc}.json")
    if prev:
        old_ids = {p["id"] for p in prev.get("spots", [])}
        if old_ids and len(spots) < len(old_ids) * (1 - MAX_DROP):
            missing = sorted(old_ids - ids)[:3]
            errors.append(f"{cc}: suspicious drop {len(old_ids)} -> {len(spots)}; sample missing ids: {missing}")
    return errors


def main(argv):
    all_errors = []
    for cc in argv or COUNTRIES:
        errs = validate_country(cc)
        log(f"[{cc}] {'OK' if not errs else str(len(errs)) + ' error(s)'}")
        all_errors += errs
    for e in all_errors:
        print(e)
    sys.exit(1 if all_errors else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
