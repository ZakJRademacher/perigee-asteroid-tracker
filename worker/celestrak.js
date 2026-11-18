// CelesTrak general-perturbations (OMM) orbit data for a fixed list of groups.
// This is a fixed-destination endpoint, not an arbitrary URL proxy.
export const SATELLITE_GROUPS=['stations','gnss','weather','science','geo','starlink','oneweb'];
// CelesTrak asks clients not to download a group more than once per two hours.
export const SATELLITE_TTL=7200000;
// A stale copy is kept for three days and served, clearly labeled, if CelesTrak fails.
export const SATELLITE_STALE_TTL=259200000;
export const SATELLITE_FIELDS=['NORAD_CAT_ID','OBJECT_NAME','OBJECT_ID','EPOCH','MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'];
export function satelliteKey(group){return 'sat-v1/'+group;}
const satelliteUrl=group=>'https://celestrak.org/NORAD/elements/gp.php?GROUP='+group+'&FORMAT=json';
// Keep only what SGP4 needs plus identity. Reject the whole group if any record
// is malformed, rather than silently showing a partial constellation.
export function compactSatellites(records,group){
 if(!Array.isArray(records)||!records.length)throw Error('CelesTrak returned no orbit records for '+group);
 const numeric=SATELLITE_FIELDS.filter(f=>!['OBJECT_NAME','OBJECT_ID','EPOCH'].includes(f)),seen=new Set(),rows=[];
 for(const r of records){
  if(!r||typeof r!=='object'||!Number.isInteger(r.NORAD_CAT_ID)||r.NORAD_CAT_ID<=0)throw Error('Invalid NORAD catalog number in '+group);
  if(typeof r.OBJECT_NAME!=='string'||!r.OBJECT_NAME.trim())throw Error('Missing object name in '+group);
  if(typeof r.EPOCH!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z?$/.test(r.EPOCH)||!Number.isFinite(Date.parse(r.EPOCH.endsWith('Z')?r.EPOCH:r.EPOCH+'Z')))throw Error('Invalid element epoch in '+group);
  for(const f of numeric)if(!Number.isFinite(r[f]))throw Error('Invalid '+f+' in '+group);
  if(r.MEAN_MOTION<=0||r.ECCENTRICITY<0||r.ECCENTRICITY>=1)throw Error('Unsupported orbit in '+group);
  if(seen.has(r.NORAD_CAT_ID))continue;seen.add(r.NORAD_CAT_ID);
  rows.push(SATELLITE_FIELDS.map(f=>f==='OBJECT_ID'?(typeof r[f]==='string'?r[f]:''):f==='OBJECT_NAME'?r[f].trim():r[f]));
 }
 return rows;
}
export function makeSatelliteService({fetcher=fetch,now=Date.now,persistentCache=null}={}){
 const memory=new Map(),pending=new Map(),blockedUntil=new Map();
 const cacheRequest=group=>new Request('https://perigee-satellite-cache.invalid/'+satelliteKey(group));
 const age=d=>now()-Date.parse(d?.retrievedAt);
 const valid=(d,group)=>d?.schema===1&&d.group===group&&Array.isArray(d.records)&&age(d)>=0&&age(d)<SATELLITE_STALE_TTL;
 const reply=(d,state)=>({...d,refreshAfterSeconds:SATELLITE_TTL/1000,stale:age(d)>=SATELLITE_TTL,cacheState:state});
 async function stored(group){
  // A memory copy past the refresh interval is checked against the shared store,
  // which an outside job may have refreshed in the meantime.
  const local=valid(memory.get(group),group)?memory.get(group):null;
  if(local&&age(local)<SATELLITE_TTL)return local;
  if(!persistentCache)return local;
  try{const hit=await persistentCache.match(cacheRequest(group));if(hit){const d=await hit.json();if(valid(d,group)&&(!local||Date.parse(d.retrievedAt)>Date.parse(local.retrievedAt))){memory.set(group,d);return d;}}}catch{}
  return local;
 }
 const service=async(group,{refresh=true}={})=>{
  if(!SATELLITE_GROUPS.includes(group))throw Error('Choose a supported satellite group.');
  const cached=await stored(group);
  if(cached&&(age(cached)<SATELLITE_TTL||!refresh))return reply(cached,'shared');
  if(pending.has(group))return pending.get(group);
  // Groups download independently, so one slow group never holds up the others;
  // each group still has at most one download in flight.
  const task=(async()=>{
   try{
    if(now()<(blockedUntil.get(group)??0))throw Object.assign(Error('CelesTrak is in backoff after a failed request.'),{backoff:true});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);let records;
    try{const response=await fetcher(satelliteUrl(group),{signal:controller.signal,headers:{Accept:'application/json'}});const text=await response.text();
     // CelesTrak answers 403 when this network already downloaded the unchanged group within two hours.
     if(response.status===403&&/has not updated/i.test(text))throw Object.assign(Error('CelesTrak has not updated this group since the last download from this network'),{wait:1800000});
     if(!response.ok)throw Error('CelesTrak HTTP '+response.status);try{records=JSON.parse(text);}catch{throw Error('CelesTrak returned a non-JSON response');}}finally{clearTimeout(timer);}
    const data={schema:1,group,source:'CelesTrak GP (OMM JSON)',fields:SATELLITE_FIELDS,retrievedAt:new Date(now()).toISOString(),records:compactSatellites(records,group)};
    memory.set(group,data);
    if(persistentCache){try{await persistentCache.put(cacheRequest(group),new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age='+SATELLITE_STALE_TTL/1000}}));}catch{}}
    return reply(data,'fresh');
   }catch(e){
    if(!e.backoff)blockedUntil.set(group,now()+(e.wait??600000));
    if(cached)return reply(cached,'stale-fallback');
    throw e;
   }
  })();
  const job=task.finally(()=>pending.delete(group));pending.set(group,job);return job;
 };
 return service;
}
// Cron helper: refresh any default group (the large optional constellations load on demand) whose shared copy is older than the TTL.
export const DEFAULT_SATELLITE_GROUPS=['stations','gnss','weather','science','geo'];
export async function warmSatellites(service,groups=DEFAULT_SATELLITE_GROUPS){
 const result={refreshed:[],current:[],failed:[]};
 for(const group of groups){try{const d=await service(group);(d.cacheState==='fresh'?result.refreshed:d.cacheState==='stale-fallback'?result.failed:result.current).push(group);}catch{result.failed.push(group);}}
 return result;
}
