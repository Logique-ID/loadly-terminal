# Code index

Where things live. Search by function name; line numbers drift.

## Data flow

```
Loadly API ──(scripts/sync.mjs, API key)──> data/apps.json       (committed)
                                       └──> data/downloads.json  (gitignored, deployed)
data/*.json ──(fetch)──> assets/app.js ──> index.html

Click "Download APK" with DOWNLOAD_BASE set:
browser ──> worker/index.js ──(checks published apps.json)──> Loadly /app/install ──302──> signed APK URL
```

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page shell: search box, platform filters, `#list`, footer. Loads `assets/app.js`. |
| `assets/app.js` | All browser logic. One IIFE, no dependencies. |
| `assets/style.css` | All styles. |
| `data/apps.json` | `{ generatedAt, apps: [...] }`. Generated, committed. |
| `data/downloads.json` | `{ generatedAt, downloads: { [buildKey]: { url, expiresAt } } }`. Generated, gitignored. |
| `scripts/sync.mjs` | Loadly API client, normalization, grouping, sorting, signed-link resolution. |
| `scripts/loadly.config.mjs` | Every API constant and hand-maintained table. Edit here first when the API changes. |
| `scripts/grouping.test.mjs` | Tests for section grouping and labels. |
| `scripts/downloads.test.mjs` | Tests for `parseSignedUrl`. |
| `worker/index.js` | Cloudflare Worker: `GET /<buildKey>` → 302 to a fresh signed APK URL. |
| `worker/wrangler.toml` | Worker config. `APPS_URL` points at the published `data/apps.json`. |
| `.github/workflows/sync.yml` | Test, sync, commit and Pages deploy. Every 30 min, on push to `main`, manual. |
| `.env.example` | Template for `.env` (`LOADLY_API_KEY`). |

## scripts/loadly.config.mjs

| Export | Purpose |
| --- | --- |
| `BASE_URL`, `ENDPOINTS` | API root and paths (`listMy`, `view`, `builds`, install). |
| `IOS_MANIFEST_BASE`, `SHORTCUT_BASE`, `ICON_BASE` | URL bases for plist, install page and icon links. |
| `FIELDS` | Field name lists per normalized field. First match wins, so put new API names first and keep old ones as fallbacks. |
| `PLATFORMS`, `INSTALL_TYPES` | API enum values mapped to display values. |
| `REQUEST_DELAY_MS`, `MAX_RETRIES`, `MAX_PAGES`, `DEDUPE_PAGES` | Rate limit and pagination guards. Raise the delay on error 1098. |
| `CHANNELS` | Hand-written channel links keyed by the app's own shortcut. The API has no channel read endpoint. |
| `ENV_SUFFIXES` | Environment markers stripped from identifiers and names (`dev`, `staging`, `qa`, ...). |
| `GROUP_MIN_SEGMENTS` | Minimum identifier segments for an identifier-based group; shorter ones group by name. |
| `GROUP_LABELS` | Section title overrides keyed by `groupKey`. |

## scripts/sync.mjs

| Function | Purpose |
| --- | --- |
| `loadApiKey` | Reads `LOADLY_API_KEY` from `.env`, then the environment. |
| `call` | One API request with retry and delay. |
| `fetchAllPages` | Pages through a list endpoint up to `MAX_PAGES`. |
| `normalize` | Raw API object → the app shape written to `apps.json`. |
| `resolveDownload` | Android: calls `/app/install`, keeps the 302 target. iOS: `itms-services://` plist link (untested). Skips protected apps. |
| `parseSignedUrl` | Validates an https URL and reads its `Expires` param into `expiresAt`. Exported. |
| `groupKeyFor` | Identifier with env suffixes stripped (dotted or glued). Exported. |
| `cleanName` | App name with `[DEV]`, `(staging)` and trailing env words removed. Exported. |
| `groupKeyOf` | Picks identifier key or `name:` key based on `GROUP_MIN_SEGMENTS`. Exported. |
| `assignGroups` | Writes `groupKey` / `groupLabel` onto each app; warns on generic identifiers. Exported. |
| `compareApps` | Sort by group label, then identifier segments, platform, name. The page keeps this order. Exported. |
| `main` | Lists apps, fetches detail and builds per app, checks `CHANNELS`, groups, sorts, writes both JSON files. |

## assets/app.js

Constants at the top: `DATA_URL`, `DOWNLOADS_URL`, `DOWNLOAD_BASE` (worker URL,
empty = use `downloads.json`), `SESSION_KEY`.

| Function | Purpose |
| --- | --- |
| `readSession`, `writeSession`, `restoreSession` | Remember search and platform filter in `localStorage`. |
| `groupKeyOf`, `groupLabelOf` | Read the sync's grouping fields, with a fallback for old JSON. |
| `copyButton` | Copy-link button. |
| `downloadButton` | Worker link, signed link, or "Open install page" once the signed link expires. `null` for protected apps. |
| `qrToggle` | QR code toggle. Hidden on cards that show channels. |
| `buildHistory` | Version history list from `app.builds`. |
| `buildCard` | One app card. |
| `render` | Filters by search and platform, groups into sections, draws the list. |
| `syncUrl` | Writes search (`q`) and `platform` into the URL so a filtered view can be shared. |
| `buildFilters` | Platform filter buttons. |
| `loadDownloads`, `load` | Fetch the two JSON files and render. |

## worker/index.js

| Name | Purpose |
| --- | --- |
| `fetch` handler | Validates the buildKey, checks it against `APPS_URL`, serves from edge cache or resolves. Falls back to `installUrl` when Loadly fails. |
| `findApp` | Finds the buildKey among latest public Android builds in the published JSON (cached `APPS_CACHE_S`). |
| `resolve` | Calls Loadly `/app/install` with the secret key. |
| `redirect`, `notFound` | Response helpers. |
| `EXPIRY_MARGIN_S` | Cached links are dropped this many seconds before they expire. |

## Common tasks

| Task | Touch |
| --- | --- |
| API renamed a field | `FIELDS` in `loadly.config.mjs` |
| New field on the card | `FIELDS` + `normalize()` in `sync.mjs`, render in `buildCard` in `app.js` |
| Wrong section title | `GROUP_LABELS` (key = `groupKey` from `data/apps.json`) |
| Two apps should or shouldn't share a section | `ENV_SUFFIXES` / `GROUP_MIN_SEGMENTS`, plus a test in `grouping.test.mjs` |
| Add channel links to an app | `CHANNELS`, then `npm run sync` |
| Change sort order | `compareApps` in `sync.mjs`, then `npm run sync` |
| Download button behavior | `downloadButton` in `app.js`; worker access rules in `findApp` |
