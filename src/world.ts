import * as THREE from 'three';
import {finishMaterial,onGraphicsChange} from './surface-shading';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const CELL = 1.42;
export const BOARD_Y = 0.16;
export function squarePosition(square: string) {
  return new THREE.Vector3((square.charCodeAt(0) - 100.5) * CELL, BOARD_Y, (4.5 - Number(square[1])) * CELL);
}
export function pointSquare(point: THREE.Vector3): string | null {
  const file = Math.floor(point.x / CELL + 4), rank = Math.floor(4 - point.z / CELL);
  return file >= 0 && file < 8 && rank >= 0 && rank < 8 ? `${String.fromCharCode(97 + file)}${rank + 1}` : null;
}

let seed = 15731;
export function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

function marble(dark: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const wobble = Math.sin(y * .016) * 27 + Math.sin(x * .025 + y * .013) * 18;
    const vein = Math.pow(Math.max(0, Math.sin((x + y * .61 + wobble) * .049)), 30);
    const grain = random() * 9;
    const v = dark ? 45 + grain + vein * 35 : 172 + grain - vein * 27;
    const i = (y * 512 + x) * 4;
    img.data[i] = v * (dark ? .74 : 1.08); img.data[i+1] = v * (dark ? .92 : 1.02); img.data[i+2] = v * (dark ? .89 : .88); img.data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = dark ? 'rgba(190,174,117,.28)' : 'rgba(61,59,43,.22)'; ctx.lineWidth = 2;
  ctx.strokeRect(13, 13, 486, 486); ctx.strokeRect(19, 19, 474, 474);
  for (const [x,y] of [[30,30],[482,30],[30,482],[482,482]]) {
    ctx.save(); ctx.translate(x,y); ctx.rotate(Math.PI/4); ctx.fillStyle = dark ? '#8a8765' : '#7c7158'; ctx.fillRect(-2,-2,4,4); ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function labelTexture(text: string, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!; g.fillStyle = '#c7b188'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `500 ${size*.56}px Georgia`; g.fillText(text, size/2, size/2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

export function createWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  scene.background = new THREE.Color('#101815'); scene.fog = new THREE.FogExp2('#101815', .019);
  const pmrem = new THREE.PMREMGenerator(renderer); const envScene = new RoomEnvironment();
  const envMap = pmrem.fromScene(envScene, .04); scene.environment = envMap.texture; scene.environmentIntensity = .65; envScene.dispose(); pmrem.dispose();
  const bronze = new THREE.MeshStandardMaterial({ color: '#b69961', metalness:.78, roughness:.32 });
  const darkMetal = new THREE.MeshStandardMaterial({ color:'#242e29', metalness:.55, roughness:.4 });
  const stone = new THREE.MeshStandardMaterial({ color:'#35413b', roughness:.86, metalness:.06 });
  const edge = new THREE.MeshStandardMaterial({ color:'#626657', roughness:.57, metalness:.2 });
  const black = new THREE.MeshStandardMaterial({ color:'#0e1412', roughness:.8 });
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, x=0,y=0,z=0, rx=0,ry=0,rz=0) {
    geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz); geometry.translate(x,y,z);
    const normalized=geometry.index?geometry.toNonIndexed():geometry;
    if(normalized!==geometry)geometry.dispose();
    if(!batches.has(material)) batches.set(material, []); batches.get(material)!.push(normalized);
  }
  const box=(w:number,h:number,d:number,m:THREE.Material,x=0,y=0,z=0)=>add(new THREE.BoxGeometry(w,h,d),m,x,y,z);
  // Layered temple altar: stone plinth, recessed fillet, metal inlay and raised frame.
  box(13.75,.24,13.75,stone,0,-1.05); box(13.4,.22,13.4,edge,0,-.82);
  box(13.05,.5,13.05,darkMetal,0,-.48); box(13.12,.055,13.12,bronze,0,-.24);
  box(12.85,.27,12.85,black,0,-.08); box(12.74,.08,12.74,bronze,0,.045);
  box(12.56,.1,12.56,darkMetal,0,.09);
  for (const sign of [-1,1]) {
    box(11.54,.035,.032,bronze,0,.152,sign*5.75); box(.032,.035,11.54,bronze,sign*5.75,.152,0);
    box(12.38,.035,.045,bronze,0,.155,sign*6.16); box(.045,.035,12.38,bronze,sign*6.16,.155,0);
    // Repeating Grecian frieze along the vertical apron.
    for(let i=0;i<24;i++) {
      const p = (i-11.5)*.51;
      box(.32,.037,.028,bronze,p,-.41,sign*6.54);
      box(.025,.18,.028,bronze,p-.15,-.48,sign*6.54);
      box(.18,.028,.028,bronze,p-.06,-.55,sign*6.54);
      box(.028,.037,.32,bronze,sign*6.54,-.41,p);
      box(.028,.18,.025,bronze,sign*6.54,-.48,p-.15);
      box(.028,.028,.18,bronze,sign*6.54,-.55,p-.06);
    }
  }
  const tileGeometry = new THREE.BoxGeometry(CELL-.027,.16,CELL-.027);
  for(let parity=0;parity<2;parity++) {
    const material=new THREE.MeshStandardMaterial({map:marble(parity===0),roughness:parity===0?.3:.48,metalness:parity===0?.18:.06});
    const tiles=new THREE.InstancedMesh(tileGeometry,material,32); let index=0;
    for(let f=0;f<8;f++)for(let r=0;r<8;r++)if((f+r)%2===parity) {
      const m=new THREE.Matrix4().makeTranslation((f-3.5)*CELL,.075,(3.5-r)*CELL); tiles.setMatrixAt(index++,m);
    }
    tiles.receiveShadow=true; scene.add(tiles);
  }
  // Rank and file inlays remain legible after orbiting.
  for(let i=0;i<8;i++) for(const s of [-1,1]) {
    const mat = new THREE.MeshBasicMaterial({map:labelTexture(String.fromCharCode(65+i)),transparent:true,depthWrite:false});
    const m=new THREE.Mesh(new THREE.PlaneGeometry(.24,.24),mat); m.rotation.x=-Math.PI/2; m.rotation.z=s===1?0:Math.PI; m.position.set((i-3.5)*CELL,.166,s*5.96); scene.add(m);
    const rmat = new THREE.MeshBasicMaterial({map:labelTexture(`${i+1}`),transparent:true,depthWrite:false});
    const n=new THREE.Mesh(new THREE.PlaneGeometry(.24,.24),rmat); n.rotation.x=-Math.PI/2; n.position.set(s*5.96,.166,(3.5-i)*CELL); scene.add(n);
  }
  for(const x of [-6.3,6.3])for(const z of [-6.3,6.3]) {
    add(new THREE.CylinderGeometry(.2,.23,.07,8),bronze,x,.15,z);
    add(new THREE.OctahedronGeometry(.1),edge,x,.22,z);
  }
  // Hall floor, radial inlay and shallow steps frame the board without cluttering it.
  add(new THREE.CylinderGeometry(24,24,.22,96),stone,0,-1.4);
  for(const radius of [9.15,9.24,12.2,12.25,17.2]) add(new THREE.TorusGeometry(radius,.016,4,160),bronze,0,-1.273,0,Math.PI/2);
  for(let i=0;i<32;i++) {
    const a=i*Math.PI/16; const m=new THREE.BoxGeometry(.025,.01,11); m.rotateY(a); m.translate(Math.sin(a)*17,-1.273,Math.cos(a)*17); add(m,edge);
  }
  const flameObjects: THREE.Mesh[]=[];
  const flames = new THREE.MeshBasicMaterial({color:'#ffbb58',transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
  for(const x of [-8.4,8.4]) for(const z of [-8.4,8.4]) {
    // Four architectonic braziers with claw crowns.
    box(1.25,.2,1.25,edge,x,-1.15,z); box(.95,.17,.95,bronze,x,-.99,z);
    add(new THREE.CylinderGeometry(.35,.48,1.1,8),darkMetal,x,-.38,z);
    add(new THREE.CylinderGeometry(.7,.28,.35,12),bronze,x,.32,z);
    add(new THREE.TorusGeometry(.64,.038,6,24),bronze,x,.5,z,Math.PI/2);
    for(let j=0;j<8;j++){const a=j*Math.PI/4; add(new THREE.ConeGeometry(.045,.4,5),bronze,x+Math.cos(a)*.62,.65,z+Math.sin(a)*.62);}
    const flame = new THREE.Mesh(new THREE.SphereGeometry(.32,10,10),flames); flame.scale.set(.85,2.5,.85); flame.position.set(x,.84,z); scene.add(flame); flameObjects.push(flame);
    const light=new THREE.PointLight('#ff9c47',12,9,2); light.position.set(x,1.15,z); scene.add(light);
  }
  // Paired fluted columns and lintels provide a real far layer for cinematic shots.
  for(const x of [-15,-10,-5,0,5,10,15]) {
    const z=-17;
    box(1.65,.3,1.65,edge,x,-1.1,z); box(1.3,.27,1.3,darkMetal,x,-.83,z);
    add(new THREE.CylinderGeometry(.54,.7,9,12),stone,x,3.8,z);
    for(let f=0;f<12;f++){const a=f*Math.PI/6; add(new THREE.CylinderGeometry(.065,.065,8.6,6),edge,x+Math.cos(a)*.58,3.7,z+Math.sin(a)*.58);}
    for(const y of [-.55,8.1,8.4]) add(new THREE.CylinderGeometry(.82,.82,.18,12),bronze,x,y,z);
    box(1.65,.38,1.65,edge,x,8.55,z);
  }
  box(33,.6,1.9,stone,0,9.05,-17); box(33,.12,2.0,bronze,0,9.42,-17);
  for(const s of [-1,1]) {
    const bannerMat=new THREE.MeshStandardMaterial({color:s===1?'#50231e':'#667062',side:THREE.DoubleSide,roughness:.96});
    const shape=new THREE.Shape(); shape.moveTo(-.72,2.4);shape.lineTo(.72,2.4);shape.lineTo(.72,-1.5);shape.lineTo(0,-2);shape.lineTo(-.72,-1.5);shape.closePath();
    const banner=new THREE.Mesh(new THREE.ShapeGeometry(shape),bannerMat); banner.position.set(s*7.5,5,-16.7); scene.add(banner);
    const crest=new THREE.Mesh(new THREE.RingGeometry(.35,.39,6),bronze);crest.position.set(s*7.5,5.6,-16.66);scene.add(crest);
    add(new THREE.CylinderGeometry(.025,.025,1,6),bronze,s*7.5,5.6,-16.64);
  }
  for(const [mat, geos] of batches) {
    const geo=mergeGeometries(geos,false)!; const mesh=new THREE.Mesh(geo,mat); mesh.receiveShadow=true; mesh.castShadow=false; scene.add(mesh); for(const g of geos) g.dispose();
  }
  const hemi=new THREE.HemisphereLight('#d3e3d9','#313127',2.0); scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe5bb',3.3); sun.position.set(-5,14,8); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-9;sun.shadow.camera.right=9;sun.shadow.camera.top=9;sun.shadow.camera.bottom=-9;sun.shadow.camera.near=.5;sun.shadow.camera.far=35;sun.shadow.bias=-.00035;sun.shadow.normalBias=.025;scene.add(sun);
  const rim=new THREE.DirectionalLight('#aacbd4',2.4);rim.position.set(8,10,-10);scene.add(rim);
  scene.traverse(node=>{if(node instanceof THREE.Mesh){for(const m of Array.isArray(node.material)?node.material:[node.material])if(m instanceof THREE.MeshStandardMaterial)finishMaterial(m,{scale:1.4,grain:.09,roughness:.18,shade:.27});}});
  onGraphicsChange(mode=>{const enhanced=mode==='enhanced';hemi.intensity=enhanced?.65:2;sun.intensity=enhanced?4.4:3.3;rim.intensity=enhanced?2.0:2.4;scene.environmentIntensity=enhanced?.8:.65;});
  const dustGeo = new THREE.BufferGeometry(), positions=new Float32Array(220*3);
  for(let i=0;i<220;i++){positions[i*3]=(random()-.5)*35;positions[i*3+1]=random()*12;positions[i*3+2]=(random()-.5)*35;}
  dustGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#d9c498',size:.028,transparent:true,opacity:.45,depthWrite:false}));scene.add(dust);
  return {update(time:number){dust.rotation.y=time*.009;flameObjects.forEach((f,i)=>{f.scale.y=2.2+Math.sin(time*9+i*2)*.35;f.scale.x=.8+Math.sin(time*12+i)*.1;});}, shadowLight:sun};
}

type Particle={velocity:THREE.Vector3,age:number,life:number,size:number};
export class BattleEffects {
  private count=320;
  private particles:Particle[]=[];
  private positions=new Float32Array(this.count*3);
  private colors=new Float32Array(this.count*3);
  private geometry=new THREE.BufferGeometry();
  private cursor=0;
  private rings:{mesh:THREE.Mesh,age:number,life:number}[]=[];
  private shards=new THREE.InstancedMesh(new THREE.BoxGeometry(.065,.065,.065),new THREE.MeshStandardMaterial({color:'#ddbc70',metalness:.7,roughness:.3}),96);
  private debris:{pos:THREE.Vector3,velocity:THREE.Vector3,age:number,life:number,spin:number}[]=[];
  private dummy=new THREE.Object3D();
  private slashes:{mesh:THREE.Mesh,age:number,life:number}[]=[];
  private bladeSamples:{base:THREE.Vector3,tip:THREE.Vector3,age:number,color:THREE.Color}[]=[];
  private bladeGeometry=new THREE.BufferGeometry();
  private bladePositions=new Float32Array(32*18);
  private bladeColors=new Float32Array(32*18);
  constructor(private scene:THREE.Scene){
    this.bladeGeometry.setAttribute('position',new THREE.BufferAttribute(this.bladePositions,3).setUsage(THREE.DynamicDrawUsage));
    this.bladeGeometry.setAttribute('color',new THREE.BufferAttribute(this.bladeColors,3).setUsage(THREE.DynamicDrawUsage));
    this.bladeGeometry.setDrawRange(0,0);
    const trail=new THREE.Mesh(this.bladeGeometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.56,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));trail.frustumCulled=false;scene.add(trail);
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shards.frustumCulled=false;
    for(let i=0;i<96;i++){this.debris.push({pos:new THREE.Vector3(0,-100,0),velocity:new THREE.Vector3(),age:2,life:1,spin:0});this.dummy.position.set(0,-100,0);this.dummy.updateMatrix();this.shards.setMatrixAt(i,this.dummy.matrix);}scene.add(this.shards);
    for(let i=0;i<this.count;i++){this.positions[i*3+1]=-100;this.particles.push({velocity:new THREE.Vector3(),age:1,life:0,size:1});}
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3));this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3));
    const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d')!;const g=ctx.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'#fff');g.addColorStop(.2,'#fff');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,32,32);
    const mat=new THREE.PointsMaterial({map:new THREE.CanvasTexture(c),vertexColors:true,size:.18,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
    const points=new THREE.Points(this.geometry,mat);points.frustumCulled=false;scene.add(points);
  }
  emit(position:THREE.Vector3,count:number,color:THREE.Color,power=1){for(let j=0;j<count;j++){
    const i=this.cursor++%this.count,p=this.particles[i];p.age=0;p.life=.35+random()*.7;
    p.velocity.set((random()-.5)*power,random()*power*.8+.3,(random()-.5)*power);
    this.positions.set([position.x+(random()-.5)*.18,position.y+.12,position.z+(random()-.5)*.18],i*3);
    this.colors.set([color.r,color.g,color.b],i*3);
  }}
  impact(position:THREE.Vector3,color:THREE.Color){this.emit(position,42,color,7);this.debris.forEach((p,i)=>{p.pos.copy(position);p.pos.y+=(random()-.5)*.12;p.velocity.set((random()-.5)*7,1.7+random()*4,(random()-.5)*7);p.age=0;p.life=.5+random()*.7;p.spin=random()*9;this.shards.setColorAt(i,color.clone().multiplyScalar(.5+random()*.8));});if(this.shards.instanceColor)this.shards.instanceColor.needsUpdate=true;}
  weaponTrail(base:THREE.Vector3,tip:THREE.Vector3,color:THREE.Color){
    const last=this.bladeSamples.at(-1);if(last&&last.tip.distanceToSquared(tip)<.00004)return;
    this.bladeSamples.push({base:base.clone().lerp(tip,.18),tip:tip.clone(),age:0,color:color.clone()});
    if(this.bladeSamples.length>32)this.bladeSamples.shift();
  }
  clearWeaponTrail(){this.bladeSamples=[];this.bladeGeometry.setDrawRange(0,0);}
  slash(position:THREE.Vector3,direction:THREE.Vector3,color:THREE.Color,type:string){
    const count=type==='q'?3:type==='b'?2:1;
    for(let i=0;i<count;i++){const mesh=new THREE.Mesh(new THREE.RingGeometry(.54+i*.12,.64+i*.12,36,1,0,Math.PI*1.35),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));mesh.position.copy(position).add(new THREE.Vector3(0,.9+i*.16,0));mesh.rotation.set(type==='b'?Math.PI/2:.7,Math.atan2(direction.x,direction.z),-.7+i*.8);this.scene.add(mesh);this.slashes.push({mesh,age:0,life:.32+i*.07});}
  }
  ring(position:THREE.Vector3,color:THREE.Color,life=.5){const mesh=new THREE.Mesh(new THREE.RingGeometry(.8,1,64),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.copy(position);mesh.position.y+=.07;mesh.scale.setScalar(.1);this.scene.add(mesh);this.rings.push({mesh,age:0,life});}
  update(dt:number){
    this.bladeSamples=this.bladeSamples.filter(s=>{s.age+=dt;return s.age<.13;});
    let vertex=0;
    for(let i=1;i<this.bladeSamples.length;i++){
      const a=this.bladeSamples[i-1],b=this.bladeSamples[i];
      for(const [sample,pos]of [[a,a.base],[a,a.tip],[b,b.tip],[a,a.base],[b,b.tip],[b,b.base]] as const){this.bladePositions.set(pos.toArray(),vertex*3);const fade=Math.max(0,1-sample.age/.13)*.8;this.bladeColors.set([sample.color.r*fade,sample.color.g*fade,sample.color.b*fade],vertex*3);vertex++;}
    }
    this.bladeGeometry.setDrawRange(0,vertex);this.bladeGeometry.attributes.position.needsUpdate=true;this.bladeGeometry.attributes.color.needsUpdate=true;
    this.particles.forEach((p,i)=>{if(p.age>=p.life)return;p.age+=dt;const idx=i*3;if(p.age>=p.life){this.positions[idx+1]=-100;return;}p.velocity.y-=dt*5;this.positions[idx]+=p.velocity.x*dt;this.positions[idx+1]+=p.velocity.y*dt;this.positions[idx+2]+=p.velocity.z*dt;const fade=Math.max(0,1-p.age/p.life);this.colors[idx]*=1-dt*2;this.colors[idx+1]*=1-dt*2;this.colors[idx+2]*=1-dt*2;if(!fade)this.positions[idx+1]=-100;});
    this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;
    let alive=false;for(let i=0;i<this.debris.length;i++){const p=this.debris[i];if(p.age>=p.life)continue;alive=true;p.age+=dt;p.velocity.y-=dt*9;p.pos.addScaledVector(p.velocity,dt);this.dummy.position.copy(p.pos);this.dummy.rotation.set(p.age*p.spin,p.age*p.spin*.7,p.age*p.spin*1.3);this.dummy.scale.setScalar(p.age<p.life?Math.max(0,1-p.age/p.life):0);this.dummy.updateMatrix();this.shards.setMatrixAt(i,this.dummy.matrix);}if(alive)this.shards.instanceMatrix.needsUpdate=true;
    for(let i=this.slashes.length-1;i>=0;i--){const s=this.slashes[i];s.age+=dt;const t=s.age/s.life;s.mesh.rotation.z+=dt*5;s.mesh.scale.setScalar(.65+t*.8);(s.mesh.material as THREE.MeshBasicMaterial).opacity=(1-t)*.7;if(t>=1){this.scene.remove(s.mesh);s.mesh.geometry.dispose();(s.mesh.material as THREE.Material).dispose();this.slashes.splice(i,1);}}
    for(let i=this.rings.length-1;i>=0;i--){const r=this.rings[i];r.age+=dt;const t=r.age/r.life;r.mesh.scale.setScalar(.15+t*3);(r.mesh.material as THREE.MeshBasicMaterial).opacity=(1-t)*.65;if(t>=1){this.scene.remove(r.mesh);r.mesh.geometry.dispose();(r.mesh.material as THREE.Material).dispose();this.rings.splice(i,1);}}
  }
}
