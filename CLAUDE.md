# CLAUDE.md

Static page listing every Loadly app distribution link. A Node script pulls the
Loadly API into `data/apps.json`; plain HTML/CSS/JS renders it. No build step,
no npm dependencies. A Cloudflare Worker in `worker/` optionally serves fresh
signed APK links.

File and function map: [docs/INDEX.md](docs/INDEX.md). User-facing setup and
the reasoning behind most rules below: [README.md](README.md).

## Response style

Default to caveman ultra in every reply (invoke `Skill(caveman)` with
`ultra`). Drop articles, filler and hedging; fragments are fine; abbreviate
prose words (DB, auth, config, fn); use arrows for causality (X → Y). Never
abbreviate code, function names, API names, paths or error strings. Use normal
prose for security warnings, confirmations of irreversible actions, and
multi-step instructions where order matters. Commit messages, PR text, code
comments and docs stay in normal prose. Turn it off when the user says "stop
caveman" or "normal mode".

## Commands

```bash
npm test          # node --test scripts/**/*.test.mjs, no network
npm run sync      # needs LOADLY_API_KEY in .env, hits the live Loadly API
npm run serve     # python3 http.server on :8080 (file:// can't fetch the JSON)
```

Node 18+ (CI uses 22). Nothing to install.

## Rules

- **The API key never reaches the browser.** Only `scripts/sync.mjs` and
  `worker/index.js` read `LOADLY_API_KEY`. Never add it to `assets/`,
  `data/`, or anything the workflow copies into `_site/`.
- **Never fetch or publish passwords, invitation data or question answers.**
  Protected apps (`isProtected`) get a lock badge. Only apps with
  `downloadable: true` get a download button: public apps, plus
  password-protected Android apps (`siteDownload` in `INSTALL_TYPES`).
  Invitation and question apps stay locked. The worker enforces the same
  check against the published `data/apps.json`.
- **Build passwords live only in worker secrets:** `BUILD_PASSWORD` (shared
  by every app) and `BUILD_PASSWORDS` (JSON, appKey → password, wins over the
  shared one). The API key does not skip a password; `/app/install` returns
  code 1050 without it. Never put passwords in `.env`, `data/`, `assets/` or
  the repo. A password app with no password falls back to its loadly.io
  install page.
- **Grouping logic lives only in `scripts/sync.mjs`.** The page reads
  `groupKey` / `groupLabel` from the JSON. Don't reimplement it in
  `assets/app.js`. Sorting is the same: `compareApps` orders `apps.json` and
  the page keeps that order. (The `compareApps` doc comment says app.js has a
  mirror; it no longer does.)
- **API shape changes go in `scripts/loadly.config.mjs`** (`FIELDS`,
  `ENDPOINTS`, `PLATFORMS`, `INSTALL_TYPES`, `REQUEST_DELAY_MS`). Adding a new
  card field = map it in `FIELDS` + `normalize()`, then render it in
  `assets/app.js`.
- **Keep `data/apps.json` small and public-safe.** `description` and
  `updateDescription` are skipped on purpose. Add only fields the page renders.
- `data/apps.json` is committed (CI commits it as `chore: sync Loadly links`).
  `data/downloads.json` is gitignored but deployed. Don't hand-edit either;
  rerun the sync.
- `sync.mjs` only runs `main()` when executed directly, so tests can import
  its helpers. Export any new pure helper you want to test from the
  `export { ... }` line near the bottom.
- Browser code is one IIFE in `assets/app.js`, `'use strict'`, no modules, no
  libraries. Wrap every `localStorage` access in try/catch, as the existing
  code does.

## Testing

Tests cover the pure functions only: grouping (`scripts/grouping.test.mjs`) and
signed-URL parsing (`scripts/downloads.test.mjs`). When you change
`groupKeyFor`, `cleanName`, `assignGroups`, `compareApps` or `parseSignedUrl`,
add a case. UI changes have no tests; check them with `npm run serve` against a
real `data/apps.json`.

## Deploy

`.github/workflows/sync.yml` runs every 30 min, on push to `main`, and on
demand: `npm test` → `npm run sync` → commit `data/apps.json` (3 push retries
with rebase) → publish `index.html`, `assets/`, `data/`, `.nojekyll` to GitHub
Pages. A failing test blocks the deploy.

Worker: `cd worker && npx wrangler secret put LOADLY_API_KEY && npx wrangler deploy`,
then set `DOWNLOAD_BASE` in `assets/app.js`. It points at
`https://loadly-download.yama-lgq.workers.dev`. If `DOWNLOAD_BASE` is empty the
page falls back to `data/downloads.json`, whose links expire about an hour
after each sync.

## Keep docs current

When you add, rename or remove a file or exported function, update
`docs/INDEX.md`. When a rule above changes, update this file and the matching
README section.
