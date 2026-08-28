"""Shared config and helpers for the camper-spot pipeline. Stdlib only, no dependencies."""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

USER_AGENT = "crowdcampers.com data pipeline (github.com/mineflowprocess/crowdcampers)"
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
POLITE_SLEEP = 10  # seconds between Overpass requests

COUNTRIES = ["NL", "BE", "DE", "FR", "ES", "IT", "PT", "AT", "CH", "DK", "NO", "SE", "HR", "SI"]

# Rough bounding boxes (min_lat, min_lon, max_lat, max_lon) for sanity checks.
BBOX = {
    "NL": (50.7, 3.3, 53.7, 7.3),
    "BE": (49.4, 2.5, 51.6, 6.5),
    "DE": (47.2, 5.8, 55.1, 15.1),
    "FR": (41.3, -5.2, 51.1, 9.6),
    "ES": (27.6, -18.2, 43.8, 4.4),
    "IT": (35.4, 6.6, 47.1, 18.6),
    "PT": (32.6, -31.3, 42.2, -6.2),
    "AT": (46.3, 9.5, 49.1, 17.2),
    "CH": (45.8, 5.9, 47.9, 10.5),
    "DK": (54.5, 8.0, 57.8, 15.2),
    "NO": (57.9, 4.5, 71.2, 31.2),
    "SE": (55.3, 10.9, 69.1, 24.2),
    "HR": (42.3, 13.4, 46.6, 19.5),
    "SI": (45.4, 13.3, 46.9, 16.6),
}

ATTRIBUTION = {"license": "ODbL", "attribution": "© OpenStreetMap contributors"}
SCHEMA_VERSION = 1


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def overpass(query, label=""):
    """POST a query to Overpass: 3 retries with backoff on the main endpoint, then the mirror."""
    for endpoint in ENDPOINTS:
        for attempt in range(3):
            try:
                req = urllib.request.Request(
                    endpoint,
                    data=("data=" + urllib.parse.quote(query)).encode(),
                    headers={"User-Agent": USER_AGENT},
                )
                with urllib.request.urlopen(req, timeout=300) as r:
                    return json.load(r)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                wait = 2 ** attempt * 15
                log(f"[{label}] {endpoint} attempt {attempt + 1} failed: {e}; retry in {wait}s")
                time.sleep(wait)
    raise RuntimeError(f"[{label}] all Overpass endpoints failed")


def read_json(path, default=None):
    p = Path(path)
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def write_json(path, obj):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
