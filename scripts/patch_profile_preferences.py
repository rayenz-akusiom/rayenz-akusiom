#!/usr/bin/env python3
"""Add profile_preferences to an enriched suggestions JSON without re-fetching Archidekt."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

DEFAULT_PROFILES_DIR = Path.home() / "mtg" / "decks" / "profiles"


def parse_yaml_list(text: str, field_name: str) -> list[str]:
    items: list[str] = []
    in_section = False
    for line in text.splitlines():
        if re.match(r"^[^\s#]", line) and not line.startswith("-"):
            in_section = line.strip() == f"{field_name}:"
            continue
        if in_section:
            if re.match(r"^[^\s#-]", line):
                break
            match = re.match(r"^\s*-\s+(.+?)\s*$", line)
            if match:
                items.append(match.group(1).strip().strip("'\""))
    return items


def patch_file(path: Path, profiles_dir: Path) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    count = 0
    for deck in data.get("decks", []):
        deck_id = deck.get("deck_id")
        if not deck_id:
            continue
        profile_path = profiles_dir / f"{deck_id}.yaml"
        if not profile_path.is_file():
            continue
        text = profile_path.read_text(encoding="utf-8")
        deck["profile_preferences"] = {
            "protected_cards": parse_yaml_list(text, "protected_cards"),
            "blocked_cards": parse_yaml_list(text, "blocked_cards"),
        }
        count += 1
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Embed profile_preferences into suggestions JSON")
    parser.add_argument("input", type=Path, help="Suggestions JSON (e.g. data/suggestions/latest.json)")
    parser.add_argument("--profiles-dir", type=Path, default=DEFAULT_PROFILES_DIR)
    args = parser.parse_args()
    n = patch_file(args.input, args.profiles_dir)
    print(f"Patched {n} decks in {args.input}")


if __name__ == "__main__":
    main()
