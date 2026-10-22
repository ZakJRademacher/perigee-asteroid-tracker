import {Observer,ObserverVector,GeoVector,Rotation_EQJ_ECL,Rotation_ECL_EQD,AstroTime,Vector,RotateVector,SiderealTime} from './vendor/astronomy.js';

// Earth-fixed directions -> J2000 equatorial -> J2000 ecliptic -> renderer.
// SphereGeometry UVs: Greenwich = local +X, north = +Y, 90 E = -Z.
const rotation=Rotation_EQJ_ECL();
function sceneDirection(vector){
 const v=RotateVector(rotation,vector),length=Math.hypot(v.x,v.y,v.z);
 return [v.x/length,v.z/length,-v.y/length];
}
export function earthOrientation(epoch){
 if(!Number.isFinite(epoch))throw new RangeError('Earth orientation requires a finite UTC epoch');
 const date=new Date(epoch);
 if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1962||date.getUTCFullYear()>2099)throw new RangeError('Earth orientation supports 1962–2099');
 const prime=sceneDirection(ObserverVector(date,new Observer(0,0,0),false));
 const north=sceneDirection(ObserverVector(date,new Observer(90,0,0),false));
 const east=sceneDirection(ObserverVector(date,new Observer(0,90,0),false));
 return {epoch,prime,north,west:east.map(v=>-v),sun:sceneDirection(GeoVector('Sun',date,false)),siderealHours:SiderealTime(date)};
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
