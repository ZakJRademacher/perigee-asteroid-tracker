import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogWindows,mergeCatalog,fetchCatalog,fieldRows} from '../dist/catalog.js';
import {makeCatalogService} from '../worker/catalog.js';
const start='2026-10-22';
const empty=()=>({near_earth_objects:{}});
test('five nonoverlapping NASA batches cover exactly 30 calendar days across month and year boundaries',()=>{
 for(const date of [start,'2026-12-20','2028-02-20']){
  const windows=catalogWindows(date),days=[];
  for(const window of windows){const n=(Date.parse(window.end)-Date.parse(window.start))/86400000+1;assert.ok(n<=7);for(let i=0;i<n;i++)days.push(Date.parse(window.start)+i*86400000);}
  assert.equal(days.length,30);assert.equal(new Set(days).size,30);assert.equal(days.at(-1)-days[0],29*86400000);
 }
});
test('catalog assembly is atomic and rejects short or mismatched batches',()=>{
 assert.equal(Object.keys(mergeCatalog(start,Array.from({length:5},empty)).near_earth_objects).length,30);
 assert.throws(()=>mergeCatalog(start,[empty()]),/Incomplete/);
 assert.throws(()=>mergeCatalog(start,[{near_earth_objects:{'2026-12-01':[]}},empty(),empty(),empty(),empty()]),/outside/);
});
test('NASA catalog fetches weekly batches serially and stops on a rate limit',async()=>{
 let active=0,peak=0,calls=0;const progress=[];
 const fetcher=async url=>{active++;peak=Math.max(peak,active);calls++;assert.equal(new URL(url).hostname,'api.nasa.gov');await Promise.resolve();active--;return {ok:true,json:async()=>empty()};};
 await fetchCatalog(start,{fetcher,onProgress:n=>progress.push(n)});assert.equal(calls,5);assert.equal(peak,1);assert.deepEqual(progress,[1,2,3,4,5]);
 calls=0;await assert.rejects(fetchCatalog(start,{fetcher:async()=>{calls++;return {ok:false,status:429};}}),/rate limit/);assert.equal(calls,1);
});
test('later encounters enter the marker field as the position epoch advances, while selection stays available',()=>{
 const first=Date.parse(start),records=Array.from({length:30},(_,i)=>({key:'object-'+i,epoch:first+i*86400000})),original=JSON.stringify(records);
 assert.deepEqual(fieldRows(records,first,null,3).map(r=>r.key),['object-0','object-1','object-2']);
 assert.deepEqual(fieldRows(records,first+29*86400000,null,3).map(r=>r.key),['object-29','object-28','object-27']);
 assert.ok(fieldRows(records,first+29*86400000,'object-0',3).some(r=>r.key==='object-0'));assert.equal(JSON.stringify(records),original);
});
test('shared catalog cache coalesces visitors and expires according to NASA retrieval time',async()=>{
 let now=Date.parse(start),calls=0;const service=makeCatalogService({now:()=>now,fetcher:async()=>{calls++;return {ok:true,json:async()=>empty()};}});
 const [a,b]=await Promise.all([service(start),service(start)]);assert.equal(calls,5);assert.equal(a.end,'2026-11-20');assert.deepEqual(a,b);
 const cached=await service(start);assert.equal(cached.cacheState,'shared');assert.equal(calls,5);
 now+=3600001;await service(start);assert.equal(calls,10);
});
