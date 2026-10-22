import {Observer,ObserverVector,HelioVector,GeoMoon,RotationAxis,Rotation_EQJ_ECL,Rotation_ECL_EQD,AstroTime,Vector,RotateVector,SiderealTime} from './vendor/astronomy.js';

// Earth-fixed directions -> J2000 equatorial -> J2000 ecliptic -> renderer.
// SphereGeometry UVs: Greenwich = local +X, north = +Y, 90 E = -Z.
const rotation=Rotation_EQJ_ECL();
function sceneDirection(vector){
 const v=RotateVector(rotation,vector),length=Math.hypot(v.x,v.y,v.z);
 return [v.x/length,v.z/length,-v.y/length];
}
export function moonState(epoch){
 if(!Number.isFinite(epoch)||new Date(epoch).getUTCFullYear()<1962||new Date(epoch).getUTCFullYear()>2099)throw new RangeError('Moon position supports 1962–2099');
 const date=new Date(epoch),raw=RotateVector(rotation,GeoMoon(date)),axis=RotationAxis('Moon',date),alpha=axis.ra*Math.PI/12,delta=axis.dec*Math.PI/180,spin=axis.spin*Math.PI/180;
 const node=[-Math.sin(alpha),Math.cos(alpha),0],tangent=[-Math.sin(delta)*Math.cos(alpha),-Math.sin(delta)*Math.sin(alpha),Math.cos(delta)];
 const prime=node.map((v,k)=>v*Math.cos(spin)+tangent[k]*Math.sin(spin)),west=node.map((v,k)=>v*Math.sin(spin)-tangent[k]*Math.cos(spin));
 const direction=v=>sceneDirection(new Vector(...v,new AstroTime(date)));
 return {epoch,positionKm:[raw.x,raw.z,-raw.y].map(v=>v*149597870.7),prime:direction(prime),north:sceneDirection(axis.north),west:direction(west)};
}
function osculatingGuide(r,v,mu){
 const cross=(x,y)=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],dot=(x,y)=>x.reduce((s,n,k)=>s+n*y[k],0),unit=x=>x.map(n=>n/Math.hypot(...x));
 const h=cross(r,v),vxh=cross(v,h),evec=vxh.map((n,k)=>n/mu-r[k]/Math.hypot(...r)),eccentricity=Math.hypot(...evec),x=unit(evec),y=unit(cross(unit(h),x)),p=dot(h,h)/mu,start=Math.atan2(dot(r,y),dot(r,x)),points=[];
 if(!(eccentricity>0&&eccentricity<1))throw new RangeError('Invalid reference orbit');
 for(let i=0;i<256;i++){const angle=start+i/256*Math.PI*2,distance=p/(1+eccentricity*Math.cos(angle));points.push(x.map((n,k)=>distance*(n*Math.cos(angle)+y[k]*Math.sin(angle))));}points.push([...points[0]]);return {points,eccentricity,semiMajorKm:p/(1-eccentricity**2)};
}
const lunarOrbitCache=new Map(),earthOrbitCache=new Map();
function cachedOrbit(epoch,cache,position,mu){
 const anchor=Math.floor(epoch/3600000)*3600000;if(cache.has(anchor))return cache.get(anchor);
 const r=position(anchor),before=Math.max(anchor-60000,Date.parse('1962-01-01T00:00:00Z')),after=Math.min(anchor+60000,Date.parse('2100-01-01T00:00:00Z')-1),a=position(before),b=position(after),v=b.map((n,k)=>(n-a[k])/((after-before)/1000)),guide={epoch:anchor,...osculatingGuide(r,v,mu)};
 cache.set(anchor,guide);if(cache.size>3)cache.delete(cache.keys().next().value);return guide;
}
export function moonOrbitGuide(epoch){return cachedOrbit(epoch,lunarOrbitCache,time=>moonState(time).positionKm,398600.435507+4902.800118);}
export function earthOrbitGuide(epoch){return cachedOrbit(epoch,earthOrbitCache,time=>earthOrientation(time).sunPositionKm.map(v=>-v),132712440041.279419+398600.435507);}
export function earthOrientation(epoch){
 if(!Number.isFinite(epoch))throw new RangeError('Earth orientation requires a finite UTC epoch');
 const date=new Date(epoch);
 if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1962||date.getUTCFullYear()>2099)throw new RangeError('Earth orientation supports 1962–2099');
 const prime=sceneDirection(ObserverVector(date,new Observer(0,0,0),false));
 const north=sceneDirection(ObserverVector(date,new Observer(90,0,0),false));
 const east=sceneDirection(ObserverVector(date,new Observer(0,90,0),false));
 const earth=RotateVector(rotation,HelioVector('Earth',date)),auKm=149597870.7;
 const sunPositionKm=[-earth.x*auKm,-earth.z*auKm,earth.y*auKm],distance=Math.hypot(...sunPositionKm);
 return {epoch,prime,north,west:east.map(v=>-v),sun:sunPositionKm.map(v=>v/distance),sunPositionKm,siderealHours:SiderealTime(date)};
}

export function surfaceDirection(state,latitude,longitude){
 const phi=latitude*Math.PI/180,lambda=longitude*Math.PI/180;
 return state.prime.map((v,k)=>Math.cos(phi)*(Math.cos(lambda)*v-Math.sin(lambda)*state.west[k])+Math.sin(phi)*state.north[k]);
}

export function equatorialFrame(epoch){
 const time=new AstroTime(new Date(epoch)),rotation=Rotation_ECL_EQD(time);
 return [[1,0,0],[0,1,0],[0,0,1]].map(([x,y,z])=>{
  const v=RotateVector(rotation,new Vector(x,-z,y,time));return [v.x,v.z,-v.y];
 });
}
export function frameVector(frame,vector){
 return [0,1,2].map(k=>frame[0][k]*vector[0]+frame[1][k]*vector[1]+frame[2][k]*vector[2]);
}
