#!/usr/bin/env node
/**
 * Fetches every app from Loadly and writes data/apps.json for the static site.
 *
 * The API key is read from .env (LOADLY_API_KEY) and never ends up in the
 * generated JSON, so the output is safe to publish on GitHub Pages.
 *
 *   node scripts/sync.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BASE_URL,
  CHANNELS,
  DEDUPE_PAGES,
  ENDPOINTS,
  ENV_SUFFIXES,
  FIELDS,
  GROUP_LABELS,
  GROUP_MIN_SEGMENTS,
  ICON_BASE,
  INSTALL_TYPES,
  MAX_PAGES,
  MAX_RETRIES,
  PLATFORMS,
  REQUEST_DELAY_MS,
  SHORTCUT_BASE,
} from './loadly.config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'data/apps.json');

async function loadApiKey() {
  const envFile = resolve(ROOT, '.env');
  if (existsSync(envFile)) {
    const contents = await readFile(envFile, 'utf8');
    for (const line of contents.split('\n')) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }

  const key = process.env.LOADLY_API_KEY;
  if (!key) {
    throw new Error(
      'LOADLY_API_KEY is not set. Copy .env.example to .env and fill in your key.'
    );
  }
  return key;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * POSTs form-encoded params and unwraps Loadly's {code, message, data} envelope.
 * Network blips are retried; a Loadly error code is not.
 */
async function call(path, params, attempt = 1) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) body.append(key, String(value));
  }

  let payload;
  try {
    const response = await fetch(`${BASE_URL}${path}`, { method: 'POST', body });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    payload = await response.json();
  } catch (error) {
    if (attempt >= MAX_RETRIES) throw new Error(`${path} failed: ${error.message}`);
    await sleep(REQUEST_DELAY_MS * 4 * attempt);
    return call(path, params, attempt + 1);
  }

  const code = Number(payload.code ?? 0);
  if (code !== 0) {
    throw new Error(`${path} failed: Loadly error ${code} — ${payload.message ?? 'unknown'}`);
  }

  await sleep(REQUEST_DELAY_MS);
  return payload.data ?? payload;
}

/** Loadly returns either a bare array or {list: [...]} depending on endpoint. */
const toArray = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const pick = (source, field) => {
  for (const key of FIELDS[field] ?? []) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
};

/** /app/listMy returns an icon hash, /app/view returns a full URL. */
const iconUrl = (value) => {
  if (!value) return null;
  return /^https?:\/\//.test(value) ? value : `${ICON_BASE}/${value}`;
};

function normalize(raw, extra = {}) {
  const installType = Number(pick(raw, 'installType') ?? 1);
  const install = INSTALL_TYPES[installType] ?? { label: 'Unknown', protected: false };
  const shortcut = pick(raw, 'shortcutUrl');
  const channels = (CHANNELS[shortcut] ?? []).map((channel) => ({
    label: channel.label,
    shortcut: channel.shortcut,
    url: `${SHORTCUT_BASE}/${channel.shortcut}`,
  }));

  return {
    appKey: pick(raw, 'appKey'),
    buildKey: pick(raw, 'buildKey'),
    name: pick(raw, 'name'),
    icon: iconUrl(pick(raw, 'icon')),
    platform: PLATFORMS[Number(pick(raw, 'platform'))] ?? 'Unknown',
    version: pick(raw, 'version'),
    buildVersion: pick(raw, 'buildVersion'),
    identifier: pick(raw, 'identifier'),
    fileSize: Number(pick(raw, 'fileSize') ?? 0),
    shortcut,
    installUrl: shortcut ? `${SHORTCUT_BASE}/${shortcut}` : null,
    channels,
    qrCodeUrl: pick(raw, 'qrCodeUrl'),
    protection: install.label,
    isProtected: install.protected,
    created: pick(raw, 'created'),
    updated: pick(raw, 'updated'),
    ...extra,
  };
}

/** Identity of a row, for spotting a backend that hands back the same page. */
const rowKey = (row) =>
  pick(row, 'buildKey') ?? pick(row, 'appKey') ?? JSON.stringify(row);

/**
 * Walks a paginated endpoint until a page is empty, shorter than the first
 * page, or contains nothing new. Without those last two stops an endpoint that
 * ignored `page` would keep returning page 1 until MAX_PAGES and duplicate
 * every row into the output.
 */
async function fetchAllPages(path, params) {
  const collected = [];
  const seen = new Set();
  let pageSize = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const rows = toArray(await call(path, { ...params, page }));
    if (rows.length === 0) break;

    const fresh = DEDUPE_PAGES ? rows.filter((row) => !seen.has(rowKey(row))) : rows;
    for (const row of fresh) seen.add(rowKey(row));
    collected.push(...fresh);

    if (DEDUPE_PAGES && fresh.length === 0) break;
    if (page === 1) pageSize = rows.length;
    else if (rows.length < pageSize) break;
  }

  return collected;
}

/**
 * Group key for an app: its identifier with environment suffixes stripped, so
 * id.foo, id.foo.dev and id.foo.staging all collapse to id.foo. Handles both
 * dotted segments (id.foo.dev) and glued tails (com.foo.barstaging).
 */
function groupKeyFor(identifier) {
  const segments = String(identifier ?? '').split('.').filter(Boolean);
  if (segments.length === 0) return '';

  // Drop whole trailing segments that are nothing but an environment marker.
  while (segments.length > 1 && ENV_SUFFIXES.includes(segments.at(-1).toLowerCase())) {
    segments.pop();
  }

  // Then strip an environment word glued onto the end of the last segment,
  // keeping it only if a meaningful stem remains.
  const last = segments.at(-1);
  const lower = last.toLowerCase();
  for (const suffix of ENV_SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 3) {
      segments[segments.length - 1] = last.slice(0, last.length - suffix.length);
      break;
    }
  }

  return segments.join('.');
}

/** An app name with environment markers like "[DEV]" or "(staging)" removed. */
function cleanName(name) {
  const envPattern = ENV_SUFFIXES.join('|');
  return String(name ?? '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(new RegExp(`\\((?:${envPattern})\\)`, 'gi'), ' ')
    .replace(new RegExp(`\\b(?:${envPattern})\\b$`, 'i'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tags every app with the section it belongs to. The label comes from
 * GROUP_LABELS when the key is listed there, otherwise from the name of the
 * group's base app — the one with the shortest identifier.
 */
/**
 * Group key for one app. A stripped identifier is used only when it is specific
 * enough (GROUP_MIN_SEGMENTS); a vendor-only identifier like `id.logique.dev`
 * strips down to `id.logique`, which any later app under the same vendor would
 * fall into, so those group by cleaned name instead. Name keys are prefixed so
 * they can never collide with an identifier key.
 */
function groupKeyOf(app) {
  const stripped = groupKeyFor(app.identifier);
  if (stripped && stripped.split('.').length >= GROUP_MIN_SEGMENTS) {
    return { key: stripped, generic: false };
  }
  const name = cleanName(app.name) || app.name || String(app.appKey ?? '');
  return { key: `name:${name}`, generic: true, stripped };
}

function assignGroups(list) {
  const members = new Map();
  const generic = new Map();
  for (const app of list) {
    const { key, generic: isGeneric, stripped } = groupKeyOf(app);
    if (isGeneric && app.identifier) generic.set(app.identifier, { key, stripped });
    if (!members.has(key)) members.set(key, []);
    members.get(key).push(app);
  }

  for (const [identifier, { key, stripped }] of generic) {
    console.warn(
      `  ! ${identifier} is too generic to group by identifier` +
        `${stripped ? ` (strips to "${stripped}")` : ''} — grouped as "${key}" instead.`
    );
  }

  // Base app of each group: the one with the shortest identifier.
  const bases = new Map();
  for (const [key, group] of members) {
    bases.set(
      key,
      group.reduce((shortest, app) =>
        String(app.identifier ?? '').length < String(shortest.identifier ?? '').length ? app : shortest
      )
    );
  }

  // Cleaning names can collapse two unrelated groups onto one title
  // ("Blue-T Demo" and "Blue-T Dev" both clean to "Blue-T"); those keep their
  // base app's full name so every section stays distinguishable.
  const labelUsers = new Map();
  for (const [key, base] of bases) {
    const label = GROUP_LABELS[key] || cleanName(base.name) || base.name || key;
    if (!labelUsers.has(label)) labelUsers.set(label, []);
    labelUsers.get(label).push(key);
  }

  for (const [key, group] of members) {
    const base = bases.get(key);
    const cleaned = GROUP_LABELS[key] || cleanName(base.name) || base.name || key;
    const unique = Boolean(GROUP_LABELS[key]) || labelUsers.get(cleaned).length === 1;
    const label = unique ? cleaned : base.name || key;
    for (const app of group) {
      app.groupKey = key;
      app.groupLabel = label;
    }
  }
}

/**
 * Orders apps by group label first, so each section's apps stay contiguous,
 * then by bundle identifier, comparing dot-separated segments so a base id
 * always precedes its variants (id.jbabidding, .dev, .stg). Mirrors the
 * comparator in assets/app.js.
 */
function compareApps(a, b) {
  const byGroup = String(a.groupLabel ?? '').localeCompare(String(b.groupLabel ?? ''));
  if (byGroup !== 0) return byGroup;

  const idA = String(a.identifier ?? '');
  const idB = String(b.identifier ?? '');
  if (idA && idB && idA !== idB) {
    const segA = idA.split('.');
    const segB = idB.split('.');
    for (let i = 0; i < Math.min(segA.length, segB.length); i += 1) {
      const diff = segA[i].localeCompare(segB[i]);
      if (diff !== 0) return diff;
    }
    return segA.length - segB.length;
  }
  if (idA !== idB) return idA ? -1 : 1;
  return (
    String(a.platform ?? '').localeCompare(String(b.platform ?? '')) ||
    String(a.name ?? '').localeCompare(String(b.name ?? ''))
  );
}

async function main() {
  const apiKey = await loadApiKey();

  console.log('Fetching app list…');
  const listed = await fetchAllPages(ENDPOINTS.listMy, { _api_key: apiKey });
  console.log(`  ${listed.length} app(s) found`);

  const apps = [];
  for (const summary of listed) {
    const appKey = pick(summary, 'appKey');
    const buildKey = pick(summary, 'buildKey');
    const label = pick(summary, 'name') ?? appKey ?? buildKey;

    let detail = summary;
    let builds = [];
    try {
      detail = { ...summary, ...(await call(ENDPOINTS.view, { _api_key: apiKey, appKey })) };
      builds = await fetchAllPages(ENDPOINTS.builds, { _api_key: apiKey, appKey, buildKey });
    } catch (error) {
      console.warn(`  ! ${label}: ${error.message}`);
    }

    apps.push(
      normalize(detail, {
        builds: builds.map((build) => ({
          buildKey: pick(build, 'buildKey'),
          version: pick(build, 'version'),
          buildVersion: pick(build, 'buildVersion'),
          fileSize: Number(pick(build, 'fileSize') ?? 0),
          created: pick(build, 'created'),
        })),
      })
    );
    console.log(`  ✓ ${label} (${builds.length} build(s))`);
  }

  // A channel entry is keyed by the app's own shortcut. Renaming that shortcut
  // in the Loadly dashboard would otherwise drop the channels with no trace.
  const shortcuts = new Set(apps.map((app) => app.shortcut).filter(Boolean));
  for (const shortcut of Object.keys(CHANNELS)) {
    if (!shortcuts.has(shortcut)) {
      console.warn(
        `  ! CHANNELS has "${shortcut}", which matches no app shortcut — ` +
          'the entry is being ignored. Check the shortcut in loadly.config.mjs.'
      );
    }
  }

  assignGroups(apps);
  apps.sort(compareApps);

  await writeFile(
    OUTPUT,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), apps }, null, 2)}\n`
  );
  console.log(`Wrote ${OUTPUT} (${apps.length} app(s))`);
}

export { assignGroups, cleanName, compareApps, groupKeyFor, groupKeyOf };

// Only sync when run as a script; importing this file (tests) must not fetch.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Sync failed: ${error.message}`);
    process.exit(1);
  });
}
