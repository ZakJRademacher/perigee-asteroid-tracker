export const HORIZONS_TTL=3600000;
export function validateOrbitRequest(id,start){
 if(!/^\d{7,10}$/.test(id??''))throw Error('A numeric NASA small-body SPK ID is required.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start??''))throw Error('A valid starting date is required.');
 const t=Date.parse(start+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==start||Number(start.slice(0,4))<1962||Number(start.slice(0,4))>2099)throw Error('Ephemeris dates must be valid calendar dates from 1962 through 2099.');
 return {id,start,end:new Date(t+60*86400000).toISOString().slice(0,10)};
}
export function horizonsURL(id,start){const q=validateOrbitRequest(id,start),p=new URLSearchParams({format:'json',COMMAND:`'DES=${q.id};'`,OBJ_DATA:'NO',MAKE_EPHEM:'YES',EPHEM_TYPE:'VECTORS',CENTER:"'500@399'",REF_PLANE:'ECLIPTIC',REF_SYSTEM:'ICRF',OUT_UNITS:'KM-S',VEC_TABLE:'2',VEC_CORR:'NONE',TIME_TYPE:'UT',CSV_FORMAT:'YES',START_TIME:`'${q.start}'`,STOP_TIME:`'${q.end}'`,STEP_SIZE:"'1 h'"});return 'https://ssd.jpl.nasa.gov/api/horizons.api?'+p;}
export function parseHorizons(payload,id,start,retrievedAt=new Date().toISOString()){
 validateOrbitRequest(id,start);
 if(payload?.signature?.source!=='NASA/JPL Horizons API'||payload.signature.version!=='1.2')throw Error('Unsupported JPL Horizons API signature/version; the parser needs review.');
 if(payload.error)throw Error('JPL could not resolve this object or date range.');
 const text=payload.result??'';
 if(!/Center body name:\s*Earth \(399\)/.test(text)||!/Reference frame\s*:\s*Ecliptic of J2000\.0/.test(text)||!/Output units\s*:\s*KM-S/.test(text)||!/GEOMETRIC cartesian states/.test(text)||!/Start time[^\n]* UT\s/.test(text))throw Error('Horizons returned an unexpected origin, reference frame, units or time scale.');
 const body=text.match(/\$\$SOE\s*([\s\S]*?)\$\$EOE/)?.[1];if(!body)throw Error('Horizons returned no vector table.');
 const samples=body.trim().split(/\r?\n/).filter(Boolean).map(line=>{const c=line.split(',').map(s=>s.trim()),values=[Number(c[0]),...c.slice(2,8).map(Number)];if(c.length<8||c.slice(2,8).some(s=>!s)||!values.every(Number.isFinite))throw Error('Invalid vector record.');return [Math.round((values[0]-2440587.5)*86400000),...values.slice(1)];});
 if(samples.length!==1441)throw Error('Incomplete Horizons vector coverage.');const first=Date.parse(start+'T00:00:00Z');
 for(let i=0;i<samples.length;i++){if(Math.abs(samples[i][0]-(first+i*3600000))>5)throw Error('Unexpected Horizons sampling interval.');if(Math.hypot(...samples[i].slice(1,4))===0)throw Error('Invalid zero position.');}
 return {schema:1,id,start,end:new Date(first+60*86400000).toISOString().slice(0,10),target:text.match(/Target body name:\s*([^\n{]+)/)?.[1]?.trim()??id,source:'NASA/JPL Horizons',apiVersion:payload.signature.version,center:'Earth (399), body center',frame:'Ecliptic of J2000.0',correction:'NONE; geometric',units:'km and km/s',timeScale:'UT (UTC for these dates)',stepSeconds:3600,retrievedAt,samples};
}
export function makeHorizonsService({fetcher=fetch,now=Date.now,persistentCache=null,seed=[]}={}){
 const memory=new Map(seed.map(d=>[d.id+'/'+d.start,d])),pending=new Map();let tail=Promise.resolve(),blockedUntil=0;
 return async function getOrbit(id,start){validateOrbitRequest(id,start);const key=id+'/'+start,cacheKey=new Request('https://perigee-horizons-cache.invalid/v3-60d/'+key),stamp=now();
  const fresh=data=>data?.schema===1&&data.samples?.length===1441&&data.id===id&&data.start===start&&stamp-Date.parse(data.retrievedAt)>=0&&stamp-Date.parse(data.retrievedAt)<HORIZONS_TTL;
  if(fresh(memory.get(key)))return memory.get(key);
  if(pending.has(key))return pending.get(key);
  const operation=(async()=>{if(persistentCache){try{const hit=await persistentCache.match(cacheKey);if(hit){const data=await hit.json();if(fresh(data)){memory.set(key,data);return data;}}}catch{}}
   const job=tail.catch(()=>{}).then(async()=>{if(now()<blockedUntil){const e=Error('JPL is temporarily unavailable; please retry after the backoff period.');e.retryAfter=Math.ceil((blockedUntil-now())/1000);throw e;}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);let response,payload;
    try{response=await fetcher(horizonsURL(id,start),{headers:{'User-Agent':'Perigee/1.3 (https://github.com/ZakJRademacher)','Accept':'application/json'},signal:controller.signal});if(!response.ok){blockedUntil=now()+(response.status===429||response.status===503?600000:10000);const e=Error('JPL Horizons is temporarily unavailable (HTTP '+response.status+').');e.retryAfter=Math.ceil((blockedUntil-now())/1000);throw e;}payload=await response.json();}catch(e){blockedUntil=Math.max(blockedUntil,now()+10000);e.retryAfter??=Math.ceil((blockedUntil-now())/1000);throw e;}finally{clearTimeout(timer);}
    let data;try{data=parseHorizons(payload,id,start,new Date(now()).toISOString());}catch(e){if(/signature\/version|unexpected origin/.test(e.message)){blockedUntil=now()+600000;e.retryAfter=600;}throw e;}memory.set(key,data);if(memory.size>64)memory.delete(memory.keys().next().value);if(persistentCache){try{await persistentCache.put(cacheKey,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=3600'}}));}catch{}}return data;});tail=job.catch(()=>{});return job;
  })().finally(()=>pending.delete(key));pending.set(key,operation);return operation;
 };
}
