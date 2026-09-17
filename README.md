# Logique Loadly Terminal

A small static site that lists every Loadly distribution link in one place —
app name, icon, platform, version, install URL, QR code and version history.

The site itself is plain HTML/CSS/JS with no build step. All Loadly data is
fetched by a Node script and written to `data/apps.json`, which the page reads.
The API key lives in `.env` (and in a GitHub secret for CI) and never reaches
the browser.

## Setup

```bash
cp .env.example .env     # then paste your Loadly API key
npm run sync             # writes data/apps.json
npm run serve            # http://localhost:8080
npm test                 # checks the grouping rules
```

`npm run sync` needs Node 18+ (uses built-in `fetch`). It reads
`LOADLY_API_KEY` from `.env`, falling back to the environment.

Open the site through a local server, not `file://` — the page fetches
`data/apps.json` and browsers block that on the file protocol.

## Deploying to GitHub Pages

> **The repo must be public, or the org must be on GitHub Team or Enterprise.**
> GitHub Pages is not available for private repositories on a Free plan, and
> `Logique-ID` is currently on Free with this repo private — the deploy step
> will fail until one of those changes. Making it public also publishes
> `data/apps.json`: every app name, bundle identifier and install URL. The
> install URLs are already public on loadly.io, but the inventory of which
> clients and environments exist would not be. Decide that deliberately.

1. Push this repo to GitHub.
2. Settings → Secrets and variables → Actions → add `LOADLY_API_KEY`.
3. Settings → Pages → Source: **GitHub Actions**.

[`.github/workflows/sync.yml`](.github/workflows/sync.yml) then runs hourly (and
on demand via *Run workflow*), re-syncs `data/apps.json`, commits any change and
publishes the site. Only `index.html`, `assets/` and `data/` are published —
`scripts/` and the workflow stay out of the deployed site.

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `assets/` | The site. No dependencies, no build. |
| `data/apps.json` | Generated output — the only thing the browser loads. |
| `scripts/sync.mjs` | Calls the Loadly API and writes the JSON. |
| `scripts/loadly.config.mjs` | Endpoints, field names, enums — edit here when the API changes. |
| `scripts/grouping.test.mjs` | `npm test` — covers how apps are grouped into sections. |
| `.env.example` | Template for `.env`. |

Grouping rules live in `scripts/sync.mjs` only. The page reads the `groupKey`
and `groupLabel` that the sync writes into `data/apps.json`, so the logic is
not duplicated in the browser.

## Channels

If an app is distributed through channels, the card shows the channel links
instead of the app's direct link.

The Loadly API has no endpoint that lists channels — `buildChannelShortcut` is
only an upload parameter, and no read endpoint returns channel data. So
channels are declared by hand in `CHANNELS` at the bottom of
`scripts/loadly.config.mjs`, keyed by the app's own shortcut:

```js
export const CHANNELS = {
  'jba-bidding-dev': [
    { label: 'QA', shortcut: 'jba-bidding-qa' },
    { label: 'Client', shortcut: 'jba-bidding-client' },
  ],
};
```

Run `npm run sync` after editing. Apps with no entry keep their direct link +
QR code as before. (The QR code encodes the direct link, so it is hidden on
cards that show channels.)

## When the Loadly API changes

Almost every change is a one-file edit in `scripts/loadly.config.mjs`:

- **A field was renamed** — add the new name to the front of that field's list in
  `FIELDS`. Old names can stay as fallbacks.
- **An endpoint moved** — update `ENDPOINTS` or `BASE_URL`.
- **A new install type or platform** — add it to `INSTALL_TYPES` / `PLATFORMS`.
- **Rate limits tightened** (error 1098) — raise `REQUEST_DELAY_MS`.

`description` and `updateDescription` are deliberately not fetched: nothing on
the page renders them and they were a seventh of the published JSON.

Adding a *new* field to the cards takes two edits: map it in `FIELDS` +
`normalize()` in `scripts/sync.mjs`, then render it in `assets/app.js`.

API reference: <https://loadly.io/doc/view/api>

## Sections

Apps are grouped by bundle identifier with environment suffixes stripped, so
`id.foo`, `id.foo.dev` and `id.foo.staging` share one section.

Some apps ship with a vendor-only identifier — `id.logique.dev`,
`id.logique.live` — which strips down to just `id.logique`. That is too generic
to be a section: any later app under the same vendor would silently join it. So
keys shorter than `GROUP_MIN_SEGMENTS` fall back to grouping by cleaned app
name, and `npm run sync` prints a warning naming each identifier it did that
for. Those groups show up in `data/apps.json` with a `name:` prefixed
`groupKey`, which is also the key to use in `GROUP_LABELS`.

The real fix is on the publishing side: give the app a specific bundle
identifier in Loadly (`id.logique.jbainventory.dev`) and the warning goes away.

## Notes

- Password / invitation / question-protected apps are listed with a 🔒 badge.
  Passwords and answers are never fetched or published.
- `data/apps.json` contains only publicly shareable fields — no API key.
- An entry in `CHANNELS` whose shortcut matches no app is reported by
  `npm run sync`, so a shortcut renamed in the dashboard cannot silently drop
  its channel links.
