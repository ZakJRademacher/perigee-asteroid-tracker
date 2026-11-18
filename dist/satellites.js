import {json2satrec} from './vendor/satellite/io.js';
import {propagate,gstime} from './vendor/satellite/propagation.js';
import {eciToEcf,eciToGeodetic,degreesLat,degreesLong} from './vendor/satellite/transforms.js';
import {earthOrientation,surfaceDirection} from './earth-orientation.js';

// Curated CelesTrak groups. The two megaconstellations are opt-in.
export const SATELLITE_GROUPS=[
 {id:'stations',label:'Space stations',color:0xffd27a,css:'#ffd27a'},
 {id:'gnss',label:'Navigation (GNSS)',color:0x8fd3ff,css:'#8fd3ff'},
 {id:'weather',label:'Weather',color:0x9ff0c4,css:'#9ff0c4'},
 {id:'science',label:'Science',color:0xd7a8ff,css:'#d7a8ff'},
 {id:'geo',label:'Geostationary',color:0xff9e8a,css:'#ff9e8a'},
 {id:'starlink',label:'Starlink',color:0x9aa8b8,css:'#9aa8b8',optional:true},
 {id:'oneweb',label:'OneWeb',color:0x7f95a8,css:'#7f95a8',optional:true}
];
export const DEFAULT_GROUPS=SATELLITE_GROUPS.filter(g=>!g.optional).map(g=>g.id);
export const OPTIONAL_GROUPS=SATELLITE_GROUPS.filter(g=>g.optional).map(g=>g.id);
// SGP4 accuracy from one element set degrades over days, so positions are only
// shown within this distance in time from the element epoch.
export const SATELLITE_VALID_MS=7*86400000;
const MU=398600.4418,EARTH_EQUATORIAL_KM=6378.137;

// Rebuild named OMM records from the Worker's compact rows and initialize SGP4.
// A group whose payload is malformed is rejected whole.
export function parseSatellites(payload){
 if(payload?.schema!==1||!Array.isArray(payload.fields)||!Array.isArray(payload.records))throw Error('Unsupported satellite payload');
 const group=SATELLITE_GROUPS.find(g=>g.id===payload.group);if(!group)throw Error('Unknown satellite group');
 const at=name=>{const i=payload.fields.indexOf(name);if(i<0)throw Error('Satellite payload is missing '+name);return i;};
 const index=Object.fromEntries(['NORAD_CAT_ID','OBJECT_NAME','OBJECT_ID','EPOCH','MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'].map(n=>[n,at(n)]));
 const satellites=[];
 for(const row of payload.records){
  const omm=Object.fromEntries(Object.entries(index).map(([name,i])=>[name,row[i]]));
  const epochMs=Date.parse(omm.EPOCH.endsWith('Z')?omm.EPOCH:omm.EPOCH+'Z');
  if(!Number.isInteger(omm.NORAD_CAT_ID)||!Number.isFinite(epochMs)||!(omm.MEAN_MOTION>0))throw Error('Invalid satellite record');
  const satrec=json2satrec(omm);if(satrec.error)continue;
  satellites.push({key:'sat:'+omm.NORAD_CAT_ID,norad:omm.NORAD_CAT_ID,name:omm.OBJECT_NAME,intl:omm.OBJECT_ID,group:group.id,epochMs,satrec,meanMotion:omm.MEAN_MOTION,eccentricity:omm.ECCENTRICITY,inclination:omm.INCLINATION,raan:omm.RA_OF_ASC_NODE,argPerigee:omm.ARG_OF_PERICENTER,meanAnomaly:omm.MEAN_ANOMALY,bstar:omm.BSTAR,periodMinutes:1440/omm.MEAN_MOTION,semiMajorKm:Math.cbrt(MU*(86400/(2*Math.PI*omm.MEAN_MOTION))**2)});
 }
 return {group:group.id,retrievedAt:payload.retrievedAt,stale:!!payload.stale,satellites};
}
export function elementAge(sat,epoch){return epoch-sat.epochMs;}
export function withinValidity(sat,epoch){return Math.abs(elementAge(sat,epoch))<=SATELLITE_VALID_MS;}

// Scene-base axes (from earthOrientation) back to the J2000 ecliptic vector
// convention the asteroid pipeline uses, so physicalPosition() applies unchanged.
const toEcliptic=s=>[s[0],-s[2],s[1]];
function earthFixedToEcliptic(ecf,orientation){
 const east=orientation.west.map(v=>-v),scene=[0,1,2].map(k=>ecf.x*orientation.prime[k]+ecf.y*east[k]+ecf.z*orientation.north[k]);
 return toEcliptic(scene);
}
// SGP4 gives TEME coordinates; rotating by GMST gives Earth-fixed coordinates,
// which are then placed with the same Earth orientation that turns the globe.
// Polar motion and the TEME/true-equator difference (well under 0.01°) are ignored.
export function satelliteState(sat,epoch,orientation=earthOrientation(epoch)){
 if(!withinValidity(sat,epoch))return null;
 const date=new Date(epoch);let pv;try{pv=propagate(sat.satrec,date);}catch{return null;}
 if(!pv||!pv.position||!pv.velocity||![pv.position.x,pv.position.y,pv.position.z].every(Number.isFinite))return null;
 const gmst=gstime(date),position=earthFixedToEcliptic(eciToEcf(pv.position,gmst),orientation),km=Math.hypot(...position);
 if(km<EARTH_EQUATORIAL_KM*.98)return null;
 const geo=eciToGeodetic(pv.position,gmst);
 return {position,km,altitudeKm:geo.height,latitude:degreesLat(geo.latitude),longitude:degreesLong(geo.longitude),speed:Math.hypot(pv.velocity.x,pv.velocity.y,pv.velocity.z)};
}
// Positions for many satellites at one epoch; Earth orientation is computed once.
export function satelliteField(satellites,epoch,radiusKm){
 const orientation=earthOrientation(epoch),inside=[];let valid=0,expired=0;
 for(const sat of satellites){if(!withinValidity(sat,epoch)){expired++;continue;}const state=satelliteState(sat,epoch,orientation);if(!state)continue;valid++;if(state.km<=radiusKm)inside.push({sat,state});}
 return {inside,valid,expired,total:satellites.length};
}
// One orbital period ahead, in the same inertial frame as the dots.
export function orbitPath(sat,epoch,steps=180){
 const points=[],period=sat.periodMinutes*60000;
 for(let i=0;i<=steps;i++){const t=epoch+period*i/steps;if(!withinValidity(sat,t))break;const s=satelliteState(sat,t);if(s)points.push(s);}
 return points;
}
// The sub-satellite path for one period ahead, drawn on the globe as it is
// oriented at the display epoch. Returns unit directions in scene-base axes.
export function groundTrack(sat,epoch,steps=240){
 const now=earthOrientation(epoch),points=[],period=sat.periodMinutes*60000;
 for(let i=0;i<=steps;i++){const t=epoch+period*i/steps;if(!withinValidity(sat,t))break;const s=satelliteState(sat,t,earthOrientation(t));if(s)points.push({latitude:s.latitude,longitude:s.longitude,direction:toEcliptic(surfaceDirection(now,s.latitude,s.longitude))});}
 return points;
}
export class SatelliteLoader {
 constructor({fetcher=fetch,onUpdate=()=>{}}={}){this.fetcher=(...a)=>fetcher(...a);this.onUpdate=onUpdate;this.groups=new Map();this.errors=new Map();this.loading=new Set();}
 ensure(groups){for(const group of groups){if(this.groups.has(group)||this.loading.has(group)||this.errors.has(group))continue;this.load(group);}}
 async load(group){
  this.loading.add(group);this.errors.delete(group);queueMicrotask(()=>this.onUpdate());
  try{const response=await this.fetcher('/api/satellites?group='+encodeURIComponent(group));const body=await response.json();if(!response.ok)throw Error(body.error??'Satellite data unavailable');this.groups.set(group,parseSatellites(body));}
  catch(e){this.errors.set(group,e.message||'Satellite data unavailable');}
  finally{this.loading.delete(group);this.onUpdate();}
 }
 retry(){const failed=[...this.errors.keys()];this.errors.clear();this.ensure(failed);}
 // A satellite can be listed in more than one group (GOES 14 is in weather and
 // geo); it is drawn once, under the first group in the requested order.
 satellites(groups){const seen=new Set();return groups.flatMap(g=>this.groups.get(g)?.satellites??[]).filter(s=>!seen.has(s.norad)&&seen.add(s.norad));}
 find(key){for(const {id} of SATELLITE_GROUPS){const sat=this.groups.get(id)?.satellites.find(s=>s.key===key);if(sat)return sat;}return null;}
}
