import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {earthOrientation,moonState,moonOrbitGuide,earthOrbitGuide,surfaceDirection,equatorialFrame,frameVector} from '../dist/earth-orientation.js';
import {sphereOccludes} from '../dist/occlusion.js';
import {markerSize} from '../dist/marker-size.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),degrees=r=>r*180/Math.PI;
const angle=(a,b)=>degrees(Math.acos(Math.min(1,Math.max(-1,dot(a,b)))));

test('J2000 Greenwich angle agrees with the standard 280.46 degree sidereal reference',()=>{
 const state=earthOrientation(Date.parse('2000-01-01T12:00:00Z'));
 assert.ok(Math.abs(state.siderealHours*15-280.46)<.01);
 assert.ok(Math.abs(degrees(Math.acos(state.north[1]))-23.4393)<.01);
});
test('Earth rotates eastward once per sidereal day and nearly one extra degree per solar day',()=>{
 const epoch=Date.parse('2026-10-22T00:00:00Z'),a=earthOrientation(epoch);
 assert.ok(angle(a.prime,earthOrientation(epoch+86164.0905*1000).prime)<.001);
 const b=earthOrientation(epoch+86400000),turn=angle(a.prime,b.prime);
 assert.ok(turn>.98&&turn<.99);
 const east=a.west.map(x=>-x),hour=earthOrientation(epoch+3600000);
 assert.ok(dot(hour.prime,east)>0,'prime meridian must advance toward the east');
});
test('surface basis stays orthonormal and right-handed throughout supported dates',()=>{
 for(const date of ['1962-01-01','2000-01-01','2026-10-22','2099-12-31']){
  const s=earthOrientation(Date.parse(date+'T12:00:00Z'));
  for(const v of [s.prime,s.north,s.west,s.sun])assert.ok(Math.abs(Math.hypot(...v)-1)<1e-12);
  for(const [a,b] of [[s.prime,s.north],[s.prime,s.west],[s.north,s.west]])assert.ok(Math.abs(dot(a,b))<1e-12);
  const [a,b,c]=s.prime,[x,y,z]=s.north,cross=[b*z-c*y,c*x-a*z,a*y-b*x];
  assert.ok(dot(cross,s.west)>.999999999999);
 }
});
test('Sun direction yields equinox and opposite solstice declinations, with noon and midnight reversed',()=>{
 for(const [date,declination] of [['2026-03-20',0],['2026-06-21',23.44],['2026-12-21',-23.44]]){
  const s=earthOrientation(Date.parse(date+'T12:00:00Z'));
  assert.ok(Math.abs(degrees(Math.asin(dot(s.sun,s.north)))-declination)<.2);
 }
 const noon=earthOrientation(Date.parse('2026-03-20T12:00:00Z')),midnight=earthOrientation(Date.parse('2026-03-20T00:00:00Z'));
 assert.ok(dot(surfaceDirection(noon,0,0),noon.sun)>.99);
 assert.ok(dot(surfaceDirection(midnight,0,0),midnight.sun)<-.99);
});
test('geographic UV directions map Greenwich, north and east without mirroring',()=>{
 const s=earthOrientation(Date.parse('2026-10-22T00:00:00Z'));
 assert.ok(angle(surfaceDirection(s,0,0),s.prime)<.00001);
 assert.ok(angle(surfaceDirection(s,90,0),s.north)<.00001);
 assert.ok(angle(surfaceDirection(s,0,90),s.west.map(v=>-v))<.00001);
 assert.ok(angle(surfaceDirection(s,0,180),s.prime.map(v=>-v))<.00001);
});

test('geometric Sun position retains real distance, shared lighting direction and date-dependent motion',()=>{
 const epoch=Date.parse('2026-10-22T00:00:00Z'),state=earthOrientation(epoch);
 // Independent JPL Horizons: Earth 399 / center 500@10, geometric
 // J2000 ecliptic km; negate and apply the renderer's [x,z,-y] transform.
 const reference=[-131186243.7067239,5161.113070707768,70444728.93257087];
 assert.ok(Math.hypot(...state.sunPositionKm.map((v,k)=>v-reference[k]))<1000);
 const distance=Math.hypot(...state.sunPositionKm);
 assert.ok(distance>147e6&&distance<153e6);
 for(let k=0;k<3;k++)assert.ok(Math.abs(state.sunPositionKm[k]/distance-state.sun[k])<1e-12);
 const tomorrow=earthOrientation(epoch+86400000),travel=Math.hypot(...tomorrow.sunPositionKm.map((v,k)=>v-state.sunPositionKm[k]));
 assert.ok(travel>2.4e6&&travel<2.8e6);
 const framed=frameVector(equatorialFrame(epoch),state.sunPositionKm);
 assert.ok(Math.abs(Math.hypot(...framed)-distance)<1e-6);
});

test('Moon position agrees with a JPL reference and its surface basis keeps the near side facing Earth',()=>{
 const epoch=Date.parse('2026-10-22T00:00:00Z'),state=moonState(epoch),reference=[354821.6876948141,4815.542842848576,160634.0808988809];
 assert.ok(Math.hypot(...state.positionKm.map((v,k)=>v-reference[k]))<50);
 for(let day=0;day<30;day+=3){
  const s=moonState(epoch+day*86400000),distance=Math.hypot(...s.positionKm),earthDirection=s.positionKm.map(v=>-v/distance);
  assert.ok(distance>350000&&distance<410000);
  assert.ok(dot(s.prime,earthDirection)>.97,'prime meridian should remain near the Earth-facing hemisphere');
  for(const v of [s.prime,s.north,s.west])assert.ok(Math.abs(Math.hypot(...v)-1)<1e-12);
  assert.ok(Math.abs(dot(s.prime,s.north))<1e-12);
  const [a,b,c]=s.prime,[x,y,z]=s.north,cross=[b*z-c*y,c*x-a*z,a*y-b*x];assert.ok(dot(cross,s.west)>.999999999);
 }
 const earthRadius=6371,moonRadius=1737.4;assert.ok(Math.abs(moonRadius/earthRadius-.2727)<.0001);
 for(const bad of [NaN,Infinity,Date.parse('1900-01-01'),Date.parse('2100-01-01')])assert.throws(()=>moonState(bad),RangeError);
});

test('closed lunar guide passes through its source state with a smooth seam and physical orbital dimensions',()=>{
 const epoch=Date.parse('2026-10-22T13:00:00Z'),guide=moonOrbitGuide(epoch),state=moonState(guide.epoch);
 assert.equal(guide.points.length,257);assert.deepEqual(guide.points[0],guide.points.at(-1));
 assert.ok(Math.hypot(...guide.points[0].map((v,k)=>v-state.positionKm[k]))<1e-6);
 assert.ok(guide.eccentricity>.01&&guide.eccentricity<.12);assert.ok(guide.semiMajorKm>350000&&guide.semiMajorKm<420000);
 const lengths=guide.points.slice(1).map((p,i)=>Math.hypot(...p.map((v,k)=>v-guide.points[i][k])));assert.ok(Math.max(...lengths)<15000);assert.ok(Math.min(...lengths)>5000);
 const first=guide.points[1].map((v,k)=>v-guide.points[0][k]),last=guide.points.at(-1).map((v,k)=>v-guide.points.at(-2)[k]);assert.ok(dot(first,last)/(Math.hypot(...first)*Math.hypot(...last))>.99);
 for(const date of ['1962-01-01T00:00:00Z','2099-12-31T23:30:00Z'])assert.equal(moonOrbitGuide(Date.parse(date)).points.length,257);
});

test('Earth orbit is closed about the Sun and passes through Earth after geocentric translation',()=>{
 const epoch=Date.parse('2026-10-22T00:00:00Z'),guide=earthOrbitGuide(epoch),sun=earthOrientation(epoch).sunPositionKm;
 assert.equal(guide.points.length,257);assert.deepEqual(guide.points[0],guide.points.at(-1));
 assert.ok(guide.eccentricity>.01&&guide.eccentricity<.03);assert.ok(guide.semiMajorKm>148e6&&guide.semiMajorKm<151e6);
 assert.ok(Math.hypot(...guide.points[0].map((v,k)=>v+sun[k]))<1e-6,'Earth must remain at the model origin');
 for(const p of guide.points)assert.ok(Math.hypot(...p)>146e6&&Math.hypot(...p)<154e6);
});

test('invalid or unsupported Earth epochs fail without inventing an orientation',()=>{
 for(const epoch of [NaN,Infinity,Date.parse('1900-01-01'),Date.parse('2100-01-01')])assert.throws(()=>earthOrientation(epoch),RangeError);
});
test('NASA texture and astronomy runtime hashes and retained license match provenance',()=>{
 const vendor=JSON.parse(readFileSync(new URL('../dist/vendor/astronomy-provenance.json',import.meta.url)));
 for(const [file,hash] of Object.entries(vendor.files_sha256))assert.equal(createHash('sha256').update(readFileSync(new URL('../dist/vendor/'+file,import.meta.url))).digest('hex'),hash);
 assert.match(readFileSync(new URL('../dist/vendor/astronomy.js',import.meta.url),'utf8'),/MIT License/);
 const assets=JSON.parse(readFileSync(new URL('../dist/assets/provenance.json',import.meta.url)));
 for(const file of ['earth-day.jpg','earth-clouds.jpg','earth-night.jpg','moon-color.jpg']){
  const data=assets.assets[file];assert.ok(data.date&&data.credit&&data.source);assert.equal(data.modifications.startsWith('None.'),true);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../dist/assets/'+file,import.meta.url))).digest('hex'),data.sha256);
 }
});
test('diameter markers increase monotonically, remain bounded, and ignore distance and selection',()=>{
 const sizes=[1,10,50,100,500,1000,100000].map(n=>markerSize({min:n,max:n}));
 for(let i=1;i<sizes.length;i++)assert.ok(sizes[i].pixels>=sizes[i-1].pixels);
 assert.ok(sizes.every(s=>s.pixels>=5&&s.pixels<=30));
 const a=markerSize({min:50,max:150}),b=markerSize({min:50,max:150,ld:180,selected:true});
 assert.deepEqual(a,b);assert.equal(a.diameter,100);
 assert.ok(markerSize({min:900,max:1100}).pixels>markerSize({min:5,max:10}).pixels);
});
test('unknown, zero and malformed diameter estimates stay visibly unknown',()=>{
 for(const row of [{min:null,max:100},{min:10,max:null},{min:0,max:0},{min:-1,max:10},{min:100,max:10},{min:10,max:Infinity}]){
  const size=markerSize(row);assert.equal(size.known,false);assert.equal(size.diameter,null);assert.equal(size.label,'Diameter unknown');
 }
});

test('equatorial view makes Earth north vertical while preserving all distances and relative angles',()=>{
 for(const date of ['1962-01-01','2026-10-22','2099-12-31']){
  const epoch=Date.parse(date+'T12:00:00Z'),s=earthOrientation(epoch),frame=equatorialFrame(epoch);
  const north=frameVector(frame,s.north);assert.ok(angle(north,[0,1,0])<.00001);
  const a=[3,4,12],b=[-9,2,5],u=frameVector(frame,a),v=frameVector(frame,b);
  assert.ok(Math.abs(Math.hypot(...u)-13)<1e-12);
  assert.ok(Math.abs(dot(a,b)-dot(u,v))<1e-12);
  const greenwich=frameVector(frame,s.prime);assert.ok(Math.abs(greenwich[1])<1e-12);
 }
});
test('opaque Earth hides points behind or inside its silhouette while front and clear rays stay visible',()=>{
 const camera=[0,0,5];
 assert.equal(sphereOccludes(camera,[0,0,-2]),true);
 assert.equal(sphereOccludes(camera,[0,0,.1]),true);
 assert.equal(sphereOccludes(camera,[0,0,2]),false);
 assert.equal(sphereOccludes(camera,[2,0,-5]),false);
 assert.equal(sphereOccludes(camera,[0,0,-2],.1),true);
 const frame=equatorialFrame(Date.parse('2026-10-22T00:00:00Z'));
 assert.equal(sphereOccludes(frameVector(frame,camera),frameVector(frame,[0,0,-2])),true);
});
