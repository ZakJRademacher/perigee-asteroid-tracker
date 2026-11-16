import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {kvCache,warmPositions} from '../worker/kv.js';
import {makeHorizonsService,horizonsKey,HORIZONS_TTL} from '../worker/horizons.js';
import worker from '../dist/server/index.js';

// Minimal in-memory stand-in for a Workers KV namespace.
function fakeKv(){const store=new Map(),writes=[];return {store,writes,
 async get(key){return store.get(key)?.value??null;},
 async put(key,value,options){writes.push({key,options});store.set(key,{value,options});},
 async list({prefix='',cursor}={}){const names=[...store.keys()].filter(k=>k.startsWith(prefix)).sort(),from=Number(cursor??0),page=names.slice(from,from+2);return {keys:page.map(name=>({name})),list_complete:from+2>=names.length,cursor:String(from+2)};}};}
const raw=JSON.parse(readFileSync(new URL('./fixtures/horizons-2010al30-60d.json',import.meta.url))),id='3485264',start='2026-10-22',epoch=Date.parse(start+'T00:00:00Z');

test('KV adapter stores by path with the response max-age as its expiry',async()=>{
 const kv=fakeKv(),cache=kvCache(kv);
 assert.equal(await cache.match(new Request('https://x.invalid/a/b')),undefined);
 await cache.put(new Request('https://x.invalid/a/b'),new Response('{"ok":1}',{headers:{'Cache-Control':'public,max-age=900'}}));
 assert.deepEqual(kv.writes,[{key:'a/b',options:{expirationTtl:900}}]);
 assert.deepEqual(await (await cache.match(new Request('https://x.invalid/a/b'))).json(),{ok:1});
});
test('a second Worker instance reuses vectors from the shared store without calling JPL',async()=>{
 const kv=fakeKv();let calls=0;const fetcher=async()=>{calls++;return {ok:true,json:async()=>raw};};
 const first=makeHorizonsService({now:()=>epoch,fetcher,persistentCache:kvCache(kv)});await first(id,start);
 assert.equal(calls,1);assert.ok(kv.store.has(horizonsKey(start,id)));assert.equal(kv.writes[0].options.expirationTtl,HORIZONS_TTL/1000);
 const second=makeHorizonsService({now:()=>epoch+1000,fetcher,persistentCache:kvCache(kv)});
 assert.equal((await second.peek(id,start)).id,id);assert.equal((await second(id,start)).samples.length,1441);assert.equal(calls,1);
 assert.equal(await second.peek('3802428',start),null,'peek never fetches a missing object');assert.equal(calls,1);
});
test('scheduled warm-up fills only missing objects, in small batches, and reports what remains',async()=>{
 const kv=fakeKv(),ids=['3485264','3802428','3000001','3000002','3000003'],catalog=async()=>({feed:{near_earth_objects:{a:ids.slice(0,3).map(id=>({id})),b:ids.slice(3).map(id=>({id}))}}});
 const fetched=[],orbit=async objectId=>{fetched.push(objectId);await kv.put(horizonsKey(start,objectId),'{}');};
 await kv.put(horizonsKey(start,'3802428'),'{}');
 const first=await warmPositions({kv,catalog,orbit,start,limit:3});
 assert.deepEqual(first,{candidates:5,cached:1,warmed:3,remaining:1});assert.deepEqual(fetched,['3485264','3000001','3000002']);
 const second=await warmPositions({kv,catalog,orbit,start,limit:3});assert.deepEqual(second,{candidates:5,cached:4,warmed:1,remaining:0});
 const third=await warmPositions({kv,catalog,orbit,start,limit:3});assert.equal(third.warmed,0);assert.equal(fetched.length,4);
});
test('batch endpoint validates its input and returns only already-cached vectors',async()=>{
 const none=await worker.fetch(new Request('https://perigee.test/api/ephemeris/batch?start='+start));assert.equal(none.status,400);
 const many=await worker.fetch(new Request('https://perigee.test/api/ephemeris/batch?start='+start+'&ids='+Array.from({length:13},(_,i)=>3000000+i).join(',')));assert.equal(many.status,400);
 const bad=await worker.fetch(new Request('https://perigee.test/api/ephemeris/batch?start=nope&ids=3485264'));assert.equal(bad.status,400);
 const ok=await worker.fetch(new Request('https://perigee.test/api/ephemeris/batch?start=2099-01-01&ids=3485264,3802428'));assert.equal(ok.status,200);const body=await ok.json();assert.deepEqual(body.vectors,{});assert.deepEqual(body.missing,['3485264','3802428']);
});
