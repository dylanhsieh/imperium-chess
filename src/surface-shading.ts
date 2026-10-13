import * as THREE from 'three';
import {getMaterialMaps,getMaterialDetail} from './material-atlas';

export type GraphicsMode = 'basic' | 'enhanced';
const preferenceKey = 'voxel-games-graphics-v1';
const surfaceMood={value:0};
export function setSurfaceMood(night:number){surfaceMood.value=night;}
const callbacks = new Set<(mode:GraphicsMode)=>void>();
const materials = new Set<THREE.MeshStandardMaterial>();
function initialMode():GraphicsMode {
 if(typeof window==='undefined')return 'basic';
 const query=new URLSearchParams(location.search);
 if(query.has('debug')&&query.has('graphics'))return query.get('graphics')==='0'?'basic':'enhanced';
 try{const saved=localStorage.getItem(preferenceKey);if(saved==='basic'||saved==='enhanced')return saved;}catch{}
 return matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0?'basic':'enhanced';
}
let mode=initialMode();
export const getGraphicsMode=()=>mode;
export function setGraphicsMode(next:GraphicsMode){
 if(next===mode)return;mode=next;
 try{localStorage.setItem(preferenceKey,next);}catch{}
 // Reuse Three.js' program cache. Basic mode compiles the original PBR shader,
 // so switching back removes the extra texture sample and finish operations.
 materials.forEach(material=>{material.needsUpdate=true;});
 callbacks.forEach(callback=>callback(mode));
}
export function onGraphicsChange(callback:(mode:GraphicsMode)=>void){callbacks.add(callback);callback(mode);return()=>callbacks.delete(callback);}
let grain:THREE.DataTexture|undefined;
export function getSurfaceGrain(){
 if(grain)return grain;
 const size=128,data=new Uint8Array(size*size*4);let seed=71839;
 for(let i=0;i<size*size;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const value=72+(seed>>>24)*.56;data.set([value,value,value,255],i*4);}
 grain=new THREE.DataTexture(data,size,size);grain.name='local-surface-grain';grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.minFilter=THREE.LinearMipmapLinearFilter;grain.magFilter=THREE.LinearFilter;grain.generateMipmaps=true;grain.needsUpdate=true;return grain;
}
/** Original lightweight surface treatment; no screen-space passes or reflection render. */
export function finishMaterial<T extends THREE.MeshStandardMaterial>(material:T,options:{scale?:number;grain?:number;roughness?:number;shade?:number;edge?:number}={}):T{
 if(materials.has(material))return material;materials.add(material);
 const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
 const detail=getMaterialDetail(material.name);
 const config=new THREE.Vector4(options.scale??1.8,options.grain??.045,options.roughness??.12,options.shade??.24);
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);if(mode==='basic')return;
  shader.uniforms.uSurfaceMood=surfaceMood;
  shader.uniforms.uSurfaceEdge={value:options.edge??0};
  shader.uniforms.uSurfaceGrain={value:getSurfaceGrain()};shader.uniforms.uSurfaceFinish={value:config};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFinishPosition;\nvarying vec2 vFinishUv;\nvarying float vFinishUp;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvFinishPosition=position;\nvFinishUv=uv;\nvFinishUp=clamp(normal.y*.5+.5,0.0,1.0);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uSurfaceGrain;\nuniform vec4 uSurfaceFinish;\nuniform float uSurfaceMood;\nuniform float uSurfaceEdge;\nvarying vec3 vFinishPosition;\nvarying vec2 vFinishUv;\nvarying float vFinishUp;')
   .replace('#include <color_fragment>',`#include <color_fragment>
    vec2 finishUv=vec2(vFinishPosition.x+vFinishPosition.y*.37,vFinishPosition.z+vFinishPosition.y*.73)*uSurfaceFinish.x;
    float finishGrain=texture2D(uSurfaceGrain,finishUv).r-.5;
    diffuseColor.rgb*=1.0+finishGrain*uSurfaceFinish.y;`)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+finishGrain*uSurfaceFinish.z,.045,1.0);')
   .replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=1.0-uSurfaceFinish.w*(1.0-vFinishUp);')
   .replace('#include <opaque_fragment>',`float finishLight=clamp(dot(outgoingLight,vec3(.2126,.7152,.0722))*.6,0.0,1.0);
    vec3 shadowTint=mix(vec3(.80,.84,.97),vec3(.82,.88,1.03),uSurfaceMood);
    vec3 highlightTint=mix(vec3(1.12,1.02,.83),vec3(.99,1.01,1.06),uSurfaceMood);
    outgoingLight*=mix(shadowTint,highlightTint,smoothstep(.02,.85,finishLight));
    // Sub-pixel bevel glints on authored box faces. One derivative pair,
    // no normal-map lookup and no additional render target.
    vec2 edgeDistance=min(vFinishUv,1.0-vFinishUv);
    vec2 edgeWidth=max(fwidth(vFinishUv)*.85,vec2(.016));
    float forgedEdge=1.0-smoothstep(0.0,min(edgeWidth.x,edgeWidth.y),min(edgeDistance.x,edgeDistance.y));
    outgoingLight+=diffuseColor.rgb*forgedEdge*uSurfaceEdge*(.45+.55*vFinishUp)*metalnessFactor;
    float edgeLight=pow(1.0-clamp(dot(normal,normalize(vViewPosition)),0.0,1.0),3.0);
    outgoingLight+=mix(vec3(.20,.16,.10),vec3(.10,.13,.19),uSurfaceMood)*edgeLight*metalnessFactor*.28;
    #include <opaque_fragment>`);
 if(detail){
   const maps=getMaterialMaps();
   shader.uniforms.uMaterialColor={value:maps.color};shader.uniforms.uMaterialNormal={value:maps.normal};
   shader.uniforms.uMaterialRect={value:detail.rect};shader.uniforms.uMaterialFinish={value:detail.finish};
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    uniform sampler2D uMaterialColor;uniform sampler2D uMaterialNormal;uniform vec4 uMaterialRect;uniform vec4 uMaterialFinish;
    mat3 antiqueFrame(vec3 eye,vec3 n,vec2 uv){
     vec3 dp1=dFdx(eye),dp2=dFdy(eye);vec2 duv1=dFdx(uv),duv2=dFdy(uv);
     vec3 p2=cross(dp2,n),p1=cross(n,dp1);
     vec3 t=p2*duv1.x+p1*duv2.x,b=p2*duv1.y+p1*duv2.y;
     float inv=inversesqrt(max(max(dot(t,t),dot(b,b)),1e-8));return mat3(t*inv,b*inv,n);
    }`)
    .replace('#include <color_fragment>',`#include <color_fragment>
     vec2 antiqueUv=uMaterialRect.xy+fract(vFinishUv*2.0)*uMaterialRect.zw;
     float antiqueDetail=dot(texture2D(uMaterialColor,antiqueUv).rgb,vec3(.2126,.7152,.0722))/uMaterialFinish.x-1.0;
     diffuseColor.rgb*=clamp(1.0+antiqueDetail*uMaterialFinish.z,.82,1.18);`)
    .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
     roughnessFactor=clamp(roughnessFactor+antiqueDetail*uMaterialFinish.w,.08,1.0);`)
    .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     vec3 antiqueNormal=texture2D(uMaterialNormal,antiqueUv).xyz*2.0-1.0;
     antiqueNormal.xy*=uMaterialFinish.y;
     normal=normalize(antiqueFrame(-vViewPosition,normal,vFinishUv)*antiqueNormal);`);
 }
 };
 material.customProgramCacheKey=()=>cacheKey+(mode==='enhanced'?'|forged-finish-v5|'+(detail?detail.rect.toArray().join(','):'plain'):'|basic');
 return material;
}
export interface ContactSpot{x:number;y:number;z:number;rx:number;rz:number;yaw?:number;height?:number;}
/** One pooled draw for soft foot/wheel grounding, instead of a full-screen AO pass. */
export class ContactShadows {
 private mesh:THREE.InstancedMesh;private dummy=new THREE.Object3D();private strength:THREE.InstancedBufferAttribute;
 constructor(scene:THREE.Scene,capacity:number){
  const geo=new THREE.PlaneGeometry(2,2);geo.rotateX(-Math.PI/2);
  this.strength=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);this.strength.setUsage(THREE.DynamicDrawUsage);geo.setAttribute('contactStrength',this.strength);
  const material=new THREE.ShaderMaterial({name:'pooled-contact-shadows',transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
   vertexShader:`attribute float contactStrength;varying vec2 vContact;varying float vStrength;void main(){vContact=uv*2.0-1.0;vStrength=contactStrength;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
   fragmentShader:`varying vec2 vContact;varying float vStrength;void main(){float falloff=max(0.0,1.0-dot(vContact,vContact));gl_FragColor=vec4(.025,.04,.045,falloff*falloff*vStrength*.30);}`});
  this.mesh=new THREE.InstancedMesh(geo,material,capacity);this.mesh.name='soft-contact-pool';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(this.mesh);onGraphicsChange(value=>{this.mesh.visible=value==='enhanced';});
 }
 update(spots:ContactSpot[]){
  if(mode==='basic')return;
  const count=Math.min(spots.length,this.strength.count);this.mesh.count=count;
  for(let i=0;i<count;i++){const s=spots[i];this.dummy.position.set(s.x,s.y,s.z);this.dummy.rotation.set(0,s.yaw??0,0);this.dummy.scale.set(s.rx,1,s.rz);this.dummy.updateMatrix();this.mesh.setMatrixAt(i,this.dummy.matrix);this.strength.setX(i,Math.max(0,1-(s.height??0)*.6));}
  this.strength.needsUpdate=true;this.mesh.instanceMatrix.needsUpdate=true;
 }
}
/** Debug-only full-pipeline benchmark; includes shadows, scene and film output. */
export function installGraphicsDiagnostics(renderer:THREE.WebGLRenderer,debug:boolean){
 if(!debug)return;
 (window as any).__GRAPHICS__={mode:getGraphicsMode,setMode:setGraphicsMode,benchmark:async(count=80)=>{
  const benchmark=(window as any).__CHESS_DEBUG__?.benchmarkRender;
  if(!benchmark)throw new Error('The game render benchmark is not ready');
  const result=benchmark(Math.min(240,Math.max(20,count)));
  return{mode,method:'synchronous-render-completion-cpu-and-gpu',samples:result.samples,medianMs:result.medianMs,p95Ms:result.p95Ms,calls:result.renderer.calls,triangles:result.renderer.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,extraPostPasses:result.pipeline.postPasses,includesShadowPasses:true};
 }};
}
