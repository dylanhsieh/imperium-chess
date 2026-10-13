import * as THREE from 'three';

export interface MaterialDetail { rect:THREE.Vector4; finish:THREE.Vector4; }
let maps:{color:THREE.Texture;normal:THREE.Texture}|undefined;
/** Two shared, local maps serve every metal/leather/cloth surface in both armies. */
export function getMaterialMaps(){
 if(maps)return maps;
 const loader=new THREE.ImageLoader();
 const placeholder=(normalMap:boolean)=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2;
  const paint=canvas.getContext('2d')!;
  if(normalMap){paint.fillStyle='rgb(128,128,255)';paint.fillRect(0,0,2,2);}
  else for(const [x,y,value]of [[0,0,.62],[1,0,.51],[0,1,.30],[1,1,.57]]){paint.fillStyle=`rgb(${Math.round(value*255)},${Math.round(value*255)},${Math.round(value*255)})`;paint.fillRect(x,y,1,1);}
  const texture=new THREE.Texture(canvas);texture.needsUpdate=true;return texture;
 };
 const color=placeholder(false),normal=placeholder(true);
 loader.load(new URL('./assets/ancient-color-atlas.webp',import.meta.url).href,image=>{color.image=image;color.needsUpdate=true;});
 loader.load(new URL('./assets/ancient-normal-atlas.webp',import.meta.url).href,image=>{normal.image=image;normal.needsUpdate=true;});
 for(const texture of [color,normal]){texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;texture.colorSpace=THREE.NoColorSpace;}
 color.name='imagegen-antique-surface-detail';normal.name='imagegen-antique-micro-normals';
 maps={color,normal};return maps;
}
export function getMaterialDetail(name:string):MaterialDetail|null{
 // Atlas coordinates are inset to keep mip filtering away from adjacent swatches.
 const rect=(x:number,y:number)=>new THREE.Vector4(x+.008,y+.008,.484,.484);
 if(/enamel-and-plate|blade-edges/.test(name))return{rect:rect(0,.5),finish:new THREE.Vector4(.62,.32,.22,.10)};
 if(name.includes('antique-trim'))return{rect:rect(.5,.5),finish:new THREE.Vector4(.51,.30,.28,.12)};
 if(name.includes('leather-and-recesses'))return{rect:rect(0,0),finish:new THREE.Vector4(.30,.38,.22,.12)};
 if(name.includes('ceremonial-cloth'))return{rect:rect(.5,0),finish:new THREE.Vector4(.57,.40,.20,.09)};
 return null;
}
