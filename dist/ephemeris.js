import {CATALOG_DAYS} from './catalog.js';
export const LD_KM=384400;
export function validEphemeris(data,id,start){return data?.schema===1&&data.id===id&&data.start===start&&data.frame==='Ecliptic of J2000.0'&&data.correction==='NONE; geometric'&&data.center==='Earth (399), body center'&&Array.isArray(data.samples)&&data.samples.length===1441&&Array.isArray(data.samples[0])&&Math.abs(data.samples[0][0]-Date.parse(start+'T00:00:00Z'))<5&&data.samples.every((s,i)=>Array.isArray(s)&&s.length===7&&s.every(Number.isFinite)&&(i===0||Math.abs(s[0]-data.samples[i-1][0]-3600000)<5));}
export function interpolateState(data,epoch){const a=data?.samples;if(!a?.length||!Number.isFinite(epoch)||epoch<a[0][0]||epoch>a.at(-1)[0])return null;let lo=0,hi=a.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(a[m][0]<=epoch)lo=m;else hi=m;}const p=a[lo],q=a[hi],dt=(q[0]-p[0])/1000,u=(epoch-p[0])/(q[0]-p[0]),h00=2*u**3-3*u*u+1,h10=u**3-2*u*u+u,h01=-2*u**3+3*u*u,h11=u**3-u*u;const position=[1,2,3].map(k=>h00*p[k]+h10*dt*p[k+3]+h01*q[k]+h11*dt*q[k+3]);return {epoch,position,km:Math.hypot(...position),sampleStep:dt};}
export function physicalPosition(vector,scaleKm){return {x:vector[0]/scaleKm,y:vector[2]/scaleKm,z:-vector[1]/scaleKm};}
export function futureTrack(data,epoch,days=30){const end=Math.min(epoch+days*86400000,data.samples.at(-1)[0]),points=[],step=3600000;for(let t=epoch;t<end;t+=step){const s=interpolateState(data,t);if(s)points.push(s);}const last=interpolateState(data,end);if(last)points.push(last);return points;}
export function displayScale(records,ephemerides,epoch,selected){
 // Reference the full five-day window and selected 30-day future path, never the
 // scrubbed instant. Catalog speed/distance provide a conservative initial fit.
 let extent=2*LD_KM;
 for(const record of records){
  if(Number.isFinite(record.km))extent=Math.max(extent,record.km+(Number.isFinite(record.speed)?record.speed*CATALOG_DAYS*86400:0));
  const data=ephemerides.get(record.id);if(!data)continue;
  const first=data.samples[0][0],end=first+(record.key===selected?CATALOG_DAYS+30:CATALOG_DAYS)*86400000;
  for(const sample of data.samples){if(sample[0]>end)break;extent=Math.max(extent,Math.hypot(...sample.slice(1,4)));}
 }
 return extent/7.8;
}
export class EphemerisLoader {
 constructor({fetcher=fetch,onUpdate=()=>{}}={}){this.fetcher=(...args)=>fetcher(...args);this.onUpdate=onUpdate;this.data=new Map();this.errors=new Map();this.pending=[];this.running=false;this.start='';this.generation=0;this.paused=false;}
 reset(start){this.start=start;this.generation++;this.data.clear();this.errors.clear();this.pending=[];this.paused=false;}
 ensure(rows,selected){if(this.paused)return;const ids=[...new Set(rows.map(r=>r.id))];this.pending=this.pending.filter(id=>ids.includes(id));for(const id of ids)if(!this.data.has(id)&&!this.errors.has(id)&&!this.pending.includes(id)&&id!==this.current)this.pending.push(id);const chosen=rows.find(r=>r.key===selected)?.id;if(chosen&&this.pending.includes(chosen)){this.pending=this.pending.filter(id=>id!==chosen);this.pending.unshift(chosen);}if(this.pending.length)this.pump();}
 async pump(){if(this.running||this.paused)return;this.running=true;try{while(this.pending.length&&!this.paused){const id=this.pending.shift(),start=this.start,generation=this.generation;this.current=id;
   try{const key='perigee-horizons-60d-'+start+'-'+id;let data;try{const old=JSON.parse(localStorage.getItem(key)||'null');if(validEphemeris(old,id,start)&&Date.now()-Date.parse(old.retrievedAt)>=0&&Date.now()-Date.parse(old.retrievedAt)<3600000)data=old;}catch{}
    if(!data){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),35000);try{const r=await this.fetcher('/api/ephemeris?id='+id+'&start='+start+'&coverage=60',{signal:controller.signal});const body=await r.json();if(!r.ok){const e=Error(body.error??'JPL request failed.');e.retryAfter=body.retryAfter;throw e;}if(!validEphemeris(body,id,start))throw Error('Invalid ephemeris response.');data=body;try{localStorage.setItem(key,JSON.stringify(data));}catch{}}finally{clearTimeout(timeout);}}
    if(generation===this.generation)this.data.set(id,data);
   }catch(e){if(generation===this.generation){this.errors.set(id,e.name==='AbortError'?'JPL request timed out.':e.message);if(e.retryAfter){this.paused=true;this.pending=[];}}}
   finally{this.current=null;this.onUpdate();}
  }}finally{this.running=false;this.onUpdate();}}
}
