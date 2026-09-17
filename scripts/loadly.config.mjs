/**
 * Single place to adapt when the Loadly API changes.
 * Docs: https://loadly.io/doc/view/api
 *
 * If Loadly renames a field, add the new name to the FRONT of the candidate
 * list in FIELDS — nothing else in the codebase needs to change.
 */

export const BASE_URL = 'https://api.loadly.io/apiv2';

export const ENDPOINTS = {
  listMy: '/app/listMy',   // POST: _api_key, page
  view: '/app/view',       // POST: _api_key, appKey, [buildKey]
  builds: '/app/builds',   // POST: _api_key, appKey|buildKey, page
};

/**
 * Public install page for a shortcut URL.
 * The API docs still show i.loadly.io, but that host now 404s — loadly.io/<shortcut> is live.
 */
export const SHORTCUT_BASE = 'https://loadly.io';

/**
 * Fallback for endpoints that return a bare icon hash instead of a full URL.
 * Every row currently comes back with an absolute URL, so this path is unused
 * and therefore unverified — check it against the docs if icons ever break.
 */
export const ICON_BASE = 'https://loadly.io/app/icon';

/** Candidate source keys per output field, first match wins. */
export const FIELDS = {
  appKey: ['appKey'],
  buildKey: ['buildKey'],
  name: ['buildName'],
  icon: ['iconUrl', 'buildIcon'],
  platform: ['buildType'],
  version: ['buildVersion'],
  versionNo: ['buildVersionNo'],
  buildVersion: ['buildBuildVersion'],
  identifier: ['buildIdentifier'],
  fileSize: ['buildFileSize'],
  shortcutUrl: ['buildShortcutUrl', 'appShortcutUrl'],
  qrCodeUrl: ['buildQRCodeURL', 'buildQRCodeUrl'],
  installType: ['buildInstallType', 'appInstallType'],
  created: ['buildCreated'],
  updated: ['buildUpdated'],
};

/** buildType -> platform label. */
export const PLATFORMS = {
  1: 'iOS',
  2: 'Android',
};

/** buildInstallType -> how the install page is protected. */
export const INSTALL_TYPES = {
  1: { label: 'Public', protected: false },
  2: { label: 'Password', protected: true },
  3: { label: 'Invitation', protected: true },
  4: { label: 'Question', protected: true },
};

/** Milliseconds between API calls, to stay under the hourly rate limit (1098). */
export const REQUEST_DELAY_MS = 250;

/** Attempts per request, for transient network failures. */
export const MAX_RETRIES = 3;

/** Safety stop for paginated endpoints. */
export const MAX_PAGES = 50;

/**
 * Pagination stops on the first page that is empty, short, or made entirely of
 * rows already seen — so a backend that ignores `page` can never spin up to
 * MAX_PAGES or duplicate rows into the output.
 */
export const DEDUPE_PAGES = true;

/**
 * Distribution channels, keyed by the app's own shortcut URL.
 *
 * The Loadly API has no endpoint that lists channels — `buildChannelShortcut`
 * exists only as an upload parameter, and none of the read endpoints
 * (/app/view, /app/listMy, /app/builds, /app/getByShortcut) return channel
 * data. So channels are declared here by hand, from the Loadly web UI.
 *
 * When an app has channels, the site shows those links instead of the app's
 * direct link. Add one entry per app:
 *
 *   'jba-bidding-dev': [
 *     { label: 'QA', shortcut: 'jba-bidding-qa' },
 *     { label: 'Client', shortcut: 'jba-bidding-client' },
 *   ],
 */
export const CHANNELS = {};

/**
 * Environment suffixes that mark a variant of the same product. Stripped from
 * a bundle identifier — both as a whole dot segment (id.foo.dev) and as a glued
 * tail on the last segment (com.foo.barstaging) — to derive its group key.
 */
export const ENV_SUFFIXES = [
  'development',
  'production',
  'staging',
  'stage',
  'preprod',
  'prod',
  'beta',
  'demo',
  'live',
  'test',
  'dev',
  'stg',
  'uat',
  'qa',
];

/**
 * Shortest bundle identifier (in dot-separated segments) that is specific
 * enough to identify a product. Some apps ship with a vendor-only identifier
 * such as `id.logique.dev` / `id.logique.live`; stripping the environment
 * suffix leaves `id.logique`, which any future app under the same vendor would
 * collide with. Keys shorter than this fall back to the cleaned app name, so
 * those variants still group together without claiming the vendor prefix.
 */
export const GROUP_MIN_SEGMENTS = 3;

/**
 * Section titles, keyed by group key (the identifier with ENV_SUFFIXES
 * stripped). A group with no entry here falls back to the base app's name
 * with environment markers like "[DEV]" removed.
 *
 * Run `npm run sync` and check data/apps.json for the groupKey to add here.
 */
export const GROUP_LABELS = {
  'id.logique.jbabiddingrevamp': 'JBA Bidding Revamp',
};
