/**
 * Download redirect for the Loadly Terminal page.
 *
 *   GET /<buildKey>  →  302 to a fresh signed APK URL from Loadly
 *
 * The page cannot call /app/install itself because it needs the API key, and a
 * link resolved at sync time expires about an hour later. This worker holds the
 * key and resolves the link when the user clicks, so the button never goes
 * stale.
 *
 * Only builds that the published data/apps.json lists as the latest public
 * Android build are served. Without that check anyone could pass the buildKey
 * of a password- or invitation-protected app and the API key would skip its
 * protection.
 *
 * Env: LOADLY_API_KEY (secret), APPS_URL (the published data/apps.json).
 */

const INSTALL_URL = 'https://api.loadly.io/apiv2/app/install';
// Signed links are reused until this long before they expire.
const EXPIRY_MARGIN_S = 300;
const APPS_CACHE_S = 300;

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const buildKey = new URL(request.url).pathname.slice(1);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(buildKey)) return notFound();

    let app;
    try {
      app = await findApp(env.APPS_URL, buildKey);
    } catch (error) {
      console.error(error.message);
      return new Response('Download unavailable', { status: 502 });
    }
    if (!app) return notFound();

    const cache = caches.default;
    const cacheKey = new Request(new URL(`/${buildKey}`, request.url));
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const signed = await resolve(env.LOADLY_API_KEY, buildKey);
      const ttl = signed.expires ? signed.expires - Math.floor(Date.now() / 1000) - EXPIRY_MARGIN_S : 0;
      const response = redirect(signed.url, ttl > 0 ? ttl : 0);
      if (ttl > 0) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      console.error(`${buildKey}: ${error.message}`);
      // Loadly hiccup: the install page still works, just with one more tap.
      return app.installUrl ? redirect(app.installUrl, 0) : new Response('Download unavailable', { status: 502 });
    }
  },
};

/** The latest public Android build with this key, or null. */
async function findApp(appsUrl, buildKey) {
  const response = await fetch(appsUrl, { cf: { cacheTtl: APPS_CACHE_S, cacheEverything: true } });
  if (!response.ok) throw new Error(`apps.json: HTTP ${response.status}`);
  const { apps = [] } = await response.json();
  return (
    apps.find((app) => app.buildKey === buildKey && app.platform === 'Android' && !app.isProtected) ?? null
  );
}

async function resolve(apiKey, buildKey) {
  const query = new URLSearchParams({ _api_key: apiKey, buildKey });
  const response = await fetch(`${INSTALL_URL}?${query}`, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (response.status < 300 || response.status >= 400 || !location) {
    throw new Error(`expected a redirect, got HTTP ${response.status}`);
  }
  const url = new URL(location);
  if (url.protocol !== 'https:') throw new Error('redirect target is not an https URL');
  return { url: url.href, expires: Number(url.searchParams.get('Expires')) || null };
}

function redirect(location, maxAge) {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      'cache-control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}

function notFound() {
  return new Response('Unknown or protected build', { status: 404 });
}
