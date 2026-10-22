// Fixed screen scale: a square-root diameter scale preserves readable variation
// across metre-to-kilometre estimates without changing when filters change.
export function markerSize(row){
 const valid=Number.isFinite(row.min)&&Number.isFinite(row.max)&&row.min>0&&row.max>=row.min;
 if(!valid)return {known:false,diameter:null,pixels:9,sceneRadius:.045,label:'Diameter unknown'};
 const diameter=(row.min+row.max)/2;
 const pixels=Math.max(5,Math.min(30,4+.65*Math.sqrt(diameter)));
 return {known:true,diameter,pixels,sceneRadius:pixels*.005,label:`Estimated diameter ${Math.round(row.min).toLocaleString('en-US')}–${Math.round(row.max).toLocaleString('en-US')} m`};
}
