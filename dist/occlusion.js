export const EARTH_RADIUS=.62;
export function sphereOccludes(camera,point,radius=EARTH_RADIUS){
 const v=point.map((n,i)=>n-camera[i]),a=v.reduce((s,n)=>s+n*n,0);
 const c=camera.reduce((s,n)=>s+n*n,0)-radius*radius;
 if(c<0)return true;
 if(!Number.isFinite(a)||a<=0)return false;
 const b=2*camera.reduce((s,n,i)=>s+n*v[i],0),discriminant=b*b-4*a*c;
 if(discriminant<0)return false;
 const t=(-b-Math.sqrt(discriminant))/(2*a);
 return t>=0&&t<1-1e-9;
}
