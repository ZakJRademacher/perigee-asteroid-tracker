import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {readFileSync} from 'node:fs';
test('built Worker serves unchanged application assets and safe method/path responses',async()=>{const root=await worker.fetch(new Request('https://perigee.test/'));assert.equal(root.status,200);assert.equal(await root.text(),readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));const svg=await worker.fetch(new Request('https://perigee.test/icon.svg'));assert.equal(svg.headers.get('content-type'),'image/svg+xml');const head=await worker.fetch(new Request('https://perigee.test/app.js',{method:'HEAD'}));assert.equal(await head.text(),'');assert.equal((await worker.fetch(new Request('https://perigee.test/missing'))).status,404);assert.equal((await worker.fetch(new Request('https://perigee.test/',{method:'POST'}))).status,405);});
test('built Worker validates ephemeris input without calling upstream services',async()=>{for(const path of ['/api/ephemeris?id=https://evil.test&start=2026-10-22','/api/ephemeris?id=3485264&start=2026-02-30']){const r=await worker.fetch(new Request('https://perigee.test'+path));assert.equal(r.status,400);assert.ok((await r.json()).error);assert.equal(r.headers.get('cache-control'),'no-store');}});

test('catalog endpoint rejects invalid dates without contacting NASA',async()=>{const r=await worker.fetch(new Request('https://perigee.test/api/catalog?start=bad'));assert.equal(r.status,400);});
