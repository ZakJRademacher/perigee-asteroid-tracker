import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {EarthGlobe} from './earth-globe.js';
import {markerSize} from './marker-size.js';
import {earthOrientation,equatorialFrame,frameVector} from './earth-orientation.js';
import {sphereOccludes,EARTH_RADIUS} from './occlusion.js';

export class EncounterViewer {
 constructor(host,{onSelect,onFailure}){
  this.host=host;this.onSelect=onSelect;this.onFailure=onFailure;this.items=[];this.active=true;this.motion=false;this.frame=0;this.selected=null;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.setClearColor(0x090e16,1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.35;
  this.canvas=this.renderer.domElement;this.canvas.setAttribute('aria-label','3D encounter viewer. Drag to rotate, scroll or pinch to zoom. Arrow keys rotate; plus and minus zoom; Home resets.');this.canvas.setAttribute('role','img');this.canvas.tabIndex=0;host.prepend(this.canvas);
  this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2(0x090e16,.012);this.camera=new THREE.PerspectiveCamera(44,1,.1,120);this.home=new THREE.Vector3(0,1.4,17);this.camera.position.copy(this.home);
  this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enablePan=false;this.controls.minDistance=2.4;this.controls.maxDistance=32;this.controls.minPolarAngle=.15;this.controls.maxPolarAngle=Math.PI-.15;this.controls.zoomSpeed=.7;this.controls.rotateSpeed=.6;this.controls.addEventListener('change',()=>this.draw());
  this.scene.add(new THREE.AmbientLight(0x778eaa,1.1));const sun=new THREE.DirectionalLight(0xe5f4ff,3.8);sun.position.set(-7,5,6);this.scene.add(sun);const fill=new THREE.DirectionalLight(0x4a789d,.6);fill.position.set(5,-2,-5);this.scene.add(fill);
  this.globe=new EarthGlobe(this.scene,host,()=>this.draw());this.earth=this.globe.surface;this.globe.setEpoch(Date.now());
  this.sunReference=new THREE.Mesh(new THREE.SphereGeometry(.15,24,16),new THREE.MeshBasicMaterial({color:0xffce70,toneMapped:false}));this.sunReference.name='sun-direction-reference';this.scene.add(this.sunReference);
  this.sunLabel=document.createElement('span');this.sunLabel.className='sun-reference-label';this.sunLabel.textContent='Sun direction · off scale';this.sunLabel.title='Direction at the displayed UTC epoch. Sun distance and size are not to scale; the Sun is outside the asteroid viewing sphere.';host.append(this.sunLabel);
  const makeRing=(radius,opacity)=>{const points=[];for(let i=0;i<=160;i++){const a=i/160*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));}const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x72968d,transparent:true,opacity}));this.scene.add(line);};
  for(const r of [2.6,5.2,7.8])makeRing(r,r===7.8?.24:.10);
  const crossPoints=[new THREE.Vector3(-9,0,0),new THREE.Vector3(9,0,0),new THREE.Vector3(0,0,-9),new THREE.Vector3(0,0,9)];this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crossPoints),new THREE.LineBasicMaterial({color:0x506c78,transparent:true,opacity:.15})));
  let seed=942;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};const stars=[];for(let i=0;i<900;i++){const az=rand()*Math.PI*2,y=rand()*2-1,r=38+rand()*15,s=Math.sqrt(1-y*y);stars.push(r*s*Math.cos(az),r*y,r*s*Math.sin(az));}const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));this.stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xaac3d4,size:.065,transparent:true,opacity:.7,sizeAttenuation:true}));this.scene.add(this.stars);
  this.group=new THREE.Group();this.scene.add(this.group);this.trajectory=null;this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.overlay=document.createElement('div');this.overlay.className='viewer3d-markers';host.append(this.overlay);
  let down=null;this.canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});this.canvas.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const rect=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects([this.earth,...this.items.map(x=>x.mesh)],false)[0];if(hit?.object.userData.key)this.onSelect(hit.object.userData.key);});
  this.canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')this.reset();else if('+-='.includes(e.key))this.zoom(e.key==='-'?1.15:1/1.15);else{const sphere=new THREE.Spherical().setFromVector3(this.camera.position);if(e.key==='ArrowLeft')sphere.theta-=.12;if(e.key==='ArrowRight')sphere.theta+=.12;if(e.key==='ArrowUp')sphere.phi=Math.max(.15,sphere.phi-.12);if(e.key==='ArrowDown')sphere.phi=Math.min(Math.PI-.15,sphere.phi+.12);this.camera.position.setFromSpherical(sphere);this.controls.update();this.draw();}}});
  this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.setActive(false);this.onFailure('The 3D graphics context was lost. The 2D view is still available.');});
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.start();});this.resize();
 }
 resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.draw();}
 update(rows,selected,maxLd,path=[],epoch=Date.now(),earthRadius=EARTH_RADIUS){
  this.globe.setEpoch(epoch);const frame=equatorialFrame(epoch);
  try{const direction=frameVector(frame,earthOrientation(epoch).sun);this.sunReference.position.set(...direction).multiplyScalar(8.8);this.sunReference.visible=true;this.host.dataset.sunReferenceEpoch=String(epoch);this.host.dataset.sunReferenceDirection=JSON.stringify(direction);}catch{this.sunReference.visible=false;this.sunLabel.hidden=true;}
  const shown=rows.filter(row=>row.scenePosition);
  this.earthRadius=earthRadius;this.earth.scale.setScalar(earthRadius/EARTH_RADIUS);this.globe.atmosphere.scale.setScalar(earthRadius/EARTH_RADIUS);this.controls.minDistance=Math.max(1e-7,earthRadius*3.8);if(this.camera.position.length()<this.controls.minDistance)this.camera.position.setLength(this.controls.minDistance);this.host.dataset.earthRadius=String(earthRadius);
  const previous=new Map(this.items.map(item=>[item.row.key,item]));this.selected=selected;
  this.items=shown.map(row=>{
   let item=previous.get(row.key);previous.delete(row.key);
   if(item&&markerSize(row).known!==markerSize(item.row).known){this.group.remove(item.mesh);item.mesh.geometry.dispose();item.mesh.material.dispose();item.button.remove();item=null;}
   if(!item){
    const mesh=new THREE.Mesh(markerSize(row).known?new THREE.IcosahedronGeometry(1,1):new THREE.TorusGeometry(.9,.1,6,32),new THREE.MeshStandardMaterial({color:row.pha?0xe7b979:0xb9eccd,emissive:row.pha?0x8c5c23:0x397c60,emissiveIntensity:.8,roughness:.7,flatShading:true,depthTest:true}));
    mesh.userData.key=row.key;this.group.add(mesh);
    const button=document.createElement('button');button.className='viewer3d-point';button.addEventListener('click',()=>this.onSelect(row.key));
    const core=document.createElement('span');core.className='point-core';button.append(core);const label=document.createElement('span');label.className='point-label';button.append(label);this.overlay.append(button);item={mesh,button,row,label};
   }
   const chosen=row.key===selected;item.button.classList.toggle('selected',chosen);item.button.classList.toggle('pha',row.pha);item.button.setAttribute('aria-pressed',String(chosen));item.mesh.material.emissiveIntensity=chosen?2:.8;
   return item;
  });
  for(const item of previous.values()){this.group.remove(item.mesh);item.mesh.geometry.dispose();item.mesh.material.dispose();item.button.remove();}
  this.items.forEach((item,i)=>{const row=shown[i],p=row.scenePosition;item.row=row;const size=markerSize(row);item.markerPixels=size.pixels;item.mesh.visible=true;item.button.style.setProperty('--marker-px',size.pixels+'px');item.button.classList.toggle('size-unknown',!size.known);item.button.title=size.label;item.mesh.position.set(...frameVector(frame,[p.x,p.y,p.z]));const distance=(row.positionKm/384400).toFixed(2);item.button.setAttribute('aria-label',row.name+', Earth distance '+distance+' lunar distances, '+size.label);item.label.textContent=row.name+' · '+distance+' LD at epoch · '+size.label;});
  if(this.trajectory){this.scene.remove(this.trajectory);this.trajectory.geometry.dispose();this.trajectory.material.dispose();this.trajectory=null;}
  if(selected&&path.length>1){this.trajectory=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(path.map(p=>new THREE.Vector3(...frameVector(frame,[p.x,p.y,p.z])))),new THREE.LineBasicMaterial({color:0xbde9ce,transparent:true,opacity:.75,depthTest:true}));this.trajectory.name='selected-predicted-path';this.scene.add(this.trajectory);}
  this.host.dataset.trajectoryPoints=String(selected?path.length:0);this.draw();
 }
 draw(){if(!this.active)return;const near=Math.min(.1,Math.max((this.earthRadius??EARTH_RADIUS)*.03,this.camera.position.length()*.001));if(this.camera.near!==near){this.camera.near=near;this.camera.updateProjectionMatrix();}this.camera.updateMatrixWorld();const w=this.host.clientWidth,h=this.host.clientHeight,cam=this.camera.position;
  for(const item of this.items){if(!markerSize(item.row).known)item.mesh.quaternion.copy(this.camera.quaternion);const depth=-item.mesh.position.clone().applyMatrix4(this.camera.matrixWorldInverse).z;item.mesh.scale.setScalar(item.markerPixels*Math.max(.01,depth)*Math.tan(this.camera.fov*Math.PI/360)/Math.max(1,h));}this.renderer.render(this.scene,this.camera);
  for(const {mesh,button} of this.items){const position=mesh.position.clone(),p=position.clone().project(this.camera),occluded=sphereOccludes(cam.toArray(),position.toArray(),this.earthRadius??EARTH_RADIUS),x=(p.x*.5+.5)*w;button.hidden=!!occluded||p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1;button.style.left=x+'px';button.style.top=(-p.y*.5+.5)*h+'px';button.classList.toggle('label-right',x>w-120);button.classList.toggle('label-left',x<120);}
  if(this.sunReference&&this.sunLabel){const point=this.sunReference.position,p=point.clone().project(this.camera),x=(p.x*.5+.5)*w;this.sunLabel.hidden=!this.sunReference.visible||sphereOccludes(cam.toArray(),point.toArray(),this.earthRadius??EARTH_RADIUS)||p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1;this.sunLabel.style.left=Math.max(80,Math.min(w-80,x))+'px';this.sunLabel.style.top=(-p.y*.5+.5)*h+'px';}
 }
 zoom(factor){this.camera.position.multiplyScalar(factor);this.camera.position.setLength(Math.min(32,Math.max(this.controls.minDistance,this.camera.position.length())));this.controls.update();this.draw();}
 focusEarth(){this.controls.target.set(0,0,0);this.camera.position.setLength((this.earthRadius??EARTH_RADIUS)*4.5);this.controls.update();this.draw();}
 reset(){this.controls.target.set(0,0,0);this.camera.position.copy(this.home);this.controls.update();this.draw();}
 setActive(active){this.active=active;if(!active){cancelAnimationFrame(this.frame);this.frame=0;}else{this.resize();this.start();}}
 setMotion(motion){this.motion=motion;if(!motion){cancelAnimationFrame(this.frame);this.frame=0;this.draw();}else this.start();}
 start(){if(this.frame||!this.active||!this.motion||document.hidden)return;const tick=now=>{this.frame=0;if(!this.active||!this.motion||document.hidden)return;if(now-(this.lastStarDraw??0)>=50){this.lastStarDraw=now;this.stars.material.opacity=.67+Math.sin(now*.00015)*.035;this.renderer.render(this.scene,this.camera);}this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);}
}
