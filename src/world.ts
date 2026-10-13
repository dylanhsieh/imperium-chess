import * as THREE from 'three';
import {finishMaterial,getSurfaceGrain,getGraphicsMode,onGraphicsChange} from './surface-shading';
import {TurnAtmosphere} from './atmosphere';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
    const wobble=Math.sin(y*.011)*22+Math.sin(x*.018+y*.009)*15+Math.sin(y*.047)*3;
    const streak=Math.sin((x+y*.59+wobble)*.024);
    const vein=Math.pow(Math.max(0,streak),48);
    const hairline=Math.pow(Math.max(0,Math.sin((x+y*.58+wobble*.92)*.024+.11)),140);
    const cloud=Math.sin(x*.009+y*.004)*Math.sin(y*.014)*3;
    const grain=random()*4;
    const v=dark?40+grain+cloud+vein*16+hairline*13:174+grain+cloud-vein*13-hairline*8;
    const i = (y * 512 + x) * 4;
    img.data[i] = v * (dark ? .78 : 1.02); img.data[i+1] = v * (dark ? .89 : 1.01); img.data[i+2] = v * (dark ? .93 : .97); img.data[i+3] = 255;
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

/** One startup-only reflection bake: long windows produce readable metal highlights.
 * These cards never enter the playable scene or add a recurring render pass. */
function hallReflection(renderer:THREE.WebGLRenderer){
  const room=new THREE.Scene();room.background=new THREE.Color('#17242c');
  const geometry=new THREE.BoxGeometry(1,1,1),materials:THREE.MeshBasicMaterial[]=[];
  const enclosure=new THREE.MeshBasicMaterial({color:'#3c4548',side:THREE.BackSide});materials.push(enclosure);
  const shell=new THREE.Mesh(geometry,enclosure);shell.scale.set(38,26,38);shell.position.y=9;room.add(shell);
  function panel(color:string,power:number,x:number,y:number,z:number,w:number,h:number,d:number){
    const material=new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(power),toneMapped:false});materials.push(material);
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);room.add(mesh);
  }
  // Warm narrow colonnade windows against a broad cool sky opening. Alternating
  // gaps keep specular response shaped instead of washing the whole armor white.
  for(const z of[-9,-3,3,9])panel('#ffd6a0',12,-18,7,z,.15,9,1.2);
  panel('#b1d7f1',9.5,18,9,-5,.15,11,6);
  panel('#c6dce9',6.5,2,21,-3,9,.15,11);
  panel('#e7dfca',2.2,2,4,18,8,5,.15);
  for(const x of[-8,8])panel('#ffb46b',6,x,.6,-9,1.2,2,.15);
  const generator=new THREE.PMREMGenerator(renderer),target=generator.fromScene(room,.045,.1,80);
  target.texture.name='local-colonnade-reflection';geometry.dispose();materials.forEach(material=>material.dispose());generator.dispose();
  return target.texture;
}

/** A shared local limestone paint: mineral clouds, pores and scratched edges. */
function limestoneTexture(){
  const size=512,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const context=canvas.getContext('2d')!,pixels=context.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const cloud=Math.sin(x*.023+Math.sin(y*.014)*3)*Math.sin(y*.019)*5+Math.sin((x+y)*.061)*1.6;
    const pore=random()>.985?-17:0,value=181+cloud+(random()-.5)*10+pore,i=(y*size+x)*4;
    pixels.data.set([value*1.005,value,value*.978,255],i);
  }
  context.putImageData(pixels,0,0);
  for(let i=0;i<52;i++){
    const x=random()*size,y=random()*size;
    context.strokeStyle=`rgba(69,74,74,${.025+random()*.045})`;context.lineWidth=.4+random()*.6;
    context.beginPath();context.moveTo(x,y);context.lineTo(x+8+random()*18,y-1+random()*3);context.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.name='local-worn-limestone';texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;return texture;
}

/** Sixteen locally drawn glyphs share one atlas and a single board-label draw. */
function labelAtlas(){
  const c=document.createElement('canvas');c.width=1024;c.height=64;
  const g=c.getContext('2d')!;g.fillStyle='#c7b188';g.textAlign='center';g.textBaseline='middle';g.font='500 36px Georgia';
  for(let i=0;i<16;i++)g.fillText(i<8?String.fromCharCode(65+i):`${i-7}`,i*64+32,32);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

/** Local texture paint: worn ashlar and woven military standards. No image files. */
function ashlarTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const g=canvas.getContext('2d')!;g.fillStyle='#99998e';g.fillRect(0,0,256,256);
  for(let row=0;row<8;row++)for(let col=-1;col<5;col++){
    const x=col*64+(row%2)*32,y=row*32,v=144+Math.floor(random()*32);
    g.fillStyle=`rgb(${v+8},${v+5},${v})`;g.fillRect(x+1,y+1,62,30);
    g.fillStyle='rgba(242,237,216,.18)';g.fillRect(x+2,y+2,61,1);
    g.fillStyle='rgba(31,28,22,.22)';g.fillRect(x+1,y+29,62,2);
    for(let chip=0;chip<5;chip++){g.fillStyle=`rgba(55,47,36,${.04+random()*.12})`;g.fillRect(x+random()*61,y+random()*30,1+random()*5,1);}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,2);texture.anisotropy=2;return texture;
}
function standardTexture(dark:boolean){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;const g=canvas.getContext('2d')!;
  g.fillStyle=dark?'#202b3e':'#742d24';g.fillRect(0,0,256,512);
  g.fillStyle='rgba(240,219,169,.07)';for(let x=0;x<256;x+=3)g.fillRect(x,0,1,512);
  g.fillStyle='rgba(2,6,7,.10)';for(let y=0;y<512;y+=4)g.fillRect(0,y,256,1);
  g.strokeStyle='#bca56f';g.lineWidth=5;g.strokeRect(13,13,230,486);g.lineWidth=1;g.strokeRect(23,22,210,468);
  g.translate(128,182);g.strokeStyle='#d0b57b';g.lineWidth=9;g.beginPath();g.arc(0,0,44,0,Math.PI*2);g.stroke();
  // Eagle wings and laurel, readable as heraldry instead of a fantasy neon glyph.
  g.fillStyle='#cbb178';g.beginPath();g.moveTo(0,-30);g.lineTo(15,12);g.lineTo(6,37);g.lineTo(-6,37);g.lineTo(-15,12);g.closePath();g.fill();
  for(const sign of[-1,1])for(let feather=0;feather<5;feather++){
    g.save();g.scale(sign,1);g.beginPath();g.moveTo(10,feather*5);g.lineTo(73-feather*7,-41+feather*15);g.lineTo(59-feather*6,-7+feather*14);g.lineTo(10,12+feather*5);g.closePath();g.fill();g.restore();
  }
  g.font='600 26px Georgia';g.textAlign='center';g.fillText(dark?'NOCTIS':'AURELIA',0,128);
  g.font='19px Georgia';g.fillText(dark?'LEGIO · IX':'LEGIO · IV',0,163);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
function flameTexture(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;const g=canvas.getContext('2d')!,pixels=g.createImageData(128,256);
  for(let y=0;y<256;y++)for(let x=0;x<128;x++){
    const height=1-y/255,width=.35*Math.pow(1-height,.62),center=.5+Math.sin(height*9.4)*height*.065;
    const edge=Math.abs(x/127-center)/Math.max(.003,width),noise=.91+Math.sin(y*.18+x*.07)*.06;
    const alpha=Math.max(0,Math.min(1,(1-Math.pow(edge,2.2))*3))*Math.min(1,(1-height)*13)*Math.min(1,height*15)*noise;
    const core=Math.max(0,1-edge*1.6)*(1-height*.66),index=(y*128+x)*4;
    pixels.data[index]=255;pixels.data[index+1]=110+core*135;pixels.data[index+2]=21+core*137;pixels.data[index+3]=alpha*255;
  }
  g.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function armorChipGeometry(){
  const shape=new THREE.Shape();shape.moveTo(-.052,-.034);shape.lineTo(.019,-.048);shape.lineTo(.056,.012);shape.lineTo(.025,.039);shape.lineTo(-.043,.021);shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.014,bevelEnabled:false});geo.translate(0,0,-.007);return geo;
}

export function createWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  scene.background = new THREE.Color('#101815'); scene.fog = new THREE.FogExp2('#101815', .019);
  scene.environment=hallReflection(renderer);scene.environmentIntensity=.64;
  const bronze = new THREE.MeshStandardMaterial({ name:'antique-bronze-trim',color: '#a68c65', metalness:.76, roughness:.36 });
  const darkMetal = new THREE.MeshStandardMaterial({ color:'#242e29', metalness:.55, roughness:.4 });
  const stone = new THREE.MeshStandardMaterial({ color:'#35413b', roughness:.86, metalness:.06 });
  const edge = new THREE.MeshStandardMaterial({ color:'#626657', roughness:.57, metalness:.2 });
  const black = new THREE.MeshStandardMaterial({ color:'#0e1412', roughness:.8 });
  const patina = new THREE.MeshStandardMaterial({color:'#587267',roughness:.78,metalness:.21});
  const ashlar=new THREE.MeshStandardMaterial({name:'fortification-limestone',color:'#b6b7ae',map:ashlarTexture(),roughness:.93,metalness:0});
  const floor=new THREE.MeshStandardMaterial({name:'arena-worn-limestone',color:'#787d7b',map:limestoneTexture(),roughness:.91,metalness:0});
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
  // Carved corner rosettes and shallow tablet grooves are all material-batched.
  // Their relief catches grazing cinematic light without covering playable squares.
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*6.02,z=sz*6.02;
    box(.22,.014,.22,black,x,.165,z);
    box(.15,.018,.034,bronze,x,.177,z);box(.034,.018,.15,bronze,x,.177,z);
    for(const sign of [-1,1]){
      box(.027,.015,.06,patina,x+sign*.075,.177,z+sign*.075);
      box(.025,.013,.068,bronze,x+sign*.19,.17,z);
      box(.068,.013,.025,bronze,x,.17,z+sign*.19);
    }
  }
  for(let inset=0;inset<32;inset++)for(const sign of [-1,1]){
    const t=(inset-15.5)*.37;
    box(.17,.019,.08,patina,t,-.13,sign*6.407);
    box(.08,.019,.17,patina,sign*6.407,-.13,t);
  }
  const tileGeometry = new THREE.BoxGeometry(CELL-.027,.16,CELL-.027);
  const tileMaterials:THREE.MeshStandardMaterial[]=[];
  for(let parity=0;parity<2;parity++) {
    const material=new THREE.MeshStandardMaterial({name:parity===0?'board-blue-slate':'board-ivory-marble',map:marble(parity===0),roughness:parity===0?.33:.39,metalness:parity===0?.10:.02});tileMaterials.push(material);
    const tiles=new THREE.InstancedMesh(tileGeometry,material,32); let index=0;
    for(let f=0;f<8;f++)for(let r=0;r<8;r++)if((f+r)%2===parity) {
      const m=new THREE.Matrix4().makeRotationY(((f*5+r*3)%4)*Math.PI/2);m.setPosition((f-3.5)*CELL,.075,(3.5-r)*CELL);
      tiles.setMatrixAt(index,m);tiles.setColorAt(index++,new THREE.Color().setScalar(.95+((f*7+r*11)%9)*.00625));
    }
    tiles.receiveShadow=true; scene.add(tiles);
  }
  // Rank and file inlays remain legible after orbiting, batched into one draw.
  const labelGeometries:THREE.BufferGeometry[]=[];
  for(let i=0;i<8;i++)for(const sign of [-1,1])for(const isRank of [false,true]){
    const geo=new THREE.PlaneGeometry(.24,.24),uv=geo.getAttribute('uv'),glyph=isRank?i+8:i;
    for(let vertex=0;vertex<uv.count;vertex++)uv.setX(vertex,(uv.getX(vertex)+glyph)/16);
    if(!isRank&&sign<0)geo.rotateZ(Math.PI);
    geo.rotateX(-Math.PI/2);
    geo.translate(isRank?sign*5.96:(i-3.5)*CELL,.166,isRank?(3.5-i)*CELL:sign*5.96);
    labelGeometries.push(geo);
  }
  const labels=new THREE.Mesh(mergeGeometries(labelGeometries,false)!,new THREE.MeshBasicMaterial({map:labelAtlas(),transparent:true,depthWrite:false}));labels.name='board-coordinate-inlays';scene.add(labels);labelGeometries.forEach(geo=>geo.dispose());
  for(const x of [-6.3,6.3])for(const z of [-6.3,6.3]) {
    add(new THREE.CylinderGeometry(.2,.23,.07,8),bronze,x,.15,z);
    add(new THREE.OctahedronGeometry(.1),edge,x,.22,z);
  }
  // Hall floor, radial inlay and shallow steps frame the board without cluttering it.
  const floorGeometry=new THREE.CylinderGeometry(24,24,.22,96),floorPositions=floorGeometry.getAttribute('position'),floorUv=floorGeometry.getAttribute('uv');
  // World-sized slabs keep pores and wear at a credible scale in low camera shots.
  for(let i=0;i<floorUv.count;i++)floorUv.setXY(i,floorPositions.getX(i)/6,floorPositions.getZ(i)/6);
  add(floorGeometry,floor,0,-1.4);
  for(const radius of [9.15,9.24,12.2,12.25,17.2]) add(new THREE.TorusGeometry(radius,.016,4,160),bronze,0,-1.273,0,Math.PI/2);
  for(let i=0;i<32;i++) {
    const a=i*Math.PI/16; const m=new THREE.BoxGeometry(.025,.01,11); m.rotateY(a); m.translate(Math.sin(a)*17,-1.273,Math.cos(a)*17); add(m,edge);
  }
  // Existing floor gets radially laid paving joints; no new shadow casters.
  for(let ring=0;ring<3;ring++)for(let slab=0;slab<32;slab++){
    const a=(slab+(ring%2)*.5)*Math.PI/16,r=11.25+ring*3.15;
    const seam=new THREE.BoxGeometry(.017,.009,2.9);seam.rotateY(a);seam.translate(Math.sin(a)*r,-1.279,Math.cos(a)*r);add(seam,black);
  }
  const flameObjects: THREE.Object3D[]=[],braziers:THREE.PointLight[]=[];
  const flames = new THREE.MeshBasicMaterial({color:'#ffffff',map:flameTexture(),transparent:true,opacity:.87,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});flames.forceSinglePass=true;
  const flameA=new THREE.PlaneGeometry(.83,1.28),flameB=flameA.clone();flameB.rotateY(Math.PI/2);const fireGeometry=mergeGeometries([flameA,flameB],false)!;flameA.dispose();flameB.dispose();
  const firePool=new THREE.InstancedMesh(fireGeometry,flames,4);firePool.name='procedural-brazier-flames';firePool.frustumCulled=false;firePool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(firePool);
  for(const x of [-8.4,8.4]) for(const z of [-8.4,8.4]) {
    // Four architectonic braziers with claw crowns.
    box(1.25,.2,1.25,edge,x,-1.15,z); box(.95,.17,.95,bronze,x,-.99,z);
    add(new THREE.CylinderGeometry(.35,.48,1.1,8),darkMetal,x,-.38,z);
    add(new THREE.CylinderGeometry(.7,.28,.35,12),bronze,x,.32,z);
    add(new THREE.TorusGeometry(.64,.038,6,24),bronze,x,.5,z,Math.PI/2);
    for(let j=0;j<8;j++){const a=j*Math.PI/4; add(new THREE.ConeGeometry(.045,.4,5),bronze,x+Math.cos(a)*.62,.65,z+Math.sin(a)*.62);}
    const flame=new THREE.Object3D();flame.position.set(x,1.07,z);flame.updateMatrix();firePool.setMatrixAt(flameObjects.length,flame.matrix);flameObjects.push(flame);
    const light=new THREE.PointLight('#ff9c47',12,9,2); light.position.set(x,1.15,z); scene.add(light);braziers.push(light);
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
  // A coffered lintel and inset metopes add scale behind the close combat view.
  for(let i=0;i<30;i++){
    const x=(i-14.5)*1.055;
    box(.69,.29,.09,darkMetal,x,9.055,-16.015);
    box(.043,.31,.024,bronze,x-.365,9.055,-15.96);
    box(.043,.31,.024,bronze,x+.365,9.055,-15.96);
  }
  box(33,.6,1.9,stone,0,9.05,-17); box(33,.12,2.0,bronze,0,9.42,-17);
  // Woven legion standards hang from physical crossbars. A tiny vertex wave
  // supplies fabric weight; its top stays anchored and reduced motion freezes it.
  const bannerTime={value:0};
  for(const side of[-1,1]){
    const material=new THREE.MeshStandardMaterial({map:standardTexture(side>0),side:THREE.DoubleSide,roughness:.98});material.forceSinglePass=true;
    material.onBeforeCompile=shader=>{shader.uniforms.uBannerTime=bannerTime;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uBannerTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
      float freedom=pow(1.0-uv.y,1.4);transformed.z+=freedom*(sin(position.y*2.4+uBannerTime*1.1)*.075+sin(position.x*3.7-uBannerTime*.8)*.045);`);};
    material.customProgramCacheKey=()=> 'legion-cloth-v1';
    const geo=new THREE.PlaneGeometry(1.7,4.5,10,18),position=geo.getAttribute('position');
    for(let i=0;i<position.count;i++)if(position.getY(i)<-2)position.setY(i,position.getY(i)+Math.abs(position.getX(i))*.5);
    const banner=new THREE.Mesh(geo,material);banner.name='woven-legion-standard';banner.position.set(side*7.5,5.1,-16.58);scene.add(banner);
    add(new THREE.CylinderGeometry(.048,.048,2.2,8),bronze,side*7.5,7.43,-16.55,0,0,Math.PI/2);
    for(const sign of[-1,1])add(new THREE.SphereGeometry(.083,8,5),bronze,side*7.5+sign*1.1,7.43,-16.55);
  }
  // A distant military gate, watchtowers and battered curtain walls give close
  // camera shots a believable army setting. Shared materials are merged below.
  const gate=new THREE.Shape();gate.moveTo(-6,-1.3);gate.lineTo(6,-1.3);gate.lineTo(6,10.7);gate.lineTo(-6,10.7);gate.closePath();
  const opening=new THREE.Path();opening.moveTo(-2.55,-1.3);opening.lineTo(-2.55,4.2);opening.absarc(0,4.2,2.55,Math.PI,0,true);opening.lineTo(2.55,-1.3);opening.closePath();gate.holes.push(opening);
  add(new THREE.ExtrudeGeometry(gate,{depth:1.3,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.09,bevelThickness:.07}),ashlar,0,0,-25);
  box(12.4,.36,1.75,edge,0,10.72,-24.38);box(12.7,.18,1.9,bronze,0,10.99,-24.38);
  box(7.2,1.13,.15,darkMetal,0,8.65,-23.98);
  for(let i=0;i<14;i++){const a=(i+.5)*Math.PI/14;const voussoir=new THREE.BoxGeometry(.52,.35,.2);voussoir.rotateZ(a-Math.PI/2);add(voussoir,edge,Math.cos(a)*2.83,4.2+Math.sin(a)*2.83,-23.57);}
  for(const side of[-1,1]){
    box(13,4.7,1.1,ashlar,side*12.5,1,-24.4);
    for(let j=0;j<9;j++)box(.69,.7,1.2,edge,side*(6.5+j*1.52),3.68,-24.4);
    const towerX=side*20;
    box(3.2,9.2,3.2,ashlar,towerX,3.3,-23.6);box(3.5,.3,3.5,edge,towerX,7.88,-23.6);
    for(let c=0;c<3;c++)for(const z of[-25.1,-22.1])box(.6,.82,.65,edge,towerX+(c-1)*1.18,8.43,z);
    for(const y of[1.9,5.25]){box(.28,1.38,.05,black,towerX,y,-21.975);box(.51,.10,.12,edge,towerX,y-.73,-21.94);}
    // Spear racks and shields at the entrance signal an occupied army camp.
    for(let j=0;j<6;j++){
      const x=side*(10.7+j*.42),z=-19.2;
      add(new THREE.CylinderGeometry(.025,.025,3.4,5),darkMetal,x,.55,z);
      add(new THREE.ConeGeometry(.09,.38,4),bronze,x,2.45,z,0,Math.PI/4);
      if(j%2===0)add(new THREE.CylinderGeometry(.38,.38,.08,12),bronze,x,-.63,z+.11,Math.PI/2);
    }
  }
  for(const [mat, geos] of batches) {
    const geo=mergeGeometries(geos,false)!; const mesh=new THREE.Mesh(geo,mat); mesh.receiveShadow=true; mesh.castShadow=false; scene.add(mesh); for(const g of geos) g.dispose();
  }
  const hemi=new THREE.HemisphereLight('#d3e3d9','#313127',2.0); scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe5bb',3.3); sun.position.set(-5,14,8); sun.castShadow=true; const shadowSize=matchMedia('(pointer: coarse)').matches?1024:2048;sun.shadow.mapSize.set(shadowSize,shadowSize); sun.shadow.camera.left=-9;sun.shadow.camera.right=9;sun.shadow.camera.top=9;sun.shadow.camera.bottom=-9;sun.shadow.camera.near=.5;sun.shadow.camera.far=35;sun.shadow.bias=-.00035;sun.shadow.normalBias=.025;scene.add(sun);
  const rim=new THREE.DirectionalLight('#aacbd4',2.4);rim.position.set(8,10,-10);scene.add(rim);
  scene.traverse(node=>{if(node instanceof THREE.Mesh){for(const m of Array.isArray(node.material)?node.material:[node.material])if(m instanceof THREE.MeshStandardMaterial)finishMaterial(m,{scale:1.4,grain:.09,roughness:.18,shade:.27,edge:m===bronze?.025:0});}});
  const dustGeo = new THREE.BufferGeometry(), positions=new Float32Array(220*3);
  for(let i=0;i<220;i++){positions[i*3]=(random()-.5)*35;positions[i*3+1]=random()*12;positions[i*3+2]=(random()-.5)*35;}
  dustGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#d9c498',size:.028,transparent:true,opacity:.45,depthWrite:false}));scene.add(dust);
  const atmosphere=new TurnAtmosphere({scene,renderer,stone,edge,darkMetal,hemi,sun,rim,flames,braziers,dust:dust.material});
  const groundHaze=(scene.getObjectByName('hall-mist') as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>).material;
  const palette={
    day:{sky:new THREE.Color('#27343a'),stone:new THREE.Color('#777b75'),floor:new THREE.Color('#7a807e'),edge:new THREE.Color('#979c94'),metal:new THREE.Color('#343c3c'),hemi:new THREE.Color('#c4d7e3'),ground:new THREE.Color('#3a3932'),key:new THREE.Color('#ffe0b9'),rim:new THREE.Color('#a1c9df'),dust:new THREE.Color('#d7c5a5')},
    night:{sky:new THREE.Color('#0b1220'),stone:new THREE.Color('#4a5963'),floor:new THREE.Color('#505e67'),edge:new THREE.Color('#7b8d97'),metal:new THREE.Color('#283741'),hemi:new THREE.Color('#afcbe2'),ground:new THREE.Color('#242a31'),key:new THREE.Color('#ffd0a0'),rim:new THREE.Color('#92b9e4'),dust:new THREE.Color('#a8c2d5')}
  };
  let enhanced=getGraphicsMode()==='enhanced',lightingTime=0;
  function lightHall(time:number,reduced=false){
    const t=atmosphere.state().blend,a=palette.day,b=palette.night;
    const mix=(target:THREE.Color,key:keyof typeof a)=>target.copy(a[key]).lerp(b[key],t);
    mix(scene.background as THREE.Color,'sky');const fog=scene.fog as THREE.FogExp2;fog.color.copy(scene.background as THREE.Color);fog.density=enhanced?.014:.012;
    mix(stone.color,'stone');mix(floor.color,'floor');mix(edge.color,'edge');mix(darkMetal.color,'metal');
    mix(hemi.color,'hemi');mix(hemi.groundColor,'ground');mix(sun.color,'key');mix(rim.color,'rim');
    // Basic retains an inexpensive readable fill. Enhanced sculpts forms with
    // one warmer side key, cooler rim and lower broad fill, not extra lights.
    hemi.intensity=enhanced?.47-t*.10:1.25-t*.28;
    sun.intensity=enhanced?3.9-t*1.0:3.0-t*.65;
    rim.intensity=enhanced?2.65+t*.65:1.7+t*.25;
    sun.position.set(-8,enhanced?10-t*1.7:13,7);rim.position.set(8,9,-11);
    scene.environmentIntensity=enhanced?.64-t*.13:.75-t*.13;
    renderer.toneMappingExposure=enhanced?1.00+t*.025:1.01;
    stone.roughness=enhanced?.80:.89;edge.roughness=enhanced?.54:.64;darkMetal.roughness=enhanced?.34:.44;
    floor.roughness=enhanced?.83:.94;
    groundHaze.uniforms.uOpacity.value=.085+t*.035;
    tileMaterials[0].roughness=enhanced?.30:.40;tileMaterials[1].roughness=enhanced?.37:.48;
    flames.color.set('#fff0d8');
    const flicker=enhanced&&!reduced?1+Math.sin(time*1.8)*.04+Math.sin(time*3.1)*.025:1;
    braziers.forEach(light=>{light.color.set('#ffb274');light.intensity=(enhanced?20+t*5:14+t*3)*flicker;});
    mix(dust.material.color,'dust');dust.material.opacity=enhanced?.30:.23;
  }
  const shaftMaterial=new THREE.ShaderMaterial({name:'side-lit-hall-dust',transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{uGrain:{value:getSurfaceGrain()},uTime:{value:0},uNight:{value:0}},
    vertexShader:`varying vec2 vShaft;varying vec3 vWorld;void main(){vShaft=uv;vec4 world=modelMatrix*instanceMatrix*vec4(position,1.0);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`uniform sampler2D uGrain;uniform float uTime;uniform float uNight;varying vec2 vShaft;varying vec3 vWorld;
      void main(){float edge=pow(max(0.0,1.0-abs(vShaft.x*2.0-1.0)),2.5);float lengthFade=pow(max(0.0,sin(vShaft.y*3.14159)),.7);
        float dust=texture2D(uGrain,vWorld.xy*.011+vec2(uTime*.0008,0.0)).r;
        vec3 tint=mix(vec3(.78,.73,.61),vec3(.39,.51,.66),uNight);
        gl_FragColor=vec4(tint,edge*lengthFade*(.040+dust*.045)*(1.0-uNight*.3));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});shaftMaterial.forceSinglePass=true;
  const shafts=new THREE.InstancedMesh(new THREE.PlaneGeometry(2.1,14),shaftMaterial,3);shafts.name='architectural-sunshafts';
  const shaftMatrix=new THREE.Object3D();for(let i=0;i<3;i++){shaftMatrix.position.set(-11.5+i*10.6,4.8,-10.8-i*1.7);shaftMatrix.rotation.set(0,-.37,-.52);shaftMatrix.scale.set(.8+i*.12,1,1);shaftMatrix.updateMatrix();shafts.setMatrixAt(i,shaftMatrix.matrix);}scene.add(shafts);
  onGraphicsChange(mode=>{enhanced=mode==='enhanced';shafts.visible=enhanced;lightHall(lightingTime);});
  return {setTurn:(side:'w'|'b',instant=false)=>{atmosphere.setTurn(side,instant);lightHall(lightingTime);},theme:()=>({...atmosphere.state(),shafts:shafts.visible?1:0,localArchitecture:true,reflection:'local-colonnade',key:sun.intensity,fill:hemi.intensity,rim:rim.intensity,environment:scene.environmentIntensity}),update(time:number,reduced=false){
    atmosphere.update(time,reduced);lightingTime=time;lightHall(time,reduced);bannerTime.value=reduced?0:time;shaftMaterial.uniforms.uTime.value=reduced?0:time;shaftMaterial.uniforms.uNight.value=atmosphere.state().blend;
    dust.rotation.y=reduced?0:time*.009;flameObjects.forEach((f,i)=>{f.scale.y=1+(reduced?0:Math.sin(time*7+i*2)*.10);f.scale.x=.9+(reduced?0:Math.sin(time*5.6+i)*.07);f.scale.z=f.scale.x;f.rotation.y=reduced?0:Math.sin(time*.6+i)*.15;f.updateMatrix();firePool.setMatrixAt(i,f.matrix);});firePool.instanceMatrix.needsUpdate=true;
  }, shadowLight:sun};
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
  private shards=new THREE.InstancedMesh(armorChipGeometry(),new THREE.MeshStandardMaterial({color:'#ddbc70',metalness:.78,roughness:.31}),96);
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
    let alive=false;for(let i=0;i<this.debris.length;i++){const p=this.debris[i];if(p.age>=p.life)continue;alive=true;p.age+=dt;p.velocity.y-=dt*9;p.pos.addScaledVector(p.velocity,dt);this.dummy.position.copy(p.pos);this.dummy.rotation.set(p.age*p.spin,p.age*p.spin*.7,p.age*p.spin*1.3);const scale=p.age<p.life?Math.max(0,1-p.age/p.life):0;this.dummy.scale.set(scale*(.65+i%3*.25),scale*(.6+i%4*.16),scale);this.dummy.updateMatrix();this.shards.setMatrixAt(i,this.dummy.matrix);}if(alive)this.shards.instanceMatrix.needsUpdate=true;
    for(let i=this.slashes.length-1;i>=0;i--){const s=this.slashes[i];s.age+=dt;const t=s.age/s.life;s.mesh.rotation.z+=dt*5;s.mesh.scale.setScalar(.65+t*.8);(s.mesh.material as THREE.MeshBasicMaterial).opacity=(1-t)*.7;if(t>=1){this.scene.remove(s.mesh);s.mesh.geometry.dispose();(s.mesh.material as THREE.Material).dispose();this.slashes.splice(i,1);}}
    for(let i=this.rings.length-1;i>=0;i--){const r=this.rings[i];r.age+=dt;const t=r.age/r.life;r.mesh.scale.setScalar(.15+t*3);(r.mesh.material as THREE.MeshBasicMaterial).opacity=(1-t)*.65;if(t>=1){this.scene.remove(r.mesh);r.mesh.geometry.dispose();(r.mesh.material as THREE.Material).dispose();this.rings.splice(i,1);}}
  }
}
