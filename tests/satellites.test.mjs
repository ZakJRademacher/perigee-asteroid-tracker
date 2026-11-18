import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compactSatellites,makeSatelliteService,warmSatellites,satelliteKey,SATELLITE_FIELDS,SATELLITE_TTL,DEFAULT_SATELLITE_GROUPS} from '../worker/celestrak.js';
import {kvCache} from '../worker/kv.js';
import {parseSatellites,satelliteState,satelliteField,orbitPath,groundTrack,withinValidity,SATELLITE_VALID_MS,DEFAULT_GROUPS,OPTIONAL_GROUPS,SatelliteLoader} from '../dist/satellites.js';
import {earthOrientation,surfaceDirection,equatorialFrame,frameVector} from '../dist/earth-orientation.js';
import {physicalPosition} from '../dist/ephemeris.js';
import {propagate} from '../dist/vendor/satellite/propagation.js';
import worker from '../dist/server/index.js';

// Real CelesTrak OMM records saved 2026-11-17: ISS, three GPS satellites and two near-zero-inclination GEO satellites.
const fixture=JSON.parse(readFileSync(new URL('./fixtures/celestrak-omm-sample.json',import.meta.url)));
const retrievedAt='2026-11-17T18:00:00.000Z',epoch=Date.parse(retrievedAt);
const payload=group=>({schema:1,group,fields:SATELLITE_FIELDS,retrievedAt,records:compactSatellites(fixture.groups[group],group)});
const load=group=>parseSatellites(payload(group)).satellites;
function fakeKv(){const store=new Map();return {store,async get(k){return store.get(k)?.value??null;},async put(k,value,options){store.set(k,{value,options});}};}
const angle=(a,b)=>Math.acos(Math.min(1,a.reduce((s,v,k)=>s+v*b[k],0)/Math.hypot(...a)/Math.hypot(...b)))*180/Math.PI;

test('compact orbit records keep SGP4 fields, drop duplicates and reject malformed groups whole',()=>{
 const iss=fixture.groups.stations[0],rows=compactSatellites([iss,iss],'stations');
 assert.equal(rows.length,1);assert.equal(rows[0][SATELLITE_FIELDS.indexOf('NORAD_CAT_ID')],25544);assert.equal(rows[0].length,SATELLITE_FIELDS.length);
 assert.throws(()=>compactSatellites([],'stations'),/no orbit records/);
 assert.throws(()=>compactSatellites([{...iss,EPOCH:'yesterday'}],'stations'),/epoch/);
 assert.throws(()=>compactSatellites([{...iss,BSTAR:null}],'stations'),/BSTAR/);
 assert.throws(()=>compactSatellites([{...iss,ECCENTRICITY:1.2}],'stations'),/Unsupported orbit/);
 assert.throws(()=>compactSatellites([{...iss,NORAD_CAT_ID:'25544'}],'stations'),/NORAD/);
});

test('satellite service shares one CelesTrak download per group for two hours, across instances',async()=>{
 const kv=fakeKv();let calls=0,now=epoch;const urls=[];
 const fetcher=async url=>{calls++;urls.push(url);return new Response(JSON.stringify(fixture.groups.stations));};
 const first=makeSatelliteService({fetcher,now:()=>now,persistentCache:kvCache(kv)}),data=await first('stations');
 assert.equal(data.cacheState,'fresh');assert.equal(data.records.length,1);assert.equal(calls,1);
 assert.equal(urls[0],'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json');
 assert.ok(kv.store.has(satelliteKey('stations')));
 now+=SATELLITE_TTL-1000;const second=makeSatelliteService({fetcher,now:()=>now,persistentCache:kvCache(kv)});
 assert.equal((await second('stations')).cacheState,'shared');assert.equal(calls,1);
 now+=2000;assert.equal((await second('stations')).cacheState,'fresh');assert.equal(calls,2);
});

test('a failed refresh serves the last saved copy, labeled stale, then backs off',async()=>{
 const kv=fakeKv();let now=epoch,fail=false,calls=0;
 const fetcher=async()=>{calls++;if(fail)return new Response('GP data has not updated',{status:200});return new Response(JSON.stringify(fixture.groups.geo));};
 const service=makeSatelliteService({fetcher,now:()=>now,persistentCache:kvCache(kv)});await service('geo');
 fail=true;now+=SATELLITE_TTL+1000;const stale=await service('geo');
 assert.equal(stale.cacheState,'stale-fallback');assert.equal(stale.stale,true);assert.equal(stale.records.length,2);assert.equal(calls,2);
 await service('geo');assert.equal(calls,2,'backoff prevents hammering CelesTrak');
 const empty=makeSatelliteService({fetcher,now:()=>now});await assert.rejects(empty('gnss'),/non-JSON/);
});

test('visitor requests never wait on CelesTrak when a saved copy exists, and pick up outside refreshes',async()=>{
 const kv=fakeKv();let now=epoch,calls=0;const fetcher=async()=>{calls++;return new Response(JSON.stringify(fixture.groups.geo));};
 const service=makeSatelliteService({fetcher,now:()=>now,persistentCache:kvCache(kv)});await service('geo');assert.equal(calls,1);
 now+=SATELLITE_TTL*3;const old=await service('geo',{refresh:false});assert.equal(calls,1);assert.equal(old.stale,true);
 // An outside job (the GitHub refresh) writes a newer copy straight to the store.
 const newer={...JSON.parse(kv.store.get(satelliteKey('geo')).value),retrievedAt:new Date(now-60000).toISOString()};
 await kv.put(satelliteKey('geo'),JSON.stringify(newer),{expirationTtl:259200});
 const fresh=await service('geo',{refresh:false});assert.equal(fresh.retrievedAt,newer.retrievedAt);assert.equal(fresh.stale,false);assert.equal(calls,1);
});

test('CelesTrak two-hour download limit keeps the saved copy and waits 30 minutes before asking again',async()=>{
 const kv=fakeKv();let now=epoch,limited=false,calls=0;
 const fetcher=async()=>{calls++;return limited?new Response('GP data has not updated since your last successful\ndownload of GROUP=stations at 2026-11-17 18:00:00 UTC.\nData is updated once every 2 hours.',{status:403}):new Response(JSON.stringify(fixture.groups.stations));};
 const service=makeSatelliteService({fetcher,now:()=>now,persistentCache:kvCache(kv)});await service('stations');
 limited=true;now+=SATELLITE_TTL+1000;assert.equal((await service('stations')).cacheState,'stale-fallback');assert.equal(calls,2);
 now+=1700000;await service('stations');assert.equal(calls,2);now+=200000;await service('stations');assert.equal(calls,3);
 await assert.rejects(makeSatelliteService({fetcher})('stations'),/has not updated this group/);
});

test('only the fixed list of groups is accepted, without contacting CelesTrak',async()=>{
 let calls=0;const service=makeSatelliteService({fetcher:async()=>{calls++;}});
 await assert.rejects(service('https://example.com'),/supported satellite group/);await assert.rejects(service('active'),/supported satellite group/);assert.equal(calls,0);
 const reply=await worker.fetch(new Request('https://perigee.test/api/satellites?group=..%2Fsecrets'));assert.equal(reply.status,400);assert.match((await reply.json()).error,/supported satellite group/);
 assert.equal((await worker.fetch(new Request('https://perigee.test/api/satellites?group=geo',{method:'POST'}))).status,405);
});

test('scheduled warm-up refreshes only the default groups; megaconstellations load on demand',async()=>{
 const asked=[];const result=await warmSatellites(async group=>{asked.push(group);return {cacheState:group==='geo'?'fresh':'shared'};});
 assert.deepEqual(asked,DEFAULT_SATELLITE_GROUPS);assert.deepEqual(DEFAULT_GROUPS,DEFAULT_SATELLITE_GROUPS);assert.deepEqual(OPTIONAL_GROUPS,['starlink','oneweb']);
 assert.deepEqual(result.refreshed,['geo']);assert.equal(result.current.length,4);
});

test('SGP4 positions are physically plausible and keep the propagated distance',()=>{
 const [iss]=load('stations'),state=satelliteState(iss,epoch);
 assert.ok(state.altitudeKm>380&&state.altitudeKm<460,'ISS altitude '+state.altitudeKm);
 assert.ok(state.speed>7.5&&state.speed<7.8,'ISS speed '+state.speed);
 const pv=propagate(iss.satrec,new Date(epoch));assert.ok(Math.abs(state.km-Math.hypot(pv.position.x,pv.position.y,pv.position.z))<1e-6,'frame rotation preserves distance');
 for(const gps of load('gnss')){const s=satelliteState(gps,epoch);assert.ok(s.altitudeKm>19500&&s.altitudeKm<21000,gps.name+' altitude '+s.altitudeKm);assert.ok(Math.abs(gps.periodMinutes-718)<5);}
});

test('satellite positions line up with the globe and the geostationary belt lies on the equator',()=>{
 const orientation=earthOrientation(epoch),frame=equatorialFrame(epoch);
 for(const sat of [...load('stations'),...load('gnss'),...load('geo')]){
  const s=satelliteState(sat,epoch,orientation),scene=[s.position[0],s.position[2],-s.position[1]];
  // Geodetic and geocentric latitude differ by at most about 0.19 degrees.
  assert.ok(angle(scene,surfaceDirection(orientation,s.latitude,s.longitude))<.2,sat.name);
 }
 for(const sat of load('geo')){
  const s=satelliteState(sat,epoch),p=physicalPosition(s.position,1),v=frameVector(frame,[p.x,p.y,p.z]);
  assert.ok(Math.abs(Math.asin(v[1]/s.km))*180/Math.PI<.1,'display north is +Y, so GEO elevation is near zero: '+sat.name);
  assert.ok(Math.abs(s.km-42164)<60,sat.name+' radius '+s.km);
 }
});

test('elements are used only within seven days of their epoch, with no extrapolated positions beyond',()=>{
 const [iss]=load('stations');
 assert.ok(satelliteState(iss,iss.epochMs+SATELLITE_VALID_MS-60000));assert.ok(satelliteState(iss,iss.epochMs-SATELLITE_VALID_MS+60000));
 assert.equal(satelliteState(iss,iss.epochMs+SATELLITE_VALID_MS+60000),null);assert.equal(withinValidity(iss,iss.epochMs-SATELLITE_VALID_MS-1),false);
 const all=[...load('stations'),...load('geo')],later=satelliteField(all,epoch+30*86400000,50000);
 assert.deepEqual([later.inside.length,later.valid,later.expired],[0,0,3]);
 const now=satelliteField(all,epoch,10000);assert.deepEqual([now.inside.map(x=>x.sat.norad),now.valid,now.expired],[[25544],3,0]);
});

test('orbit path covers one period and the ground track stays on the surface within the inclination',()=>{
 const [iss]=load('stations'),path=orbitPath(iss,epoch),track=groundTrack(iss,epoch);
 assert.equal(path.length,181);
 const gap=Math.hypot(...path[0].position.map((v,k)=>v-path.at(-1).position[k]));assert.ok(gap<120,'one period returns near the start: '+gap+' km');
 assert.equal(track.length,241);
 for(const p of track){assert.ok(Math.abs(Math.hypot(...p.direction)-1)<1e-9);assert.ok(Math.abs(p.latitude)<=iss.inclination+.3);}
 const [geo]=load('geo'),still=groundTrack(geo,epoch);assert.ok(still.every(p=>Math.abs(p.latitude)<.2),'GEO ground track stays near one point on the equator');
});

test('browser loader parses groups, reports failures per group and can retry',async()=>{
 let fail=true;const updates=[];const fetcher=async url=>{const group=new URL(url,'https://x.test').searchParams.get('group');if(group==='gnss'&&fail)return new Response(JSON.stringify({error:'Satellite orbit data unavailable; please retry later.'}),{status:503});return new Response(JSON.stringify(payload(group)));};
 const loader=new SatelliteLoader({fetcher,onUpdate:()=>updates.push(1)});
 loader.ensure(['stations','gnss']);await new Promise(r=>setTimeout(r,20));
 assert.equal(loader.satellites(['stations','gnss']).length,1);assert.match(loader.errors.get('gnss'),/unavailable/);assert.ok(updates.length>=2);
 assert.equal(loader.find('sat:25544').name,'ISS (ZARYA)');
 fail=false;loader.retry();await new Promise(r=>setTimeout(r,20));assert.equal(loader.errors.size,0);assert.equal(loader.satellites(['gnss']).length,3);
 assert.throws(()=>parseSatellites({...payload('stations'),group:'active'}),/Unknown satellite group/);
 assert.throws(()=>parseSatellites({...payload('stations'),fields:SATELLITE_FIELDS.slice(1)}),/missing NORAD_CAT_ID/);
});

test('vendored satellite.js subset keeps its recorded hashes and MIT license',()=>{
 const vendor=JSON.parse(readFileSync(new URL('../dist/vendor/satellite/provenance.json',import.meta.url)));
 assert.equal(vendor.package,'satellite.js');assert.equal(vendor.license,'MIT');
 for(const [file,hash] of Object.entries(vendor.files_sha256))assert.equal(createHash('sha256').update(readFileSync(new URL('../dist/vendor/satellite/'+file,import.meta.url))).digest('hex'),hash,file);
 assert.match(readFileSync(new URL('../dist/vendor/satellite/LICENSE.md',import.meta.url),'utf8'),/MIT License/);
});
