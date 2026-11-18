// Satellite photos found through Wikidata: the item whose NORAD catalog number
// (property P377) matches, and its image (P18) on Wikimedia Commons. Commons
// supplies the thumbnail, author and license shown with each image.
// Fixed destinations only; the NORAD number is the only input.
export const PHOTO_TTL=2592000000;
export const PHOTO_EMPTY_TTL=604800000;
const PHOTO_AGENT='Perigee-satellite-photos/1.4 (educational visualization)';
export function validNorad(value){return /^[1-9]\d{0,8}$/.test(String(value??''));}
export function photoQuery(norad){
 // Several items can share a number (the ISS and its first module, Zarya); the
 // one with the most Wikipedia articles is the spacecraft people know.
 return `SELECT ?item ?itemLabel ?img ?links WHERE { ?item wdt:P377 "${norad}" ; wdt:P18 ?img ; wikibase:sitelinks ?links . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?links) LIMIT 4`;
}
const plainText=s=>String(s??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function fileTitle(url){const m=/Special:FilePath\/(.+)$/.exec(String(url));return m?decodeURIComponent(m[1]):null;}
export function wikidataPhotos(sparql){
 const bindings=sparql?.results?.bindings;if(!Array.isArray(bindings))throw Error('Unexpected Wikidata response');
 const top=bindings[0]?.item?.value;if(!top)return {item:null,label:null,files:[]};
 const files=[...new Set(bindings.filter(b=>b.item?.value===top).map(b=>fileTitle(b.img?.value)).filter(Boolean))].slice(0,2);
 return {item:top.replace(/^http:/,'https:'),label:bindings[0].itemLabel?.value??null,files};
}
export function commonsImage(page,{item,label}){
 const info=page?.imageinfo?.[0],meta=info?.extmetadata??{};
 const src=info?.thumburl??info?.url;
 if(!src||!/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(src))return null;
 return {title:label??plainText(page.title).replace(/^File:/,''),src,source:info.descriptionurl,credit:plainText(meta.Artist?.value)||'Wikimedia Commons contributor',license:plainText(meta.LicenseShortName?.value),licenseUrl:meta.LicenseUrl?.value??null,date:plainText(meta.DateTimeOriginal?.value).slice(0,40),caption:plainText(meta.ImageDescription?.value).slice(0,300),item};
}
export function makeSatellitePhotoService({fetcher=fetch,now=Date.now,persistentCache=null}={}){
 const memory=new Map(),pending=new Map();
 const key=norad=>new Request('https://perigee-photo-cache.invalid/photo-v1/'+norad);
 const json=async url=>{const r=await fetcher(url,{headers:{'User-Agent':PHOTO_AGENT,Accept:'application/json'}});if(!r.ok)throw Error('Upstream HTTP '+r.status);return r.json();};
 return async norad=>{
  if(!validNorad(norad))throw Error('A NORAD catalog number is required.');
  const hit=memory.get(norad);if(hit&&now()<hit.expires)return hit.data;
  if(persistentCache){try{const stored=await persistentCache.match(key(norad));if(stored){const data=await stored.json();memory.set(norad,{data,expires:now()+3600000});return data;}}catch{}}
  if(pending.has(norad))return pending.get(norad);
  const task=(async()=>{
   const found=wikidataPhotos(await json('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(photoQuery(norad))));
   let images=[];
   if(found.files.length){
    const commons=await json('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=800&titles='+encodeURIComponent(found.files.map(f=>'File:'+f).join('|')));
    images=Object.values(commons?.query?.pages??{}).map(page=>commonsImage(page,found)).filter(Boolean);
   }
   const data={norad:Number(norad),source:'Wikidata P377 → P18 · Wikimedia Commons',retrievedAt:new Date(now()).toISOString(),images};
   const ttl=images.length?PHOTO_TTL:PHOTO_EMPTY_TTL;memory.set(norad,{data,expires:now()+Math.min(ttl,86400000)});
   if(memory.size>500)memory.delete(memory.keys().next().value);
   if(persistentCache){try{await persistentCache.put(key(norad),new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age='+ttl/1000}}));}catch{}}
   return data;
  })();
  const job=task.finally(()=>pending.delete(norad));pending.set(norad,job);return job;
 };
}
