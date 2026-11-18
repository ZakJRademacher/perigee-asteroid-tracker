import {CATALOG_DAYS,encounterRows,catalogCoverage} from './catalog.js';
import {fieldObjects,radiusField,clipTrack} from './field.js';
import {EARTH_RADIUS} from './occlusion.js';
import {earthOrientation,moonState} from './earth-orientation.js';
import {EphemerisLoader,interpolateState,physicalPosition,futureTrack} from './ephemeris.js';
import {reviewedImages,lookupImages,searchDesignation} from './media.js';
import {dateKey,addDays,validDate,normalizeFeed,filterRows,summaries,csvExport,AU_KM} from './model.js';
import {SATELLITE_GROUPS,DEFAULT_GROUPS,OPTIONAL_GROUPS,SatelliteLoader,satelliteField,satelliteState,orbitPath,elementAge} from './satellites.js';
import {satelliteImagesFor} from './satellite-media.js';
import {LD_KM,sizeComparison,distanceStory,speedStory,lightTime,heightStory,launchYear,orbitClass,orbitStory,inEarthShadow,satelliteRole} from './explain.js';

// ---------- helpers ----------
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const fmt=(n,d=1)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(n);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
const shortDate=s=>new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const utc=epoch=>new Date(epoch).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'UTC'});
const longDate=epoch=>new Date(epoch).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'UTC'})+' UTC';
const isoMinute=epoch=>new Date(epoch).toISOString().slice(0,16).replace('T',' ')+' UTC';
const latLon=(lat,lon)=>fmt(Math.abs(lat),1)+'° '+(lat>=0?'N':'S')+', '+fmt(Math.abs(lon),1)+'° '+(lon>=0?'E':'W');
const duration=minutes=>minutes<120?fmt(minutes,0)+' min':minutes<2880?fmt(minutes/60,1)+' hours':fmt(minutes/1440,1)+' days';
const store={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};

// ---------- state ----------
let candidates=[],fieldCandidates=[],rows=[],visible=[],selected=null,selectedBody=null,selectedSat=null;
let loadedStart='',loadedEnd='',day='',generation=0,lastRequest=0,activeController=null,provenance={};
let pendingFocus=null,playTimer=0,viewer=null,viewerError='',positionEpoch=Date.now(),positionWindow='',positionDays=CATALOG_DAYS,scaleKm=1,referenceEarthRadius=EARTH_RADIUS;
let detailTab=store.get('perigee-detail-tab')==='deep'?'deep':'glance',photoIndex=0;
let satelliteTracks={key:'',orbit:[]},satelliteLimit=60,lastFieldNear=false;
let motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
const photoState=new Map(),satellitePhotoState=new Map(),satelliteGroupFilter=new Set(SATELLITE_GROUPS.map(g=>g.id));
const ephemeris=new EphemerisLoader({batch:true,onUpdate:()=>{renderMap();refreshDetailBody();}});
const satellites=new SatelliteLoader({onUpdate:()=>{renderMap();renderSatelliteTable();if(selectedSat||!(selected||selectedBody))renderDetail();}});

// ---------- radius, layers ----------
const radiusInput=()=>document.querySelector('input[name="field-radius"]:checked');
const nearEarth=()=>!!radiusInput()?.dataset.km;
const radiusKm=()=>nearEarth()?Number(radiusInput().dataset.km):Number(radiusInput().value)*LD_KM;
const radiusLabel=()=>nearEarth()?fmt(radiusKm(),0)+' km':radiusInput().value+' LD';
const asteroidsOn=()=>$('#show-asteroids').checked,satellitesOn=()=>$('#show-satellites').checked;
// The catalog's group buttons choose which groups are drawn on the stage as well as listed.
const satelliteGroups=()=>[...DEFAULT_GROUPS,...($('#show-megaconstellations').checked?OPTIONAL_GROUPS:[])].filter(g=>satelliteGroupFilter.has(g));
const satelliteShown=key=>satellites.satellites(satelliteGroups()).some(s=>s.key===key);
const groupMeta=id=>SATELLITE_GROUPS.find(g=>g.id===id);
const filters=()=>({search:$('#search').value,pha:$('#pha-only').checked,maxLd:Number($('#max-distance').value),minSize:Number($('#min-size').value),day,sort:$('#sort').value});

function status(message,kind='live'){$('#feed-status').dataset.state=kind;$('#feed-status').innerHTML='<i></i>'+esc(message);}
let toastTimer=0;function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3800);}

// ---------- forecast ----------
function renderSummary(){
 const s=summaries(rows);
 $('#stat-count').textContent=s.count;
 $('#stat-closest').innerHTML=s.closest?fmt(s.closest.ld,2)+'<em>LD</em>':'—';
 $('#stat-close-name').textContent=s.closest?s.closest.name+' · '+distanceStory(s.closest.km).short:'No flybys in this window';
 $('#stat-speed').innerHTML=s.fastest!==null?fmt(s.fastest*3600,0)+'<em>km/h</em>':'—';
 $('#stat-pha').textContent=s.pha;
}
function dayCounts(){if(!loadedStart)return [];const base=filterRows(rows,{...filters(),day:''}),count=Math.round((Date.parse(loadedEnd)-Date.parse(loadedStart))/86400000)+1;const days=Array.from({length:count},(_,i)=>({date:addDays(loadedStart,i),count:0,pha:0}));for(const r of base){const d=days.find(x=>x.date===r.date);if(d){d.count++;if(r.pha)d.pha++;}}return days;}
function renderTimeline(){
 if(!loadedStart)return;const days=dayCounts(),max=Math.max(1,...days.map(d=>d.count)),today=dateKey();
 $('#timeline').innerHTML=days.map(d=>`<button type="button" class="day-button ${day===d.date?'active':''} ${d.date===today?'today':''}" data-day="${d.date}" aria-pressed="${day===d.date}" aria-label="${esc(shortDate(d.date))}: ${d.count} flybys"><span class="day-count">${d.count}</span><span class="day-bar" style="--height:${Math.max(3,d.count/max*100)}px"></span><span class="day-label">${esc(shortDate(d.date))}</span></button>`).join('');
 $('#timeline-heading').textContent=day?'Showing '+shortDate(day)+' only':'Flybys per day';
 renderScrubBars(days);
}
function renderScrubBars(days=dayCounts()){
 const max=Math.max(1,...days.map(d=>d.count)),nowDay=dateKey(new Date(positionEpoch));
 $('#scrub-bars').innerHTML=days.map(d=>`<i class="${d.pha?'pha':''} ${d.date<nowDay?'past':''}" style="height:${Math.max(2,d.count/max*24)}px"></i>`).join('');
 $('#scrub-start').textContent=loadedStart?shortDate(loadedStart):'—';$('#scrub-end').textContent=loadedEnd?shortDate(loadedEnd):'—';
}

// ---------- asteroid catalog ----------
function renderTable(){
 $('#result-count').textContent=visible.length;
 $('#asteroid-table').innerHTML=visible.map(r=>`<tr class="${selected===r.key?'selected-row':''}"><td><button type="button" class="object-button" data-object="${esc(r.key)}"><i class="mini ${r.pha?'pha':''}" aria-hidden="true"></i><span><b>${esc(r.name)}</b>${reviewedImages[r.id]?.length?'<span class="photo-flag" title="Reviewed imagery available">PHOTO</span>':''}<span class="sub">NASA ${esc(r.id)}</span></span></button></td><td>${esc(utc(r.epoch))}<span class="sub">${r.date.slice(0,4)}</span></td><td>${fmt(r.ld,2)}<span class="unit">LD</span><span class="sub">${fmt(r.km,0)} km</span></td><td>${r.min===null||r.max===null?'<span class="sub">Unknown</span>':fmt(r.min,0)+'–'+fmt(r.max,0)+'<span class="unit">m</span>'}</td><td>${fmt(r.speed,1)}<span class="unit">km/s</span></td><td>${r.pha?'<span class="tag amber">Watch-listed</span>':'<span class="tag">Not listed</span>'}</td></tr>`).join('');
 $('#table-empty').hidden=visible.length>0;
 $('#result-note').textContent=`${visible.length} of ${rows.length} flybys${day?' on '+shortDate(day):''} · the 3D stage also includes objects passing a week either side`;
 $('#download-btn').disabled=!visible.length;
}
function render(){
 visible=filterRows(rows,filters());fieldCandidates=filterRows(candidates,filters());
 if(selected&&!fieldCandidates.some(r=>r.key===selected))selected=null;
 $('#distance-output').textContent=$('#max-distance').value+' LD';$('#size-output').textContent=$('#min-size').value+' m';
 renderTimeline();renderTable();renderMap();renderDetail();
}

// ---------- satellite catalog ----------
const featured=new Set([25544,20580,48274,25867,36395,41866,100057,33053,38358]);
let altitudeCache={minute:-1,values:new Map()};
function satelliteAltitudes(list){
 const minute=Math.floor(positionEpoch/60000);if(altitudeCache.minute!==minute)altitudeCache={minute,values:new Map()};
 let orientation=null;
 for(const sat of list){if(altitudeCache.values.has(sat.norad))continue;orientation??=earthOrientation(positionEpoch);const s=satelliteState(sat,positionEpoch,orientation);altitudeCache.values.set(sat.norad,s?s.altitudeKm:null);}
 return altitudeCache.values;
}
function renderSatelliteTable(){
 const loaded=SATELLITE_GROUPS.filter(g=>satellites.groups.has(g.id));
 $('#satellite-groups').innerHTML=loaded.map(g=>`<button type="button" class="pill" data-group="${g.id}" aria-pressed="${satelliteGroupFilter.has(g.id)}" style="--group:${g.css}"><i></i>${esc(g.label)} <span>${satellites.groups.get(g.id).satellites.length}</span></button>`).join('');
 const groups=loaded.map(g=>g.id).filter(id=>satelliteGroupFilter.has(id));
 const q=$('#satellite-search').value.trim().toLowerCase(),sort=$('#satellite-sort').value;
 let list=satellites.satellites(groups).filter(s=>!q||s.name.toLowerCase().includes(q)||String(s.norad).includes(q));
 $('#satellite-count').textContent=satellites.satellites(loaded.map(g=>g.id)).length;
 if(sort==='altitude'){const alt=satelliteAltitudes(list);list.sort((a,b)=>(alt.get(a.norad)??Infinity)-(alt.get(b.norad)??Infinity));}
 else if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));
 else if(sort==='period')list.sort((a,b)=>a.periodMinutes-b.periodMinutes);
 else list.sort((a,b)=>Number(featured.has(b.norad))-Number(featured.has(a.norad))||SATELLITE_GROUPS.findIndex(g=>g.id===a.group)-SATELLITE_GROUPS.findIndex(g=>g.id===b.group)||a.name.localeCompare(b.name));
 const shown=list.slice(0,satelliteLimit),alt=satelliteAltitudes(shown);
 $('#satellite-table').innerHTML=shown.map(s=>{const g=groupMeta(s.group),h=alt.get(s.norad),year=launchYear(s.intl);return `<tr class="${selectedSat===s.key?'selected-row':''}"><td><button type="button" class="object-button" data-satellite="${esc(s.key)}"><i class="mini sat" style="--group:${g.css}" aria-hidden="true"></i><span><b>${esc(s.name)}</b><span class="sub">NORAD ${s.norad}</span></span></button></td><td><span class="tag group" style="--group:${g.css}">${esc(g.label)}</span></td><td>${h===null||h===undefined?'<span class="sub">Not shown now</span>':fmt(h,0)+'<span class="unit">km</span>'}</td><td>${duration(s.periodMinutes)}</td><td>${fmt(s.inclination,1)}°</td><td>${year??'—'}</td></tr>`;}).join('');
 $('#satellite-empty').hidden=shown.length>0||!satellites.groups.size;
 $('#satellite-more').hidden=list.length<=satelliteLimit;
 const failed=satellites.errors.size;
 $('#satellite-note').textContent=!satellites.groups.size?(failed?'CelesTrak orbit data is unavailable right now.':'Loading CelesTrak orbit data…'):`Showing ${shown.length} of ${list.length} satellites · the group buttons also choose what’s on the stage${failed?' · '+failed+' group'+(failed>1?'s':'')+' unavailable':''}${$('#show-megaconstellations').checked?'':' · tick “+ Starlink & OneWeb” on the stage to add about 10,500 more'}`;
}

// ---------- selection ----------
function selectedRow(){return fieldCandidates.find(r=>r.key===selected)??visible.find(r=>r.key===selected)??candidates.find(r=>r.key===selected);}
function clearSelection(){selected=null;selectedBody=null;selectedSat=null;}
function refreshAll(){renderMap();renderTable();renderSatelliteTable();renderDetail();}
function selectAsteroid(key,{toggle=true}={}){const same=selected===key;clearSelection();selected=toggle&&same?null:key;photoIndex=0;if(selected&&!asteroidsOn())$('#show-asteroids').checked=true;refreshAll();}
function selectBody(name){const same=selectedBody===name;clearSelection();selectedBody=same?null:name;photoIndex=0;refreshAll();}
function selectSatellite(key,{toggle=true}={}){if(!key)return;const same=selectedSat===key;clearSelection();selectedSat=toggle&&same?null:key;photoIndex=0;if(selectedSat&&!satellitesOn())$('#show-satellites').checked=true;refreshAll();}
function scrollToStage(){const rect=$('#stage').getBoundingClientRect();if(rect.top<-80)$('#stage').scrollIntoView({behavior:motion?'smooth':'auto',block:'start'});}
function focusSelection(){scrollToStage();if(!viewer||viewer.focus(selected))return;const row=selectedRow();if(row&&!ephemeris.data.has(row.id)&&!ephemeris.errors.has(row.id))pendingFocus=selected;else toast('This asteroid is outside the viewing distance right now. Its details are in the panel.');}
function focusSatellite(){scrollToStage();if(viewer&&!viewer.focusSatellite())toast('This satellite isn’t shown at this time. Its details are in the panel.');}

// ---------- detail drawer ----------
function drawerShell({kind,kindColor,name,tagline,media}){
 return `<div class="drawer-inner"><div class="drawer-top"><span class="kind" style="--kind:${kindColor}">${esc(kind)}</span><button type="button" class="close" id="close-details" aria-label="Close details">✕</button></div><h2>${esc(name)}</h2><p class="tagline">${tagline}</p><div id="detail-media">${media}</div><div class="tabs detail-tabs" role="tablist" aria-label="Detail level"><button type="button" role="tab" id="detail-tab-glance" data-detail-tab="glance" aria-selected="${detailTab==='glance'}" aria-controls="detail-body" tabindex="${detailTab==='glance'?0:-1}">At a glance</button><button type="button" role="tab" id="detail-tab-deep" data-detail-tab="deep" aria-selected="${detailTab==='deep'}" aria-controls="detail-body" tabindex="${detailTab==='deep'?0:-1}">Deep dive</button></div><div id="detail-body" role="tabpanel" aria-labelledby="detail-tab-${detailTab}"></div></div>`;
}
const fact=(label,value,text,cls='')=>`<div class="fact ${cls}"><span>${esc(label)}</span><strong>${value}</strong>${text?`<p>${text}</p>`:''}</div>`;
const rowsDl=items=>`<dl>${items.filter(Boolean).map(([k,v,note])=>`<dt>${esc(k)}</dt><dd>${v}${note?`<small>${esc(note)}</small>`:''}</dd>`).join('')}</dl>`;
function badgeFor(img){if(img.candidate)return img.illustrative?'Archive illustration · unverified':'Archive match · unverified';if(img.commons)return 'Wikimedia Commons'+(img.license?' · '+img.license:'');return img.family?img.type+' · same spacecraft type':img.type;}
function photoMarkup(images,{empty,art='art'}){
 if(!images.length)return `<div class="no-photo"><div class="${art}" aria-hidden="true"></div><span>${esc(empty)}</span></div>`;
 const i=Math.min(photoIndex,images.length-1),img=images[i],text=img.candidate?img.description:img.caption;
 return `<figure class="photo"><a href="${esc(img.source)}" target="_blank" rel="noopener noreferrer"><img src="${esc(img.src)}" alt="${esc(img.title)}" loading="lazy" referrerpolicy="no-referrer"></a><span class="badge ${img.family?'family':''} ${img.candidate?'unverified':''}">${esc(badgeFor(img))}</span>${images.length>1?`<div class="photo-nav"><button type="button" data-photo-step="-1" aria-label="Previous image">‹</button><button type="button" data-photo-step="1" aria-label="Next image">›</button></div>`:''}<figcaption><strong>${esc(img.title)}</strong>${text?esc(text)+'<br>':''}${esc(img.credit)}${img.date?' · '+esc(img.date):''}${images.length>1?` · ${i+1} of ${images.length}`:''}</figcaption></figure>`;
}
function asteroidImages(r){return [...(reviewedImages[r.id]??[]),...((photoState.get(r.id)?.candidates)??[]).map(c=>({...c,candidate:true}))];}
// Wikidata first; the small reviewed NASA list only fills in where Wikidata has nothing.
function satelliteImages(sat){const found=((satellitePhotoState.get(sat.norad)?.images)??[]).map(i=>({...i,commons:true}));return found.length?found:satelliteImagesFor(sat.norad);}
function currentImages(){if(selectedSat){const sat=satellites.find(selectedSat);return sat?satelliteImages(sat):[];}const r=selectedRow();return r?asteroidImages(r):[];}
function emptyDrawer(){
 const s=summaries(rows),iss=satellites.find('sat:25544'),hubble=satellites.find('sat:20580'),hazard=rows.filter(r=>r.pha).sort((a,b)=>a.km-b.km)[0];
 const picks=[
  s.closest&&`<button type="button" class="pick asteroid" data-pick-asteroid="${esc(s.closest.key)}"><i>☄</i><span><b>${esc(s.closest.name)}</b><small>Closest flyby this month · ${esc(distanceStory(s.closest.km).short)}</small></span></button>`,
  iss&&`<button type="button" class="pick" data-pick-satellite="sat:25544"><i>✦</i><span><b>International Space Station</b><small>A home in orbit, about 400 km up</small></span></button>`,
  hubble&&`<button type="button" class="pick" data-pick-satellite="sat:20580"><i>◎</i><span><b>Hubble Space Telescope</b><small>Looking out at the universe since 1990</small></span></button>`,
  hazard&&hazard.key!==s.closest?.key&&`<button type="button" class="pick amber" data-pick-asteroid="${esc(hazard.key)}"><i>!</i><span><b>${esc(hazard.name)}</b><small>Closest watch-listed flyby · ${esc(distanceStory(hazard.km).short)}</small></span></button>`,
  `<button type="button" class="pick" data-pick-body="Moon"><i>☾</i><span><b>The Moon</b><small>Our nearest neighbor, for scale</small></span></button>`
 ].filter(Boolean).join('');
 return `<div class="drawer-inner empty-drawer"><p class="eyebrow">Meet the neighbors</p><h2>Tap a dot to say hello.</h2><p>Every dot on the stage is a real asteroid or satellite, placed where published predictions say it is.</p><div class="picks">${picks}</div><ul class="tips"><li>Drag the time bar or press play to watch a month unfold.</li><li>Pick a satellite distance on the left to zoom in on the satellites around Earth.</li><li>Each object has an “At a glance” view and a “Deep dive”.</li></ul></div>`;
}
function renderDetail(){
 const panel=$('#detail-panel');
 if(selectedSat&&!satellites.find(selectedSat))selectedSat=null;
 if(selectedSat){const sat=satellites.find(selectedSat),g=groupMeta(sat.group);
  panel.innerHTML=drawerShell({kind:'Satellite · '+g.label,kindColor:g.css,name:sat.name,tagline:esc(satelliteRole(sat.name,sat.group)),media:photoMarkup(satelliteImages(sat),{empty:satellitePhotoState.get(sat.norad)?.loading?'Looking for a photo…':'No photo of this satellite in Wikidata yet.',art:'art sat'})});
  lookupSatellitePhotos(sat);
 }else if(selectedBody){const moon=selectedBody==='Moon';
  panel.innerHTML=drawerShell({kind:moon?'Moon':'Star',kindColor:moon?'#c9d2da':'#ffcf6b',name:moon?'The Moon':'The Sun',tagline:moon?'Earth’s only natural satellite, and the yardstick this app uses for distance.':'Our star. It lights every scene from its real direction.',media:moon?`<figure class="photo"><img src="assets/moon-color.jpg" alt="Global lunar color map from the NASA CGI Moon Kit"><span class="badge">Global map</span><figcaption><strong>Lunar surface color map</strong>NASA’s Scientific Visualization Studio / LRO, Ernie Wright, 2019. Mapped onto the 3D Moon; not a live photograph.</figcaption></figure>`:photoMarkup([],{empty:'The Sun is drawn as a glowing reference sphere.',art:'art sun'})});
 }else{const r=selectedRow();
  if(!r){panel.innerHTML=emptyDrawer();return;}
  const size=sizeComparison(r.min,r.max);
  panel.innerHTML=drawerShell({kind:r.pha?'Asteroid · watch-listed':'Asteroid',kindColor:r.pha?'var(--amber)':'var(--mint)',name:r.name,tagline:`A space rock ${size?esc(size.text):'of unknown size'}, passing Earth on <b>${esc(longDate(r.epoch))}</b>.`,media:photoMarkup(asteroidImages(r),{empty:'No confirmed image of this asteroid. The shape above is an illustration.'})});
  lookupMedia(r);
 }
 refreshDetailBody();
}
function lookupMedia(r){if(photoState.has(r.id))return;photoState.set(r.id,{loading:true,candidates:[]});lookupImages(r).then(result=>{photoState.set(r.id,result);if(selectedRow()?.id===r.id&&!selectedSat&&!selectedBody)renderDetail();}).catch(()=>photoState.set(r.id,{error:true,candidates:[]}));}
// Satellite photos come from Wikidata (NORAD number → Commons image) via the Worker.
function lookupSatellitePhotos(sat){
 if(satellitePhotoState.has(sat.norad))return;satellitePhotoState.set(sat.norad,{loading:true,images:[]});
 fetch('/api/satellite-photos?norad='+sat.norad).then(r=>r.ok?r.json():Promise.reject()).then(body=>{satellitePhotoState.set(sat.norad,{images:Array.isArray(body.images)?body.images:[]});}).catch(()=>{satellitePhotoState.set(sat.norad,{error:true,images:[]});}).finally(()=>{if(selectedSat===sat.key)renderDetail();});
}
function refreshDetailBody(){
 const body=$('#detail-body');if(!body)return;let html='';
 if(selectedSat){const sat=satellites.find(selectedSat);if(sat)html=detailTab==='deep'?satelliteDeep(sat):satelliteGlance(sat);}
 else if(selectedBody)html=detailTab==='deep'?bodyDeep(selectedBody):bodyGlance(selectedBody);
 else{const r=selectedRow();if(r)html=detailTab==='deep'?asteroidDeep(r):asteroidGlance(r);}
 body.innerHTML=html;
}

// Asteroid: At a glance / Deep dive
function asteroidNow(r){const data=ephemeris.data.get(r.id),state=interpolateState(data,positionEpoch),later=interpolateState(data,positionEpoch+600000);return {data,state,rate:state&&later?(later.km-state.km)/600:null};}
function asteroidGlance(r){
 const size=sizeComparison(r.min,r.max),dist=distanceStory(r.km),speed=speedStory(r.speed),{state,rate}=asteroidNow(r),error=ephemeris.errors.get(r.id);
 const now=state?fact('Right now',fmt(state.km/LD_KM,2)+'<em>LD away</em>',`${rate!==null&&rate<0?'Getting closer':'Moving away'}${rate!==null?' at '+fmt(Math.abs(rate),1)+' km/s':''}. Its light takes ${lightTime(state.km)} to reach us.`):fact('Right now','—',error?esc(error):'Position still loading from JPL…');
 return `<div class="facts">${fact('Closest approach',esc(dist.short),`${esc(cap(dist.text))}: ${fmt(r.km,0)} km, on ${esc(longDate(r.epoch))}.`,'wide')}${fact('Size',r.min===null?'Unknown':fmt(r.min,0)+'–'+fmt(r.max,0)+'<em>m</em>',size?'Roughly '+esc(size.thing)+'.':'NASA has no size estimate for this one.')}${fact('Speed',fmt(speed.kmh,0)+'<em>km/h</em>',esc(cap(speed.text))+'.')}${now}${fact('Should we worry?',r.pha?'Watch-listed':'Not listed',r.pha?'NASA keeps a closer eye on it because it’s large and its orbit comes near Earth’s. That’s a label for monitoring, not a prediction that it will hit us.':'NASA doesn’t classify it as potentially hazardous.',r.pha?'tone-amber':'tone-mint')}${r.sentry?fact('Impact monitoring','On the Sentry list','JPL’s Sentry system tracks it because a future impact can’t yet be fully ruled out. Most such objects are later removed.','wide tone-amber'):''}</div>`;
}
function asteroidDeep(r){
 const {data,state,rate}=asteroidNow(r),inside=state&&state.km<=radiusKm();
 return `<div class="deep"><h3>Identity</h3>${rowsDl([['Name',esc(r.name)],['NASA / JPL ID',esc(r.id)],r.absoluteMagnitude!==null&&r.absoluteMagnitude!==undefined&&['Absolute magnitude (H)',fmt(r.absoluteMagnitude,2),'Brightness at a standard distance; lower means bigger'],['Hazard classification',r.pha?'Potentially hazardous asteroid':'Not a PHA','PHA: H ≤ 22 and Earth MOID ≤ 0.05 au'],['Sentry impact monitoring',r.sentry?'Listed':'Not listed']])}
<h3>Close approach</h3>${rowsDl([['Time',esc(isoMinute(r.epoch))],['Miss distance',fmt(r.km,0)+' km',fmt(r.ld,3)+' LD · '+fmt(r.km/AU_KM,5)+' au, center to center'],['Relative speed',fmt(r.speed,3)+' km/s',fmt(r.speed*3600,0)+' km/h relative to Earth'],['Estimated diameter',r.min===null?'Unknown':fmt(r.min,1)+' – '+fmt(r.max,1)+' m','From H with an assumed albedo range'],(r.date<loadedStart||r.date>loadedEnd)&&['Window','Seven-day buffer','Approach falls just outside the 30-day timeline']])}
<h3>Position at ${esc(isoMinute(positionEpoch))}</h3>${state?rowsDl([['Earth-center distance',fmt(state.km,0)+' km',fmt(state.km/LD_KM,4)+' LD'],rate!==null&&['Range rate',(rate>0?'+':'')+fmt(rate,3)+' km/s',rate<0?'Approaching':'Receding'],['J2000 ecliptic X / Y / Z',state.position.map(n=>fmt(n,0)).join(' / ')+' km'],['Viewing sphere',inside?'Inside':'Outside',radiusLabel()],['Source','JPL Horizons vectors','Retrieved '+String(data.retrievedAt).slice(0,16).replace('T',' ')+' UTC; hourly samples, cubic Hermite interpolation']]):`<p>${esc(ephemeris.errors.get(r.id)??'Loading JPL Horizons vectors. No position is invented while it loads.')}</p>`}
<h3>Path</h3><p>${$('#show-path').checked?'The line on the stage is its predicted next 30 days relative to Earth, clipped to the viewing sphere. It is a flyby track, not an orbit around Earth, and carries no uncertainty envelope.':'Paths are turned off.'}</p>
<div class="links"><a href="https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(r.id)}" target="_blank" rel="noopener noreferrer">JPL small-body record ↗</a><a href="https://images.nasa.gov/search?q=${encodeURIComponent(searchDesignation(r))}&media=image" target="_blank" rel="noopener noreferrer">Search NASA images ↗</a></div>
<p class="foot-note">${esc(photoNote(r))}</p></div>`;
}
function photoNote(r){const s=photoState.get(r.id);if(reviewedImages[r.id]?.length)return 'The first image is from a reviewed list with confirmed identity. Archive matches after it are unverified.';if(!s||s.loading)return 'Checking NASA’s image archive…';if(s.error)return 'NASA’s image search is unavailable right now.';return s.candidates.length?s.candidates.length+' archive match'+(s.candidates.length>1?'es':'')+' found; verify captions before treating one as this asteroid.':'No exact-designation matches in NASA’s image library. That doesn’t mean none exists elsewhere.';}

// Satellite: At a glance / Deep dive
function satelliteNow(sat){const state=satelliteState(sat,positionEpoch);if(!state)return {state:null};const sun=earthOrientation(positionEpoch).sunPositionKm;return {state,shadow:inEarthShadow(state.position,[sun[0],-sun[2],sun[1]])};}
function satelliteGlance(sat){
 const {state,shadow}=satelliteNow(sat),orbit=orbitClass(sat),year=launchYear(sat.intl),ageDays=elementAge(sat,positionEpoch)/86400000;
 if(!state)return `<div class="facts">${fact('Not shown at this time','—',`The orbit data for this satellite is from ${fmt(Math.abs(ageDays),1)} days ${ageDays>0?'before':'after'} the time on the stage. Perigee only uses it within 7 days, so press <b>Now</b> to see it.`,'wide tone-amber')}${fact('One lap',duration(sat.periodMinutes),esc(orbitStory(sat.periodMinutes)),'wide')}</div>`;
 const speed=speedStory(state.speed),height=heightStory(state.altitudeKm);
 return `<div class="facts">${fact('Height now',fmt(state.altitudeKm,0)+'<em>km</em>',esc(cap(height.text))+'.')}${fact('Speed',fmt(speed.kmh,0)+'<em>km/h</em>',esc(cap(speed.text))+'.')}${fact('One lap',duration(sat.periodMinutes),esc(orbitStory(sat.periodMinutes)))}${fact('Right now over',latLon(state.latitude,state.longitude),shadow?'In Earth’s shadow: it’s night up there too.':'In sunlight.')}${fact(orbit.label,orbit.code,esc(orbit.text),'wide')}${year?fact('In space since',String(year),'About '+fmt(new Date(positionEpoch).getUTCFullYear()-year,0)+' years in orbit.'):''}${fact('How sure is this?',fmt(Math.abs(ageDays),1)+'<em>days</em>','Time between the orbit data and the moment shown. Predictions drift by kilometres a day, so this is a good guide, not live tracking.')}</div>`;
}
function satelliteDeep(sat){
 const {state,shadow}=satelliteNow(sat),orbit=orbitClass(sat),data=satellites.groups.get(sat.group),perigee=sat.semiMajorKm*(1-sat.eccentricity)-6378.137,apogee=sat.semiMajorKm*(1+sat.eccentricity)-6378.137,age=elementAge(sat,positionEpoch)/86400000;
 return `<div class="deep"><h3>Identity</h3>${rowsDl([['Name',esc(sat.name)],['NORAD catalog number',String(sat.norad)],sat.intl&&['International designator',esc(sat.intl),'Launch year and launch number'],['CelesTrak group',esc(groupMeta(sat.group).label)],['Orbit class',orbit.code+' · '+esc(orbit.label)]])}
<h3>Orbital elements</h3>${rowsDl([['Element epoch',esc(isoMinute(sat.epochMs)),(age>=0?fmt(age,2)+' days before':fmt(-age,2)+' days after')+' the time shown'],['Mean motion',fmt(sat.meanMotion,6)+' rev/day'],['Period',fmt(sat.periodMinutes,2)+' min'],['Inclination',fmt(sat.inclination,4)+'°'],['Eccentricity',fmt(sat.eccentricity,7)],['RA of ascending node',fmt(sat.raan,4)+'°'],['Argument of perigee',fmt(sat.argPerigee,4)+'°'],['Mean anomaly',fmt(sat.meanAnomaly,4)+'°'],['BSTAR drag term',Number(sat.bstar).toExponential(4)+' per Earth radius'],['Semi-major axis',fmt(sat.semiMajorKm,1)+' km'],['Perigee / apogee',fmt(perigee,0)+' / '+fmt(apogee,0)+' km','Altitude above the 6,378 km equatorial radius']])}
<h3>Position at ${esc(isoMinute(positionEpoch))}</h3>${state?rowsDl([['Altitude',fmt(state.altitudeKm,1)+' km','Geodetic height'],['Sub-satellite point',latLon(state.latitude,state.longitude)],['Earth-center distance',fmt(state.km,0)+' km'],['Inertial speed',fmt(state.speed,3)+' km/s'],['J2000 ecliptic X / Y / Z',state.position.map(n=>fmt(n,0)).join(' / ')+' km'],['Lighting',shadow?'Earth’s shadow':'Sunlit','Cylindrical shadow model'],['Viewing sphere',state.km<=radiusKm()?'Inside':'Outside',radiusLabel()]]):`<p>Not computed: the time shown is more than 7 days from the element epoch, so no position is extrapolated.</p>`}
<h3>Source and model</h3><p>CelesTrak general-perturbations elements${data?', retrieved '+esc(String(data.retrievedAt).slice(0,16).replace('T',' '))+' UTC':''}${data?.stale?' ('+fmt((Date.now()-Date.parse(data.retrievedAt))/3600000,1)+' hours ago)':''}, propagated in this browser with SGP4 and placed with the same Earth rotation that turns the globe. ${$('#show-path').checked?'The line shows one orbit ahead.':'Paths are turned off.'} Photos are found through the satellite’s NORAD number on Wikidata and served from Wikimedia Commons with their own licenses.</p>
<div class="links"><a href="https://celestrak.org/satcat/records.php?CATNR=${sat.norad}" target="_blank" rel="noopener noreferrer">CelesTrak catalog record ↗</a><a href="https://celestrak.org/NORAD/elements/gp.php?CATNR=${sat.norad}&FORMAT=json-pretty" target="_blank" rel="noopener noreferrer">Raw orbit data ↗</a>${satellitePhotoState.get(sat.norad)?.images?.[0]?.item?`<a href="${esc(satellitePhotoState.get(sat.norad).images[0].item)}" target="_blank" rel="noopener noreferrer">Wikidata entry ↗</a>`:''}</div></div>`;
}

// Moon and Sun
function bodyState(name){try{const moon=name==='Moon',position=moon?moonState(positionEpoch).positionKm:earthOrientation(positionEpoch).sunPositionKm;return {moon,position,km:Math.hypot(...position)};}catch{return null;}}
function bodyGlance(name){
 const s=bodyState(name);if(!s)return '<p>Model unavailable for this date.</p>';
 return s.moon?`<div class="facts">${fact('Distance now',fmt(s.km,0)+'<em>km</em>',`That’s ${fmt(s.km/LD_KM,3)} of an average lunar distance. Moonlight takes ${lightTime(s.km)} to reach us.`,'wide')}${fact('Size','3,475<em>km</em>','About a quarter as wide as Earth.')}${fact('One orbit','27.3<em>days</em>','It keeps the same face turned toward us.')}${fact('Scale bar','1 LD','Asteroid distances here are measured in Moon distances.','wide tone-mint')}</div>`
 :`<div class="facts">${fact('Distance now',fmt(s.km/AU_KM,3)+'<em>au</em>',fmt(s.km/1e6,1)+' million km. Sunlight takes '+lightTime(s.km)+' to get here.','wide')}${fact('Size','109<em>Earths</em>','Across its face.')}${fact('In this scene','Light source','It lights Earth, the Moon and every model from its real direction.')}</div>`;
}
function bodyDeep(name){
 const s=bodyState(name);if(!s)return '<p>Model unavailable for this date.</p>';const radius=s.moon?1737.4:695700;
 return `<div class="deep"><h3>Position at ${esc(isoMinute(positionEpoch))}</h3>${rowsDl([['Earth-center distance',fmt(s.km,0)+' km',fmt(s.km/LD_KM,3)+' LD · '+fmt(s.km/AU_KM,5)+' au'],['J2000 ecliptic X / Y / Z',s.position.map(n=>fmt(n,0)).join(' / ')+' km'],['Mean radius',fmt(radius,1)+' km','Drawn to the same scale as every distance']])}<h3>Model</h3><p>Astronomy Engine geometric ${s.moon?'Moon position and IAU rotation model; the blue line is an instantaneous two-body reference ellipse, while the true orbit evolves':'Sun position; the glow is illustrative'}.</p><div class="links"><a href="https://science.nasa.gov/${s.moon?'moon':'sun'}/facts/" target="_blank" rel="noopener noreferrer">NASA ${s.moon?'Moon':'Sun'} facts ↗</a>${s.moon?'<a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noopener noreferrer">Lunar imagery source ↗</a>':''}</div></div>`;
}

// ---------- stage ----------
function renderHeadline(asteroidCount,satelliteCount){
 const parts=[];
 if(asteroidsOn())parts.push(`<b>${asteroidCount}</b> asteroid${asteroidCount===1?'':'s'} within ${nearEarth()?fmt(radiusKm(),0)+' km':radiusInput().value+' Moon distances'}`);
 if(satellitesOn())parts.push(`<b>${fmt(satelliteCount,0)}</b> satellites around Earth`);
 $('#stage-headline').innerHTML=parts.length?parts.join(' and '):'Turn on a layer to fill the sky';
 $('#position-epoch-label').textContent=($('#live-clock').checked?'Live · ':'Viewing · ')+longDate(positionEpoch);
}
function renderMap(){
 if(!positionWindow)return;
 const shown=asteroidsOn()?fieldObjects(fieldCandidates,positionEpoch,selected):[],near=nearEarth(),fieldKm=radiusKm(),radiusLd=fieldKm/LD_KM,label=radiusLabel();
 if(viewer)ephemeris.ensure(shown,selected);else ephemeris.ensure(shown.filter(r=>r.key===selected),selected);
 const field=radiusField(shown,ephemeris.data,positionEpoch,radiusLd);scaleKm=field.scale;referenceEarthRadius=6371/scaleKm;
 const positioned=field.inside.map(({state,...row})=>({...row,scenePosition:physicalPosition(state.position,scaleKm),positionKm:state.km}));
 const chosen=selectedRow(),vectors=chosen&&ephemeris.data.get(chosen.id),track=vectors&&asteroidsOn()&&$('#show-path').checked?futureTrack(vectors,positionEpoch):[];
 const path=clipTrack(track,fieldKm).map(v=>physicalPosition(v,scaleKm));
 const sats={points:[],selected:null,orbit:[],ground:[]};let satField=null;
 $('#space-map').dataset.field=near?'near':'deep';$('#space-map').dataset.satellites=satellitesOn()?'on':'off';
 for(const item of document.querySelectorAll('[data-legend-group]'))item.hidden=!item.dataset.legendGroup.split(' ').some(g=>satelliteGroups().includes(g));
 if(satellitesOn()){
  const groups=satelliteGroups();satellites.ensure(groups);satField=satelliteField(satellites.satellites(groups),positionEpoch,fieldKm);
  sats.points=satField.inside.map(({sat,state})=>({key:sat.key,color:groupMeta(sat.group).color,scenePosition:physicalPosition(state.position,scaleKm)}));
  const pick=selectedSat&&satellites.find(selectedSat),state=pick&&satelliteState(pick,positionEpoch);
  if(pick&&state){const g=groupMeta(pick.group);sats.selected={key:pick.key,color:g.color,css:g.css,label:pick.name+' · '+fmt(state.altitudeKm,0)+' km up',scenePosition:physicalPosition(state.position,scaleKm)};
   if($('#show-path').checked){const key=pick.key+'|'+Math.floor(positionEpoch/30000);if(satelliteTracks.key!==key)satelliteTracks={key,orbit:orbitPath(pick,positionEpoch)};sats.orbit=clipTrack(satelliteTracks.orbit,fieldKm).map(v=>physicalPosition(v,scaleKm));}}
  const loading=satellites.loading.size,failed=satellites.errors.size,retrieved=groups.map(g=>satellites.groups.get(g)?.retrievedAt).filter(Boolean).sort()[0];
  $('#satellite-status').textContent=`${fmt(sats.points.length,0)} satellites${near?' inside '+label:''}${satField.expired?' · '+satField.expired+' with orbit data over 7 days old':''}${loading?' · loading CelesTrak…':''}${failed?' · '+failed+' group'+(failed>1?'s':'')+' unavailable':''}${retrieved?' · orbits from '+utc(Date.parse(retrieved))+' UTC':''}`;
 }else $('#satellite-status').textContent='';
 if(viewer){viewer.update(positioned,selected,radiusLd,path,positionEpoch,referenceEarthRadius,selectedBody,sats);if(pendingFocus){if(pendingFocus!==selected)pendingFocus=null;else if(viewer.focus(pendingFocus))pendingFocus=null;else if(ephemeris.data.has(selectedRow()?.id)||ephemeris.errors.has(selectedRow()?.id))pendingFocus=null;}}
 const failed=shown.filter(r=>ephemeris.errors.has(r.id)).length;
 $('#retry-positions').hidden=!(failed||(ephemeris.paused&&!ephemeris.resumeTimer)||(satField&&satellites.errors.size));
 $('#ephemeris-status').textContent=!asteroidsOn()?'':near?`${positioned.length} asteroid${positioned.length===1?'':'s'} this close · asteroids pass much farther out; pick Near, Middle or Far to see them`:`${positioned.length} asteroid${positioned.length===1?'':'s'} inside ${label} · ${field.loaded}/${shown.length} positioned${failed?' · '+failed+' unavailable':''}${ephemeris.paused?(ephemeris.resumeTimer?' · JPL busy, retrying':' · JPL paused'):ephemeris.running?' · loading':''}`;
 $('#linear-scale').textContent=`One scene unit = ${near?fmt(scaleKm,0)+' km':fmt(scaleKm/LD_KM,2)+' LD'} · Earth, Moon and Sun to scale${satellitesOn()&&!near?' · zoom toward Earth to separate satellites':''}`;
 const root=$('#viewer3d-root');root.dataset.fieldCount=String(positioned.length);root.dataset.fieldRadiusLd=String(radiusLd);root.dataset.positionedCandidates=String(field.loaded);root.dataset.candidateCount=String(shown.length);
 $('#map-empty').hidden=!!viewer&&(positioned.length>0||sats.points.length>0);
 $('#map-empty').textContent=!viewer&&viewerError?viewerError:!asteroidsOn()&&!satellitesOn()?'Both layers are off. Turn on Asteroids or Satellites.':near&&satellitesOn()?(satField?.total?(satField.expired===satField.total?'Satellite orbit data is only used within 7 days of its date. Press Now to see satellites.':'No satellites inside '+label+' at this time.'):satellites.errors.size?'CelesTrak orbit data is unavailable. Use Retry or try again later.':'Loading CelesTrak orbit data…'):shown.length?(ephemeris.paused?(ephemeris.resumeTimer?'JPL is busy. Positions will resume loading automatically.':'JPL positions unavailable. Use Retry or try again later.'):ephemeris.running||ephemeris.pending.length?'Loading NASA/JPL positions…':field.loaded?`No asteroids inside ${label} at this time. Pick a wider distance or move the time bar.`:'Positions unavailable for these asteroids; use Retry or try again later.'):'No flybys match these filters.';
 renderHeadline(positioned.length,sats.points.length);
}

// ---------- data loading ----------
function adopt(feed,meta){
 const sameWindow=meta.start===loadedStart&&meta.end===loadedEnd,days=Math.round((Date.parse(meta.end)-Date.parse(meta.start))/86400000)+1;if(days<1||days>CATALOG_DAYS)throw Error('Invalid catalog coverage');
 const data=encounterRows(feed,meta.start,days);rows=data.rows;candidates=normalizeFeed(feed).rows.filter(r=>r.date>=(meta.candidateStart??meta.start)&&r.date<=(meta.candidateEnd??meta.end));
 loadedStart=meta.start;loadedEnd=meta.end;provenance={...meta,skipped:data.skipped};if(!sameWindow){day='';selected=null;if(playTimer)setPlaying(false);}
 positionDays=days;$('#all-days').textContent='Show all '+positionDays+' days';if(!sameWindow)configurePositionWindow(meta.start);
 $('#start-date').value=loadedStart;$('#end-date').textContent=shortDate(loadedEnd);$('#range-title').textContent=shortDate(loadedStart)+' – '+shortDate(loadedEnd)+', '+loadedEnd.slice(0,4);
 renderSummary();render();
 $('#data-provenance').textContent=`Source: NASA / JPL NeoWs. Window: ${loadedStart} through ${loadedEnd} (UTC). Retrieved ${new Date(meta.retrieved_at).toISOString()}. ${meta.mode==='live'?'Fetched from NASA during this visit.':meta.mode==='cache'?'Reused a browser cache within its refresh interval.':meta.mode==='shared-cache'?'Reused the shared NASA catalog cache within its refresh interval.':'Saved NASA snapshot; this is not a live response.'} Candidate coverage: ${meta.candidateStart??meta.start} through ${meta.candidateEnd??meta.end}. ${data.skipped?data.skipped+' incomplete approach records excluded.':''}`;
 status(meta.mode==='snapshot'?'Saved NASA snapshot · '+shortDate(loadedStart)+'–'+shortDate(loadedEnd):'NASA data · '+new Date(meta.retrieved_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC',meta.mode==='snapshot'?'snapshot':'live');
}
async function load(start,{force=false}={}){
 if(!validDate(start)){toast('Choose a valid date.');return;}if(force&&Date.now()-lastRequest<10000){toast('Please wait a few seconds before refreshing NASA again.');return;}
 const request=++generation;activeController?.abort();activeController=new AbortController();const end=addDays(start,CATALOG_DAYS-1),controller=activeController;$('#load-btn').disabled=true;status('Connecting to NASA…','loading');let error='';
 try{
  if(!force){try{const cache=JSON.parse(localStorage.getItem('perigee-nasa-30d-buffer7-cache')||'null');if(cache?.start===start&&cache.end===end&&cache.candidateStart===catalogCoverage(start).start&&cache.candidateEnd===catalogCoverage(start).end&&Date.now()-Date.parse(cache.retrieved_at)>=0&&Date.now()-Date.parse(cache.retrieved_at)<(cache.refreshAfterSeconds??900)*1000){adopt(cache.feed,{...cache,mode:'cache'});return;}}catch{}}
  lastRequest=Date.now();const timer=setTimeout(()=>controller.abort(),60000);let feed,catalog;
  try{let response;for(let attempt=1;;attempt++){response=await fetch('/api/catalog?start='+start,{signal:controller.signal});catalog=await response.json();if(response.ok||attempt>=2||response.status!==503||/limit/i.test(catalog.error??''))break;status('Retrying NASA…','loading');await new Promise(r=>setTimeout(r,1500));if(request!==generation)return;}
   if(!response.ok)throw Error(catalog.error??'NASA catalog unavailable');if(catalog.start!==start||catalog.end!==end||catalog.candidateStart!==catalogCoverage(start).start||catalog.candidateEnd!==catalogCoverage(start).end)throw Error('Incomplete NASA catalog window');feed=catalog.feed;}finally{clearTimeout(timer);}
  normalizeFeed(feed);if(request!==generation)return;
  const meta={start,end,candidateStart:catalog.candidateStart,candidateEnd:catalog.candidateEnd,retrieved_at:catalog.retrievedAt,savedAt:Date.now(),refreshAfterSeconds:catalog.refreshAfterSeconds??900};
  adopt(feed,{...meta,mode:catalog.cacheState==='shared'?'shared-cache':'live'});try{localStorage.setItem('perigee-nasa-30d-buffer7-cache',JSON.stringify({feed,...meta}));}catch{}
 }catch(e){
  if(request!==generation)return;error=e.name==='AbortError'?'NASA did not respond in time.':e.message;
  try{const res=await fetch('data/snapshot.json');if(!res.ok)throw Error();const snapshot=await res.json();if(request!==generation)return;adopt(snapshot.feed,{start:snapshot.start,end:snapshot.end,retrieved_at:snapshot.retrieved_at,candidateStart:snapshot.candidateStart,candidateEnd:snapshot.candidateEnd,mode:'snapshot'});toast(error+' Showing saved NASA data for '+snapshot.start+' through '+snapshot.end+'.');}
  catch{rows=[];loadedStart=start;loadedEnd=end;renderSummary();render();status('NASA unavailable · please retry','error');$('#data-provenance').textContent='No data loaded. '+error;toast('Unable to load NASA or saved data. Please retry.');}
 }finally{if(request===generation)$('#load-btn').disabled=false;}
}

// ---------- time ----------
function configurePositionWindow(start){
 positionWindow=start;ephemeris.reset(start);if(Number(start.slice(0,4))<1962||Number(start.slice(0,4))>2099)ephemeris.paused=true;
 const first=Date.parse(start+'T00:00:00Z'),last=first+positionDays*86400000-60000,now=Date.now();
 positionEpoch=now>=first&&now<=last?now:first+12*3600000;$('#live-clock').checked=now>=first&&now<=last;$('#live-clock').disabled=now<first||now>last;
 $('#position-time').min=start+'T00:00';$('#position-time').max=new Date(last).toISOString().slice(0,16);$('#position-slider').max=positionDays*1440-1;syncPositionControls();
}
function syncPositionControls(){if(!positionWindow)return;$('#position-time').value=new Date(positionEpoch).toISOString().slice(0,16);$('#position-slider').value=Math.round((positionEpoch-Date.parse(positionWindow+'T00:00:00Z'))/60000);}
let lastScrubDay='';
function applyPositionEpoch(value,{live=false}={}){
 if(!live)$('#live-clock').checked=false;const first=Date.parse(positionWindow+'T00:00:00Z'),last=first+positionDays*86400000-60000;
 if(!Number.isFinite(value)||value<first||value>last){toast('Choose a time within the loaded 30 days.');syncPositionControls();return;}
 positionEpoch=value;syncPositionControls();renderMap();refreshDetailBody();
 const d=dateKey(new Date(positionEpoch));if(d!==lastScrubDay){lastScrubDay=d;renderScrubBars();}
}
// Play advances time one day per second, in ten steps.
function setPlaying(on){
 clearInterval(playTimer);playTimer=0;const button=$('#position-play');button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?'Pause':'Play: move time forward one day per second');button.innerHTML=`<span aria-hidden="true">${on?'❚❚':'▶'}</span>`;
 if(!on||!positionWindow)return;const first=Date.parse(positionWindow+'T00:00:00Z'),last=first+positionDays*86400000-60000;if(positionEpoch>=last-3600000)applyPositionEpoch(first);
 playTimer=setInterval(()=>{const next=Math.min(last,positionEpoch+8640000);applyPositionEpoch(next);if(next>=last)setPlaying(false);},100);
}
function tickLiveClock(){if(!$('#live-clock').checked||document.hidden||!positionWindow)return;const now=Date.now(),first=Date.parse(positionWindow+'T00:00:00Z');if(now<first||now>=first+positionDays*86400000-60000){$('#live-clock').checked=false;load(dateKey());return;}applyPositionEpoch(now,{live:true});}
function refreshLiveCatalog(){const interval=(provenance.refreshAfterSeconds??900)*1000;if(!document.hidden&&$('#live-clock').checked&&positionWindow&&Date.now()-lastRequest>=interval&&Date.now()-Date.parse(provenance.retrieved_at)>=interval)load(loadedStart);}

// ---------- viewer ----------
function stageInsets(){
 if(!viewer)return;if(!matchMedia('(min-width: 921px)').matches){viewer.setInsets({right:0,bottom:0});return;}
 const stage=$('#stage').getBoundingClientRect(),drawer=$('#detail-panel').getBoundingClientRect(),transport=$('.transport').getBoundingClientRect();
 viewer.setInsets({right:Math.max(0,Math.round(stage.right-drawer.left)),bottom:Math.max(0,Math.round(stage.bottom-transport.top-20))});
}
function viewerFailed(message){viewerError=message;viewer?.setActive(false);viewer=null;$('#viewer3d-root').hidden=true;for(const id of ['earth-moon','fit-field','zoom-in','zoom-out','fullscreen-view'])$('#'+id).disabled=true;renderMap();}
async function bootViewer(){
 try{const {EncounterViewer}=await import('./viewer3d.js');viewer=new EncounterViewer($('#viewer3d-root'),{onSelect:key=>selectAsteroid(key),onBodySelect:selectBody,onSatelliteSelect:key=>selectSatellite(key),onFailure:message=>viewerFailed(message+' The forecast, catalog and details still work.')});viewer.setMotion(motion);stageInsets();renderMap();}
 catch{viewerFailed('The 3D stage is unavailable in this browser. The forecast, catalog and details still work.');}
}

// ---------- events ----------
$('#date-form').addEventListener('submit',e=>{e.preventDefault();const start=$('#start-date').value;load(start,{force:start===loadedStart});});
$('#start-date').addEventListener('change',()=>{if(validDate($('#start-date').value))$('#end-date').textContent=shortDate(addDays($('#start-date').value,CATALOG_DAYS-1));});
for(const id of ['search','pha-only','max-distance','min-size','sort'])$('#'+id).addEventListener(id==='sort'||id==='pha-only'?'change':'input',()=>{if(loadedStart)render();});
$('#reset-filters').addEventListener('click',()=>{$('#search').value='';$('#pha-only').checked=false;$('#max-distance').value=200;$('#min-size').value=0;$('#sort').value='date';day='';if(loadedStart)render();});
$('#timeline').addEventListener('click',e=>{const el=e.target.closest('[data-day]');if(el){day=day===el.dataset.day?'':el.dataset.day;render();}});
$('#all-days').addEventListener('click',()=>{day='';if(loadedStart)render();});
document.addEventListener('click',e=>{
 const asteroid=e.target.closest('[data-object]');if(asteroid){const fromTable=!!asteroid.closest('#asteroid-table');selectAsteroid(asteroid.dataset.object,{toggle:!fromTable});if(selected&&fromTable)focusSelection();return;}
 const sat=e.target.closest('[data-satellite]');if(sat){selectSatellite(sat.dataset.satellite,{toggle:false});focusSatellite();return;}
 const pickA=e.target.closest('[data-pick-asteroid]');if(pickA){selectAsteroid(pickA.dataset.pickAsteroid,{toggle:false});focusSelection();return;}
 const pickS=e.target.closest('[data-pick-satellite]');if(pickS){selectSatellite(pickS.dataset.pickSatellite,{toggle:false});viewer?.focusSatellite();return;}
 const pickB=e.target.closest('[data-pick-body]');if(pickB){selectBody(pickB.dataset.pickBody);viewer?.fitMoon();return;}
 if(e.target.closest('#close-details')){clearSelection();refreshAll();return;}
 const tab=e.target.closest('[data-detail-tab]');if(tab){setDetailTab(tab.dataset.detailTab);return;}
 const step=e.target.closest('[data-photo-step]');if(step){const media=currentImages();if(media.length){photoIndex=(photoIndex+Number(step.dataset.photoStep)+media.length)%media.length;$('#detail-media').innerHTML=photoMarkup(media,{empty:''});}return;}
 const group=e.target.closest('[data-group]');if(group){const id=group.dataset.group;if(satelliteGroupFilter.has(id)&&satelliteGroupFilter.size>1)satelliteGroupFilter.delete(id);else satelliteGroupFilter.add(id);satelliteLimit=60;if(selectedSat&&!satelliteShown(selectedSat)){selectedSat=null;renderDetail();}renderMap();renderSatelliteTable();}
});
function setDetailTab(tab,focus=false){detailTab=tab;store.set('perigee-detail-tab',tab);for(const b of $$('[data-detail-tab]')){const on=b.dataset.detailTab===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;if(on&&focus)b.focus();}$('#detail-body')?.setAttribute('aria-labelledby','detail-tab-'+tab);refreshDetailBody();}
function setCatalogTab(tab,focus=false){for(const [name,button,panel] of [['asteroids',$('#tab-asteroids'),$('#panel-asteroids')],['satellites',$('#tab-satellites'),$('#panel-satellites')]]){const on=name===tab;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;panel.hidden=!on;if(on&&focus)button.focus();}if(tab==='satellites')renderSatelliteTable();}
document.addEventListener('keydown',e=>{
 if(e.target.closest?.('[data-detail-tab]')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setDetailTab(detailTab==='glance'?'deep':'glance',true);}
 const cat=e.target.closest?.('#catalog [role=tab]');if(cat&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setCatalogTab(cat.id==='tab-asteroids'?'satellites':'asteroids',true);}
 if(e.key==='Escape'&&(selected||selectedSat||selectedBody)&&!$('#about-dialog').open){clearSelection();refreshAll();}
});
$('#tab-asteroids').addEventListener('click',()=>setCatalogTab('asteroids'));$('#tab-satellites').addEventListener('click',()=>setCatalogTab('satellites'));
$('#satellite-search').addEventListener('input',()=>{satelliteLimit=60;renderSatelliteTable();});$('#satellite-sort').addEventListener('change',renderSatelliteTable);$('#satellite-more').addEventListener('click',()=>{satelliteLimit+=120;renderSatelliteTable();});
$('#position-play').addEventListener('click',()=>setPlaying(!playTimer));
for(const id of ['position-slider','position-time','position-now','live-clock'])$('#'+id).addEventListener(id==='position-slider'?'input':id==='position-now'?'click':'change',e=>{if(playTimer&&e.isTrusted)setPlaying(false);});
$('#position-time').addEventListener('change',()=>applyPositionEpoch(Date.parse($('#position-time').value+'Z')));
$('#position-time').addEventListener('focus',()=>{$('#live-clock').checked=false;});
$('#position-slider').addEventListener('input',()=>applyPositionEpoch(Date.parse(positionWindow+'T00:00:00Z')+Number($('#position-slider').value)*60000));
$('#position-now').addEventListener('click',()=>{const now=Date.now(),first=Date.parse(positionWindow+'T00:00:00Z');if(now>=first&&now<first+positionDays*86400000){$('#live-clock').checked=true;applyPositionEpoch(now,{live:true});}else load(dateKey());});
$('#live-clock').addEventListener('change',tickLiveClock);
$('#show-path').addEventListener('change',()=>{renderMap();refreshDetailBody();});
$('#show-asteroids').addEventListener('change',()=>{if(!asteroidsOn()&&selected){selected=null;renderDetail();}renderMap();});
$('#show-satellites').addEventListener('change',()=>{if(!satellitesOn()&&selectedSat){selectedSat=null;renderDetail();}renderMap();});
$('#show-megaconstellations').addEventListener('change',()=>{if(selectedSat&&!satelliteShown(selectedSat)){selectedSat=null;renderDetail();}if($('#show-megaconstellations').checked)$('#show-satellites').checked=true;renderMap();renderSatelliteTable();});
$('#retry-positions').addEventListener('click',()=>{ephemeris.errors.clear();ephemeris.paused=false;satellites.retry();renderMap();});
for(const input of $$('input[name="field-radius"]'))input.addEventListener('change',()=>{const near=nearEarth();renderMap();refreshDetailBody();if(near!==lastFieldNear){lastFieldNear=near;if(near)viewer?.fitField();else viewer?.fitMoon();}});
$('#zoom-in').addEventListener('click',()=>viewer?.zoom(1/1.15));$('#zoom-out').addEventListener('click',()=>viewer?.zoom(1.15));
$('#earth-moon').addEventListener('click',()=>viewer?.fitMoon());$('#fit-field').addEventListener('click',()=>{renderMap();viewer?.fitField();});
$('#motion-btn').addEventListener('click',()=>{motion=!motion;viewer?.setMotion(motion);$('#motion-btn').setAttribute('aria-pressed',String(motion));$('#motion-btn').setAttribute('aria-label',motion?'Pause background animation':'Resume background animation');$('#motion-btn').textContent=motion?'Ⅱ':'▷';});
$('#fullscreen-view').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#stage').requestFullscreen();}catch{toast('Full screen is unavailable in this browser.');}});
$('#download-btn').addEventListener('click',()=>{const blob=new Blob(['﻿'+csvExport(visible)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`NASA-close-approaches-${loadedStart}${day?'-'+day:''}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Exported '+visible.length+' flybys.');});
const dialog=$('#about-dialog');for(const id of ['about-btn','map-info','pha-info','sources-btn'])$('#'+id).addEventListener('click',()=>dialog.showModal());$('#close-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
new ResizeObserver(stageInsets).observe($('#stage'));new ResizeObserver(stageInsets).observe($('#detail-panel'));
setInterval(tickLiveClock,1000);setInterval(refreshLiveCatalog,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){tickLiveClock();refreshLiveCatalog();}});

// ---------- start ----------
$('#motion-btn').setAttribute('aria-pressed',String(motion));if(!motion)$('#motion-btn').textContent='▷';
lastFieldNear=nearEarth();
$('#start-date').value=dateKey();$('#end-date').textContent=shortDate(addDays(dateKey(),CATALOG_DAYS-1));
renderDetail();load(dateKey());bootViewer();satellites.ensure(DEFAULT_GROUPS);
