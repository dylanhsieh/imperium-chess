import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {getGraphicsMode,onGraphicsChange} from './surface-shading';

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const blurFragment=`
 uniform sampler2D tScene;uniform vec2 uStep;uniform float uExtract;uniform float uMobile;uniform float uVerticalStep;
 varying vec2 vUv;
 vec3 sampleGlow(vec2 uv){vec3 c=texture2D(tScene,uv).rgb;float v=max(c.r,max(c.g,c.b));float knee=clamp((v-.9)/.6,0.0,1.0);return mix(c,c*knee*knee,uExtract);}
 void main(){
  vec3 c=sampleGlow(vUv)*.227027;
  c+=sampleGlow(vUv+uStep*1.384615)*.316216;
  c+=sampleGlow(vUv-uStep*1.384615)*.316216;
  c+=sampleGlow(vUv+uStep*3.230769)*.070270;
  c+=sampleGlow(vUv-uStep*3.230769)*.070270;
  if(uMobile>.5){
   vec2 v=vec2(0.0,uVerticalStep);
   c=c*.5+sampleGlow(vUv+v*1.384615)*.158108+sampleGlow(vUv-v*1.384615)*.158108;
   c+=sampleGlow(vUv+v*3.230769)*.035135+sampleGlow(vUv-v*3.230769)*.035135+sampleGlow(vUv)*.113514;
  }
  gl_FragColor=vec4(c,1.0);
 }`;
const outputFragment=`
 uniform sampler2D tScene;uniform sampler2D tBloom;uniform vec2 uPixels;uniform float uTime;uniform float uNight;
 varying vec2 vUv;
 float noise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
 void main(){
  vec3 color=texture2D(tScene,vUv).rgb+texture2D(tBloom,vUv).rgb*.22;
  float luma=dot(color,vec3(.2126,.7152,.0722));
  float shadows=1.0-smoothstep(.06,.7,luma),highlights=smoothstep(.7,2.8,luma);
  color*=mix(vec3(1.0),mix(vec3(.96,.99,1.045),vec3(.985,1.005,1.03),uNight),shadows*.55);
  color*=mix(vec3(1.0),mix(vec3(1.035,1.005,.97),vec3(1.025,1.01,.985),uNight),highlights*.6);
  color=mix(vec3(dot(color,vec3(.2126,.7152,.0722))),color,.96);
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  float vignette=smoothstep(.26,.80,length((vUv-.5)*vec2(1.0,.9)));
  gl_FragColor.rgb*=1.0-vignette*.12;
  float grain=noise(floor(vUv*uPixels)+floor(uTime*24.0)*.37)-.5;
  gl_FragColor.rgb+=grain*.0028;
 }`;

/** Bounded HDR / AgX pipeline: one scene render, small glow buffers and one output. */
export class CinemaRenderer {
 private hdr:THREE.WebGLRenderTarget|null=null;
 private glowA:THREE.WebGLRenderTarget|null=null;
 private glowB:THREE.WebGLRenderTarget|null=null;
 private blur=new THREE.ShaderMaterial({name:'bounded-highlight-bloom',vertexShader:vertex,fragmentShader:blurFragment,depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{tScene:{value:null},uStep:{value:new THREE.Vector2()},uExtract:{value:1},uMobile:{value:0},uVerticalStep:{value:0}}});
 private output=new THREE.ShaderMaterial({name:'war-film-AgX-output',vertexShader:vertex,fragmentShader:outputFragment,depthTest:false,depthWrite:false,
  uniforms:{tScene:{value:null},tBloom:{value:null},uPixels:{value:new THREE.Vector2()},uTime:{value:0},uNight:{value:0}}});
 private quad=new FullScreenQuad(this.blur);
 private width=1;private height=1;private mobile=false;private active=false;
 constructor(private renderer:THREE.WebGLRenderer){
  // Accumulate geometry and all screen passes; do not report only the last quad.
  renderer.info.autoReset=false;
  onGraphicsChange(mode=>{this.active=mode==='enhanced';renderer.toneMapping=this.active?THREE.AgXToneMapping:THREE.ACESFilmicToneMapping;if(!this.active)this.releaseTargets();});
 }
 setSize(width:number,height:number,mobile:boolean){
  if(this.mobile!==mobile)this.releaseTargets();
  this.width=width;this.height=height;this.mobile=mobile;
  if(this.hdr)this.sizeTargets();
 }
 private sizeTargets(){
  const dpr=Math.min(this.renderer.getPixelRatio(),this.mobile?1.25:1.5);
  const w=Math.max(1,Math.round(this.width*dpr)),h=Math.max(1,Math.round(this.height*dpr));
  const scale=Math.min(this.mobile?.2:.25,(this.mobile?192:512)/Math.max(w,h));
  const gw=Math.max(1,Math.round(w*scale)),gh=Math.max(1,Math.round(h*scale));
  this.hdr!.setSize(w,h);this.glowA!.setSize(gw,gh);if(this.glowB)this.glowB.setSize(gw,gh);
  this.output.uniforms.uPixels.value.set(w,h);
 }
 private ensureTargets(){
  if(this.hdr)return;
  const options={type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false};
  this.hdr=new THREE.WebGLRenderTarget(1,1,{...options,depthBuffer:true,samples:this.mobile?2:4});
  this.hdr.texture.name='war-film-HDR';
  this.glowA=new THREE.WebGLRenderTarget(1,1,options);this.glowA.texture.name='war-film-small-glow';
  if(!this.mobile){this.glowB=new THREE.WebGLRenderTarget(1,1,options);this.glowB.texture.name='war-film-soft-glow';}
  this.sizeTargets();
 }
 render(scene:THREE.Scene,camera:THREE.Camera,time:number,night:number){
  const r=this.renderer;r.info.reset();
  if(!this.active){r.setRenderTarget(null);r.render(scene,camera);return;}
  this.ensureTargets();const hdr=this.hdr!,a=this.glowA!,b=this.glowB;
  r.setRenderTarget(hdr);r.render(scene,camera);
  this.quad.material=this.blur;this.blur.uniforms.tScene.value=hdr.texture;
  this.blur.uniforms.uExtract.value=1;this.blur.uniforms.uMobile.value=this.mobile?1:0;
  this.blur.uniforms.uVerticalStep.value=1.25/a.height;this.blur.uniforms.uStep.value.set(1.25/a.width,0);r.setRenderTarget(a);this.quad.render(r);
  if(b){this.blur.uniforms.tScene.value=a.texture;this.blur.uniforms.uExtract.value=0;this.blur.uniforms.uMobile.value=0;this.blur.uniforms.uStep.value.set(0,1.25/a.height);r.setRenderTarget(b);this.quad.render(r);}
  this.quad.material=this.output;this.output.uniforms.tScene.value=hdr.texture;this.output.uniforms.tBloom.value=(b||a).texture;
  this.output.uniforms.uTime.value=time;this.output.uniforms.uNight.value=night;
  r.setRenderTarget(null);this.quad.render(r);
 }
 private releaseTargets(){this.hdr?.dispose();this.glowA?.dispose();this.glowB?.dispose();this.hdr=this.glowA=this.glowB=null;}
 diagnostics(){return{enabled:this.active,toneMapping:this.active?'AgX':'ACES',sceneRenders:1,postPasses:this.active?(this.mobile?1:2):0,screenPasses:this.active?(this.mobile?2:3):0,hdr:this.hdr?{width:this.hdr.width,height:this.hdr.height,samples:this.hdr.samples}:null,bloom:this.glowA?{width:this.glowA.width,height:this.glowA.height}:null};}
 dispose(){this.releaseTargets();this.blur.dispose();this.output.dispose();this.quad.dispose();}
}
