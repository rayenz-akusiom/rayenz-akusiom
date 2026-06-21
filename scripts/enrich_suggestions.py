#!/usr/bin/env python3
"""Attach deck_snapshot from Archidekt API to suggestions JSON for Rayenz Hub Deck Review."""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ARCHIDEKT_API = "https://archidekt.com/api"
USER_AGENT = "rayenz-hub-enrich/1.0"
REQUEST_DELAY = 0.15

EXCLUDE_PRIMARY = {"Commander", "Lieutenant", "Lieutenants"}


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def parse_deck_id(url: str) -> int:
    match = re.search(r"archidekt\.com/decks/(\d+)", url)
    if not match:
        raise ValueError(f"Invalid Archidekt deck URL: {url}")
    return int(match.group(1))


def edition_set_code(entry: dict) -> str | None:
    edition = entry.get("card", {}).get("edition") or {}
    code = edition.get("editioncode") or edition.get("editionCode")
    return code.lower() if code else None


def collector_number(entry: dict) -> str | None:
    cn = entry.get("card", {}).get("collectorNumber")
    if cn is None or cn == "":
        return None
    return str(cn)


def build_snapshot(deck: dict) -> dict:
    cards = []
    for entry in deck.get("cards", []):
        if entry.get("deletedAt"):
            continue
        cats = entry.get("categories") or []
        primary = cats[0] if cats else None
        oracle = entry.get("card", {}).get("oracleCard", {})
        name = oracle.get("name")
        if not name:
            continue
        cards.append(
            {
                "name": name,
                "quantity": entry.get("quantity", 1) or 1,
                "set_code": edition_set_code(entry),
                "collector_number": collector_number(entry),
                "primary_category": primary,
                "categories": cats,
                "archidekt_uid": entry.get("uid"),
            }
        )
    return {"fetched_at": date.today().isoformat(), "cards": cards}


EXCLUDE_PRIMARY = {"Commander", "Lieutenant", "Lieutenants"}
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
                name = match.group(1).strip().strip("'\"")
                items.append(name)
    return items


def load_profile_preferences(deck_id: str, profiles_dir: Path) -> dict | None:
    path = profiles_dir / f"{deck_id}.yaml"
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8")
    return {
        "protected_cards": parse_yaml_list(text, "protected_cards"),
        "blocked_cards": parse_yaml_list(text, "blocked_cards"),
    }


def enrich_deck(deck_entry: dict, profiles_dir: Path) -> None:
    deck_id = parse_deck_id(deck_entry.get("archidekt_url", ""))
    time.sleep(REQUEST_DELAY)
    raw = fetch_json(f"{ARCHIDEKT_API}/decks/{deck_id}/")
    deck_entry["deck_snapshot"] = build_snapshot(raw)
    prefs = load_profile_preferences(deck_entry.get("deck_id", ""), profiles_dir)
    if prefs is not None:
        deck_entry["profile_preferences"] = prefs


def enrich_file(path: Path, output: Path | None, in_place: bool, profiles_dir: Path) -> Path:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data.get("decks"), list):
        raise ValueError("Expected top-level decks[] array")

    for deck in data["decks"]:
        print(f"Fetching {deck.get('deck_name', deck.get('deck_id'))}...")
        enrich_deck(deck, profiles_dir)

    out = output or (path if in_place else path.with_name(path.stem + "-enriched.json"))
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich suggestions JSON with Archidekt deck snapshots")
    parser.add_argument("input", type=Path, help="Suggestions JSON file")
    parser.add_argument("-o", "--output", type=Path, help="Output path")
    parser.add_argument("--in-place", action="store_true", help="Overwrite input file")
    parser.add_argument(
        "--profiles-dir",
        type=Path,
        default=DEFAULT_PROFILES_DIR,
        help="Directory containing deck profile YAML files",
    )
    args = parser.parse_args()

    out = enrich_file(args.input, args.output, args.in_place, args.profiles_dir)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
