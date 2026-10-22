export const LD_KM=384400;
export const AU_KM=149597870.7;
export function dateKey(date=new Date()){return date.toISOString().slice(0,10);}
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&dateKey(new Date(s+'T00:00:00Z'))===s;}
export function addDays(s,n){if(!validDate(s))throw Error('Choose a valid date.');return dateKey(new Date(Date.parse(s+'T00:00:00Z')+n*86400000));}
const num=x=>x===null||x===''||x===undefined?NaN:Number(x);
export function displayName(name){const text=String(name);return text.startsWith('(')&&text.endsWith(')')?text.slice(1,-1):text;}
export function normalizeFeed(feed){
 if(!feed||!feed.near_earth_objects||typeof feed.near_earth_objects!=='object'||Array.isArray(feed.near_earth_objects))throw Error('NASA returned an unexpected data format.');
 const rows=[],seen=new Set();let skipped=0;
 for(const group of Object.values(feed.near_earth_objects)){
  if(!Array.isArray(group))throw Error('NASA returned an unexpected group format.');
  for(const neo of group){for(const ca of neo.close_approach_data??[]){
   if(ca.orbiting_body!=='Earth')continue;
   const epoch=num(ca.epoch_date_close_approach),km=num(ca.miss_distance?.kilometers),speed=num(ca.relative_velocity?.kilometers_per_second);
   const min=num(neo.estimated_diameter?.meters?.estimated_diameter_min),max=num(neo.estimated_diameter?.meters?.estimated_diameter_max);
   if(!neo.id||!Number.isFinite(epoch)||!Number.isFinite(km)||km<0||!Number.isFinite(speed)||speed<0){skipped++;continue;}
   const key=String(neo.id)+'-'+epoch;if(seen.has(key))continue;seen.add(key);
   rows.push({key,id:String(neo.id),name:displayName(neo.name??neo.id),epoch,date:dateKey(new Date(epoch)),km,ld:km/LD_KM,speed,min:Number.isFinite(min)&&min>=0?min:null,max:Number.isFinite(max)&&max>=min?max:null,pha:neo.is_potentially_hazardous_asteroid===true,sentry:neo.is_sentry_object===true,absoluteMagnitude:Number.isFinite(num(neo.absolute_magnitude_h))?num(neo.absolute_magnitude_h):null});
  }}
 }
 rows.sort((a,b)=>a.epoch-b.epoch||a.key.localeCompare(b.key));return {rows,skipped};
}
export function filterRows(rows,{search='',pha=false,maxLd=200,minSize=0,day='',sort='date'}={}){
 const q=search.trim().toLowerCase();const result=rows.filter(r=>(!q||r.name.toLowerCase().includes(q)||r.id.includes(q))&&(!pha||r.pha)&&r.ld<=maxLd&&(!minSize||(r.max!==null&&r.max>=minSize))&&(!day||r.date===day));
 return result.sort((a,b)=>(sort==='distance'?a.km-b.km:sort==='speed'?b.speed-a.speed:sort==='size'?(b.max??-1)-(a.max??-1):a.epoch-b.epoch)||a.key.localeCompare(b.key));
}
export function summaries(rows){return {count:rows.length,closest:rows.length?rows.reduce((a,b)=>a.km<b.km?a:b):null,fastest:rows.length?Math.max(...rows.map(r=>r.speed)):null,pha:rows.filter(r=>r.pha).length};}
export function mapPosition(row,maxLd=200){let hash=0;for(const c of row.key)hash=(hash*31+c.charCodeAt(0))|0;const angle=(((hash>>>0)%360)+0.38)*Math.PI/180;const radius=0.23+0.72*Math.log1p(Math.min(row.ld,maxLd))/Math.log1p(maxLd);return {x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};}
export function csvExport(rows){const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';return [['NASA ID','Name','Close approach UTC','Miss distance km','Miss distance lunar distances','Relative velocity km/s','Estimated diameter min m','Estimated diameter max m','Potentially hazardous classification'],...rows.map(r=>[r.id,r.name,new Date(r.epoch).toISOString(),r.km,r.ld,r.speed,r.min,r.max,r.pha])].map(row=>row.map(cell).join(',')).join('\r\n');}
