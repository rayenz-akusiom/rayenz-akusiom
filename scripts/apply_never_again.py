#!/usr/bin/env python3
"""Append blocked_cards or protected_cards to a deck profile YAML."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

DEFAULT_PROFILES_DIR = Path.home() / "mtg" / "decks" / "profiles"
LIST_FIELDS = {"block": "blocked_cards", "protect": "protected_cards"}


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


def append_to_yaml_list(text: str, field_name: str, card_name: str) -> tuple[str, bool]:
    items = parse_yaml_list(text, field_name)
    if card_name in items:
        return text if text.endswith("\n") else text + "\n", False

    lines = text.splitlines()
    section_index = -1
    insert_at = -1

    for i, line in enumerate(lines):
        if line.strip() == f"{field_name}:":
            section_index = i
            insert_at = i + 1
            for j in range(i + 1, len(lines)):
                if re.match(r"^\s*-\s+", lines[j]):
                    insert_at = j + 1
                elif re.match(r"^[^\s#-]", lines[j]):
                    break
            break

    entry = f"  - {card_name}"
    if section_index >= 0:
        lines.insert(insert_at, entry)
    else:
        anchor = -1
        for anchor_name in ("archidekt_swaps:", "constraints:", "roles:", "notes:"):
            for k, line in enumerate(lines):
                if line.strip() == anchor_name:
                    anchor = k
                    break
            if anchor >= 0:
                break
        block = [field_name + ":", entry]
        if anchor >= 0:
            lines[anchor:anchor] = ["", block[0], block[1]]
        else:
            if lines and lines[-1] != "":
                lines.append("")
            lines.extend(block)

    out = "\n".join(lines)
    if not out.endswith("\n"):
        out += "\n"
    return out, True


def main() -> None:
    parser = argparse.ArgumentParser(description="Append never-again preferences to a deck profile")
    parser.add_argument("--deck", required=True, help="Deck profile id (filename without .yaml)")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--block", metavar="CARD", help="Add to blocked_cards (never suggest as add)")
    group.add_argument("--protect", metavar="CARD", help="Add to protected_cards (never suggest as cut)")
    parser.add_argument(
        "--profiles-dir",
        type=Path,
        default=DEFAULT_PROFILES_DIR,
        help="Profiles directory (default: ~/mtg/decks/profiles)",
    )
    args = parser.parse_args()

    field = LIST_FIELDS["block" if args.block else "protect"]
    card_name = args.block or args.protect
    path = args.profiles_dir / f"{args.deck}.yaml"
    if not path.is_file():
        raise SystemExit(f"Profile not found: {path}")

    text = path.read_text(encoding="utf-8")
    updated, changed = append_to_yaml_list(text, field, card_name)
    path.write_text(updated, encoding="utf-8")
    if changed:
        print(f"Added {card_name!r} to {field} in {path}")
    else:
        print(f"{card_name!r} already in {field} ({path})")


if __name__ == "__main__":
    main()
