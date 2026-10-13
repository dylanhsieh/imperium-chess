import * as THREE from 'three';

export interface MaterialDetail { rect:THREE.Vector4; finish:THREE.Vector4; }
let maps:{color:THREE.Texture;normal:THREE.Texture}|undefined;
/** Two shared, local maps serve every metal/leather/cloth surface in both armies. */
export function getMaterialMaps(){
 if(maps)return maps;
 const loader=new THREE.TextureLoader();
 const color=loader.load(new URL('./assets/ancient-color-atlas.webp',import.meta.url).href);
 const normal=loader.load(new URL('./assets/ancient-normal-atlas.webp',import.meta.url).href);
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
