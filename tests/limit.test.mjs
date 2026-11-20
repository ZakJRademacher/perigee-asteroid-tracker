import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeUpstreamGate, LIMITS } from '../worker/limit.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('the local window allows the budget, then blocks until it slides', async () => {
  let t = 0;
  const gate = makeUpstreamGate({ now: () => t, limit: 3, period: 60 });
  for (let i = 0; i < 3; i++) assert.equal(await gate('a'), true);
  assert.equal(await gate('a'), false);
  assert.equal(await gate('b'), true, 'each visitor has its own budget');
  t = 60_000;
  assert.equal(await gate('a'), true);
});

test('the rate-limiting binding decides when present, and a binding error falls back locally', async () => {
  const gate = makeUpstreamGate({ limit: 1, period: 60 });
  assert.equal(await gate('a', { limit: async () => ({ success: false }) }), false);
  assert.equal(await gate('a', { limit: async () => ({ success: true }) }), true);
  const broken = {
    limit: async () => {
      throw Error('binding unavailable');
    }
  };
  assert.equal(await gate('c', broken), true);
  assert.equal(await gate('c', broken), false);
  assert.throws(() => makeUpstreamGate({}), RangeError);
});

test('the deployed budgets match cloudflare.config.ts', () => {
  const config = readFileSync(new URL('../cloudflare.config.ts', import.meta.url), 'utf8');
  for (const [binding, { limit, period }] of [
    ['CATALOG_LIMITER', LIMITS.catalog],
    ['ORBIT_LIMITER', LIMITS.orbit]
  ])
    assert.ok(
      config
        .split(/\r?\n/)
        .some(
          line =>
            line.includes(`${binding}: bindings.rateLimit(`) &&
            line.includes(`simple: { limit: ${limit}, period: ${period} } })`)
        ),
      binding
    );
});

test('the Worker serves saved answers freely and limits only lookups that would reach NASA or JPL', async () => {
  const upstream = [];
  globalThis.fetch = async url => {
    upstream.push(String(url));
    return new Response('unavailable', { status: 503 });
  };
  const { default: worker } = await import('../dist/server/index.js');
  const now = new Date().toISOString();
  const orbit = { ...read('../dist/data/horizons-example.json'), retrievedAt: now };
  const seed = read('../dist/data/snapshot.json');
  const catalog = {
    schema: 1,
    start: seed.start,
    end: seed.end,
    candidateStart: seed.candidateStart,
    candidateEnd: seed.candidateEnd,
    retrievedAt: now,
    feed: seed.feed
  };
  const ids = Object.values(seed.feed.near_earth_objects)
    .flat()
    .map(neo => String(neo.id));
  const listed = ids.find(id => id !== orbit.id && /^\d{7,10}$/.test(id));
  const unlisted = ['2000433', '2101955', '3542519'].find(id => !ids.includes(id));
  assert.ok(listed && unlisted && orbit.start === seed.start);

  const store = new Map([
    [`v4-60d/${orbit.start}/${orbit.id}`, JSON.stringify(orbit)],
    [`v4-30d-buffer7-public/${seed.start}`, JSON.stringify(catalog)]
  ]);
  const CACHE = {
    get: async key => store.get(key) ?? null,
    put: async (key, value) => store.set(key, value)
  };
  const checks = [];
  const limiter = (name, success) => ({ limit: async () => (checks.push(name), { success }) });
  const get = (path, allow = false) =>
    worker.fetch(
      new Request('https://perigee.test' + path, { headers: { 'CF-Connecting-IP': '203.0.113.9' } }),
      {
        CACHE,
        CATALOG_LIMITER: limiter('catalog', allow),
        ORBIT_LIMITER: limiter('orbit', allow)
      }
    );

  assert.equal((await get(`/api/ephemeris?id=${orbit.id}&start=${orbit.start}`)).status, 200);
  assert.equal((await get(`/api/catalog?start=${seed.start}`)).status, 200);
  assert.deepEqual(checks, [], 'saved answers do not use the budget');

  const unknown = await get(`/api/ephemeris?id=${unlisted}&start=${seed.start}`, true);
  assert.equal(unknown.status, 404, 'an object outside the saved catalog is never looked up');
  assert.deepEqual(checks, []);

  for (const [path, kind] of [
    [`/api/ephemeris?id=${listed}&start=${seed.start}`, 'orbit'],
    ['/api/catalog?start=2026-11-20', 'catalog']
  ]) {
    const r = await get(path);
    assert.equal(r.status, 429, path);
    assert.equal(r.headers.get('retry-after'), String(LIMITS[kind].period));
    assert.equal((await r.json()).retryAfter, LIMITS[kind].period);
    assert.equal(checks.at(-1), kind, 'each kind of lookup uses its own budget');
  }
  assert.deepEqual(upstream, [], 'a limited request never contacts NASA or JPL');

  const passed = await get(`/api/ephemeris?id=${listed}&start=${seed.start}`, true);
  assert.equal(passed.status, 503);
  assert.equal(upstream.length, 1, 'an allowed lookup goes upstream');

  assert.equal((await get('/api/ephemeris?id=bad&start=2026-11-20')).status, 400);
});
