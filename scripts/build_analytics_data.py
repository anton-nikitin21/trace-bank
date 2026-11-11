"""Publish the canonical research and financial assumptions to the static website."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "model" / "analytics-dashboard.json"
DEST = ROOT / "website" / "analytics-data.json"
DESTINATIONS = [DEST, ROOT / "website/downloads/analytics-data.json", ROOT / "website/downloads/analytics-dashboard.json"]


def serialized_data() -> str:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check if the website data matches the canonical model")
    args = parser.parse_args()
    expected = serialized_data()
    if args.check:
        stale = [str(path.relative_to(ROOT)) for path in DESTINATIONS if not path.is_file() or path.read_text(encoding="utf-8") != expected]
        if stale:
            raise SystemExit("FAIL: analytics data is out of sync: " + ", ".join(stale) + "; run python scripts/build_analytics_data.py")
        print("PASS: website analytics data matches model/analytics-dashboard.json")
        return
    for destination in DESTINATIONS:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(expected, encoding="utf-8")
    print(f"Built {DEST.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
