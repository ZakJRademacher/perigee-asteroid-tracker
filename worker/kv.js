import { horizonsKey } from './horizons.js';
// Workers KV behind the small Cache-API surface (match/put) the catalog and
// Horizons services already use. Unlike caches.default, KV is shared by every
// Worker instance and also works on workers.dev.
export function kvCache(kv) {
  const keyOf = request => new URL(typeof request === 'string' ? request : request.url).pathname.slice(1);
  return {
    async match(request) {
      const value = await kv.get(keyOf(request));
      return value === null
        ? undefined
        : new Response(value, { headers: { 'Content-Type': 'application/json' } });
    },
    async put(request, response) {
      const ttl = Number(/max-age=(\d+)/.exec(response.headers.get('Cache-Control') ?? '')?.[1] ?? 3600);
      await kv.put(keyOf(request), await response.text(), { expirationTtl: Math.max(60, ttl) });
    }
  };
}
export const BATCH_LIMIT = 12;
export const WARM_BATCH = 3;
// Pre-load a few missing position sets for a window. Small batches keep each
// scheduled run inside free-plan CPU and request limits; progress is saved as
// each object completes, so an interrupted run still helps the next one.
export async function warmPositions({ kv, catalog, orbit, start, limit = WARM_BATCH }) {
  const data = await catalog(start),
    ids = [
      ...new Set(
        Object.values(data.feed.near_earth_objects)
          .flat()
          .map(neo => String(neo.id))
      )
    ].filter(id => /^\d{7,10}$/.test(id));
  const have = new Set();
  let cursor;
  do {
    const page = await kv.list({ prefix: horizonsKey(start, ''), cursor });
    for (const key of page.keys) have.add(key.name.slice(key.name.lastIndexOf('/') + 1));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const missing = ids.filter(id => !have.has(id)),
    done = [];
  for (const id of missing.slice(0, limit)) {
    try {
      await orbit(id, start);
      done.push(id);
    } catch {
      break;
    }
  }
  return {
    candidates: ids.length,
    cached: have.size,
    warmed: done.length,
    remaining: missing.length - done.length
  };
}
