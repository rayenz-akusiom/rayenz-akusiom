# Rayenz Hub

Personal multi-app hub hosted on GitHub Pages at [rayenz-akusiom.github.io/rayenz-akusiom](https://rayenz-akusiom.github.io/rayenz-akusiom/).

## Apps

- **Dailies** — Neopets dailies launcher (requires [rayenz-dailies.user.js](https://github.com/rayenz-akusiom/neopets/blob/main/monkey-scripts/rayenz-dailies.user.js) for automation)
- **Deck Review** — Review MTG set-update suggestions; export full-deck Archidekt import or apply via bridge

## Publishing

This repo (`rayenz-akusiom/rayenz-akusiom`) is the **GitHub Pages** source. Push to `main` to deploy the hub.

```bash
cd rayenz-akusiom   # this repo
git add -A && git commit -m "..." && git push origin main
```

Userscripts live in the separate [neopets](https://github.com/rayenz-akusiom/neopets) repo under `monkey-scripts/`. Edit and push there for Tampermonkey changes — no Pages deploy.

If you use the neopets monorepo with this folder as a submodule, bump the submodule pointer after hub pushes:

```bash
cd ..
git add rayenz-akusiom && git commit -m "Bump rayenz-akusiom submodule"
```

Clone the monorepo with submodules: `git clone --recurse-submodules https://github.com/rayenz-akusiom/neopets.git`

## Deck Review workflow

1. Generate suggestions with the `mtg-deck-set-updates` Cursor skill.
2. Enrich with deck snapshots and profile preferences (`protected_cards`, `blocked_cards`):

   ```powershell
   .\scripts\enrich_suggestions.ps1 -InputPath ~\mtg\decks\suggestions\MSH-2026-06-21.json -Output data\suggestions\latest.json
   ```

3. Commit and push `data/suggestions/latest.json` to **this repo** (or upload JSON on the Deck Review page).
4. Review every suggestion for each deck (Accept / Reject / Skip). The **Deck status** card at the top shows a **Decisions** recap, live **Archidekt queue**, and **Update** actions.
5. On **desktop** with [archidekt-deck-review.user.js](https://github.com/rayenz-akusiom/neopets/blob/main/monkey-scripts/archidekt-deck-review.user.js): when all suggestions are reviewed, open the **Update** tab → **Apply via bridge** (opens Archidekt and shows an apply banner).
6. On **tablet** (no userscript): when all suggestions are reviewed, **Update** tab → **Copy full deck import** → Archidekt deck → **Import** → **Replace deck** → paste → Save Changes.
7. On **desktop Chrome**, connect your profiles folder in the right nav and use **Never suggest again** to update `~/mtg/decks/profiles/{deck_id}.yaml` directly.
8. After changing profiles on PC, re-run `enrich_suggestions` so tablet-loaded `latest.json` reflects new blocklists.

**Update is blocked** until every visible suggestion for the deck has a decision. The exported import is a **full deck replace**: main-deck cards keep their categories; `New Set In` / `New Set Out` are rebuilt from **accepted** swaps only (rejected/skipped queue slots are cleared).

### Apply via bridge troubleshooting

Apply via bridge uses **Tampermonkey shared storage** (`GM_setValue`), not browser `localStorage`, so the Hub (GitHub Pages) and Archidekt can exchange the staged import.

- Requires [archidekt-deck-review.user.js](https://github.com/rayenz-akusiom/neopets/blob/main/monkey-scripts/archidekt-deck-review.user.js) **version 2026-06-21.4 or newer** in the same browser profile as the Hub tab.
- Tampermonkey must be enabled on both `rayenz-akusiom.github.io` and `archidekt.com`.
- After **Apply via bridge**, the Archidekt deck tab should show a **Pending update from Rayenz Hub** banner — click **Apply import** there.
- If only a blank deck page opens: reload the Archidekt tab, or re-click Apply via bridge (adds a cache-buster to force a fresh load).
- On tablet without Tampermonkey, use **Copy full deck import** instead.

### Never suggest again (fallback CLI)

If File System Access API is unavailable (non-Chromium browser), append preferences manually:

```bash
python scripts/apply_never_again.py --deck god-bane --block "Door of Destinies"
python scripts/apply_never_again.py --deck god-bane --protect "Taurean Mauler"
```

- **In** side → `blocked_cards` (never suggest as add/replace-in)
- **Out** side → `protected_cards` (never suggest as cut/replace-out)

## Local dev

Serve this folder over HTTP (not `file://`). The dailies userscript matches `localhost` and GitHub Pages.
