import * as THREE from 'three';
import {finishMaterial} from './surface-shading';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Locally sculpted historical miniatures: curved armor, adult faces, draped cloth. */
type Faction = 'w' | 'b';
type Mode = 'idle' | 'move' | 'attack' | 'fear' | 'relief';
type V3 = [number, number, number];
type Palette = Record<'armor' | 'gold' | 'dark' | 'cloth' | 'steel' | 'skin' | 'horse', THREE.MeshStandardMaterial>;
const palettes = new Map<Faction, Palette>();
const prototypes = new Map<string, THREE.Group>();
const ZERO: V3 = [0, 0, 0];

function palette(color: Faction): Palette {
  if (palettes.has(color)) return palettes.get(color)!;
  const light = color === 'w';
  const make = (name: string, value: number, metalness: number, roughness: number) => {
    const m = new THREE.MeshStandardMaterial({ color: value, metalness, roughness });
    m.name = `${color}-${name}`;
    return finishMaterial(m,{scale:4,grain:metalness>.4?.055:.09,roughness:metalness>.4?.12:.06,shade:.30,edge:metalness>.4?.065:0});
  };
  const p = {
    armor: make('enamel-and-plate', light ? 0xd2d8c8 : 0x364a60, .62, .32),
    gold: make('antique-trim', light ? 0xb98c35 : 0xb66943, .84, .3),
    dark: make('leather-and-recesses', light ? 0x332d24 : 0x161b22, .22, .65),
    cloth: make('ceremonial-cloth', light ? 0x176b6b : 0x7e203b, .02, .87),
    steel: make('blade-edges', light ? 0xd2e4e7 : 0xb8c7d7, .94, .17),
    skin: make('skin', light ? 0xd2a07b : 0xbb8464, .01, .85),
    horse: make('warhorse', light ? 0x9c9483 : 0x3c3030, .07, .87),
  };
  // Cloth is a thin woven shell. Double-sided opaque shading avoids duplicating
  // every cape triangle and still lights the inside correctly as it flutters.
  p.cloth.side=THREE.DoubleSide;
  palettes.set(color, p);
  return p;
}

/** A batch is one mesh per material, including all tiny rivets and ornaments. */
class Sculpt {
  parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(public group: THREE.Group, public p: Palette) {}
  add(g: THREE.BufferGeometry, material: THREE.Material, position: V3 = ZERO, rotation: V3 = ZERO, scale: V3 = [1, 1, 1]) {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    g.applyMatrix4(matrix);
    const nonindexed = g.index ? g.toNonIndexed() : g;
    if (nonindexed !== g) g.dispose();
    if (!nonindexed.getAttribute('uv')) nonindexed.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(nonindexed.getAttribute('position').count * 2), 2));
    const list = this.parts.get(material) || [];
    list.push(nonindexed);
    this.parts.set(material, list);
    return this;
  }
  /** Small custom chamfers: 44 triangles rather than subdividing a rounded cube. */
  box(size:V3,at:V3,m:THREE.Material,rotation:V3=ZERO,bevel=.008){
    const cut=Math.min(bevel,Math.min(...size)*.22);
    if(cut<.002||Math.max(...size)<.07)return this.add(new THREE.BoxGeometry(...size),m,at,rotation);
    const pos:number[]=[],uv:number[]=[];
    const tri=(a:V3,b:V3,c:V3)=>{pos.push(...a,...b,...c);uv.push(0,0,1,0,1,1);};
    const quad=(a:V3,b:V3,c:V3,d:V3)=>{tri(a,b,c);tri(a,c,d);};
    const h=size.map(v=>v/2),lo=h.map(v=>v-cut);
    // Six inset faces, twelve bevel strips and eight corner facets.
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
      const u=(axis+1)%3,v=(axis+2)%3,points:V3[]=[];
      for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const q=[0,0,0] as V3;q[axis]=sign*h[axis];q[u]=a*lo[u];q[v]=b*lo[v];points.push(q);}
      if(sign<0)points.reverse();quad(points[0],points[1],points[2],points[3]);
    }
    for(let axis=0;axis<3;axis++)for(const a of [-1,1])for(const b of [-1,1]){
      const u=(axis+1)%3,v=(axis+2)%3;
      const points:V3[]=[];
      for(const [end,swap] of [[-1,0],[1,0],[1,1],[-1,1]]){const q=[0,0,0] as V3;q[axis]=end*lo[axis];q[u]=a*(swap?lo[u]:h[u]);q[v]=b*(swap?h[v]:lo[v]);points.push(q);}
      const normal=new THREE.Vector3().subVectors(new THREE.Vector3(...points[1]),new THREE.Vector3(...points[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[2]),new THREE.Vector3(...points[0])));
      const outward=new THREE.Vector3();outward.setComponent(u,a);outward.setComponent(v,b);if(normal.dot(outward)<0)points.reverse();quad(points[0],points[1],points[2],points[3]);
    }
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
      const points:V3[]=[[x*h[0],y*lo[1],z*lo[2]],[x*lo[0],y*h[1],z*lo[2]],[x*lo[0],y*lo[1],z*h[2]]];if(x*y*z<0)points.reverse();tri(points[0],points[1],points[2]);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();return this.add(geo,m,at,rotation);
  }
  ellipsoid(size:V3,at:V3,m:THREE.Material,rotation:V3=ZERO,segments=10){
    if(Math.max(...size)<.027)return this.add(new THREE.IcosahedronGeometry(1,0),m,at,rotation,size);
    const detail=Math.max(...size)<.045?6:Math.min(12,Math.max(8,segments));
    return this.add(new THREE.SphereGeometry(1,detail,Math.max(4,Math.floor(detail*.65))),m,at,rotation,size);
  }
  cone(top:number,bottom:number,height:number,at:V3,m:THREE.Material,segments=10,rotation:V3=ZERO){
    return this.add(new THREE.CylinderGeometry(top,bottom,height,segments,1),m,at,rotation);
  }
  rod(a:V3,b:V3,radius:number,m:THREE.Material,radius2=radius,sides=8){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
    const geo=new THREE.CylinderGeometry(radius2,radius,direction.length(),sides,1);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
    return this.add(geo,m,start.add(end).multiplyScalar(.5).toArray() as V3);
  }
  plate(points:number[][],depth:number,at:V3,m:THREE.Material,rotation:V3=ZERO,bevel=.004){
    const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    const inset=Math.min(depth*.2,bevel);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.001,depth-inset*2),steps:1,bevelEnabled:inset>.001,bevelThickness:inset,bevelSize:inset,bevelSegments:1,curveSegments:3});
    geo.translate(0,0,-depth*.5+inset);return this.add(geo,m,at,rotation);
  }
  curve(points:V3[],radius:number,m:THREE.Material,tubular=12){
    return this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),tubular,radius,5,false),m);
  }
  ring(radius:number,thickness:number,at:V3,m:THREE.Material,rotation:V3=ZERO){
    return this.add(new THREE.TorusGeometry(radius,thickness,5,Math.max(12,Math.ceil(radius*70))),m,at,rotation);
  }
  /** Elliptical cross-sections form continuous fitted armor rather than a sphere. */
  shell(profile:[number,number,number,number?][],at:V3,m:THREE.Material,segments=12){
    const positions:number[]=[],uv:number[]=[],indices:number[]=[];
    for(let row=0;row<profile.length;row++){const [y,rx,rz,cz=0]=profile[row];for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;positions.push(Math.sin(a)*rx,y,Math.cos(a)*rz+cz);uv.push(i/segments,row/(profile.length-1));}}
    for(let row=0;row<profile.length-1;row++)for(let i=0;i<segments;i++){const a=row*(segments+1)+i,b=a+segments+1;indices.push(a,a+1,b,b,a+1,b+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return this.add(geometry,m,at);
  }
  finish() {
    for (const [material, parts] of this.parts) {
      const geometry = mergeGeometries(parts, false)!;
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `forged-${material.name}`;
      this.group.add(mesh);
      parts.forEach(g => g.dispose());
    }
    this.parts.clear();
  }
}

function joint(parent: THREE.Group, name: string, at: V3) {
  const g = new THREE.Group(); g.name = name; g.position.set(...at); parent.add(g); return g;
}

const wingShape = [[-.04, -.04], [.21, -.07], [.28, .06], [.2, .03], [.24, .14], [.14, .1], [.16, .23], [.04, .14]];

function emblem(s: Sculpt, at: V3, size = 1) {
  const [x, y, z] = at;
  s.plate([[0, -.05], [-.037, .015], [0, .083], [.037, .015]], .012, [x, y, z], s.p.gold, ZERO, .002);
  for (const sign of [-1, 1]) {
    s.plate([[0, .035], [sign * .14 * size, .092], [sign * .105 * size, .025], [sign * .07 * size, .018], [sign * .03 * size, -.025]], .009, [x, y, z], s.p.gold, ZERO, .002);
  }
}

function helmet(s:Sculpt,type:string,at:V3,scale=1){
  const [x,y,z]=at,p=s.p;
  const point=(dx:number,dy:number,dz:number):V3=>[x+dx*scale,y+dy*scale,z+dz*scale];
  const oval=(r:V3,q:V3,m:THREE.Material,rotation:V3=ZERO)=>s.ellipsoid(r.map(v=>v*scale) as V3,point(...q),m,rotation,12);
  const line=(a:V3,b:V3,r:number,m:THREE.Material)=>s.rod(point(...a),point(...b),r*scale,m);
  // Adult face: shaped brow, cheekbones, jaw and nose, with narrow inset eyes.
  // The head is ~one seventh of the whole sculpt including its ceremonial crest.
  const faceRows:[number,number,number][]=[[-.19,.014,.031],[-.176,.047,.054],[-.14,.073,.068],[-.094,.086,.077],[-.04,.096,.083],[.017,.094,.081],[.07,.085,.075],[.119,.065,.058],[.14,.027,.03]];
  const facePosition:number[]=[],faceUv:number[]=[],faceIndex:number[]=[],sides=16;
  for(let row=0;row<faceRows.length;row++){
    const [yy,rx,rz]=faceRows[row];
    for(let i=0;i<=sides;i++){
      const angle=i/sides*Math.PI*2,front=Math.max(0,Math.cos(angle));
      const bridge=Math.max(0,1-Math.abs((yy+.05)/.085))*.027*Math.pow(front,14);
      const brow=Math.exp(-(((yy-.013)/.028)**2))*.008*Math.pow(front,5);
      facePosition.push(...point(Math.sin(angle)*rx,yy,Math.cos(angle)*rz+.012+bridge+brow));faceUv.push(i/sides,row/(faceRows.length-1));
    }
  }
  for(let row=0;row<faceRows.length-1;row++)for(let i=0;i<sides;i++){const a=row*(sides+1)+i,b=a+sides+1;faceIndex.push(a,a+1,b,b,a+1,b+1);}
  const face=new THREE.BufferGeometry();face.setAttribute('position',new THREE.Float32BufferAttribute(facePosition,3));face.setAttribute('uv',new THREE.Float32BufferAttribute(faceUv,2));face.setIndex(faceIndex);face.computeVertexNormals();s.add(face,p.skin);
  for(const side of [-1,1]){
    oval([.017,.0055,.004],[side*.042,-.039,.091],p.dark);
    oval([.005,.005,.004],[side*.042,-.039,.094],p.dark);
    s.curve([point(side*.061,-.023,.087),point(side*.044,-.017,.097),point(side*.025,-.021,.103)],.0035*scale,p.dark,4);
    oval([.012,.025,.014],[side*.094,-.062,.007],p.skin);
  }
  s.curve([point(-.023,-.128,.081),point(0,-.125,.086),point(.023,-.128,.081)],.0025*scale,p.dark,5);
  // Spun shell, reinforced brow and hinged cheek pieces: visible continuous curves.
  const dome=new THREE.SphereGeometry(1,14,8,0,Math.PI*2,0,Math.PI*.53);
  s.add(dome,p.armor,point(0,.035,-.008),ZERO,[.12*scale,.15*scale,.114*scale]);
  s.add(new THREE.TorusGeometry(.113,.01,5,18),p.gold,point(0,.024,-.008),[Math.PI/2,0,0],[1,1,1.04]);
  s.curve([point(-.114,.03,.025),point(-.088,.052,.09),point(0,.058,.113),point(.088,.052,.09),point(.114,.03,.025)],.013*scale,p.gold,12);
  for(const side of [-1,1]){
    s.plate([[-.033,.038],[.033,.027],[.038,-.065],[.012,-.125],[-.022,-.101]],.018*scale,point(side*.105,-.045,.023),p.armor,[0,side*1.1,side*.08],.005);
    oval([.015,.015,.013],[side*.115,.002,.03],p.gold);
    for(let rivet=0;rivet<3;rivet++)oval([.004,.004,.004],[side*.106,-.032-rivet*.026,.061],p.gold);
  }
  s.plate([[-.088,.018],[.088,.018],[.096,-.057],[0,-.081],[-.096,-.057]],.017,point(0,-.025,-.105),p.armor,[.25,0,0],.006);
  if(type==='p'||type==='n'||type==='r'){
    const crestScale=type==='n'?1.13:type==='r'?.82:1;
    const shape=new THREE.Shape();shape.moveTo(-.16,.16);shape.bezierCurveTo(-.17,.29,-.08,.36,.035,.35);shape.bezierCurveTo(.14,.34,.18,.24,.17,.15);shape.lineTo(.11,.15);shape.quadraticCurveTo(0,.245,-.105,.155);shape.closePath();
    const crest=new THREE.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:true,bevelThickness:.003,bevelSize:.002,bevelSegments:1,steps:1,curveSegments:7});crest.translate(0,0,-.0125);crest.rotateY(Math.PI/2);
    s.add(crest,p.cloth,point(0,0,-.002),ZERO,[scale,scale*crestScale,scale]);
    for(let plume=0;plume<7;plume++){
      const z0=(plume-3)*.037,high=.31+Math.cos((plume-3)*.36)*.035;
      s.curve([point(.015,.18,z0),point(.017,(high+.18)*.5,z0*1.06),point(.016,high*crestScale,z0*1.08)],.0024*scale,p.dark,5);
    }
    s.curve([point(0,.18,-.14),point(0,.195,0),point(0,.18,.14)],.013*scale,p.gold,10);
  }
  if(type==='k'||type==='q'){
    s.cone(.126*scale,.124*scale,.047*scale,point(0,.095,-.004),p.gold,16);
    s.cone(.119*scale,.122*scale,.038*scale,point(0,.096,-.004),p.dark,16);
    s.ring(.126*scale,.006*scale,point(0,.07,-.004),p.gold,[Math.PI/2,0,0]);
    s.ring(.127*scale,.006*scale,point(0,.118,-.004),p.gold,[Math.PI/2,0,0]);
    const count=type==='q'?7:5;
    for(let i=0;i<count;i++){
      const angle=(i/count)*Math.PI*2,xx=Math.sin(angle)*.124,zz=Math.cos(angle)*.124-.004;
      s.plate([[-.035,0],[-.025,.035],[0,type==='q'?.12:.078],[.025,.035],[.035,0]],.012,point(xx,.118,zz),p.gold,[0,angle,0],.002);
      oval([.01,.015,.009],[xx,.108,zz+.009],p.cloth);
    }
    if(type==='k'){
      s.curve([point(-.118,.105,0),point(-.07,.217,0),point(0,.249,0),point(.07,.217,0),point(.118,.105,0)],.011*scale,p.gold,12);
      line([0,.24,0],[0,.314,0],.011,p.gold);line([-.035,.287,0],[.035,.287,0],.009,p.gold);
      // A swept beard follows the jaw rather than three square tiers.
      oval([.067,.058,.027],[0,-.171,.075],p.dark);
      for(let strand=-2;strand<=2;strand++)s.curve([point(strand*.021,-.14,.096),point(strand*.019,-.179,.10),point(strand*.012,-.216,.066)],.007*scale,p.dark,5);
    }else{
      for(const side of [-1,1])for(let lock=0;lock<3;lock++)s.curve([point(side*(.092+lock*.013),.02,-.031),point(side*(.12+lock*.012),-.09,-.065),point(side*(.108+lock*.014),-.23,-.06),point(side*(.13+lock*.012),-.29,-.098)],.018*scale,p.dark,9);
      for(const side of [-1,1])oval([.011,.023,.009],[side*.107,-.1,.052],p.gold);
    }
  }
  if(type==='b'){
    // Two tapering embossed mitre panels leave the traditional cleft visible.
    for(const front of [-1,1]){
      s.plate([[-.114,0],[-.097,.117],[0,.29],[.097,.117],[.114,0]],.026,point(0,.06,front*.064),p.armor,[front*-.10,0,0],.008);
      s.plate([[-.009,0],[-.009,.171],[0,.211],[.009,.171],[.009,0]],.007,point(0,.08,front*.083),p.gold,[front*-.10,0,0],.001);
    }
    for(const side of [-1,1])s.plate([[-.026,0],[.026,0],[.035,-.24],[0,-.27],[-.029,-.24]],.007,point(side*.051,-.004,-.12),p.cloth,[.1,0,side*.07],.001);
  }
}

function sword(s: Sculpt, at: V3, length: number, broad = false) {
  const [x, y, z] = at;
  const w = broad ? .065 : .044;
  s.rod([x, y - .085, z], [x, y + .07, z], .022, s.p.dark);
  s.cone(.03, .023, .036, [x, y - .096, z], s.p.gold, 8);
  s.box([broad ? .22 : .17, .035, .055], [x, y + .07, z], s.p.gold);
  s.plate([[-w, 0], [-w * .84, length * .76], [0, length], [w * .84, length * .76], [w, 0]], .025, [x, y + .088, z], s.p.steel, ZERO, .006);
  s.plate([[-.009, 0], [0, length * .92], [.009, 0]], .008, [x, y + .095, z + .022], s.p.gold, ZERO, .001);
}

function shield(s:Sculpt,at:V3,scale=1,infantry=false){
  const h=infantry?.35:.30,w=infantry?.20:.19;
  const surface=(inset:number,offset:number,material:THREE.Material)=>{
    const rows=6,columns=8,positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    for(let iy=0;iy<=rows;iy++)for(let ix=0;ix<=columns;ix++){
      const t=iy/rows,u=ix/columns,yy=(t*2-1)*h*inset;
      const taper=infantry?(.83+.17*Math.sin(Math.PI*t)):(.12+.88*Math.sin(t*Math.PI*.68));
      const xx=(u*2-1)*w*taper*inset;
      positions.push(at[0]+xx*scale,at[1]+yy*scale,at[2]+offset+Math.cos((u-.5)*1.35)*.068);
      uvs.push(u,t);
    }
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+columns+1;if(material===s.p.dark)indices.push(a,b,a+1,a+1,b,b+1);else indices.push(a,a+1,b,a+1,b+1,b);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();s.add(g,material);
    return (side:number):V3[]=>Array.from({length:11},(_,i)=>{const t=i/10,taper=infantry?(.83+.17*Math.sin(Math.PI*t)):(.12+.88*Math.sin(t*Math.PI*.68));return[at[0]+side*w*taper*inset*scale,at[1]+(t*2-1)*h*inset*scale,at[2]+offset+Math.cos(.675)*.068] as V3;});
  };
  surface(1,0,s.p.dark);const border=surface(.99,.01,s.p.gold);surface(.91,.016,s.p.armor);
  for(const side of [-1,1])s.curve(border(side),.008,s.p.gold,10);
  // Continuous rear leather straps fasten the shield to the wrist.
  for(const yy of [-.065,.065])s.curve([[at[0]-.073,at[1]+yy,at[2]+.01],[at[0],at[1]+yy,at[2]-.024],[at[0]+.073,at[1]+yy,at[2]+.01]],.008,s.p.dark,6);
  s.ellipsoid([.042,.052,.025],[at[0],at[1],at[2]+.095],s.p.gold);
  if(infantry){for(const side of [-1,1])for(const row of [-1,1])s.plate([[0,0],[side*.071,row*.065],[side*.035,row*.075],[side*.082,row*.203]],.009,[at[0]+side*.034,at[1]+row*.042,at[2]+.084],s.p.cloth,ZERO,.001);}
  else emblem(s,[at[0],at[1]+.055,at[2]+.094],.66);
  for(const side of [-1,1])for(const yy of [-.20,-.06,.10,.23])s.ellipsoid([.006,.006,.004],[at[0]+side*w*.85*scale,at[1]+yy*scale,at[2]+.069],s.p.gold);
}

function cape(parent:THREE.Group,p:Palette,top:number,length:number,wide=.25){
  const g=joint(parent,'cape',[0,top,-.13]),s=new Sculpt(g,p);
  const columns=16,rows=7,positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  const shape=(u:number,t:number):V3=>{
    const spread=wide*(.65+.53*t),x=(u*2-1)*spread;
    return[x,-length*t,-.025-t*.15+Math.sin(u*Math.PI*10)*(.014+t*.017)+Math.cos(u*Math.PI*2)*t*.025];
  };
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){const u=col/columns,t=row/rows;positions.push(...shape(u,t));uvs.push(u,t);}
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const a=row*(columns+1)+col,b=a+columns+1;indices.push(a,a+1,b,a+1,b+1,b);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();s.add(geometry,p.cloth);

  for(const u of [0,1])s.curve(Array.from({length:7},(_,i)=>shape(u,i/6)),.006,p.gold,10);
  s.curve(Array.from({length:15},(_,i)=>shape(i/14,1)),.006,p.gold,18);
  // Brooches attach the draped cloth to the cuirass at its actual shoulders.
  for(const side of [-1,1])s.ellipsoid([.026,.025,.012],[side*wide*.57,-.013,.007],p.gold);
  s.finish();return g;
}

function soldier(parent: THREE.Group, type: string, p: Palette, at: V3 = ZERO, size = 1, mounted = false) {
  const figure = joint(parent, 'figure', at); figure.scale.setScalar(size);
  const torso = joint(figure, 'torso', [0, .67, 0]);
  const body = joint(torso, 'body', [0, -.67, 0]); const s = new Sculpt(body, p);
  const royal = type === 'k' || type === 'q';
  // Breastplate, segmented abdominal armor, riveted belt and hanging leather pteruges.
  s.shell([[-.24,.142,.081],[-.16,.16,.10],[-.03,.19,.132],[.12,.19,.124],[.2,.121,.077]],[0,.887,0],p.armor,14);
  s.shell([[-.16,.145,.09],[-.04,.156,.103],[.09,.139,.086]],[0,.691,0],p.dark,10);
  for(const side of [-1,1]){
    s.ellipsoid([.089,.063,.028],[side*.091,.977,.115],p.armor,[0,side*-.17,side*.07],10);
    s.curve([[side*.171,1.012,.066],[side*.114,1.069,.099],[side*.051,1.084,.080]],.008,p.gold,8);
    s.curve([[side*.028,.789,.11],[side*.075,.85,.126],[side*.139,.899,.107]],.0045,p.gold,7);
  }
  emblem(s,[0,.944,.15],.64);
  for (let i = 0; i < 3; i++) s.box([.28 - i * .015, .058, .18], [0, .77 - i * .047, .015], i === 2 ? p.gold : p.armor, ZERO, .016);
  s.box([.068, .075, .024], [0, .68, .122], p.gold);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7 * 2 - 1) * Math.PI * .87;
    s.box([.054, .19, .033], [Math.sin(a) * .143, .558, Math.cos(a) * .105], p.dark, [0, a, -Math.sin(a) * .13]);
    s.box([.057, .05, .035], [Math.sin(a) * .156, .48, Math.cos(a) * .113], p.gold, [0, a, -Math.sin(a) * .13]);
  }
  // Collar straps, abdominal seams and two rows of tiny shoulder fasteners.
  for(const side of [-1,1]){
    s.box([.039,.17,.021],[side*.137,1.031,.157],p.dark,[0,0,side*.23]);
    for(let stud=0;stud<3;stud++)s.box([.015,.015,.016],[side*.151,1.011-stud*.052,.158],p.gold);
    for(let row=0;row<2;row++)s.box([.061,.025,.013],[side*.07,.791-row*.052,.112],p.dark);
  }
  s.cone(.085, .097, .1, [0, 1.13, 0], p.dark);
  const head = joint(torso, 'head', [0, 1.265 - .67, .006]);
  const hs = new Sculpt(head, p);
  helmet(hs, type, ZERO, royal ? 1.06 : 1);
  hs.finish();
  if (royal) {
    for (const side of [-1, 1]) {
      s.plate(wingShape.map(([x, y]) => [x * side * .8, y * .49]), .055, [side * .22, 1.062, -.015], p.gold, [0, side * -.1, side * -.15]);
      for (let i = 0; i < 4; i++) s.ellipsoid([.033, .04, .032], [side * (.12 + i * .031), 1.116 - i * .008, -.078], p.armor, ZERO, 8);
    }
    s.curve([[-.13, 1.09, .09], [0, .99, .218], [.13, 1.09, .09]], .012, p.gold);
  }
  if (type === 'b' || type === 'q') {
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      s.plate([[-.048, 0], [-.065, -.38], [0, -.42], [.065, -.38], [.048, 0]], .025, [Math.sin(a) * .16, .63, Math.cos(a) * .12], p.cloth, [0, a, 0]);
    }
    for (const side of [-1, 1]) s.box([.028, .39, .03], [side * .09, .46, .153], p.gold, [0, 0, side * -.12]);
  }
  s.finish();
  // Pivoted greaves and sabatons have layered guards, not capsule placeholder legs.
  for (const side of [-1, 1]) {
    const leg = joint(figure, side < 0 ? 'leg-left' : 'leg-right', [side * .092, .59, 0]);
    const l = new Sculpt(leg, p);
    l.cone(.071, .063, .215, [0, -.11, 0], p.dark);
    l.ellipsoid([.067,.058,.041],[0,-.231,.036],p.armor);
    l.curve([[-.061,-.225,.049],[0,-.18,.065],[.061,-.225,.049]],.005,p.gold,7);
    l.plate([[-.06, .115], [0, .14], [.06, .115], [.04, -.125], [-.04, -.125]], .058, [0, -.347, .016], p.armor, ZERO, .012);
    l.rod([0, -.245, .065], [0, -.439, .06], .013, p.gold);
    l.ellipsoid([.068,.043,.112],[0,-.492,.047],p.dark,ZERO,10);
    l.box([.131,.023,.211],[0,-.517,.046],p.dark,ZERO,.005);
    l.box([.135, .037, .15], [0, -.467, .085], p.armor, [-.09, 0, 0], .015);
    for(let tier=0;tier<3;tier++)l.box([.128-tier*.011,.018,.042],[0,-.448-tier*.015,.056+tier*.055],p.gold);
    l.finish();
    if (mounted) { leg.rotation.z = side * .24; leg.rotation.x = -.26; }
  }
  for (const side of [-1, 1]) {
    const arm = joint(torso, side < 0 ? 'weapon-arm' : 'shield-arm', [side * .222, 1.025 - .67, .004]);
    const upper = new Sculpt(arm, p);
    upper.ellipsoid([.104, .088, .115], [side * .012, -.004, 0], p.gold);
    upper.ellipsoid([.107, .06, .098], [side * .022, .024, .008], p.armor);
    for(let plate=0;plate<3;plate++){
      upper.box([.127-plate*.017,.036,.19-plate*.019],[side*(.06+plate*.018),-.015-plate*.033,.006],p.armor,[0,0,side*-.14]);
      upper.box([.023,.022,.024],[side*(.105+plate*.011),-.013-plate*.033,.097-plate*.01],p.gold);
    }
    upper.cone(.061, .055, .175, [side * .019, -.143, .015], p.dark, 8, [0, 0, side * -.08]);
    upper.finish();
    const elbow = joint(arm, side < 0 ? 'weapon-elbow' : 'shield-elbow', [side * .025, -.222, .025]);
    const forearm = new Sculpt(elbow, p);
    forearm.ellipsoid([.049,.048,.048],ZERO,p.dark);
    forearm.ellipsoid([.032,.036,.011],[0,0,-.047],p.armor);
    forearm.box([.115, .17, .115], [side * .004, -.082, .032], p.armor, [-.32, 0, 0], .026);
    forearm.box([.118, .026, .122], [side * .004, -.038, .01], p.gold, [-.32, 0, 0]);
    forearm.finish();
    const wrist = joint(elbow, side < 0 ? 'weapon-wrist' : 'shield-wrist', [side * .004, -.156, .084]);
    const hand = new Sculpt(wrist, p);
    // Articulated leather palm and four curled metal finger segments encircle
    // the hilt. The wrist is shared with the weapon; the grip cannot slide.
    hand.ellipsoid([.039,.049,.026],[0,0,-.02],p.dark);
    hand.plate([[-.035,-.025],[-.036,.032],[0,.05],[.036,.03],[.032,-.032]],.015,[0,.002,-.039],p.armor,[.07,0,0],.004);
    for(let finger=0;finger<4;finger++){
      const yy=-.03+finger*.020;
      hand.rod([-.033,yy,.012],[.025,yy,.022],.010,p.armor,.009,6);
      hand.ellipsoid([.011,.012,.014],[.032,yy,.009],p.gold);
    }
    hand.rod([side*-.031,.022,-.013],[side*-.039,-.007,.021],.015,p.dark,.011,6);
    hand.finish();
    if (side < 0) {
      const held = joint(wrist, 'held-weapon', ZERO);
      const weapon = new Sculpt(held, p);
      if (type === 'b') {
        weapon.rod([0, -.512, 0], [0, .848, 0], .019, p.dark);
        weapon.rod([0, .628, 0], [0, .848, 0], .023, p.gold);
        weapon.ring(.108, .023, [0, .818, 0], p.gold);
        weapon.plate([[0, -.11], [-.055, 0], [0, .13], [.055, 0]], .035, [0, .818, 0], p.steel);
        weapon.box([.16, .025, .045], [0, .818, 0], p.gold);
        joint(held, 'blade-base', [0, .70, 0]);
        joint(held, 'blade-tip', [0, .948, 0]);
      } else if (type === 'n') {
        weapon.rod([0, -.312, 0], [0, 1.158, 0], .019, p.dark);
        weapon.plate([[-.045, 0], [0, .24], [.045, 0]], .028, [0, 1.158, 0], p.steel);
        weapon.plate([[0, 0], [.24, -.025], [.14, -.1], [.23, -.16], [0, -.145]], .012, [0, 1.088, .004], p.cloth, ZERO, .001);
        joint(held, 'blade-base', [0, 1.158, 0]);
        joint(held, 'blade-tip', [0, 1.398, 0]);
      } else {
        const length = type === 'k' ? .67 : type === 'q' ? .62 : .49;
        sword(weapon, ZERO, length, type === 'k');
        joint(held, 'blade-base', [0, .088, 0]);
        joint(held, 'blade-tip', [0, .088 + length, 0]);
      }
      weapon.finish();
    } else {
      const equipment = new Sculpt(wrist, p);
      if (type !== 'b' && type !== 'q') shield(equipment, [0, .158, .055], type === 'k' ? 1.05 : .88, type==='p');
      else equipment.ellipsoid([.057, .071, .055], [.056, .078, .031], p.gold, ZERO, 8);
      equipment.finish();
    }
  }
  cape(torso, p, 1.085 - .67, royal ? .87 : type === 'b' ? .83 : .61, royal ? .31 : .24);
  return figure;
}

function warhorse(parent: THREE.Group, p: Palette) {
  const horse = joint(parent, 'horse', ZERO); const s = new Sculpt(horse, p);
  s.ellipsoid([.215, .235, .35], [0, .585, -.045], p.horse);
  s.shell([[.43,.135,.11,.115],[.58,.16,.16,.15],[.75,.121,.132,.225],[.94,.079,.096,.283],[1.10,.063,.074,.302]],[0,0,0],p.horse,12);
  // Equine skull along its long nasal axis; narrowing cheek to nasal bridge to muzzle.
  const horseHeadPositions:number[]=[],horseHeadIndices:number[]=[],horseHeadUvs:number[]=[];
  const headRows=[[.231,.05,.092,1.095],[.286,.091,.111,1.101],[.348,.086,.096,1.082],[.438,.062,.061,1.04],[.534,.065,.052,.996],[.574,.061,.043,.991]];
  for(let row=0;row<headRows.length;row++){const [zz,rx,ry,cy]=headRows[row];for(let i=0;i<=12;i++){const a=i/12*Math.PI*2;horseHeadPositions.push(Math.sin(a)*rx,Math.cos(a)*ry+cy,zz);horseHeadUvs.push(i/12,row/(headRows.length-1));}}
  for(let row=0;row<headRows.length-1;row++)for(let i=0;i<12;i++){const a=row*13+i,b=a+13;horseHeadIndices.push(a,b,a+1,a+1,b,b+1);}
  const skull=new THREE.BufferGeometry();skull.setAttribute('position',new THREE.Float32BufferAttribute(horseHeadPositions,3));skull.setAttribute('uv',new THREE.Float32BufferAttribute(horseHeadUvs,2));skull.setIndex(horseHeadIndices);skull.computeVertexNormals();s.add(skull,p.horse);
  s.ellipsoid([.059,.039,.013],[0,.991,.577],p.horse);
  for (const side of [-1, 1]) {
    s.cone(.002,.025,.112,[side*.062,1.235,.273],p.horse,6,[-.3,0,side*-.17]);
    s.ellipsoid([.007,.008,.012],[side*.088,1.12,.327],p.dark,ZERO,8);
    // Layered lamellar barding with bright scalloped edges.
    for (let i = 0; i < 4; i++) {
      s.plate([[-.075, .095], [.073, .095], [.069, -.09], [0, -.126], [-.07, -.09]], .028, [side * .205, .67, .18 - i * .137], i % 2 ? p.armor : p.gold, [0, side * Math.PI / 2, 0]);
    }
    s.curve([[side * .107, 1.095, .49], [side * .17, .95, .19], [side * .19, .97, -.035]], .009, p.dark, 10);
    s.curve([[side*.084,1.138,.317],[side*.073,1.081,.412],[side*.059,1.032,.523]],.006,p.gold,7);
  }
  for(const side of [-1,1]){
    s.ellipsoid([.006,.012,.018],[side*.059,.995,.548],p.dark,[0,side*.15,0],6);
    s.box([.018,.075,.075],[side*.122,1.13,.35],p.gold,[0,0,side*.2]);
    for(let stitch=0;stitch<6;stitch++)s.box([.019,.025,.023],[side*.231,.43,-.32+stitch*.097],p.gold);
    for(let tier=0;tier<3;tier++){
      s.box([.027,.044,.19-tier*.018],[side*(.215+tier*.008),.55-tier*.038,-.09],p.cloth);
      s.box([.032,.018,.19-tier*.018],[side*(.215+tier*.008),.525-tier*.038,-.09],p.gold);
    }
    s.curve([[side*.19,.84,-.045],[side*.26,.61,-.1],[side*.27,.51,-.04]],.013,p.gold,7);
  }
  s.curve([[-.061,1.01,.535],[-.043,1.043,.537],[0,1.05,.536],[.043,1.043,.537],[.061,1.01,.535]],.008,p.gold,9);
  s.plate([[-.044,-.04],[0,.10],[.044,-.04],[0,-.12]],.012,[0,1.155,.344],p.armor,[-.55,0,0],.004);
  // A swept mane follows the muscular neck; no stacked triangular toy mane.
  for(let lock=0;lock<9;lock++){
    const yy=1.15-lock*.046,zz=.236-lock*.014;
    s.curve([[0,yy,zz],[.013,yy-.018,zz-.06],[.016,yy-.09,zz-.065]],.018,p.dark,6);
  }
  for(const side of [-1,1]){
    s.curve([[side*.19,.76,.24],[side*.219,.59,.16],[side*.19,.45,.07]],.018,p.dark,9);
    s.curve([[side*.21,.62,-.27],[side*.18,.55,-.02],[side*.19,.56,.21]],.009,p.gold,10);
  }
  s.box([.29, .065, .22], [0, .816, -.08], p.dark, ZERO, .02);
  s.box([.34, .1, .075], [0, .863, .015], p.gold, ZERO, .018);
  s.curve([[0, .65, -.35], [.025, .48, -.45], [.015, .22, -.44]], .055, p.dark);
  s.finish();
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const g = joint(horse, `horse-leg-${side}-${front}`, [side * .145, .575, front * .217 - .04]);
    const l = new Sculpt(g, p);
    l.rod([0, 0, 0], [0, -.25, front > 0 ? -.028 : .044], .065, p.horse, .045);
    l.ellipsoid([.056, .061, .059], [0, -.257, front > 0 ? -.028 : .044], p.gold);
    l.finish();
    const knee=joint(g,`horse-knee-${side}-${front}`,[0,-.25,front>0?-.028:.044]),shin=new Sculpt(knee,p);
    shin.rod([0,-.015,0],[0,-.19,front>0?.035:-.02],.029,p.horse,.022,8);
    shin.ellipsoid([.031,.04,.035],[0,-.19,.02],p.horse);
    shin.box([.095,.064,.123],[0,-.231,.041],p.dark,ZERO,.017);
    shin.box([.098,.012,.125],[0,-.258,.041],p.steel,ZERO,.005);
    shin.plate([[-.023,.06],[.029,.062],[.024,-.05],[-.025,-.046]],.013,[0,-.1,.024],p.armor,ZERO,.003);
    shin.finish();
  }
  const rider = soldier(horse, 'n', p, [0, .42, -.105], .73, true);
  rider.name = 'rider';
  return horse;
}

function chariot(parent: THREE.Group, p: Palette) {
  const vehicle = joint(parent, 'chariot', ZERO); const s = new Sculpt(vehicle, p);
  // A fortified ancient scythed war-carriage: axle, spoked wheels and riveted prow.
  s.box([.74, .13, .65], [0, .275, -.005], p.dark, ZERO, .045);
  for(let plank=0;plank<7;plank++)s.box([.082,.026,.58],[(plank-3)*.09,.375,-.005],plank%2?p.horse:p.dark);
  s.box([.76, .05, .67], [0, .35, -.005], p.gold);
  s.rod([-.51, .28, -.08], [.51, .28, -.08], .041, p.dark);
  s.plate([[-.38, -.125], [-.36, .18], [-.22, .23], [0, .2], [.22, .23], [.36, .18], [.38, -.125]], .095, [0, .51, .285], p.gold, [-.12, 0, 0], .02);
  s.plate([[-.31, -.08], [-.3, .125], [0, .14], [.3, .125], [.31, -.08]], .035, [0, .51, .344], p.armor, [-.12, 0, 0]);
  emblem(s, [0, .535, .382], 1.45);
  for (const side of [-1, 1]) {
    s.box([.05, .3, .57], [side * .34, .48, -.026], p.armor, ZERO, .02);
    s.box([.066, .055, .58], [side * .34, .65, -.024], p.gold);
    for (const z of [-.26, -.075, .11]) s.box([.067, .06, .095], [side * .34, .702, z], p.gold);
    for (let i = 0; i < 4; i++) s.ellipsoid([.013, .012, .014], [side * (.14 + .051 * i), .6, .377], p.gold, ZERO, 6);
    s.plate([[-.05, -.02], [0, .2], [.05, -.02]], .022, [side * .39, .33, .38], p.steel, [Math.PI / 2, 0, 0]);
  }
  // Heavy frontal battering head and corner rivets read in the charge close-up.
  s.box([.61,.10,.085],[0,.33,.416],p.dark);
  s.box([.39,.075,.07],[0,.34,.481],p.gold);
  s.plate([[-.135,-.057],[-.095,.027],[0,.086],[.095,.027],[.135,-.057]],.055,[0,.353,.545],p.steel,[.13,0,0],.009);
  s.ellipsoid([.063,.045,.044],[0,.372,.584],p.gold);
  for(const side of [-1,1]){
    s.box([.067,.20,.074],[side*.3,.45,.4],p.gold);
    for(let bolt=0;bolt<3;bolt++)s.box([.027,.027,.02],[side*.3,.397+bolt*.055,.446],p.steel);
    s.curve(Array.from({length:9},(_,i)=>{const a=i/8*Math.PI;return[side*.434,.28+Math.sin(a)*.283,-.08+Math.cos(a)*.283] as V3;}),.037,p.armor,14);
    s.curve([[side*.3,.40,.41],[side*.35,.52,.40],[side*.30,.65,.40],[side*.20,.68,.40],[side*.18,.62,.40]],.018,p.gold,12);
  }
  // Driver and tall command standard make the rook unmistakable from above.
  const driver = joint(vehicle, 'figure', ZERO);
  const driverBody = new Sculpt(driver, p);
  driverBody.ellipsoid([.125, .16, .08], [0, .79, -.08], p.armor);
  driverBody.box([.25, .05, .16], [0, .86, -.08], p.gold);
  driverBody.finish();
  const driverHead = joint(driver, 'head', [0, 1.035, -.063]);
  const driverHelmet = new Sculpt(driverHead, p);
  helmet(driverHelmet, 'r', ZERO, .8);
  driverHelmet.finish();
  for (const side of [-1, 1]) {
    const arm = joint(driver, side < 0 ? 'weapon-arm' : 'shield-arm', [side * .12, .855, -.065]);
    const driverArm = new Sculpt(arm, p);
    driverArm.rod(ZERO, [side * .05, -.185, .235], .044, p.armor);
    driverArm.box([.075, .045, .07], [side * .05, -.185, .235], p.gold);
    driverArm.finish();
  }
  s.rod([-.17, .67, .17], [.17, .67, .17], .015, p.dark);
  s.rod([.245, .33, -.22], [.245, 1.5, -.22], .016, p.gold);
  s.plate([[-.17, 0], [.17, 0], [.15, -.33], [0, -.39], [-.15, -.33]], .013, [.245, 1.42, -.225], p.cloth, ZERO, .002);
  for(let seam=0;seam<4;seam++)s.box([.23,.011,.008],[.245,1.13+seam*.062,-.238],p.gold);
  s.box([.38, .025, .03], [.245, 1.445, -.218], p.gold);
  emblem(s, [.245, 1.25, -.207], .85);
  s.plate([[-.07, -.05], [0, .07], [.07, -.05]], .025, [.245, 1.515, -.22], p.gold);
  s.finish();
  for (const side of [-1, 1]) {
    const wheel = joint(vehicle, `wheel-${side}`, [side * .437, .28, -.08]); const w = new Sculpt(wheel, p);
    w.ring(.24,.027,ZERO,p.horse,[0,Math.PI/2,0]);
    w.ring(.257,.013,ZERO,p.dark,[0,Math.PI/2,0]);
    w.ring(.237, .018, [side * .04, 0, 0], p.gold, [0, Math.PI / 2, 0]);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      w.rod([0, 0, 0], [0, Math.cos(a) * .218, Math.sin(a) * .218], .015, p.gold);
      w.ellipsoid([.009, .011, .011], [side * .041, Math.cos(a) * .237, Math.sin(a) * .237], p.steel, ZERO, 5);
    }
    w.cone(.085,.085,.024,[side*.054,0,0],p.armor,10,[0,0,Math.PI/2]);
    w.cone(.049, .064, .1, ZERO, p.gold, 10, [0, 0, Math.PI / 2]);
    w.cone(0, .047, .1, [side * .093, 0, 0], p.steel, 5, [0, 0, side * -Math.PI / 2]);
    w.finish();
  }
  return vehicle;
}

/** Bake the resting sculpture into 6–7 shared-material meshes, reserving the rig for action. */
function bakeRest(rig: THREE.Group, p: Palette) {
  rig.updateMatrixWorld(true);
  const resting = new THREE.Group(); resting.name = 'resting'; const s = new Sculpt(resting, p);
  rig.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    s.add(geometry, object.material as THREE.Material);
  });
  s.finish(); return resting;
}

export function createPiece(type: string, color: Faction): THREE.Group {
  const key = `${color}-${type}`;
  if (!prototypes.has(key)) {
    const root = new THREE.Group(); root.name = `legion-${key}`; root.userData = { type, color };
    const p = palette(color), rig = new THREE.Group(); rig.name = 'articulated';
    const grounded = joint(rig, 'grounded-sculpture', ZERO);
    if (type === 'r') { const vehicle = chariot(grounded, p); vehicle.scale.setScalar(.98); vehicle.position.y = .006; }
    else if (type === 'n') warhorse(grounded, p).scale.setScalar(.95);
    else soldier(grounded, type, p, [0, 0, 0], type === 'p' ? .9 : type === 'k' ? 1.04 : type === 'q' ? 1.015 : 1);
    // Boots, hooves and wheels rest directly on the board. Keep this offset in a
    // separate group so the animated rig's bobbing cannot overwrite grounding.
    const bounds = new THREE.Box3().setFromObject(grounded);
    grounded.position.y = -bounds.min.y;
    root.userData.height = bounds.max.y - bounds.min.y;
    const rest = bakeRest(rig, p); root.add(rest, rig); rig.visible = false;
    prototypes.set(key, root);
  }
  const root = prototypes.get(key)!.clone(true);
  root.userData = { ...prototypes.get(key)!.userData };
  return root;
}

interface RigState {
  rest: THREE.Object3D; rig: THREE.Object3D; figure?: THREE.Object3D; cape?: THREE.Object3D;
  left?: THREE.Object3D; right?: THREE.Object3D; weapon?: THREE.Object3D; shield?: THREE.Object3D; head?: THREE.Object3D;
  torso?: THREE.Object3D; elbow?: THREE.Object3D; wrist?: THREE.Object3D; shieldElbow?: THREE.Object3D; shieldWrist?: THREE.Object3D;
  defaults: { object: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Euler }[];
  horse?: THREE.Object3D; horseLegs: THREE.Object3D[]; horseKnees: THREE.Object3D[]; chariot?: THREE.Object3D; wheels: THREE.Object3D[];
}
const stateCache = new WeakMap<THREE.Group, RigState>();

/** Actual cutting-edge sockets, never proxy points attached to the piece root. */
export function getWeaponPose(root: THREE.Group): { base: THREE.Vector3; tip: THREE.Vector3 } | null {
  const rig = root.getObjectByName('articulated');
  const base = rig?.getObjectByName('blade-base');
  const tip = rig?.getObjectByName('blade-tip');
  if (!base || !tip) return null;
  root.updateWorldMatrix(true, true);
  return { base: base.getWorldPosition(new THREE.Vector3()), tip: tip.getWorldPosition(new THREE.Vector3()) };
}

interface StrikePose { hand: V3; blade: V3; elbow: V3; torso: V3; roll: number }
const restStrike: StrikePose = {
  hand: [-.251, .647, .113], blade: [0, 1, 0], elbow: [-.247, .803, .029], torso: [0, 0, 0], roll: 0,
};

function blendPose(a: StrikePose, b: StrikePose, t: number): StrikePose {
  const mix = (x: V3, y: V3): V3 => x.map((v, i) => v + (y[i] - v) * t) as V3;
  return { hand: mix(a.hand, b.hand), blade: mix(a.blade, b.blade), elbow: mix(a.elbow, b.elbow), torso: mix(a.torso, b.torso), roll: a.roll + (b.roll - a.roll) * t };
}

/** Two rigid arm bones, solved without scaling or stretching any geometry. */
function poseWeaponArm(state: RigState, pose: StrikePose) {
  if (!state.weapon || !state.elbow || !state.wrist) return;
  const shoulder = state.weapon.position.clone();
  const upperRest = state.elbow.position.clone(), lowerRest = state.wrist.position.clone();
  const upperLength = upperRest.length(), lowerLength = lowerRest.length();
  const requested = new THREE.Vector3(...pose.hand); requested.y -= .67;
  const direction = requested.clone().sub(shoulder);
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(upperLength - lowerLength) + .001, upperLength + lowerLength - .0001);
  direction.normalize();
  const hand = shoulder.clone().addScaledVector(direction, distance);
  const pole = new THREE.Vector3(...pose.elbow); pole.y -= .67;
  pole.sub(shoulder).addScaledVector(direction, -pole.dot(direction));
  if (pole.lengthSq() < .000001) pole.set(-1, 0, 0).addScaledVector(direction, direction.x);
  pole.normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(pole, height);
  const upperRotation = new THREE.Quaternion().setFromUnitVectors(upperRest.normalize(), elbow.clone().sub(shoulder).normalize());
  state.weapon.quaternion.copy(upperRotation);
  const lowerDirection = hand.sub(elbow).normalize().applyQuaternion(upperRotation.clone().invert());
  const lowerRotation = new THREE.Quaternion().setFromUnitVectors(lowerRest.normalize(), lowerDirection);
  state.elbow.quaternion.copy(lowerRotation);
  // Orient the gripped weapon, with the entire hand following the wrist. The
  // weapon itself never slides or rotates within the fingers.
  const bladeRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...pose.blade).normalize());
  bladeRotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.roll));
  state.wrist.quaternion.copy(upperRotation.clone().multiply(lowerRotation).invert().multiply(bladeRotation));
}

function animateStrike(state: RigState, type: string, progress: number, time: number) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  if (p === 0 || p === 1) return;
  if (type === 'r') {
    // A ram stores weight over the axle, then rocks backward on contact.
    const load = Math.sin(Math.PI * p);
    const recoil = p < .5 ? 0 : Math.sin(Math.PI * Math.min(1, (p - .5) / .25)) * (1 - p);
    if (state.chariot) { state.chariot.rotation.x = -.09 * load + .26 * recoil; state.chariot.rotation.z = -.035 * recoil; }
    if (state.torso) state.torso.rotation.x = .10 * load - .24 * recoil;
    if (state.head) state.head.rotation.x = .12 * load - .13 * recoil;
    if (state.cape) state.cape.rotation.x = .26 * load + .25 * recoil;
    return;
  }
  const queen = type === 'q', king = type === 'k', knight = type === 'n', bishop = type === 'b';
  let windup: StrikePose = {
    hand: [-.35, 1.285, -.06], blade: [-.28, .82, -.52], elbow: [-.44, 1.01, -.085], torso: [-.065, -.38, .045], roll: -.25,
  };
  let contact: StrikePose = {
    hand: [-.15, .99, .37], blade: [.16, .015, 1], elbow: [-.39, .85, .16], torso: [.085, .08, -.025], roll: .35,
  };
  let follow: StrikePose = {
    hand: [-.06, .765, .20], blade: [.78, -.40, .40], elbow: [-.32, .83, .04], torso: [.09, .42, -.06], roll: .65,
  };
  if (queen) {
    windup = { hand: [-.39, 1.24, -.045], blade: [-.59, .7, -.34], elbow: [-.44, .965, -.085], torso: [-.055, -.48, .08], roll: -.42 };
    contact = { hand: [-.13, 1.0, .35], blade: [.30, -.23, 1], elbow: [-.39, .88, .13], torso: [.075, .08, -.035], roll: .47 };
    follow = { hand: [-.04, .79, .185], blade: [.88, -.43, .24], elbow: [-.31, .85, .01], torso: [.075, .51, -.08], roll: .82 };
  } else if (king) {
    windup = { hand: [-.23, 1.335, -.025], blade: [-.08, .89, -.45], elbow: [-.405, 1.08, -.085], torso: [-.11, -.21, .02], roll: -.07 };
    contact = { hand: [-.13, .99, .368], blade: [.035, -.14, 1], elbow: [-.38, .85, .17], torso: [.12, .04, -.015], roll: .12 };
    follow = { hand: [-.095, .75, .225], blade: [.42, -.60, .67], elbow: [-.32, .81, .08], torso: [.14, .30, -.035], roll: .31 };
  } else if (knight) {
    windup = { hand: [-.34, .91, -.03], blade: [.08, .38, 1], elbow: [-.41, .83, -.06], torso: [-.04, -.24, .015], roll: .06 };
    contact = { hand: [-.12, 1.03, .365], blade: [.12, -.20, 1], elbow: [-.38, .86, .16], torso: [.065, .025, 0], roll: .03 };
    follow = { hand: [-.16, 1.0, .35], blade: [.13, -.23, 1], elbow: [-.39, .85, .14], torso: [.085, .09, -.01], roll: .08 };
  } else if (bishop) {
    windup = { hand: [-.36, 1.19, -.08], blade: [-.42, .74, -.43], elbow: [-.43, .95, -.08], torso: [-.055, -.42, .045], roll: -.18 };
    contact = { hand: [-.18, .995, .36], blade: [.12, .015, 1], elbow: [-.41, .86, .14], torso: [.08, .035, -.025], roll: .32 };
    follow = { hand: [-.075, .80, .20], blade: [.71, -.47, .53], elbow: [-.34, .85, .035], torso: [.095, .43, -.055], roll: .59 };
  }
  const smooth = (t: number) => t * t * (3 - 2 * t);
  // Contact is always exactly .5: game-level stance calibration uses this pose.
  // Almost the entire first half is a deliberate lift; the last 4.5–7% is a
  // fast committed blow. Model progress is a timeline, never uniform swing speed.
  const release = knight ? .455 : king ? .45 : queen ? .445 : bishop ? .44 : .43;
  const raised = release - .025;
  const recoil = blendPose(restStrike, windup, .13);
  recoil.torso = [-.035, -.075, .025];
  let pose: StrikePose;
  if (p < raised) pose = blendPose(restStrike, windup, smooth(p / raised));
  else if (p < release) pose = windup;
  else if (p < .5) pose = blendPose(windup, contact, ((p - release) / (.5 - release)) ** 1.65);
  else if (p < .59) pose = blendPose(contact, follow, 1 - (1 - (p - .5) / .09) ** 3);
  else if (p < .74) pose = blendPose(follow, recoil, smooth((p - .59) / .15));
  else pose = blendPose(recoil, restStrike, smooth((p - .74) / .26));
  if (state.torso) state.torso.rotation.set(...pose.torso);
  poseWeaponArm(state, pose);
  const brace = Math.sin(Math.PI * p), impact = p <= .5 ? 0 : Math.sin(Math.PI * Math.min(1, (p - .5) / .24));
  if (state.shield) { state.shield.rotation.x = -.29 * brace + .08 * impact; state.shield.rotation.z = .075 * brace; }
  if (state.shieldElbow) state.shieldElbow.rotation.x = -.48 * brace;
  if (state.shieldWrist) state.shieldWrist.rotation.y = -.13 * brace;
  if (state.head) { state.head.rotation.y = -pose.torso[1] * .55; state.head.rotation.x = -pose.torso[0] * .35 - impact * .055; }
  if (state.cape) { state.cape.rotation.x = .12 * brace + .23 * impact; state.cape.rotation.z = -.08 * Math.sin(p * Math.PI * 2) + Math.sin(time * 8) * .013 * brace + impact * .10; }
  if (state.horse) state.horse.rotation.x = -.06 * impact;
  // Feet stay planted. Only joints articulate; the held blade stays rigidly
  // aligned with its hand, and root position belongs to game-level approach.

}

export function animatePiece(root: THREE.Group, mode: Mode, progress: number, time: number): void {
  let state = stateCache.get(root);
  if (!state) {
    const rig = root.getObjectByName('articulated')!;
    state = {
      rest: root.getObjectByName('resting')!, rig, figure: rig.getObjectByName('figure') || rig.getObjectByName('rider'),
      cape: rig.getObjectByName('cape'), left: rig.getObjectByName('leg-left'), right: rig.getObjectByName('leg-right'),
      weapon: rig.getObjectByName('weapon-arm'), shield: rig.getObjectByName('shield-arm'), head: rig.getObjectByName('head'), defaults: [],
      torso: rig.getObjectByName('torso'), elbow: rig.getObjectByName('weapon-elbow'), wrist: rig.getObjectByName('weapon-wrist'),
      shieldElbow: rig.getObjectByName('shield-elbow'), shieldWrist: rig.getObjectByName('shield-wrist'),
      horse: rig.getObjectByName('horse'), chariot: rig.getObjectByName('chariot'),
      horseLegs: [-1, 1].flatMap(side => [-1, 1].map(front => rig.getObjectByName(`horse-leg-${side}-${front}`)!)).filter(Boolean),
      horseKnees: [-1,1].flatMap(side=>[-1,1].map(front=>rig.getObjectByName(`horse-knee-${side}-${front}`)!)).filter(Boolean),
      wheels: [-1, 1].map(side => rig.getObjectByName(`wheel-${side}`)!).filter(Boolean),
    };
    rig.traverse(object => { if (object instanceof THREE.Group) state!.defaults.push({ object, position: object.position.clone(), rotation: object.rotation.clone() }); });
    stateCache.set(root, state);
  }
  state.defaults.forEach(({ object, position, rotation }) => { object.position.copy(position); object.rotation.copy(rotation); });
  const active = mode !== 'idle'; state.rest.visible = !active; state.rig.visible = active;
  if (!active) {
    // Idle breathing is intentionally subtle; cached resting meshes keep the board fast.
    state.rest.position.y = Math.sin(time * 1.45 + root.position.x * .43) * .002;
    return;
  }
  if (mode === 'attack') {
    animateStrike(state, root.userData.type, progress, time);
    return;
  }
  if (mode === 'fear') {
    const fear = Math.max(.25, Math.min(1, progress)), shake = Math.sin(time * 43) * fear;
    state.rig.position.y = -.029 * fear + Math.abs(shake) * .011;
    state.rig.rotation.z = shake * .022;
    if (state.head) { state.head.rotation.z = .12 * fear + Math.sin(time * 27) * .045 * fear; state.head.rotation.x = -.1 * fear; }
    if (state.weapon) { state.weapon.rotation.z = -1.13 * fear; state.weapon.rotation.x = -.5 * fear + shake * .045; }
    if (state.shield) { state.shield.rotation.z = .8 * fear; state.shield.rotation.x = -.3 * fear; }
    if (state.left) state.left.rotation.x += .12 * fear + shake * .047;
    if (state.right) state.right.rotation.x += -.12 * fear - shake * .047;
    if (state.cape) state.cape.rotation.z = shake * .028;
    if (state.chariot) state.chariot.rotation.z = shake * .04;
    return;
  }
  if (mode === 'relief') {
    const p = Math.max(0, Math.min(1, progress));
    // The start matches fear; a chest pat, lowered shoulders and tilted-back
    // exhale make the release readable before returning exactly to the rest pose.
    const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    const frightened = 1 - ease(p / .48);
    const gesture = Math.sin(Math.PI * Math.max(0, Math.min(1, (p - .12) / .76)));
    const shake = Math.sin(time * 43) * frightened;
    state.rig.position.y = -.029 * frightened + Math.abs(shake) * .011 - gesture * .009;
    state.rig.rotation.z = shake * .022;
    if (state.head) {
      state.head.rotation.z = .12 * frightened + Math.sin(time * 27) * .045 * frightened;
      state.head.rotation.x = -.1 * frightened - .21 * gesture;
      state.head.position.y += .018 * gesture;
    }
    if (state.weapon) {
      state.weapon.rotation.z = -1.13 * frightened + .63 * gesture;
      state.weapon.rotation.x = -.5 * frightened + shake * .045 - .32 * gesture;
      state.weapon.position.y -= .021 * gesture;
    }
    if (state.shield) {
      state.shield.rotation.z = .8 * frightened - .12 * gesture;
      state.shield.rotation.x = -.3 * frightened + .09 * gesture;
      state.shield.position.y -= .034 * gesture;
    }
    if (state.left) state.left.rotation.x += .12 * frightened + shake * .047;
    if (state.right) state.right.rotation.x += -.12 * frightened - shake * .047;
    if (state.figure) state.figure.rotation.x = .035 * gesture;
    if (state.cape) state.cape.rotation.z = shake * .028;
    if (state.chariot) { state.chariot.rotation.z = shake * .04; state.chariot.rotation.x = .025 * gesture; }
    return;
  }
  const p = Math.max(0, Math.min(1, progress));
  const type = root.userData.type, mounted = type === 'n';
  const envelope = Math.sin(Math.PI * p), cadence = p * Math.PI * (type === 'p' ? 10 : 8);
  const stride = Math.sin(cadence), footfall = Math.abs(Math.sin(cadence));
  // Distance-driven gait: the game eases travel, so feet and wheels accelerate
  // with the body rather than running in place during the launch anticipation.
  state.rig.position.y = footfall * .026 * envelope;
  state.rig.rotation.x = .11 * envelope;
  state.rig.rotation.z = stride * .018 * envelope;
  if (state.left) state.left.rotation.x = mounted ? -.28 : stride * .72 * envelope;
  if (state.right) state.right.rotation.x = mounted ? -.28 : -stride * .72 * envelope;
  if (state.torso) state.torso.rotation.y = mounted ? stride * .012 * envelope : -stride * .075 * envelope;
  if (state.weapon) { state.weapon.rotation.x = -.25 * envelope - stride * .24 * envelope; state.weapon.rotation.z = -.07 * envelope; }
  if (state.elbow) state.elbow.rotation.x = -.48 * envelope + stride * .12 * envelope;
  if (state.wrist) state.wrist.rotation.x = .28 * envelope;
  if (state.shield) state.shield.rotation.x = stride * .20 * envelope;
  if (state.head) state.head.rotation.x = -.035 * envelope;
  if (state.cape) { state.cape.rotation.x = .43 * envelope + Math.sin(cadence - .7) * .07 * envelope; state.cape.rotation.z = -stride * .09 * envelope; }
  if (state.horse) {
    const gallop = p * Math.PI * 8;
    state.horse.position.y += Math.max(0, Math.sin(gallop)) * .048 * envelope;
    state.horse.rotation.x = Math.sin(gallop - .45) * .085 * envelope;
    // Forelegs gather together, then the hind pair drive the next bound.
    state.horseLegs.forEach((leg, i) => {
      const phase = gallop + (i % 2 ? .75 : Math.PI) + (i < 2 ? .15 : -.15);
      const beat = Math.sin(phase);
      leg.rotation.x = beat * .63 * envelope;
      if (state.horseKnees[i]) state.horseKnees[i].rotation.x = -Math.max(0, -beat) * 1.0 * envelope;
    });
  }
  if (state.chariot) {
    state.chariot.rotation.z = Math.sin(p * Math.PI * 20) * .013 * envelope;
    state.chariot.rotation.x = -.085 * envelope + Math.sin(p * Math.PI * 10) * .018 * envelope;
    state.wheels.forEach(wheel => { wheel.rotation.x = p * Math.PI * 11; });
    if (state.torso) state.torso.rotation.x = .09 * envelope;
  }
}
