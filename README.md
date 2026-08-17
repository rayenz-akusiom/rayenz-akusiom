# Rayenz Hub

Personal multi-app hub hosted on GitHub Pages at [rayenz-akusiom.github.io/rayenz-akusiom](https://rayenz-akusiom.github.io/rayenz-akusiom/).

## Apps

- **Dailies** — Neopets dailies launcher (requires [rayenz-dailies.user.js](https://github.com/rayenz-akusiom/rayenz-hub/blob/main/monkey-scripts/rayenz-dailies.user.js) for automation)
- **Deck Suggest** — Generate rule-based suggestions or upload LLM suggestion JSON; review Accept (Swap or Seeking) / Reject / Skip; export full-deck Archidekt import or apply via bridge
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

## Deck Suggest workflow

One app (`#/deck-suggest`; legacy `#/deck-review` redirects here) with two suggestion sources, then a shared review/apply loop.

### Source A — Generate (rules engine)

Rule-based alternative to the `mtg-deck-set-updates` Cursor skill for Commander decks only.

1. Open **Deck Suggest** (`#/deck-suggest`).
2. Pick a set release or set codes, select Hub library decks, **Generate** (API required).
3. Suggestions load into the review UI immediately (snapshots / profile prefs attached inline — no `enrich_suggestions.ps1`).

Cube decks and Maybeboard-only swap queues are skipped with a per-deck message.

### Source B — Upload / latest (LLM file)

1. Generate suggestions with the `mtg-deck-set-updates` Cursor skill.
2. Enrich with deck snapshots and profile preferences (`protected_cards`, `blocked_cards`):

   ```powershell
   .\scripts\enrich_suggestions.ps1 -InputPath ~\mtg\decks\suggestions\MSH-2026-06-21.json -Output data\suggestions\latest.json
   ```

3. Commit enriched output to **production** via `npm run deploy:hub` as `data/suggestions/latest.json`, or **Upload JSON** / **Refresh latest** in the Deck Suggest sidebar. Regression fixtures live in `tests/fixtures/suggestions/` at the monorepo root.

### Review and apply

4. Review every suggestion for each deck (**Accept** as **Swap** or **Seeking**, **Reject**, or **Skip**). Swap requires an Out cut; Seeking adds In only. The **Deck status** card shows **Decisions**, live **Archidekt queue**, and **Update**.
5. On **desktop** with [archidekt-deck-review.user.js](https://github.com/rayenz-akusiom/rayenz-hub/blob/main/monkey-scripts/archidekt-deck-review.user.js): when all suggestions are reviewed, **Update** → **Apply via bridge**.
6. On **tablet** (no userscript): **Update** → **Copy full deck import** → Archidekt → **Import** → **Replace deck** → paste → Save Changes.
7. On **desktop Chrome**, connect profiles in the right nav and use **Never suggest again** to update profile YAML.
8. After changing profiles on PC for an uploaded `latest.json`, re-run `enrich_suggestions` so tablet loads reflect new blocklists.

**Update is blocked** until every visible suggestion for the deck has a decision. The export is a **full deck replace**: main-deck cards keep their categories; `Queued In` / `Queued Out` are rebuilt from **accepted swaps**; **Seeking** lines are added from **accepted Seeking** decisions.

## Order Reconcile workflow

Use after cards from a buy order physically arrive.

1. Open **Order Reconcile** (`#/order-reconcile`).
2. Configure **Archidekt folder URL** (default: [folder 81998](https://archidekt.com/folders/81998) — IRL Decks) and **buy/trade staging deck** (default: [deck 8667017](https://archidekt.com/decks/8667017)).
3. Enter acquired cards via **Card list** (one per line; qty expands to singleton copies). **Order email** tab is experimental.
4. Click **Continue** — requires [archidekt-deck-review.user.js](https://github.com/rayenz-akusiom/rayenz-hub/blob/main/monkey-scripts/archidekt-deck-review.user.js) **2026-06-25-2+** for folder + deck fetch. A pinned progress bar shows deck refresh status.
5. **Disambiguate** — matching copies auto-assign to swap-queue slots (or cube Maybeboard). Surplus copies can optionally go to another deck or be left out (buy/trade only). Card images appear on each row; fix a bad name to update all copies of that card.
6. **Reconcile deck-by-deck** — pick In printing/treatment (Scryfall), Out cut (deck snapshot; cube cuts are limited to the card's color section), destination category; review running summary; **Confirm & apply** per deck.
7. **Buy/trade list** — remove acquired cards from the staging deck.

Swap queues are always read live from Archidekt (`Queued In` / `Queued Out` for Commander decks — legacy `New Set In` / `New Set Out` still recognized on read; **Maybeboard** for cube decks named with "cube"). Cube destination categories are inferred from color identity (mono colors, Ravnica guilds for two colors; three or more colors require manual category pick). Partial orders are safe: unfilled queue slots stay.

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
