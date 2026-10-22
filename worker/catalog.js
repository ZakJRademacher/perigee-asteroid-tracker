import {catalogWindows,catalogCoverage,CATALOG_DAYS,fetchCatalog} from '../dist/catalog.js';
import {addDays} from '../dist/model.js';
// Only application data crosses the public boundary. Provider links may embed
// the upstream credential and are not needed by the browser.
export function publicCatalog(feed){
 const pick=(value,names)=>Object.fromEntries(names.filter(name=>value?.[name]!==undefined).map(name=>[name,value[name]]));
 const groups=Object.fromEntries(Object.entries(feed.near_earth_objects).map(([date,objects])=>[date,objects.map(neo=>({
  ...pick(neo,['id','name','absolute_magnitude_h','is_potentially_hazardous_asteroid','is_sentry_object']),
  estimated_diameter:{meters:pick(neo.estimated_diameter?.meters,['estimated_diameter_min','estimated_diameter_max'])},
  close_approach_data:(neo.close_approach_data??[]).map(approach=>({
   ...pick(approach,['epoch_date_close_approach','close_approach_date','close_approach_date_full','orbiting_body']),
   relative_velocity:pick(approach.relative_velocity,['kilometers_per_second']),
   miss_distance:pick(approach.miss_distance,['kilometers'])
  }))
 }))]));
 return {element_count:Object.values(groups).reduce((sum,objects)=>sum+objects.length,0),near_earth_objects:groups};
}
export function makeCatalogService({fetcher=fetch,now=Date.now,persistentCache=null,seed=null,apiKey='DEMO_KEY'}={}){
 const ttl=apiKey==='DEMO_KEY'?3600000:900000;
 const memory=new Map(),pending=new Map();let tail=Promise.resolve(),blockedUntil=0;
 if(seed&&seed.end===addDays(seed.start,CATALOG_DAYS-1)&&seed.candidateStart===catalogCoverage(seed.start).start&&seed.candidateEnd===catalogCoverage(seed.start).end)memory.set(seed.start,{schema:1,start:seed.start,end:seed.end,candidateStart:seed.candidateStart,candidateEnd:seed.candidateEnd,retrievedAt:seed.retrieved_at,feed:publicCatalog(seed.feed)});
 return async start=>{
  const coverage=catalogCoverage(start),end=addDays(start,CATALOG_DAYS-1),key=new Request('https://perigee-catalog-cache.invalid/v4-30d-buffer7-public/'+start);
  const fresh=d=>d?.schema===1&&d.start===start&&d.end===end&&d.candidateStart===coverage.start&&d.candidateEnd===coverage.end&&now()-Date.parse(d.retrievedAt)>=0&&now()-Date.parse(d.retrievedAt)<ttl;
  if(fresh(memory.get(start)))return {...memory.get(start),refreshAfterSeconds:ttl/1000,cacheState:'shared'};
  if(pending.has(start))return pending.get(start);
  const task=(async()=>{
   if(persistentCache){try{const hit=await persistentCache.match(key);if(hit){const d=await hit.json();if(fresh(d)){d.feed=publicCatalog(d.feed);memory.set(start,d);return {...d,refreshAfterSeconds:ttl/1000,cacheState:'shared'};}}}catch{}}
   const job=tail.catch(()=>{}).then(async()=>{
    if(now()<blockedUntil)throw Error('NASA catalog is in rate-limit backoff; please retry later.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
    let feed;try{feed=await fetchCatalog(start,{fetcher,signal:controller.signal,apiKey});}catch(e){if(/rate limit/.test(e.message))blockedUntil=now()+600000;throw e;}finally{clearTimeout(timer);}
    const data={schema:1,start,end,candidateStart:coverage.start,candidateEnd:coverage.end,refreshAfterSeconds:ttl/1000,retrievedAt:new Date(now()).toISOString(),feed:publicCatalog(feed)};memory.set(start,data);
    if(memory.size>4)memory.delete(memory.keys().next().value);
    if(persistentCache){try{await persistentCache.put(key,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age='+ttl/1000}}));}catch{}}
    return {...data,cacheState:'fresh'};
   });tail=job.catch(()=>{});return job;
  })().finally(()=>pending.delete(start));pending.set(start,task);return task;
 };
}
