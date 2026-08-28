#!/usr/bin/env python3
"""Verify the declared Factory Office v1 character sprite inventory."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public" / "factory-office" / "v1" / "manifest.json"


def verify_asset(
    path: Path, size: tuple[int, int], expected_bottom: int, tolerance: int = 0
) -> None:
    if not path.is_file():
        raise ValueError(f"Missing asset: {path.relative_to(ROOT)}")
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        if rgba.size != size:
            raise ValueError(f"Unexpected size for {path.relative_to(ROOT)}: {rgba.size}")
        alpha = rgba.getchannel("A")
        if alpha.getextrema() != (0, 255):
            raise ValueError(f"Invalid alpha range for {path.relative_to(ROOT)}")
        bounds = alpha.getbbox()
        if bounds is None or abs(bounds[3] - expected_bottom) > tolerance:
            raise ValueError(
                f"Unexpected baseline for {path.relative_to(ROOT)}: "
                f"{None if bounds is None else bounds[3]}"
            )


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    asset_root = MANIFEST.parent / "characters"
    master = manifest["master"]
    runtime = manifest["runtime"]
    count = 0

    for role, actions in manifest["roles"].items():
        if len(actions) != len(set(actions)):
            raise ValueError(f"Duplicate action declared for {role}")
        for action in actions:
            verify_asset(
                asset_root / role / f"{action}.{master['format']}",
                (master["width"], master["height"]),
                master["baselineY"],
                4,
            )
            verify_asset(
                asset_root / role / f"{action}.{runtime['format']}",
                (runtime["width"], runtime["height"]),
                round(master["baselineY"] * runtime["height"] / master["height"]),
                4,
            )
            count += 1

    if count != 47:
        raise ValueError(f"Expected 47 actions, found {count}")
    print(f"Verified {count} Factory Office actions ({count * 2} files)")


if __name__ == "__main__":
    main()
