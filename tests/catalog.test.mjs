import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogWindows,mergeCatalog,fetchCatalog,fieldRows,encounterRows} from '../dist/catalog.js';
import {makeCatalogService} from '../worker/catalog.js';
const start='2026-10-22';
const empty=()=>({near_earth_objects:{}});
test('seven NASA batches cover 30 timeline days plus seven days of boundary candidates on either side across month, year and leap-day boundaries',()=>{
 for(const date of [start,'2026-12-30','2028-02-27']){
  const windows=catalogWindows(date),days=[];
  assert.equal(windows.length,7);
  for(const window of windows){const n=(Date.parse(window.end)-Date.parse(window.start))/86400000+1;assert.ok(n<=7);for(let i=0;i<n;i++)days.push(Date.parse(window.start)+i*86400000);}
  assert.equal(days.length,44);assert.equal(new Set(days).size,44);assert.equal(days.at(-1)-days[0],43*86400000);
 }
});
test('catalog assembly is atomic and rejects short or mismatched batches',()=>{
 assert.equal(Object.keys(mergeCatalog(start,Array.from({length:7},empty)).near_earth_objects).length,44);
 assert.throws(()=>mergeCatalog(start,[]),/Incomplete/);
 assert.throws(()=>mergeCatalog(start,[{near_earth_objects:{'2026-12-01':[]}},...Array.from({length:6},empty)]),/outside/);
});
test('buffered NASA refresh needs seven serialized requests and does not retry a rate limit',async()=>{
 let active=0,peak=0,calls=0;const progress=[];
 const fetcher=async url=>{active++;peak=Math.max(peak,active);calls++;const u=new URL(url);assert.equal(u.hostname,'api.nasa.gov');assert.ok(Date.parse(u.searchParams.get('end_date'))-Date.parse(u.searchParams.get('start_date'))<=6*86400000);await Promise.resolve();active--;return {ok:true,json:async()=>empty()};};
 await fetchCatalog(start,{fetcher,onProgress:n=>progress.push(n)});assert.equal(calls,7);assert.equal(peak,1);assert.deepEqual(progress,[1,2,3,4,5,6,7]);
 calls=0;await assert.rejects(fetchCatalog(start,{fetcher:async()=>{calls++;return {ok:false,status:429};}}),/rate limit/);assert.equal(calls,1);
});
test('later encounters enter the marker field as the position epoch advances, while selection stays available',()=>{
 const first=Date.parse(start),records=Array.from({length:5},(_,i)=>({key:'object-'+i,epoch:first+i*86400000})),original=JSON.stringify(records);
 assert.deepEqual(fieldRows(records,first,null,3).map(r=>r.key),['object-0','object-1','object-2']);
 assert.deepEqual(fieldRows(records,first+4*86400000,null,3).map(r=>r.key),['object-4','object-3','object-2']);
 assert.ok(fieldRows(records,first+4*86400000,'object-0',3).some(r=>r.key==='object-0'));assert.equal(JSON.stringify(records),original);
});
test('shared catalog cache coalesces visitors and expires according to NASA retrieval time',async()=>{
 let now=Date.parse(start),calls=0;const service=makeCatalogService({now:()=>now,fetcher:async()=>{calls++;return {ok:true,json:async()=>empty()};}});
 const [a,b]=await Promise.all([service(start),service(start)]);assert.equal(calls,7);assert.equal(a.end,'2026-11-20');assert.equal(a.candidateStart,'2026-10-15');assert.equal(a.candidateEnd,'2026-11-27');assert.deepEqual(a,b);
 const cached=await service(start);assert.equal(cached.cacheState,'shared');assert.equal(calls,7);
 now+=3600001;await service(start);assert.equal(calls,14);
});

test('personal-key catalogs refresh after 15 minutes while demo-key catalogs retain their hourly interval',async()=>{
 for(const [apiKey,seconds] of [['private-test-key',900],['DEMO_KEY',3600]]){
  let now=Date.parse(start),calls=0;
  const service=makeCatalogService({apiKey,now:()=>now,fetcher:async()=>{calls++;return {ok:true,json:async()=>empty()};}});
  assert.equal((await service(start)).refreshAfterSeconds,seconds);now+=seconds*1000-1;await service(start);assert.equal(calls,7);
  now+=2;await service(start);assert.equal(calls,14);
 }
});

test('only close approaches inside the 30-day timeline enter catalog rows, including nested approach history',()=>{
 const first=Date.parse(start),times=[first-1,first,first+30*86400000-1,first+30*86400000];
 const neo={id:'1234567',name:'Boundary test',close_approach_data:times.map(epoch=>({orbiting_body:'Earth',epoch_date_close_approach:epoch,miss_distance:{kilometers:'1000000'},relative_velocity:{kilometers_per_second:'10'}}))};
 const feed={near_earth_objects:{[start]:[neo]}};
 assert.deepEqual(encounterRows(feed,start).rows.map(r=>r.epoch),times.slice(1,3));
});

test('provider credentials and unused URLs never enter fresh, persisted or seeded public catalog data',async()=>{
 const privateKey='test-only-upstream-credential-1234567890',link='https://api.nasa.gov/neo/rest/v1/neo/1234567?api_key='+privateKey;
 const neo={id:'1234567',name:'Boundary test',links:{self:link},unused_secret:privateKey,estimated_diameter:{meters:{estimated_diameter_min:10,estimated_diameter_max:20,links:{self:link}}},close_approach_data:[{epoch_date_close_approach:Date.parse(start),orbiting_body:'Earth',relative_velocity:{kilometers_per_second:'10',links:{self:link}},miss_distance:{kilometers:'1000000'},links:{self:link}}]};
 const feed={near_earth_objects:{[start]:[neo]}},now=()=>Date.parse(start);let persisted;
 const cache={match:async()=>persisted?new Response(persisted):null,put:async(_,response)=>{persisted=await response.text();}};
 const service=makeCatalogService({apiKey:privateKey,now,persistentCache:cache,fetcher:async url=>{assert.equal(new URL(url).searchParams.get('api_key'),privateKey);return {ok:true,json:async()=>new URL(url).searchParams.get('start_date')<=start&&new URL(url).searchParams.get('end_date')>=start?feed:empty()};}});
 const fresh=await service(start),cached=await service(start),reload=await makeCatalogService({now,persistentCache:cache,fetcher:async()=>{throw Error('Unexpected upstream request');}})(start);
 const seeded=await makeCatalogService({now,seed:{start,end:'2026-11-20',candidateStart:'2026-10-15',candidateEnd:'2026-11-27',retrieved_at:start,feed}})(start);
 for(const result of [fresh,cached,reload,seeded]){
  const text=JSON.stringify(result);assert.equal(text.includes(privateKey),false);assert.equal(text.includes('api_key'),false);
  const rows=encounterRows(result.feed,start).rows;assert.equal(rows.length,1);assert.equal(rows[0].min,10);assert.equal(rows[0].max,20);assert.equal(rows[0].speed,10);assert.equal(rows[0].km,1000000);
 }
 assert.equal(persisted.includes(privateKey),false);
});
