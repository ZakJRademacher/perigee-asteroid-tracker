import {catalogWindows,fetchCatalog} from '../dist/catalog.js';
export function makeCatalogService({fetcher=fetch,now=Date.now,persistentCache=null,seed=null,apiKey='DEMO_KEY'}={}){
 const memory=new Map(),pending=new Map();let tail=Promise.resolve(),blockedUntil=0;
 if(seed&&seed.end===catalogWindows(seed.start).at(-1).end)memory.set(seed.start,{schema:1,start:seed.start,end:seed.end,retrievedAt:seed.retrieved_at,feed:seed.feed});
 return async start=>{
  const windows=catalogWindows(start),end=windows.at(-1).end,key=new Request('https://perigee-catalog-cache.invalid/v1-30d/'+start);
  const fresh=d=>d?.schema===1&&d.start===start&&d.end===end&&now()-Date.parse(d.retrievedAt)>=0&&now()-Date.parse(d.retrievedAt)<3600000;
  if(fresh(memory.get(start)))return {...memory.get(start),cacheState:'shared'};
  if(pending.has(start))return pending.get(start);
  const task=(async()=>{
   if(persistentCache){try{const hit=await persistentCache.match(key);if(hit){const d=await hit.json();if(fresh(d)){memory.set(start,d);return {...d,cacheState:'shared'};}}}catch{}}
   const job=tail.catch(()=>{}).then(async()=>{
    if(now()<blockedUntil)throw Error('NASA catalog is in rate-limit backoff; please retry later.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
    let feed;try{feed=await fetchCatalog(start,{fetcher,signal:controller.signal,apiKey});}catch(e){if(/rate limit/.test(e.message))blockedUntil=now()+600000;throw e;}finally{clearTimeout(timer);}
    const data={schema:1,start,end,retrievedAt:new Date(now()).toISOString(),feed};memory.set(start,data);
    if(memory.size>4)memory.delete(memory.keys().next().value);
    if(persistentCache){try{await persistentCache.put(key,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=3600'}}));}catch{}}
    return {...data,cacheState:'fresh'};
   });tail=job.catch(()=>{});return job;
  })().finally(()=>pending.delete(start));pending.set(start,task);return task;
 };
}
