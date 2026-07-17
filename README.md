# Rayenz Hub

Personal multi-app hub hosted on GitHub Pages at [rayenz-akusiom.github.io/rayenz-akusiom](https://rayenz-akusiom.github.io/rayenz-akusiom/).

## Apps

- **Dailies** — Neopets dailies launcher (requires [rayenz-dailies.user.js](https://github.com/rayenz-akusiom/rayenz-hub/blob/main/monkey-scripts/rayenz-dailies.user.js) for automation)
- **Deck Review** — Review MTG set-update suggestions; export full-deck Archidekt import or apply via bridge
- **Deck Suggest** — Rule-based replacement suggestions (swap queue, proxy upgrades, role matching) without LLM; export schema 1.1 JSON for Deck Review
- **Order Reconcile** — Match acquired cards to swap queues; update decks and buy/trade list after an order arrives

## Publishing

This folder is the **built publish tree** (Vite `outDir` from `packages/web`). Production GitHub Pages live in the separate [rayenz-akusiom](https://github.com/rayenz-akusiom/rayenz-akusiom) repo.

From the monorepo root:

```bash
npm run build:web    # or: npm run publish:hub
# commit rayenz-hub/index.html, 404.html, .nojekyll, assets/
npm run deploy:hub
```

That runs `git subtree push --prefix=rayenz-hub hub-prod main`.

Userscripts live in **`monkey-scripts/` at the monorepo root** (same clone as this folder). Edit and push there for Tampermonkey changes — no Pages deploy.

```bash
git clone https://github.com/rayenz-akusiom/rayenz-hub.git
```

## Deck Review workflow

1. Generate suggestions with the `mtg-deck-set-updates` Cursor skill.
2. Enrich with deck snapshots and profile preferences (`protected_cards`, `blocked_cards`):

   ```powershell
   .\scripts\enrich_suggestions.ps1 -InputPath ~\mtg\decks\suggestions\MSH-2026-06-21.json -Output data\suggestions\latest.json
   ```

3. Commit enriched output to **production** via `npm run deploy:hub` as `data/suggestions/latest.json` (or upload JSON on the Deck Review page). The hub repo no longer ships a default `latest.json`; regression coverage lives in `tests/fixtures/suggestions/` at the monorepo root.
4. Review every suggestion for each deck (Accept / Reject / Skip). The **Deck status** card at the top shows a **Decisions** recap, live **Archidekt queue**, and **Update** actions.
5. On **desktop** with [archidekt-deck-review.user.js](https://github.com/rayenz-akusiom/rayenz-hub/blob/main/monkey-scripts/archidekt-deck-review.user.js): when all suggestions are reviewed, open the **Update** tab → **Apply via bridge** (opens Archidekt and shows an apply banner).
6. On **tablet** (no userscript): when all suggestions are reviewed, **Update** tab → **Copy full deck import** → Archidekt deck → **Import** → **Replace deck** → paste → Save Changes.
7. On **desktop Chrome**, connect your profiles folder in the right nav and use **Never suggest again** to update `~/mtg/decks/profiles/{deck_id}.yaml` directly.
8. After changing profiles on PC, re-run `enrich_suggestions` so tablet-loaded `latest.json` reflects new blocklists.

**Update is blocked** until every visible suggestion for the deck has a decision. The exported import is a **full deck replace**: main-deck cards keep their categories; `New Set In` / `New Set Out` are rebuilt from **accepted** swaps only (rejected/skipped queue slots are cleared).

## Order Reconcile workflow

Use after cards from a buy order physically arrive.

1. Open **Order Reconcile** (`#/order-reconcile`).
2. Configure **Archidekt folder URL** (default: [folder 81998](https://archidekt.com/folders/81998) — IRL Decks) and **buy/trade staging deck** (default: [deck 8667017](https://archidekt.com/decks/8667017)).
3. Enter acquired cards via **Card list** (one per line; qty expands to singleton copies). **Order email** tab is experimental.
4. Click **Continue** — requires [archidekt-deck-review.user.js](https://github.com/rayenz-akusiom/rayenz-hub/blob/main/monkey-scripts/archidekt-deck-review.user.js) **2026-06-25-2+** for folder + deck fetch. A pinned progress bar shows deck refresh status.
5. **Disambiguate** — matching copies auto-assign to swap-queue slots (or cube Maybeboard). Surplus copies can optionally go to another deck or be left out (buy/trade only). Card images appear on each row; fix a bad name to update all copies of that card.
6. **Reconcile deck-by-deck** — pick In printing/treatment (Scryfall), Out cut (deck snapshot; cube cuts are limited to the card's color section), destination category; review running summary; **Confirm & apply** per deck.
7. **Buy/trade list** — remove acquired cards from the staging deck.

Swap queues are always read live from Archidekt (`New Set In` / `New Set Out` for Commander decks; **Maybeboard** for cube decks named with "cube"). Cube destination categories are inferred from color identity (mono colors, Ravnica guilds for two colors; three or more colors require manual category pick). Partial orders are safe: unfilled queue slots stay.

## Deck Suggest workflow

Rule-based alternative to the `mtg-deck-set-updates` Cursor skill for Commander decks only.

1. Open **Deck Suggest** (`#/deck-suggest`).
2. Enter set codes (e.g. `MSH,MSC,MAR`) and **Load set pool** (Scryfall), or upload cached set JSON.
3. Load decks from your Archidekt folder (bridge required) or upload a deck JSON snapshot.
4. Connect profiles in Deck Review (optional) for role rules and blocklists.
5. Select one or more Commander decks and **Generate suggestions** (requirements checklist in the header shows what is still needed).
6. Review the results summary and rule audit; filter by tier or rule id.
7. Click **Review in Deck Review** to open Deck Review with your suggestions loaded (no download step), or **Download JSON** (`{SET}-{date}-rules.json`) to save a file. After transfer, Deck Review shows **Download JSON** in the Data panel if you want a copy.

Cube decks and Maybeboard-only swap queues are skipped with a per-deck message. No `enrich_suggestions.ps1` step is required — export attaches `deck_snapshot` and `profile_preferences` inline.

### Apply via bridge troubleshooting

Apply via bridge uses **Tampermonkey shared storage** (`GM_setValue`), not browser `localStorage`, so the Hub (GitHub Pages) and Archidekt can exchange the staged import.

- Requires [archidekt-deck-review.user.js](https://github.com/rayenz-akusiom/rayenz-hub/blob/main/monkey-scripts/archidekt-deck-review.user.js) **version 2026-06-25-2 or newer** in the same browser profile as the Hub tab.
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
