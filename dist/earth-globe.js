import * as THREE from 'three';
import {earthOrientation,equatorialFrame,frameVector} from './earth-orientation.js';
import {EARTH_RADIUS} from './occlusion.js';

const vertexShader=`
 varying vec2 earthUv;
 varying vec3 worldNormal;
 varying vec3 worldPosition;
 void main(){
  earthUv=uv;
  vec4 p=modelMatrix*vec4(position,1.0);
  worldPosition=p.xyz;
  worldNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*p;
 }`;
const fragmentShader=`
 uniform sampler2D dayMap;
 uniform sampler2D nightMap;
 uniform sampler2D cloudMap;
 uniform vec3 sunDirection;
 varying vec2 earthUv;
 varying vec3 worldNormal;
 varying vec3 worldPosition;
 void main(){
  vec3 n=normalize(worldNormal),s=normalize(sunDirection);
  vec3 view=normalize(cameraPosition-worldPosition);
  float cosine=dot(n,s),day=smoothstep(-0.08,0.12,cosine);
  vec3 land=texture2D(dayMap,earthUv).rgb;
  float cloud=texture2D(cloudMap,earthUv).r;
  vec3 albedo=mix(land,vec3(0.94),cloud*0.85);
  vec3 daylight=albedo*(0.045+1.05*max(cosine,0.0));
  vec3 night=texture2D(nightMap,earthUv).rgb;
  night=night*night*1.8*(1.0-cloud*0.65)+albedo*0.008;
  float ocean=smoothstep(0.01,0.12,land.b-land.r)*(1.0-cloud);
  float glint=pow(max(dot(n,normalize(s+view)),0.0),90.0)*ocean*max(cosine,0.0);
  vec3 color=mix(night,daylight,day)+vec3(0.44,0.57,0.66)*glint;
  gl_FragColor=vec4(color,1.0);
  #include <colorspace_fragment>
 }`;

function pixel(r,g,b){const t=new THREE.DataTexture(new Uint8Array([r,g,b,255]),1,1);t.needsUpdate=true;return t;}

export class EarthGlobe {
 constructor(scene,host,draw){
  this.host=host;this.draw=draw;
  this.uniforms={dayMap:{value:pixel(8,35,61)},nightMap:{value:pixel(0,0,0)},cloudMap:{value:pixel(0,0,0)},sunDirection:{value:new THREE.Vector3(1,0,0)}};
  this.surface=new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS,96,64),new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader,fragmentShader,toneMapped:false}));
  this.surface.name='utc-oriented-earth';scene.add(this.surface);
  this.atmosphere=new THREE.Mesh(new THREE.SphereGeometry(.64,64,40),new THREE.ShaderMaterial({
   uniforms:{sunDirection:this.uniforms.sunDirection},transparent:true,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,
   vertexShader:`varying vec3 n;varying vec3 v;void main(){vec4 p=modelMatrix*vec4(position,1.0);n=normalize(mat3(modelMatrix)*normal);v=normalize(cameraPosition-p.xyz);gl_Position=projectionMatrix*viewMatrix*p;}`,
   fragmentShader:`uniform vec3 sunDirection;varying vec3 n;varying vec3 v;void main(){float rim=pow(1.0-abs(dot(normalize(n),normalize(v))),3.2);float light=smoothstep(-0.25,0.6,dot(normalize(n),sunDirection));gl_FragColor=vec4(0.18,0.46,0.85,rim*(0.12+light*0.5));#include <colorspace_fragment>}`.replace(';#include',';\n#include')
  }));scene.add(this.atmosphere);
  const loader=new THREE.TextureLoader();let loaded=0,failed=false;host.dataset.earthTextures='loading';
  for(const [key,file,srgb] of [['dayMap','earth-day.jpg',true],['nightMap','earth-night.jpg',true],['cloudMap','earth-clouds.jpg',false]]){
   loader.load('assets/'+file,texture=>{
    if(srgb)texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=4;this.uniforms[key].value.dispose();this.uniforms[key].value=texture;
    loaded++;host.dataset.earthTextures=failed?'partial':loaded===3?'ready':'loading';draw();
   },undefined,()=>{failed=true;host.dataset.earthTextures='partial';const label=document.querySelector('#earth-orientation-credit');if(label)label.textContent='Some Earth imagery unavailable · orientation still follows UTC';draw();});
  }
 }
 setEpoch(epoch){
  try{
   const state=earthOrientation(epoch),frame=equatorialFrame(epoch),vector=v=>new THREE.Vector3(...frameVector(frame,v));
   const matrix=new THREE.Matrix4().makeBasis(vector(state.prime),vector(state.north),vector(state.west));
   this.surface.quaternion.setFromRotationMatrix(matrix);
   this.uniforms.sunDirection.value.set(...frameVector(frame,state.sun));
   this.host.dataset.earthEpoch=String(epoch);this.host.dataset.earthSiderealHours=state.siderealHours.toFixed(8);
   this.surface.visible=true;this.atmosphere.visible=true;
   return true;
  }catch{this.host.dataset.earthEpoch='unavailable';this.surface.visible=false;this.atmosphere.visible=false;return false;}
 }
}
