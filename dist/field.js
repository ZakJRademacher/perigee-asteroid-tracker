import {interpolateState,LD_KM} from './ephemeris.js';
export const FIELD_SCENE_RADIUS=7.8;
export function fieldScale(radiusLd){
 if(!Number.isFinite(radiusLd)||radiusLd<=0||radiusLd>100)throw new RangeError('Viewing radius must be greater than zero and at most 100 LD');
 return radiusLd*LD_KM/FIELD_SCENE_RADIUS;
}
export function fieldObjects(records,epoch,selected){
 const objects=new Map();
 for(const row of records){const old=objects.get(row.id);if(!old||row.key===selected||(old.key!==selected&&Math.abs(row.epoch-epoch)<Math.abs(old.epoch-epoch)))objects.set(row.id,row);}
 // This score prioritizes downloads; it never supplies a displayed position.
 const priority=r=>(Number.isFinite(r.km)?r.km:Infinity)+Math.abs(r.epoch-epoch)/1000*(Number.isFinite(r.speed)?r.speed:0);
 return [...objects.values()].sort((a,b)=>Number(b.key===selected)-Number(a.key===selected)||priority(a)-priority(b)||a.id.localeCompare(b.id));
}
export function radiusField(records,ephemerides,epoch,radiusLd){
 const scale=fieldScale(radiusLd),inside=[];let loaded=0;
 for(const row of records){const state=interpolateState(ephemerides.get(row.id),epoch);if(!state)continue;loaded++;if(state.km<=radiusLd*LD_KM)inside.push({...row,state});}
 return {inside,loaded,total:records.length,scale};
}
// Clip each sampled line segment independently. Separate visits to the sphere
// never get joined by a spurious chord across an outside part of the path.
export function clipTrack(points,radiusKm){
 const result=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1].position,b=points[i].position,d=b.map((v,k)=>v-a[k]),aa=d.reduce((s,v)=>s+v*v,0);
  if(!aa)continue;
  const bb=2*a.reduce((s,v,k)=>s+v*d[k],0),cc=a.reduce((s,v)=>s+v*v,0)-radiusKm**2,disc=bb*bb-4*aa*cc;
  if(disc<0)continue;
  const root=Math.sqrt(disc),lo=Math.max(0,(-bb-root)/(2*aa)),hi=Math.min(1,(-bb+root)/(2*aa));
  if(hi<=lo)continue;
  result.push(a.map((v,k)=>v+lo*d[k]),a.map((v,k)=>v+hi*d[k]));
 }
 return result;
}
