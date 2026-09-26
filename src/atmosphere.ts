import * as THREE from 'three';
import {getGraphicsMode,onGraphicsChange,getSurfaceGrain,setSurfaceMood} from './surface-shading';

type Side='w'|'b';
interface Hall {
 scene:THREE.Scene;renderer:THREE.WebGLRenderer;
 stone:THREE.MeshStandardMaterial;edge:THREE.MeshStandardMaterial;darkMetal:THREE.MeshStandardMaterial;
 hemi:THREE.HemisphereLight;sun:THREE.DirectionalLight;rim:THREE.DirectionalLight;
 flames:THREE.MeshBasicMaterial;braziers:THREE.PointLight[];dust:THREE.PointsMaterial;
}
const color=(hex:string)=>new THREE.Color(hex);
const palettes={
 w:{sky:color('#4b3020'),stone:color('#68543c'),edge:color('#9b8254'),metal:color('#37302a'),hemi:color('#ffe8c1'),ground:color('#30221f'),key:color('#ffdab0'),rim:color('#b9d9e8'),fire:color('#ffad52'),mist:color('#ad9b81')},
 b:{sky:color('#090c27'),stone:color('#202a51'),edge:color('#596185'),metal:color('#151a33'),hemi:color('#a7bce5'),ground:color('#16122b'),key:color('#cad9ff'),rim:color('#a989e4'),fire:color('#a495ff'),mist:color('#778bb9')}
};
/** Recolors the existing hall and lights; two pooled fog sheets add one draw only in enhanced mode. */
export class TurnAtmosphere {
 private side:Side='w';private blend=0;private previousTime=0;private enhanced=getGraphicsMode()==='enhanced';
 private mist:THREE.InstancedMesh;private haze:THREE.ShaderMaterial;
 constructor(private hall:Hall){
  this.haze=new THREE.ShaderMaterial({name:'local-ground-mist',transparent:true,depthWrite:false,
   uniforms:{uGrain:{value:getSurfaceGrain()},uTime:{value:0},uTint:{value:palettes.w.mist.clone()},uOpacity:{value:.12}},
   vertexShader:`varying vec3 vMistWorld;void main(){vec4 world=modelMatrix*instanceMatrix*vec4(position,1.0);vMistWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
   fragmentShader:`uniform sampler2D uGrain;uniform float uTime;uniform float uOpacity;uniform vec3 uTint;varying vec3 vMistWorld;
   void main(){vec2 p=vMistWorld.xz;float outside=smoothstep(6.6,8.2,max(abs(p.x),abs(p.y)));float edge=1.0-smoothstep(20.0,26.0,length(p));
    float n=texture2D(uGrain,p*.008+vec2(uTime*.0012,vMistWorld.y*.15)).r;
    float wisps=texture2D(uGrain,p*.017+vec2(-uTime*.002,uTime*.0007)).r;
    float fog=smoothstep(.32,.69,n*.65+wisps*.35);gl_FragColor=vec4(uTint,fog*outside*edge*uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
  const geometry=new THREE.PlaneGeometry(52,52);geometry.rotateX(-Math.PI/2);
  this.mist=new THREE.InstancedMesh(geometry,this.haze,2);this.mist.name='hall-mist';this.mist.frustumCulled=false;
  for(let i=0;i<2;i++)this.mist.setMatrixAt(i,new THREE.Matrix4().makeTranslation(0,-1.12+i*.42,0));
  hall.scene.add(this.mist);
  onGraphicsChange(mode=>{this.enhanced=mode==='enhanced';this.mist.visible=this.enhanced;document.documentElement.dataset.graphics=mode;this.apply();});
 }
 setTurn(side:Side,instant=false){this.side=side;if(instant){this.blend=side==='b'?1:0;this.apply();}}
 update(time:number,reduced=false){
  const dt=Math.max(0,Math.min(.1,time-this.previousTime));this.previousTime=time;
  const target=this.side==='b'?1:0;this.blend=reduced?target:THREE.MathUtils.lerp(this.blend,target,1-Math.exp(-dt*6));
  if(Math.abs(target-this.blend)<.001)this.blend=target;
  this.haze.uniforms.uTime.value=reduced?0:time;
  this.apply();
  // Slow breathing fire; deliberately no flash or strobe.
  const breath=this.enhanced&&!reduced?1+Math.sin(time*1.8)*.045+Math.sin(time*3.1)*.025:1;
  this.hall.braziers.forEach(light=>{light.intensity=(this.enhanced?15:12)*breath;});
 }
 private apply(){
  const h=this.hall,t=this.blend,e=this.enhanced,w=palettes.w,b=palettes.b;
  const mix=(dest:THREE.Color,key:keyof typeof w)=>dest.copy(w[key]).lerp(b[key],t);
  mix(h.scene.background as THREE.Color,'sky');const fog=h.scene.fog as THREE.FogExp2;fog.color.copy(h.scene.background as THREE.Color);fog.density=e?.013:.012;
  mix(h.stone.color,'stone');mix(h.edge.color,'edge');mix(h.darkMetal.color,'metal');
  mix(h.hemi.color,'hemi');mix(h.hemi.groundColor,'ground');mix(h.sun.color,'key');mix(h.rim.color,'rim');mix(h.flames.color,'fire');mix(h.dust.color,'fire');
  h.braziers.forEach(light=>mix(light.color,'fire'));mix(this.haze.uniforms.uTint.value,'mist');this.haze.uniforms.uOpacity.value=.12+t*.10;
  h.hemi.intensity=e?.34:2;h.sun.intensity=e?4.7:3.3;h.rim.intensity=e?2.7:2.4;
  h.sun.position.set(-5,e?7.5:14,8);h.scene.environmentIntensity=e?.34:.65;h.renderer.toneMappingExposure=e?.98:1.02;
  h.stone.roughness=e?.68:.86;h.darkMetal.roughness=e?.27:.4;
  setSurfaceMood(t);
 }
 state(){return{side:this.side,blend:this.blend,enhanced:this.enhanced,mistDraws:this.enhanced?1:0};}
}
