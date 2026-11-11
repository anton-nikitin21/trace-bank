"""Build the downloadable analytics evidence package from canonical project files."""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "website" / "downloads" / "trace-analytics-pack-2026-11-11.zip"
FILES = [
    "README.md",
    "merged-release-2026-11-11.md",
    "competitive-analysis.md",
    "financial-model.md",
    "market-sizing.md",
    "metrics-pilot.md",
    "source-registry.json",
    "analytics-dashboard.json",
    "analytics-data.json",
    "benchmark-summary.json",
    "benchmark-cases.json",
    "tests.txt",
    "financial-model-current-2026-11-11.xlsx",
    "product-audit-2026-11-11.md",
    "product-audit-2026-11-11.docx",
    "trace-custdev-presentation.xlsx",
    "trace-presentation-2026-11-10.pdf",
]
SOURCE_DIR = ROOT / "website" / "downloads"


def build() -> tuple[int, str]:
    missing = [name for name in FILES if not (SOURCE_DIR / name).is_file()]
    if missing:
        raise SystemExit("Missing analytics package files: " + ", ".join(missing))
    DEST.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(DEST, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in FILES:
            archive.write(SOURCE_DIR / name, arcname=f"trace-analytics/{name}")
    digest = hashlib.sha256(DEST.read_bytes()).hexdigest()
    return DEST.stat().st_size, digest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check that the package exists and contains all required files")
    args = parser.parse_args()
    if args.check:
        if not DEST.is_file():
            raise SystemExit(f"FAIL: missing {DEST.relative_to(ROOT)}; run python scripts/build_analytics_pack.py")
        with zipfile.ZipFile(DEST) as archive:
            names = {Path(name).name for name in archive.namelist()}
            missing = sorted(set(FILES) - names)
            bad = archive.testzip()
            stale = [name for name in FILES if name in names and archive.read("trace-analytics/" + name) != (SOURCE_DIR / name).read_bytes()]
        if missing or bad or stale:
            raise SystemExit(f"FAIL: invalid analytics package; missing={missing}; corrupt={bad}; stale={stale}")
        print(f"PASS: analytics package contains {len(FILES)} files ({DEST.stat().st_size:,} bytes)")
        return
    size, digest = build()
    print(f"Built {DEST.relative_to(ROOT)} ({size:,} bytes, SHA-256 {digest})")


if __name__ == "__main__":
    main()
