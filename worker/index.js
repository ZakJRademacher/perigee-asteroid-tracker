import { makeCatalogService } from './catalog.js';
import { makeHorizonsService } from './horizons.js';
import { kvCache, warmPositions, BATCH_LIMIT } from './kv.js';
import { makeSatelliteService, warmSatellites } from './celestrak.js';
import { makeSatellitePhotoService } from './wikidata.js';
// __ASSET_TABLE__ is supplied by the deterministic portable Worker build.
let service, catalogService, satelliteService, photoService;
// One catalog and one Horizons service per instance, backed by the shared KV
// store when it is bound (falls back to the per-colo Cache API otherwise).
function services(env) {
  const persistentCache = env.CACHE
    ? kvCache(env.CACHE)
    : typeof caches !== 'undefined'
      ? caches.default
      : null;
  if (!catalogService) {
    let seed = null;
    try {
      seed = JSON.parse(atob(ASSETS['/data/snapshot.json'].data));
    } catch {}
    catalogService = makeCatalogService({ apiKey: env.NASA_API_KEY || 'DEMO_KEY', persistentCache, seed });
  }
  if (!service) {
    let seed = [];
    try {
      const file = ASSETS['/data/horizons-example.json'];
      if (file) seed = [JSON.parse(atob(file.data))];
    } catch {}
    service = makeHorizonsService({ persistentCache, seed });
  }
  if (!satelliteService) satelliteService = makeSatelliteService({ persistentCache });
  if (!photoService) photoService = makeSatellitePhotoService({ persistentCache });
  return { catalog: catalogService, orbit: service, satellites: satelliteService, photos: photoService };
}
const redact = message => String(message).replace(/api_key=[^&\s]+/g, 'api_key=REDACTED');
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (url.pathname === '/api/catalog') {
      if (request.method === 'HEAD') return new Response(null, { status: 405 });
      try {
        return Response.json(await services(env).catalog(url.searchParams.get('start')), {
          headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
        });
      } catch (e) {
        const bad = /valid|date|start/.test(e.message);
        if (!bad) console.error('catalog failure', e.name, redact(e.message));
        return Response.json(
          {
            error: bad
              ? e.message
              : /rate.limit/.test(e.message)
                ? 'NASA request limit reached; please retry later.'
                : 'NASA catalog unavailable; please retry later.'
          },
          { status: bad ? 400 : 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }
    // Visitors get the saved copy; only the scheduled job and outside refresh contact CelesTrak.
    if (url.pathname === '/api/satellites') {
      if (request.method === 'HEAD') return new Response(null, { status: 405 });
      const group = url.searchParams.get('group') ?? '';
      try {
        return Response.json(await services(env).satellites(group, { refresh: false }), {
          headers: { 'Cache-Control': 'private,max-age=600', 'X-Content-Type-Options': 'nosniff' }
        });
      } catch (e) {
        const bad = /supported satellite group/.test(e.message);
        if (!bad) console.error('satellite failure', group, e.name, e.message);
        return Response.json(
          { error: bad ? e.message : 'Satellite orbit data unavailable; please retry later.' },
          { status: bad ? 400 : 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }
    if (url.pathname === '/api/satellite-photos') {
      if (request.method === 'HEAD') return new Response(null, { status: 405 });
      try {
        return Response.json(await services(env).photos(url.searchParams.get('norad')), {
          headers: { 'Cache-Control': 'public,max-age=86400', 'X-Content-Type-Options': 'nosniff' }
        });
      } catch (e) {
        const bad = /NORAD/.test(e.message);
        if (!bad) console.error('photo lookup failure', e.name, e.message);
        return Response.json(
          { error: bad ? e.message : 'Photo lookup unavailable; please retry later.', images: [] },
          { status: bad ? 400 : 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }
    // Already-cached vectors for several objects at once; never contacts JPL.
    if (url.pathname === '/api/ephemeris/batch') {
      if (request.method === 'HEAD') return new Response(null, { status: 405 });
      const start = url.searchParams.get('start'),
        ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').filter(Boolean))];
      if (!ids.length || ids.length > BATCH_LIMIT)
        return Response.json(
          { error: 'Between 1 and ' + BATCH_LIMIT + ' object IDs are required.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      try {
        const { orbit } = services(env),
          vectors = {},
          missing = [];
        for (const id of ids) {
          const data = await orbit.peek(id, start);
          if (data) vectors[id] = data;
          else missing.push(id);
        }
        return Response.json(
          { start, vectors, missing },
          { headers: { 'Cache-Control': 'private,max-age=300', 'X-Content-Type-Options': 'nosniff' } }
        );
      } catch (e) {
        return Response.json({ error: e.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
      }
    }
    if (url.pathname === '/api/ephemeris') {
      if (request.method === 'HEAD') return new Response(null, { status: 405 });
      try {
        const data = await services(env).orbit(url.searchParams.get('id'), url.searchParams.get('start'));
        return Response.json(data, {
          headers: { 'Cache-Control': 'private,max-age=300', 'X-Content-Type-Options': 'nosniff' }
        });
      } catch (e) {
        const bad = /required|dates must|starting date/.test(e.message);
        return Response.json(
          { error: bad ? e.message : 'Position unavailable: ' + e.message, retryAfter: e.retryAfter ?? null },
          {
            status: bad ? 400 : 503,
            headers: {
              'Cache-Control': 'no-store',
              ...(e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : {})
            }
          }
        );
      }
    }
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad path', { status: 400 });
    }
    if (path === '/') path = '/index.html';
    const item = ASSETS[path];
    if (!item) return new Response('Not found', { status: 404 });
    const headers = {
      'Content-Type': item.type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    };
    if (request.method === 'HEAD') return new Response(null, { headers });
    const raw = atob(item.data),
      bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Response(bytes, { headers });
  },
  // Cron: keep today's window warm so first visitors get positions from the shared store.
  async scheduled(controller, env = {}, ctx) {
    if (!env.CACHE) return;
    const { catalog, orbit, satellites } = services(env),
      orbits = warmSatellites(satellites).then(result =>
        console.log('satellite warm-up', JSON.stringify(result))
      ),
      job = warmPositions({ kv: env.CACHE, catalog, orbit, start: dateKey() })
        .then(result => console.log('position warm-up', JSON.stringify(result)))
        .catch(e => console.error('position warm-up failed', e.name, redact(e.message)));
    const all = Promise.all([
      orbits.catch(e => console.error('satellite warm-up failed', e.name, e.message)),
      job
    ]);
    ctx?.waitUntil ? ctx.waitUntil(all) : await all;
  }
};
