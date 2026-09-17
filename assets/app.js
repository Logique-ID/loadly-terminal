/**
 * Renders data/apps.json, which scripts/sync.mjs generates from the Loadly API.
 * No API key is ever used here — the browser only reads the published JSON.
 */
(() => {
  'use strict';

  const DATA_URL = 'data/apps.json';

  const listEl = document.getElementById('list');
  const statusEl = document.getElementById('status');
  const searchEl = document.getElementById('search');
  const filtersEl = document.getElementById('filters');
  const generatedEl = document.getElementById('generated');
  const clearEl = document.getElementById('clear');

  let apps = [];
  let platform = 'All';
  let restored = false;

  const SESSION_KEY = 'loadly.session.v1';

  /**
   * Last visit's search and platform filter. Storage can throw (private mode,
   * blocked site data), so every access is guarded and failure just means the
   * page starts empty.
   */
  const readSession = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      return saved && typeof saved === 'object' ? saved : null;
    } catch {
      return null;
    }
  };

  const writeSession = (session) => {
    try {
      if (!session.query && session.platform === 'All') localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Nothing to do — the page works without a remembered session.
    }
  };

  /**
   * Section key and title for an app. scripts/sync.mjs computes both and writes
   * them into data/apps.json — the grouping rules live there and are not
   * duplicated here. These fall back only if the JSON predates those fields.
   */
  const groupKeyOf = (app) => app.groupKey || String(app.identifier || app.name || app.appKey || '');
  const groupLabelOf = (app) => app.groupLabel || app.name || groupKeyOf(app);

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  };

  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      // Hyphenated keys (aria-*, data-*) are attributes, not DOM properties.
      if (key.includes('-')) node.setAttribute(key, value);
      else node[key] = value;
    }
    for (const child of [].concat(children)) {
      if (child) node.append(child);
    }
    return node;
  };

  /** Copy-to-clipboard button for one install link. */
  function copyButton(url) {
    const button = el('button', { className: 'copy', type: 'button', textContent: 'Copy link' });
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        button.textContent = 'Copied ✓';
      } catch {
        button.textContent = 'Copy failed';
      }
      setTimeout(() => { button.textContent = 'Copy link'; }, 1500);
    });
    return button;
  }

  /** Toggle button that shows or hides an app's QR code (hidden by default). */
  function qrToggle(app) {
    const img = el('img', {
      className: 'qr',
      src: app.qrCodeUrl,
      alt: `QR code for ${app.name || 'app'}`,
      loading: 'lazy',
      hidden: true,
    });
    const button = el('button', {
      className: 'copy qr-toggle',
      type: 'button',
      textContent: 'Show QR',
    });
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      const show = img.hidden;
      img.hidden = !show;
      button.textContent = show ? 'Hide QR' : 'Show QR';
      button.setAttribute('aria-expanded', String(show));
    });
    return { button, img };
  }

  /** "3 days ago" style label; falls back to the locale date for old builds. */
  const formatRelative = (value) => {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '';
    const days = Math.round((Date.now() - date.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    if (days < 365) return `${Math.round(days / 30)} mo ago`;
    return `${Math.round(days / 365)} yr ago`;
  };

  /** Signed size difference against the previous (older) build. */
  const formatDelta = (bytes, previousBytes) => {
    if (!bytes || !previousBytes) return null;
    const diff = Number(bytes) - Number(previousBytes);
    if (Math.abs(diff) < 1024) return null;
    return { text: `${diff > 0 ? '+' : '−'}${formatSize(Math.abs(diff))}`, up: diff > 0 };
  };

  /** Version history as a vertical timeline, newest build first. */
  function buildHistory(app) {
    const builds = app.builds;
    const items = builds.map((build, index) => {
      const older = builds[index + 1];
      const delta = older ? formatDelta(build.fileSize, older.fileSize) : null;
      const isLatest = index === 0;

      return el('li', { className: isLatest ? 'build is-latest' : 'build' }, [
        el('span', { className: 'build-dot', 'aria-hidden': 'true' }),
        el('div', { className: 'build-body' }, [
          el('div', { className: 'build-head' }, [
            el('span', { className: 'build-version', textContent: build.version || '?' }),
            build.buildVersion
              ? el('span', { className: 'build-number', textContent: `build ${build.buildVersion}` })
              : null,
            isLatest ? el('span', { className: 'build-tag', textContent: 'Latest' }) : null,
          ]),
          el('div', { className: 'build-meta' }, [
            el('span', { className: 'build-date', title: formatDate(build.created),
              textContent: formatRelative(build.created) || formatDate(build.created) }),
            el('span', { className: 'build-size', textContent: formatSize(build.fileSize) }),
            delta
              ? el('span', {
                  className: delta.up ? 'build-delta up' : 'build-delta down',
                  textContent: delta.text,
                })
              : null,
          ]),
        ]),
      ]);
    });

    return el('details', { className: 'history' }, [
      el('summary', { className: 'history-summary' }, [
        el('span', { className: 'history-chevron', 'aria-hidden': 'true' }),
        el('span', { className: 'history-label', textContent: 'Version history' }),
        el('span', { className: 'history-count', textContent: String(builds.length) }),
      ]),
      el('ol', { className: 'timeline' }, items),
    ]);
  }

  function buildCard(app) {
    const card = el('article', { className: 'card' });

    const heading = el('div', {}, [
      el('h2', { className: 'title', textContent: app.name || 'Untitled app' }),
      el('p', { className: 'identifier', textContent: app.identifier || '' }),
      el('div', { className: 'badges' }, [
        el('span', { className: 'badge', textContent: app.platform }),
        app.isProtected
          ? el('span', { className: 'badge locked', textContent: `🔒 ${app.protection}` })
          : el('span', { className: 'badge', textContent: app.protection }),
      ]),
    ]);

    const head = el('div', { className: 'card-head' }, [
      app.icon ? el('img', { className: 'icon', src: app.icon, alt: '', loading: 'lazy' }) : null,
      heading,
    ]);
    card.append(head);

    const meta = el('dl', { className: 'meta' });
    const rows = [
      ['Version', app.version || '—'],
      ['Size', formatSize(app.fileSize)],
      ['Updated', formatDate(app.updated || app.created)],
    ];
    for (const [term, value] of rows) {
      meta.append(el('dt', { textContent: term }), el('dd', { textContent: value }));
    }
    card.append(meta);

    const channels = app.channels || [];

    if (channels.length > 0) {
      // Channels replace the direct link: the QR code encodes the direct link,
      // so it is left out here.
      card.append(
        el('div', { className: 'channels' }, [
          el('p', { className: 'channels-title', textContent: 'Channels' }),
          el(
            'ul',
            { className: 'channel-list' },
            channels.map((channel) =>
              el('li', {}, [
                el('span', { className: 'channel-label', textContent: channel.label }),
                el('div', { className: 'install-actions' }, [
                  el('a', {
                    className: 'link',
                    href: channel.url,
                    target: '_blank',
                    rel: 'noreferrer',
                    textContent: channel.url,
                  }),
                  copyButton(channel.url),
                ]),
              ])
            )
          ),
        ])
      );
    } else if (app.installUrl) {
      const qr = app.qrCodeUrl ? qrToggle(app) : null;
      card.append(
        el('div', { className: 'install' }, [
          el('div', { className: 'install-actions' }, [
            el('a', {
              className: 'link',
              href: app.installUrl,
              target: '_blank',
              rel: 'noreferrer',
              textContent: app.installUrl,
            }),
            el('div', { className: 'install-buttons' }, [
              copyButton(app.installUrl),
              qr ? qr.button : null,
            ]),
          ]),
          qr ? qr.img : null,
        ])
      );
    }

    if (app.builds && app.builds.length > 1) {
      card.append(buildHistory(app));
    }

    return card;
  }

  function render() {
    const query = searchEl.value.trim().toLowerCase();
    const visible = apps.filter((app) => {
      if (platform !== 'All' && app.platform !== platform) return false;
      if (!query) return true;
      return [
        app.name,
        app.identifier,
        app.version,
        app.shortcut,
        ...(app.channels || []).flatMap((channel) => [channel.label, channel.shortcut]),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));
    });

    // Cards are grouped into sections; `visible` is already sorted by group
    // label, so each group's apps arrive contiguously.
    const groups = [];
    const byKey = new Map();
    for (const app of visible) {
      const key = groupKeyOf(app);
      let group = byKey.get(key);
      if (!group) {
        group = { key, label: groupLabelOf(app), apps: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.apps.push(app);
    }

    listEl.replaceChildren(
      ...groups.map((group) =>
        el('section', { className: 'group' }, [
          el('h2', { className: 'group-title' }, [
            el('span', { className: 'group-name', textContent: group.label }),
            el('span', { className: 'group-count', textContent: String(group.apps.length) }),
          ]),
          el('div', { className: 'grid' }, group.apps.map(buildCard)),
        ])
      )
    );
    const count = visible.length
      ? `${visible.length} of ${apps.length} app(s)`
      : 'No apps match this filter.';
    statusEl.textContent = restored ? `${count} — restored from your last visit` : count;
    statusEl.className = 'status';

    const active = Boolean(query) || platform !== 'All';
    clearEl.hidden = !active;
    writeSession({ query: searchEl.value.trim(), platform });
    syncUrl();
  }

  /** Mirrors the current search into the URL so a filtered view can be shared. */
  function syncUrl() {
    const url = new URL(window.location.href);
    const query = searchEl.value.trim();
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    if (platform !== 'All') url.searchParams.set('platform', platform);
    else url.searchParams.delete('platform');
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, '', next);
    }
  }

  function buildFilters() {
    const platforms = ['All', ...new Set(apps.map((app) => app.platform).filter(Boolean))];
    // A remembered platform that no longer exists in the data falls back to All.
    if (!platforms.includes(platform)) platform = 'All';
    filtersEl.replaceChildren(
      ...platforms.map((name) => {
        const button = el('button', { type: 'button', textContent: name });
        button.setAttribute('aria-pressed', String(name === platform));
        button.addEventListener('click', () => {
          platform = name;
          restored = false;
          for (const other of filtersEl.children) {
            other.setAttribute('aria-pressed', String(other.textContent === name));
          }
          render();
        });
        return button;
      })
    );
  }

  async function load() {
    try {
      const response = await fetch(`${DATA_URL}?t=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Already ordered by scripts/sync.mjs (group label, then bundle
      // identifier), so cards never shuffle between syncs.
      apps = Array.isArray(data.apps) ? data.apps : [];
      generatedEl.textContent = data.generatedAt
        ? `Last synced ${new Date(data.generatedAt).toLocaleString()}`
        : '';

      buildFilters();
      render();
    } catch (error) {
      statusEl.textContent = `Could not load ${DATA_URL} — ${error.message}. Run "npm run sync" first.`;
      statusEl.className = 'status error';
    }
  }

  /** Restores the previous session; an explicit ?q=/?platform= in the URL wins. */
  function restoreSession() {
    const saved = readSession() || {};
    const params = new URLSearchParams(window.location.search);
    const hasUrlState = params.has('q') || params.has('platform');

    const query = hasUrlState ? params.get('q') || '' : String(saved.query || '');
    const savedPlatform = hasUrlState ? params.get('platform') || 'All' : String(saved.platform || 'All');

    searchEl.value = query;
    platform = savedPlatform || 'All';
    restored = !hasUrlState && Boolean(query || platform !== 'All');
  }

  searchEl.addEventListener('input', () => {
    restored = false;
    render();
  });

  clearEl.addEventListener('click', () => {
    searchEl.value = '';
    platform = 'All';
    restored = false;
    for (const other of filtersEl.children) {
      other.setAttribute('aria-pressed', String(other.textContent === 'All'));
    }
    render();
    searchEl.focus();
  });

  restoreSession();
  load();
})();
