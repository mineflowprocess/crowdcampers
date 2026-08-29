"""Normalize raw Overpass output into the spot schema, staged as data/raw/{cc}-spots.json.

Usage: python transform.py [NL BE ...]
"""
import datetime as dt
import sys

from common import BBOX, COUNTRIES, RAW, log, read_json, write_json

AMENITY_TAGS = ["drinking_water", "power_supply", "sanitary_dump_station", "toilets", "shower", "wifi"]
NO_VALUES = ("no", "false", "none", "0")


def parse_fee(tags):
    v = tags.get("fee")
    if v is None:
        return None
    return v.strip().lower() not in NO_VALUES


def rings_from_relation(rel):
    """Outer rings of a multipolygon relation as lists of (lon, lat), joining way fragments."""
    frags = [[(p["lon"], p["lat"]) for p in m["geometry"]]
             for m in rel.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
    rings = []
    while frags:
        ring = frags.pop(0)
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for i, f in enumerate(frags):
                if f[0] == ring[-1]:
                    ring = ring + f[1:]
                elif f[-1] == ring[-1]:
                    ring = ring + f[-2::-1]
                elif f[-1] == ring[0]:
                    ring = f[:-1] + ring
                elif f[0] == ring[0]:
                    ring = f[::-1][:-1] + ring
                else:
                    continue
                frags.pop(i)
                changed = True
                break
        rings.append(ring)
    return rings


def point_in_ring(lon, lat, ring):
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > lat) != (y2 > lat):
            x = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if x > lon:
                inside = not inside
    return inside


def load_regions(cc):
    data = read_json(RAW / f"{cc}-regions.json", {"elements": []})
    regions = []
    for rel in data["elements"]:
        name = rel.get("tags", {}).get("name")
        if name:
            regions.append((name, rings_from_relation(rel), rel.get("bounds")))
    return regions


def region_for(lon, lat, regions):
    for name, rings, b in regions:
        if b and not (b["minlat"] <= lat <= b["maxlat"] and b["minlon"] <= lon <= b["maxlon"]):
            continue
        if any(point_in_ring(lon, lat, r) for r in rings):
            return name
    return None


def transform_element(el, cc, regions, today):
    tags = el.get("tags", {})
    if el["type"] == "node":
        lat, lon = el.get("lat"), el.get("lon")
    else:
        c = el.get("center") or {}
        lat, lon = c.get("lat"), c.get("lon")
    lat0, lon0, lat1, lon1 = BBOX[cc]
    if lat is None or lon is None or not (lat0 <= lat <= lat1 and lon0 <= lon <= lon1):
        return None  # no coordinates, or overseas territory (e.g. Aruba under NL)
    osm_type, osm_id = el["type"], el["id"]
    return {
        "id": f"osm-{osm_type}-{osm_id}",
        "name": tags.get("name") or tags.get("name:nl") or tags.get("name:en"),
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "country": cc,
        "region": region_for(lon, lat, regions),
        "type": "caravan_site" if tags.get("tourism") == "caravan_site" else "camp_site",
        "fee": parse_fee(tags),
        "amenities": [t for t in AMENITY_TAGS if tags.get(t, "no").strip().lower() not in NO_VALUES],
        "website": tags.get("website") or tags.get("contact:website"),
        "opening_hours": tags.get("opening_hours"),
        "capacity": tags.get("capacity"),
        "osm_url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
        "last_seen": today,
    }


def transform_country(cc):
    raw = read_json(RAW / f"{cc}.json")
    if raw is None:
        log(f"[{cc}] no raw file, skipping")
        return
    regions = load_regions(cc)
    today = dt.date.today().isoformat()
    spots, dropped = [], 0
    for el in raw.get("elements", []):
        s = transform_element(el, cc, regions, today)
        if s is None:
            dropped += 1
        else:
            spots.append(s)
    spots.sort(key=lambda s: s["id"])
    write_json(RAW / f"{cc}-spots.json", spots)
    no_region = sum(1 for s in spots if not s["region"])
    log(f"[{cc}] {len(spots)} spots ({dropped} dropped, {no_region} without region)")


def main(argv):
    for cc in argv or COUNTRIES:
        transform_country(cc)


if __name__ == "__main__":
    main(sys.argv[1:])
