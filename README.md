# Rayenz Hub

Personal multi-app hub hosted on GitHub Pages at [rayenz-akusiom.github.io/rayenz-akusiom](https://rayenz-akusiom.github.io/rayenz-akusiom/).

## Apps

- **Dailies** — Neopets dailies launcher (requires [rayenz-dailies.user.js](https://github.com/rayenz-akusiom/rayenz-hub/blob/main/monkey-scripts/rayenz-dailies.user.js) for automation)
- **Deck Suggest** — Generate rule-based suggestions or upload LLM suggestion JSON; review Accept (Swap or Seeking) / Reject / Skip; Accept saves formal swaps / Seeking to Hub; optional Archidekt full-deck import export (mirror only)
- **Order Reconcile** — Match acquired cards to Hub swap queues and Seeking; save formal swaps / Seeking to Hub after an order arrives

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

### Source B — Upload JSON (LLM file)

1. Generate suggestions with the `mtg-deck-set-updates` Cursor skill (or other offline tooling).
2. Optionally enrich with deck snapshots and profile preferences (`protected_cards`, `blocked_cards`) via `enrich_suggestions.ps1`.
3. **Upload JSON** in the Deck Suggest sidebar. Regression fixtures live in `tests/fixtures/suggestions/` at the monorepo root.

### Review and apply

4. Review every suggestion for each deck (**Accept** as **Swap** or **Seeking**, **Reject**, or **Skip**). Swap requires an Out cut; Seeking adds In only. **Accept** writes to the Hub deck (formal swaps / Seeking). The **Deck status** card shows **Decisions**, **Swap queue**, and **Export**.
5. Optional mirror: when all suggestions are reviewed, **Export** → **Copy Archidekt import** → Archidekt → **Import** → **Replace deck** → paste → Save Changes. Hub remains the system of record.
6. **Never suggest again** updates profile YAML via Hub API when signed in (desktop Chrome can still write a local profiles folder).

**Export is blocked** until every visible suggestion for the deck has a decision. The export is a **full deck replace** for the Archidekt mirror: main-deck cards keep their categories; `Queued In` / `Queued Out` are rebuilt from **accepted swaps**; **Seeking** lines are added from **accepted Seeking** decisions.

## Order Reconcile workflow

Use after cards from a buy order physically arrive. Hub is the system of record; Archidekt is copy/paste import text only.

1. Open **Order Reconcile** (`#/order-reconcile`).
2. Enter acquired cards via **Card list** (one per line; qty expands to singleton copies). **Order email** tab is experimental. Optional **Proxy order** tags Hub adds with the Proxies category.
3. Click **Continue** — loads commander and cube decks from the Hub library (skips theory). A pinned progress bar shows load status.
4. **Disambiguate** — matching copies auto-assign to Queued In swap slots, Seeking names, or cube Maybeboard. Surplus copies can optionally go to another deck or be left unassigned (they stay in Swap Queue if they were already Seeking / Queued In). Card images appear on each row; fix a bad name to update all copies of that card.
5. **Reconcile deck-by-deck** — pick In printing/treatment (Scryfall), Out cut (optional for Seeking / extras), destination category; review running summary; **Save to Hub** per deck (finalizes swaps or creates/clears Seeking).
6. Optional mirror: **Copy deck import** → Archidekt → Import → Replace deck. **Open on Archidekt** is available when the deck has an Archidekt URL.

Swap queues are read from Hub decks (`Queued In` / `Queued Out` for Commander — legacy `New Set In` / `New Set Out` still recognized on read; **Seeking** matches without a paired Out; **Maybeboard** for cube). Cube destination categories are inferred from color identity (mono colors, Ravnica guilds for two colors; three or more colors require manual category pick). Partial orders are safe: unfilled queue slots stay.

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
