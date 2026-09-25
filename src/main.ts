import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Chess, type Square, type Move } from 'chess.js';
import { createPiece, getWeaponPose, animatePiece as animateSculpt } from './models';
function animatePiece(root:THREE.Group,mode:Parameters<typeof animateSculpt>[1],progress:number,time:number){root.userData.activity=mode;animateSculpt(root,mode,progress,time);}
import { BattleAudio } from './audio';
import { BOARD_Y, CELL, createWorld, BattleEffects, squarePosition, pointSquare } from './world';
import { createUI, pieceNames, svg } from './ui';
import './style.css';

createUI();
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const stage=$('stage'), modal=$('modal');
const params=new URLSearchParams(location.search);
const debug=params.has('debug');
const audio=new BattleAudio();
const game=new Chess();
const scene=new THREE.Scene();
let renderer:THREE.WebGLRenderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:debug});}
catch{ $('loading').innerHTML='<div><h2>IMPERIUM</h2><p>需要啟用 WebGL 的瀏覽器才能進入戰場。</p><p>請啟用瀏覽器硬體加速後重新開啟。</p></div>'; throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(stage.clientWidth,stage.clientHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label','3D 西洋棋戰場，點選棋子再點選亮起的格子移動');renderer.domElement.tabIndex=0;
stage.prepend(renderer.domElement);
const camera=new THREE.PerspectiveCamera(39,stage.clientWidth/stage.clientHeight,.1,120);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=false;controls.minDistance=4;controls.maxDistance=52;controls.minPolarAngle=.14;controls.maxPolarAngle=Math.PI*.445;controls.rotateSpeed=.55;controls.zoomSpeed=.75;
const world=createWorld(scene,renderer);const effects=new BattleEffects(scene);
const pieces=new Map<string,THREE.Group>();
const idleBatches=new Map<string,THREE.InstancedMesh>();
function batchRestingArmy(){
  for(const batch of idleBatches.values())batch.count=0;
  scene.updateMatrixWorld(true);
  for(const root of pieces.values()){
    if(!root.visible)continue;const rest=root.getObjectByName('resting')!;if(root.userData.activity&&root.userData.activity!=='idle')continue;
    rest.traverse(obj=>{if(!(obj instanceof THREE.Mesh))return;const material=obj.material as THREE.Material;const key=`${obj.geometry.uuid}:${material.uuid}`;let batch=idleBatches.get(key);if(!batch){batch=new THREE.InstancedMesh(obj.geometry,material,32);batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);batch.castShadow=true;batch.receiveShadow=true;batch.frustumCulled=false;scene.add(batch);idleBatches.set(key,batch);batch.count=0;}batch.setMatrixAt(batch.count++,obj.matrixWorld);});
    rest.visible=false;
  }
  for(const batch of idleBatches.values())batch.instanceMatrix.needsUpdate=true;
}
const highlightGroup=new THREE.Group();scene.add(highlightGroup);
const routeGroup=new THREE.Group();scene.add(routeGroup);
let hovered:Square|null=null;
const fearGroup=new THREE.Group();scene.add(fearGroup);
const fears=new Set<string>();const fearSprites=new Map<string,THREE.Sprite>();
const reliefs=new Map<string,{time:number,sprite:THREE.Sprite}>();
const pickRay=new THREE.Raycaster(),pointer=new THREE.Vector2(),boardPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-BOARD_Y);
let selected:Square|null=null,legal:Move[]=[],lastSquares:string[]=[],viewSide=1;
let cinematic=true,muted=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,volume=.65;
let elapsed=0,frame=0,paused=false,modalKind='',gameId=0;
let toastTimer:ReturnType<typeof setTimeout>;
let transition:{elapsed:number,duration:number,from:THREE.Vector3,to:THREE.Vector3,lookFrom:THREE.Vector3,lookTo:THREE.Vector3}|null=null;
type Action={move:Move,root:THREE.Group,target?:THREE.Group,from:THREE.Vector3,to:THREE.Vector3,impact:THREE.Vector3,stance:THREE.Vector3,dir:THREE.Vector3,elapsed:number,duration:number,hit:boolean,hitstop:number,started:boolean,swung:boolean,step:number,camPos:THREE.Vector3,camTarget:THREE.Vector3,returnPos:THREE.Vector3,returnTarget:THREE.Vector3,film:boolean,castle?:{root:THREE.Group,from:THREE.Vector3,to:THREE.Vector3}};
let action:Action|null=null;
const gold=new THREE.Color('#f3c275'),red=new THREE.Color('#fc8761');
const moveColor=new THREE.Color('#46ceff'),attackColor=new THREE.Color('#ff655b');

function overviewPosition(){const narrow=stage.clientWidth/stage.clientHeight<1;return new THREE.Vector3(narrow?5.8:11.6,narrow?28.8:16.9,(narrow?23.8:17.6)*viewSide);}
function resetCamera(instant=false){const p=overviewPosition();if(instant){camera.position.copy(p);controls.target.set(0,0,0);controls.update();}else moveCamera(p,new THREE.Vector3(),.7);}
function moveCamera(to:THREE.Vector3,lookTo:THREE.Vector3,duration=.7){transition={elapsed:0,duration,from:camera.position.clone(),to,lookFrom:controls.target.clone(),lookTo};}
resetCamera(true);

function toast(message:string){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2700);}
function openModal(content:string,kind:string){modalKind=kind;modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${kind}" tabindex="-1">${content}</div>`;modal.hidden=false;modal.querySelector<HTMLElement>('button,input,.modal')?.focus();}
function closeModal(){modal.hidden=true;modalKind='';renderer.domElement.focus({preventScroll:true});}
function unlock(){void audio.unlock();}
document.addEventListener('pointerdown',unlock,{passive:true});
document.addEventListener('pointerup',unlock,{passive:true});
document.addEventListener('click',unlock,{passive:true});

function loadSaved(){try{const pgn=localStorage.getItem('imperium-pgn');if(pgn)game.loadPgn(pgn);const s=JSON.parse(localStorage.getItem('imperium-settings')||'{}');cinematic=s.cinematic??true;muted=s.muted??false;volume=s.volume??.65;reduced=s.reduced??reduced;}catch{game.reset();}}
if(!debug)loadSaved();
audio.setVolume(volume);audio.setMuted(muted);
function save(){if(debug)return;try{localStorage.setItem('imperium-pgn',game.pgn());localStorage.setItem('imperium-settings',JSON.stringify({cinematic,muted,volume,reduced}));}catch{/* Private browsing may disable storage. */}}
function syncSettings(){$('sound').innerHTML=svg(muted?'muted':'sound');$('sound').setAttribute('aria-pressed',String(!muted));$('sound').title=muted?'開啟音效':'靜音';$('cinema').classList.toggle('active',cinematic);$('cinema').setAttribute('aria-pressed',String(cinematic));audio.setMuted(muted);audio.setVolume(volume);save();}

function clearGroup(group:THREE.Group){for(const obj of [...group.children]){group.remove(obj);if(obj instanceof THREE.Mesh){obj.geometry.dispose();(obj.material as THREE.Material).dispose();}}}
function clearFear(relax=true){if(relax)for(const square of fears){if(!pieces.has(square))continue;const sprite=new THREE.Sprite(reliefMaterial);sprite.scale.set(.72,.5,1);sprite.position.copy(squarePosition(square)).add(new THREE.Vector3(0,2.05,0));sprite.renderOrder=9;scene.add(sprite);const old=reliefs.get(square);if(old)scene.remove(old.sprite);reliefs.set(square,{time:0,sprite});}fears.clear();fearGroup.clear();fearSprites.clear();}
const fearTexture=(()=>{const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d')!;ctx.fillStyle='#281916';ctx.beginPath();ctx.roundRect(18,8,92,86,14);ctx.fill();ctx.fillStyle='#ffdab0';ctx.font='bold 70px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',64,56);ctx.fillStyle='#281916';ctx.beginPath();ctx.moveTo(56,92);ctx.lineTo(70,112);ctx.lineTo(77,92);ctx.fill();const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;})();
const fearMaterial=new THREE.SpriteMaterial({map:fearTexture,transparent:true,depthTest:false,depthWrite:false});
const reliefMaterial=(()=>{const c=document.createElement('canvas');c.width=192;c.height=128;const g=c.getContext('2d')!;g.fillStyle='#d4e2be';g.beginPath();g.roundRect(10,10,170,85,25);g.fill();g.beginPath();g.moveTo(50,85);g.lineTo(39,110);g.lineTo(85,85);g.fill();g.fillStyle='#3b5541';g.font='bold 39px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('呼～',98,54);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false,depthWrite:false});})();
function fearSquare(square:string){if(fears.has(square))return;const old=reliefs.get(square);if(old){scene.remove(old.sprite);reliefs.delete(square);}fears.add(square);const warrior=pieces.get(square);if(warrior)animatePiece(warrior,'fear',1,reduced?0:elapsed);const sprite=new THREE.Sprite(fearMaterial);sprite.scale.set(.49,.49,1);sprite.position.copy(squarePosition(square)).add(new THREE.Vector3(0,2.22,0));sprite.renderOrder=9;fearGroup.add(sprite);fearSprites.set(square,sprite);}
function mark(square:string,kind:'selected'|'move'|'capture'|'last'|'check'){
  const pos=squarePosition(square);let geometry:THREE.BufferGeometry,mat:THREE.MeshBasicMaterial;
  if(kind==='move'||kind==='capture'){
    const capture=kind==='capture',color=capture?attackColor:moveColor;
    const add=(geometry:THREE.BufferGeometry,opacity:number,x=0,z=0,angle=0)=>{const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));mesh.rotation.set(-Math.PI/2,0,angle);mesh.position.copy(pos).add(new THREE.Vector3(x,.029,z));highlightGroup.add(mesh);};
    add(new THREE.PlaneGeometry(CELL-.12,CELL-.12),capture?.38:.32);
    for(const sign of [-1,1]){add(new THREE.PlaneGeometry(CELL-.14,.045),.9,0,sign*(CELL-.15)/2);add(new THREE.PlaneGeometry(.045,CELL-.14),.9,sign*(CELL-.15)/2,0);}
    if(capture){
      // Crossed blades and four corner brackets remain readable around a model.
      for(const sign of [-1,1])add(new THREE.PlaneGeometry(.045,.27),1,0,.47,sign*Math.PI/4);
      for(const x of [-.55,.55])for(const z of [-.55,.55]){add(new THREE.PlaneGeometry(.22,.07),1,x-Math.sign(x)*.06,z);add(new THREE.PlaneGeometry(.07,.22),1,x,z-Math.sign(z)*.06);}
    }else{
      add(new THREE.RingGeometry(.14,.18,4),1,0,0,Math.PI/4);
      add(new THREE.CircleGeometry(.045,12),1);
    }
    return;
  }
  const rad=kind==='last'?.58:.55;geometry=new THREE.RingGeometry(rad,rad+(kind==='selected'?.065:.025),64);mat=new THREE.MeshBasicMaterial({color:kind==='check'?red:gold,transparent:true,opacity:kind==='last'?.25:.95,depthWrite:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,mat);mesh.rotation.x=-Math.PI/2;mesh.position.copy(pos);mesh.position.y+=.014;highlightGroup.add(mesh);
}
function previewRoute(square:Square|null){
  if(square===hovered)return;hovered=square;clearGroup(routeGroup);
  const label=$('route-label');label.hidden=true;
  const m=selected&&legal.find(m=>m.to===square);if(!m||!selected)return;
  const capture=m.isCapture()||m.isEnPassant(),color=capture?attackColor:moveColor;
  const start=squarePosition(selected),end=squarePosition(m.to),points=[start];
  if(m.piece==='n'){const corner=start.clone();if(Math.abs(end.x-start.x)>Math.abs(end.z-start.z))corner.x=end.x;else corner.z=end.z;points.push(corner);}
  points.push(end);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dir=b.clone().sub(a).normalize(),length=a.distanceTo(b);
    for(let d=.24;d<length-.12;d+=.28){const part=Math.min(.17,length-.12-d);if(part<=0)continue;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.07,part),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false,side:THREE.DoubleSide}));mesh.rotation.set(-Math.PI/2,0,Math.atan2(dir.x,dir.z));mesh.position.copy(a).addScaledVector(dir,d+part/2);mesh.position.y+=.051;routeGroup.add(mesh);}
  }
  const last=points[points.length-2],dir=end.clone().sub(last).normalize();const shape=new THREE.Shape();shape.moveTo(0,.16);shape.lineTo(-.14,-.13);shape.lineTo(.14,-.13);shape.closePath();
  const arrow=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthWrite:false}));arrow.rotation.set(-Math.PI/2,0,Math.PI+Math.atan2(dir.x,dir.z));arrow.position.copy(end).addScaledVector(dir,-.38);arrow.position.y+=.055;routeGroup.add(arrow);
  label.classList.toggle('attack',capture);label.textContent=`${capture?'⚔ 攻擊':'◇ 移動'}  ${selected.toUpperCase()} → ${m.to.toUpperCase()}${m.isEnPassant()?' · 吃過路兵':m.isKingsideCastle()||m.isQueensideCastle()?' · 王車易位':m.piece==='n'?' · 可越過棋子':''}`;label.hidden=false;
}
function compactMarks(){
  // Whole-cell fills, outlines and icons share a few draws across the board.
  const batches=new Map<string,{material:THREE.MeshBasicMaterial,geometries:THREE.BufferGeometry[]}>();
  for(const object of [...highlightGroup.children]){
    const mesh=object as THREE.Mesh,material=mesh.material as THREE.MeshBasicMaterial;
    const key=`${material.color.getHex()}:${material.opacity}`;
    let batch=batches.get(key);if(!batch){material.forceSinglePass=true;batch={material,geometries:[]};batches.set(key,batch);}else material.dispose();
    mesh.updateMatrix();mesh.geometry.applyMatrix4(mesh.matrix);batch.geometries.push(mesh.geometry);highlightGroup.remove(mesh);
  }
  for(const {material,geometries}of batches.values()){
    highlightGroup.add(new THREE.Mesh(mergeGeometries(geometries,false)!,material));
    geometries.forEach(g=>g.dispose());
  }
}
function refreshMarks(){previewRoute(null);clearGroup(highlightGroup);lastSquares.forEach(s=>mark(s,'last'));if(selected){mark(selected,'selected');const done=new Set<string>();for(const m of legal){if(done.has(m.to))continue;done.add(m.to);mark(m.to,m.isCapture()||m.isEnPassant()?'capture':'move');}}if(game.isCheck()){for(const[s,g]of pieces)if(g.userData.type==='k'&&g.userData.color===game.turn())mark(s,'check');}compactMarks();}
function syncPieces(){for(const p of pieces.values())scene.remove(p);pieces.clear();clearFear(false);for(const r of reliefs.values())scene.remove(r.sprite);reliefs.clear();for(const row of game.board())for(const p of row)if(p){const root=createPiece(p.type,p.color);root.userData.square=p.square;root.userData.type=p.type;root.userData.color=p.color;root.position.copy(squarePosition(p.square));root.rotation.y=p.color==='w'?Math.PI:0;pieces.set(p.square,root);scene.add(root);}selected=null;legal=[];const hist=game.history({verbose:true});lastSquares=hist.length?[hist[hist.length-1].from,hist[hist.length-1].to]:[];refreshMarks();updateUI();}
function updateUI(){const turn=game.turn(),history=game.history({verbose:true});
  $('turn-title').textContent=game.isCheckmate()?'戰役終結':game.isDraw()?'和局':turn==='w'?'曜金帝國':'黑曜軍團';
  $('turn-description').textContent=game.isCheckmate()?'將死，王權已有歸屬。':game.isDraw()?'雙方軍團，旗鼓相當。':game.isCheck()?'⚠ 君王遭到將軍，必須解除威脅。':`${turn==='w'?'白':'黑'}方行動${selected?'，選擇亮起的格子。':'，選擇一名戰士。'}`;
  $('round-number').textContent=`ROUND ${String(game.moveNumber()).padStart(2,'0')}`;
  $('move-count').textContent=`${String(history.length).padStart(2,'0')} MOVES`;
  for(const c of ['w','b']){ $(`player-${c}`).classList.toggle('active',turn===c&&!game.isGameOver());const captured=history.filter(m=>m.color===c&&m.captured).map(m=>pieceNames[m.captured!].symbol).join(' ');$(`captured-${c}`).innerHTML=`<small>已俘獲</small>${captured||'—'}`;}
  if(history.length){let html='';for(let i=0;i<history.length;i+=2)html+=`<div class="history-row"><span>${Math.floor(i/2)+1}.</span><span>${history[i].san}</span><span>${history[i+1]?.san||'· · ·'}</span></div>`;$('history').innerHTML=html;$('history').scrollTop=$('history').scrollHeight;}
  else $('history').innerHTML='<div class="history-empty"><em>⚔</em>戰旗已升起<br>你的第一步，將書寫歷史。</div>';
  $('undo').toggleAttribute('disabled',!history.length||!!action);
  if(selected){const p=game.get(selected)!,info=pieceNames[p.type];const captures=new Set(legal.filter(m=>m.isCapture()||m.isEnPassant()).map(m=>m.to)).size;const moves=new Set(legal.map(m=>m.to)).size;
    $('unit-info').innerHTML=`<div class="unit-heading"><span class="unit-symbol">${info.symbol}</span><div><div class="unit-title">${info.title} · ${selected.toUpperCase()}</div><div class="unit-subtitle">${info.english}</div></div></div><p class="unit-description">${info.rule}<br><span class="destination-count"><span class="move-count">◇ ${moves-captures} 格可移動</span> · <span class="attack-count">⚔ ${captures} 格可攻擊</span>${captures?`<br>${captures} 名敵人正在發抖！`:''}</span> <button id="inspect" style="background:none;color:#dcc58e;border:0;padding:4px 0;font-size:10px;cursor:pointer">近看 ↗</button></p>`;
  }else $('unit-info').innerHTML='<div class="unit-heading"><span class="unit-symbol">♜</span><div><div class="unit-title">你的軍團，聽候號令。</div><div class="unit-subtitle">SELECT YOUR WARRIOR</div></div></div><p class="unit-description">點選己方棋子查看合法走位。<br>再點選亮起的格子，展開行動。</p>';
}
function selectSquare(square:Square){if(action||game.isGameOver())return;
  const possible=legal.filter(m=>m.to===square);
  if(selected&&possible.length){if(possible.some(m=>m.isPromotion()))choosePromotion(selected,square);else commitMove(selected,square);return;}
  const piece=game.get(square);clearFear();
  if(piece?.color===game.turn()&&selected!==square){selected=square;legal=game.moves({square,verbose:true});audio.play('select',piece.type);for(const m of legal)if(m.isCapture())fearSquare(m.to);else if(m.isEnPassant())fearSquare(`${m.to[0]}${square[1]}`);if(fears.size)toast(`${fears.size} 名敵人：不要選我！`);}
  else {if(piece&&piece.color!==game.turn())toast('輪到對方了，請選擇己方棋子。');selected=null;legal=[];}
  refreshMarks();updateUI();
}
function choosePromotion(from:Square,to:Square){openModal(`<div class="eyebrow">A NEW LEGEND RISES</div><h2>戰功晉升</h2><p>你的步兵已抵達敵方底線。<br>選擇新的兵種，繼續征戰。</p><div class="promotion-choices">${['q','r','b','n'].map(p=>`<button data-promotion="${p}"><strong>${pieceNames[p].symbol}</strong><small>${pieceNames[p].name}</small></button>`).join('')}</div><button class="secondary" data-close>返回棋盤</button>`,'升變');modal.querySelectorAll<HTMLButtonElement>('[data-promotion]').forEach(button=>button.onclick=()=>{closeModal();commitMove(from,to,button.dataset.promotion!);});}

function commitMove(from:Square,to:Square,promotion='q'){
  if(action)return;let move:Move;try{move=game.move({from,to,promotion});}catch{toast('這一步不合法，請選擇亮起的格子。');return;}
  const root=pieces.get(from)!;const captureSquare=move.isEnPassant()?`${to[0]}${from[1]}`:to;const target=move.captured?pieces.get(captureSquare):undefined;
  const start=squarePosition(from),end=squarePosition(to),impact=target?squarePosition(captureSquare):end.clone(),dir=impact.clone().sub(start).normalize();
  selected=null;legal=[];clearFear();previewRoute(null);clearGroup(highlightGroup);transition=null;
  controls.update();controls.enabled=false;
  action={move,root,target,from:start,to:end,impact,stance:impact.clone().addScaledVector(dir,target?-.63:0),dir,elapsed:0,duration:reduced?.6:cinematic?(target?4.5:3.05):target?1.8:1.25,hit:false,hitstop:0,started:false,swung:false,step:0,camPos:camera.position.clone(),camTarget:controls.target.clone(),returnPos:new THREE.Vector3(),returnTarget:new THREE.Vector3(),film:cinematic&&!reduced};
  if(move.isKingsideCastle()||move.isQueensideCastle()){const rank=from[1],rf=`${move.isKingsideCastle()?'h':'a'}${rank}`,rt=`${move.isKingsideCastle()?'f':'d'}${rank}`;action.castle={root:pieces.get(rf)!,from:squarePosition(rf),to:squarePosition(rt)};}
  root.rotation.y=Math.atan2(dir.x,dir.z);
  if(target&&move.piece!=='r'){
    // Place the sword's cutting edge (not the warrior's body) at the enemy.
    animatePiece(root,'attack',.5,elapsed);root.updateMatrixWorld(true);
    const weapon=getWeaponPose(root);
    if(weapon){const reach=weapon.base.clone().lerp(weapon.tip,.84).sub(root.position);action.stance.copy(impact).sub(new THREE.Vector3(reach.x,0,reach.z));}
    animatePiece(root,'idle',0,elapsed);
  }
  effects.clearWeaponTrail();
  stage.classList.toggle('cinematic',action.film);$('action-name').textContent=pieceNames[move.piece].verb;
  $('action-detail').textContent=`${move.color==='w'?'AURELIAN LEGION':'OBSIDIAN ORDER'}  /  ${from.toUpperCase()} → ${to.toUpperCase()}${target?'  /  ELIMINATION':''}`;
  $('undo').setAttribute('disabled','');clearTimeout(toastTimer);$('toast').classList.remove('visible');$('turn-description').textContent='軍令已下，戰士正在行動。';const count=$('unit-info').querySelector('.destination-count');if(count)count.textContent=`前往 ${to.toUpperCase()}${target?' · 發起攻擊':''}`;
  if(target)fearSquare(captureSquare);
  effects.ring(start,move.color==='w'?gold:red,.5);
}
const clamp=THREE.MathUtils.clamp;
const smooth=(t:number)=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function animateAction(dt:number){
  const a=action;if(!a)return;
  const impactTime=.69,attackStart=.5,attackSpan=.38;
  const slow=a.target&&a.film&&a.elapsed/a.duration>impactTime&&a.elapsed/a.duration<.735?.68:1;
  if(a.hitstop>0){a.hitstop-=dt;a.elapsed+=dt*.06;}else a.elapsed+=dt*slow;
  // Present the exact contact pose even when a slow frame crosses the hit time.
  if(a.target&&!a.hit&&a.elapsed>=a.duration*impactTime)a.elapsed=a.duration*impactTime;
  const t=Math.min(a.elapsed/a.duration,1),type=a.move.piece,color=a.move.color==='w'?gold:red;
  const armed=!!a.target&&type!=='r',runEnd=a.target?(armed?.5:impactTime):.66;
  const run=clamp((t-.17)/(runEnd-.17),0,1),attackProgress=clamp((t-attackStart)/attackSpan,0,1);
  if(t>=.17&&!a.started){a.started=true;audio.play(type==='r'?'charge':'move',type);if(type==='r'&&a.target)audio.battleCry('attack',type);}
  if(t>=attackStart+attackSpan*.34&&a.target&&!a.swung){a.swung=true;if(type!=='r'){audio.play('charge',type);audio.battleCry('attack',type);}}
  a.root.position.lerpVectors(a.from,a.stance,smooth(run));
  a.root.rotation.z=0;
  if(a.target&&t>.81)a.root.position.lerpVectors(a.stance,a.to,smooth((t-.81)/.16));
  if(t<.17){
    a.root.position.addScaledVector(a.dir,-Math.sin(t/.17*Math.PI)*.1);
    animatePiece(a.root,'move',0,elapsed);
  }else if(t<runEnd){
    if(type==='n')a.root.position.y+=Math.sin(run*Math.PI)*1.55;
    else if(type!=='r')a.root.position.y+=Math.abs(Math.sin(run*Math.PI*(type==='p'?6:4)))*.07;
    animatePiece(a.root,'move',run,elapsed);
    if(type==='r')a.root.rotation.z=Math.sin(run*Math.PI)*.065;
    const step=Math.floor(run*(type==='n'?4:6));if(step>a.step){a.step=step;audio.play('step',type);}
    if(!reduced&&frame%2===0)effects.emit(a.root.position,type==='r'?6:2,color,type==='r'?1.4:.7);
  }else animatePiece(a.root,a.target?'attack':'idle',attackProgress,elapsed);
  if(a.castle){a.castle.root.position.lerpVectors(a.castle.from,a.castle.to,smooth(run));animatePiece(a.castle.root,'move',run,elapsed);}
  const weapon=armed?getWeaponPose(a.root):null;
  if(weapon&&!reduced&&attackProgress>.33&&attackProgress<.72)effects.weaponTrail(weapon.base,weapon.tip,color);
  if(t>=impactTime&&!a.hit){
    a.hit=true;a.hitstop=a.target&&!reduced?.11:0;clearFear(false);
    audio.play(a.target?'impact':'land',type);
    const hitPoint=weapon?weapon.base.clone().lerp(weapon.tip,.84):a.impact.clone();
    if(a.target&&type==='r')hitPoint.y+=.55;
    effects.impact(hitPoint,color);effects.ring(a.impact,color,.62);
    if(a.target){audio.play('capture',type);audio.battleCry('defeat',a.target.userData.type);if(!reduced)$('flash').animate([{opacity:.17},{opacity:0}],{duration:170});}
  }
  if(a.target){
    if(t<impactTime){animatePiece(a.target,'fear',1,reduced?0:elapsed);a.target.position.copy(squarePosition(a.target.userData.square));if(!reduced){a.target.position.x+=Math.sin(elapsed*48)*.025;a.target.rotation.z=Math.sin(elapsed*39)*.045;}}
    else if(reduced)a.target.visible=false;
    else{const q=clamp((t-impactTime)/.25,0,1),fly=a.dir.clone();fly.x+=.3*(a.move.color==='w'?1:-1);fly.normalize();a.target.position.copy(squarePosition(a.target.userData.square)).addScaledVector(fly,q*12);a.target.position.y+=Math.sin(q*Math.PI)*4.8-q*2;a.target.rotation.x=q*9;a.target.rotation.z=q*6;a.target.rotation.y+=dt*9;if(frame%3===0)effects.emit(a.target.position,4,red,2.5);if(q>=1)a.target.visible=false;}
  }
  if(a.film){
    // Film from the weapon side so the grip, blade and enemy stay in silhouette.
    const side=new THREE.Vector3(-a.dir.z,0,a.dir.x),focus=a.root.position.clone().add(new THREE.Vector3(0,.95,0));
    const duel=smooth((t-.44)/.12)*(1-smooth((t-.82)/.05));
    if(a.target)focus.lerp(a.impact.clone().add(new THREE.Vector3(0,.9,0)),duel*.4);
    const distance=(camera.aspect<1?7.2:5.5)-duel*(camera.aspect<1?.65:1.0);
    const shot=focus.clone().addScaledVector(side,distance*.93).addScaledVector(a.dir,distance*(.38-duel*.1));shot.y=focus.y+(type==='r'?1.25:1.38)-duel*.15;
    if(type==='n'){shot.addScaledVector(side,Math.sin(t*Math.PI)*.6);shot.y+=.25;}
    if(type==='b'||type==='q')shot.addScaledVector(a.dir,Math.sin(t*Math.PI)*.45);
    if(t<.2){const k=smooth(t/.2);camera.position.lerpVectors(a.camPos,shot,k);controls.target.lerpVectors(a.camTarget,focus,k);}
    else if(t<.86){camera.position.copy(shot);controls.target.copy(focus);if(a.target&&t>.72){const pull=clamp((t-.72)/.12,0,1);camera.position.addScaledVector(side,pull*.7);controls.target.lerp(a.target.position.clone().add(new THREE.Vector3(0,.7,0)),pull*.16);}a.returnPos.copy(camera.position);a.returnTarget.copy(controls.target);}
    else{const k=smooth((t-.86)/.14);camera.position.lerpVectors(a.returnPos,a.camPos,k);controls.target.lerpVectors(a.returnTarget,a.camTarget,k);}
    if(a.target&&t>=impactTime&&t<.735&&!reduced){const strength=(1-(t-impactTime)/.045)*.065;camera.position.x+=Math.sin(elapsed*113)*strength;camera.position.y+=Math.cos(elapsed*91)*strength;}
    camera.lookAt(controls.target);camera.fov=39+Math.sin(run*Math.PI)*(type==='r'?5:2);camera.updateProjectionMatrix();
  }
  if(t>=1)finishAction();
}
function finishAction(){if(!action)return;const a=action;
  if(a.film){camera.position.copy(a.camPos);controls.target.copy(a.camTarget);camera.fov=39;camera.updateProjectionMatrix();}
  action=null;effects.clearWeaponTrail();controls.enabled=true;stage.classList.remove('cinematic');syncPieces();save();
  if(game.isGameOver()){audio.play(game.isCheckmate()?'victory':'check');const id=gameId;setTimeout(()=>{if(id===gameId&&game.isGameOver())showResult();},450);}
  else if(game.isCheck()){audio.play('check');toast('將軍！君王需要你的保護。');}
}
function drawReason(){return game.isStalemate()?'無合法走位，逼和。':game.isInsufficientMaterial()?'雙方剩餘兵力不足以將死。':game.isThreefoldRepetition()?'相同局面已重複三次。':game.isDrawByFiftyMoves()?'連續五十回合沒有兵移動或吃子。':'本局以和棋結束。';}
function showResult(){const winner=game.turn()==='w'?'黑曜軍團':'曜金帝國';openModal(`<div class="eyebrow">${game.isCheckmate()?'VICTORY IS ETERNAL':'AN HONOURABLE DRAW'}</div><div style="font-size:58px;color:#d4b878">${game.isCheckmate()?'♚':'⚔'}</div><h2>${game.isCheckmate()?`${winner}獲勝`:'榮耀和局'}</h2><p>${game.isCheckmate()?'敵方君王已被將死，戰役落幕。':drawReason()}<br>共 ${game.history().length} 步，載入帝國史冊。</p><div class="modal-actions"><button class="secondary" data-close>檢視戰場</button><button class="primary" id="rematch">再戰一局</button></div>`,'戰役結果');$('rematch').onclick=()=>startNew();}
function startNew(fen?:string){gameId++;if(action)finishAction();closeModal();if(fen)game.load(fen);else game.reset();syncPieces();resetCamera();save();toast(fen?'演示戰局：白車可攻擊三個方向的敵棋。':'新的戰役，白方先行。');}
function undo(){if(action||!game.history().length)return;gameId++;game.undo();closeModal();syncPieces();audio.play('undo');save();toast('已撤回上一步。');}
const demoFen='4k3/8/3n4/8/1b1R2p1/8/8/7K w - - 0 1';
function askNew(){if(action)return;openModal('<div class="eyebrow">A NEW CAMPAIGN</div><h2>新的戰役</h2><p>重新集結兩支軍團，開始標準對局。<br>目前戰局將被取代。</p><div class="modal-actions"><button class="secondary" data-close>繼續對弈</button><button class="primary" id="confirm-new">開始新局</button></div>','新的戰役');$('confirm-new').onclick=()=>startNew();}
function settings(){if(action)return;openModal(`<div class="eyebrow">MAKE THE BATTLE YOURS</div><h2>戰場設定</h2><label class="setting-row"><span>電影運鏡<small>每次行動切入兵種專屬鏡位</small></span><input class="switch" id="setting-cinema" type="checkbox" ${cinematic?'checked':''}></label><label class="setting-row"><span>減少動態<small>固定視角、加速行動、停用震動</small></span><input class="switch" id="setting-motion" type="checkbox" ${reduced?'checked':''}></label><label class="setting-row"><span>戰場音量<small>所有聲音在本機合成</small></span><input id="setting-volume" type="range" min="0" max="1" step=".05" value="${volume}" aria-label="戰場音量"></label><div class="demo-choices"><button class="secondary" id="demo">戰車演示</button><button class="secondary" id="sword-demo">揮劍演示</button></div><div class="modal-actions"><button class="primary" data-close>返回戰場</button></div><button id="settings-new" style="margin-top:20px;border:0;background:none;color:#a9b49d;font-size:11px">開始新的標準對局</button><p style="font-size:9px;margin-bottom:0">演示會開啟獨立戰局，取代目前棋局。</p>`,'設定');
  $<HTMLInputElement>('setting-cinema').onchange=e=>{cinematic=(e.target as HTMLInputElement).checked;syncSettings();};
  $<HTMLInputElement>('setting-motion').onchange=e=>{reduced=(e.target as HTMLInputElement).checked;syncSettings();};
  $<HTMLInputElement>('setting-volume').oninput=e=>{volume=Number((e.target as HTMLInputElement).value);audio.setVolume(volume);save();};
  $('demo').onclick=()=>{startNew(demoFen);toast('點選 D4 戰車：三名敵棋都會嚇到發抖。');};$('sword-demo').onclick=()=>{startNew(demoFen.replace('1b1R2p1','1b1Q2p1'));toast('點選 D4 女皇，再點紅格敵棋，觀看揮劍與戰吼。');};$('settings-new').onclick=askNew;
}
function help(){openModal(`<div class="eyebrow">THE COMMANDER'S HANDBOOK</div><h2>指揮你的軍團</h2><div class="help-grid"><p><b>01 · 選擇戰士</b><br>雙方共用同一台裝置，白方先行。點選己方棋子，藍色菱形格可移動，紅色交叉劍格可攻擊。滑過目的地可預覽同色路線。</p><p><b>02 · 下達命令</b><br>點選合法目標完成移動。能被吃掉的敵人會害怕發抖！動畫期間按空白鍵可略過。</p><p><b>03 · 奪取王權</b><br>遵循標準西洋棋规则，支援王車易位、吃過路兵、升變、將軍、將死與和棋。</p><p>拖曳旋轉 · 滾輪／雙指縮放<br><span class="keyboard">U</span>悔棋 <span class="keyboard">F</span>換邊 <span class="keyboard">R</span>全景 <span class="keyboard">ESC</span>取消</p></div><div class="modal-actions"><button class="primary" data-close>進入戰場</button></div>`,'玩法說明');}
modal.addEventListener('click',e=>{if((e.target as HTMLElement).closest('[data-close]')||e.target===modal)closeModal();});
$('sound').onclick=()=>{muted=!muted;syncSettings();};$('settings').onclick=settings;$('help').onclick=help;$('new-game').onclick=askNew;$('undo').onclick=undo;
$('flip').onclick=()=>{if(action)return;viewSide*=-1;resetCamera();};$('reset-camera').onclick=()=>{if(!action)resetCamera();};$('cinema').onclick=()=>{cinematic=!cinematic;syncSettings();toast(cinematic?'電影運鏡已開啟。':'切換為戰術視角。');};$('skip').onclick=finishAction;
$('unit-info').addEventListener('click',e=>{if((e.target as HTMLElement).closest('#inspect')&&selected&&!action){const root=pieces.get(selected)!;const pos=root.position.clone().add(new THREE.Vector3(0,.8,0));const front=root.userData.color==='w'?-1:1;moveCamera(pos.clone().add(new THREE.Vector3(2.6,1.8,front*3.2)),pos,.8);}});

let pointerStart={x:0,y:0,id:-1};const activePointers=new Set<number>();let multiTouch=false;
renderer.domElement.addEventListener('pointerdown',e=>{activePointers.add(e.pointerId);if(activePointers.size>1)multiTouch=true;pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId};});
function pickSquare(clientX:number,clientY:number,coarse=false):Square|null{const rect=renderer.domElement.getBoundingClientRect();pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);scene.updateMatrixWorld(true);pickRay.setFromCamera(pointer,camera);
  const intersections=coarse?[]:pickRay.intersectObjects([...pieces.values()],true);let square:string|null=null,hitDistance=Infinity;
  for(const hit of intersections){let node:THREE.Object3D|null=hit.object;let visible=true,found:string|null=null;while(node){if(!node.visible)visible=false;if(node.userData.square)found=node.userData.square;node=node.parent;}if(visible&&found){square=found;hitDistance=hit.distance;break;}}
  // The sculpted limbs have intentional gaps. A compact selection volume lets a
  // click on the silhouette still select its owner instead of the tile behind it.
  {let distance=hitDistance;const box=new THREE.Box3(),hit=new THREE.Vector3();for(const [s,root]of pieces){box.min.set(root.position.x-.39,BOARD_Y,root.position.z-.39);box.max.set(root.position.x+.39,BOARD_Y+(root.userData.height||1.6),root.position.z+.39);if(pickRay.ray.intersectBox(box,hit)){const d=hit.distanceTo(pickRay.ray.origin);if(d<distance){distance=d;square=s;}}}}
  const groundPoint=new THREE.Vector3();const groundSquare=pickRay.ray.intersectPlane(boardPlane,groundPoint)?pointSquare(groundPoint):null;
  if(selected&&groundSquare&&legal.some(m=>m.to===groundSquare)&&!legal.some(m=>m.to===square))square=groundSquare;
  if(!square)square=groundSquare;
  return square as Square|null;
}
renderer.domElement.addEventListener('pointerup',e=>{activePointers.delete(e.pointerId);if(multiTouch){if(!activePointers.size)multiTouch=false;return;}if(e.pointerId!==pointerStart.id||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>7||action||!modal.hidden)return;const square=pickSquare(e.clientX,e.clientY);if(square)selectSquare(square);});
renderer.domElement.addEventListener('pointermove',e=>{if(e.buttons||action||!selected||!modal.hidden)return;const square=pickSquare(e.clientX,e.clientY,true);previewRoute(square&&legal.some(m=>m.to===square)?square:null);renderer.domElement.style.cursor=hovered?'pointer':'grab';});
renderer.domElement.addEventListener('pointerleave',()=>previewRoute(null));
renderer.domElement.addEventListener('pointercancel',e=>{activePointers.delete(e.pointerId);pointerStart.id=-1;multiTouch=false;});
window.addEventListener('blur',()=>{activePointers.clear();multiTouch=false;pointerStart.id=-1;});
document.addEventListener('keydown',e=>{if(e.key==='Tab'&&!modal.hidden){const focusables=[...modal.querySelectorAll<HTMLElement>('button,input,[tabindex="0"]')];if(focusables.length){const first=focusables[0],last=focusables[focusables.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return;}if(e.key==='Escape'){if(!modal.hidden)closeModal();else if(action)finishAction();else{selected=null;legal=[];clearFear();refreshMarks();updateUI();}return;}if(!modal.hidden)return;unlock();if(e.code==='Space'){e.preventDefault();finishAction();}if(e.key.toLowerCase()==='u')undo();if(e.key.toLowerCase()==='f')$('flip').click();if(e.key.toLowerCase()==='r')$('reset-camera').click();});
const resizeObserver=new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);renderer.setPixelRatio(Math.min(devicePixelRatio,w<760?1.5:1.6));if(!action)resetCamera(true);});resizeObserver.observe(stage);

syncPieces();syncSettings();$('loading').remove();
const clock=new THREE.Clock();
function render(){requestAnimationFrame(render);const dt=Math.min(clock.getDelta(),.07);frame++;
  if(!paused){elapsed+=dt;world.update(elapsed);effects.update(dt);
    for(const [square,root]of pieces){if(action&&(root===action.root||root===action.target||root===action.castle?.root))continue;const afraid=fears.has(square),relief=reliefs.get(square);animatePiece(root,afraid?'fear':relief?'relief':'idle',afraid?1:relief?relief.time/1.45:0,reduced?0:elapsed);const pos=squarePosition(square);root.position.copy(pos);root.rotation.set(0,root.userData.color==='w'?Math.PI:0,0);if(afraid&&!reduced){root.position.x+=Math.sin(elapsed*47+pos.z)*.027;root.position.y+=Math.abs(Math.sin(elapsed*23))*.025;root.rotation.z=Math.sin(elapsed*39+pos.x)*.038;}else if(relief&&!reduced){root.position.y-=Math.sin(relief.time/1.45*Math.PI)*.045;root.rotation.x=-Math.sin(relief.time/1.45*Math.PI)*.06;}}
    for(const [square,r]of reliefs){r.time+=dt;r.sprite.position.y=BOARD_Y+2.05+r.time*.18;r.sprite.scale.setScalar(.65*Math.min(1,r.time*8)*Math.min(1,(1.45-r.time)*5));if(r.time>=1.45){scene.remove(r.sprite);reliefs.delete(square);}}
    for(const [square,sprite]of fearSprites){sprite.position.copy(squarePosition(square)).add(new THREE.Vector3(Math.sin(elapsed*7)*.05,2.17+Math.sin(elapsed*5)*.07,0));sprite.material.rotation=Math.sin(elapsed*13)*.07;}
    if(action)animateAction(dt);else if(transition){transition.elapsed+=dt;const k=smooth(transition.elapsed/transition.duration);camera.position.lerpVectors(transition.from,transition.to,k);controls.target.lerpVectors(transition.lookFrom,transition.lookTo,k);camera.lookAt(controls.target);if(k>=1)transition=null;}else controls.update();
  }
  batchRestingArmy();
  renderer.render(scene,camera);
  if(debug){const gl=renderer.getContext();const info=gl.getExtension('WEBGL_debug_renderer_info');(window as any).__THREE_GAME_DIAGNOSTICS__={frame,fps:Math.round(1/Math.max(dt,.001)),game:{fen:game.fen(),turn:game.turn(),moves:game.history().length,selected,legal:legal.map(m=>m.to),fear:[...fears],animating:!!action,actionProgress:action?action.elapsed/action.duration:0,gameOver:game.isGameOver()},renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},memory:renderer.info.memory,quality:{dpr:renderer.getPixelRatio(),shadowMapSize:2048,shadowLights:1,postPasses:0},gpu:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};}
}
render();
if(debug){
  (window as any).__CHESS_DEBUG__={voiceStatus:()=>audio.voiceStatus(),state:()=>({fen:game.fen(),selected,legal:legal.map(m=>m.to),fears:[...fears],relief:[...reliefs.keys()],animating:!!action,history:game.history(),turn:game.turn(),gameOver:game.isGameOver(),cinematic,reduced,muted,pieces:pieces.size}),load:(fen:string)=>{if(action)finishAction();game.load(fen);syncPieces();closeModal();},project:(square:string,height=.1)=>{const v=squarePosition(square);v.y+=height;v.project(camera);const r=renderer.domElement.getBoundingClientRect();return{x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};},combat:()=>{if(!action)return null;const weapon=getWeaponPose(action.root);const joints=['torso','weapon-arm','weapon-elbow','weapon-wrist'].map(name=>{const o=action!.root.getObjectByName(name);return{name,rotation:o?.rotation.toArray()};});return{progress:action.elapsed/action.duration,hit:action.hit,root:action.root.position.toArray(),target:action.target?.position.toArray(),impact:action.impact.toArray(),weapon:weapon?{base:weapon.base.toArray(),tip:weapon.tip.toArray()}:null,joints};},ranges:()=>({selected,hovered,moves:[...new Set(legal.filter(m=>!m.isCapture()&&!m.isEnPassant()).map(m=>m.to))],attacks:[...new Set(legal.filter(m=>m.isCapture()||m.isEnPassant()).map(m=>m.to))],routeColor:routeGroup.children.length?(routeGroup.children[0] as THREE.Mesh).material instanceof THREE.MeshBasicMaterial?((routeGroup.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHexString():null:null}),pieceStats:()=>[...pieces.entries()].map(([s,g])=>{const box=new THREE.Box3().setFromObject(g);return{square:s,type:g.userData.type,size:box.getSize(new THREE.Vector3()).toArray()};})};
  (window as any).__THREE_GAME_TEST_HOOKS__={seed:()=>{elapsed=0;},setState:async(name:string)=>{if(action)finishAction();closeModal();paused=false;elapsed=0;cinematic=true;reduced=false;transition=null;viewSide=1;if(name==='active-play'){game.reset();game.move('e4');game.move('e5');syncPieces();selectSquare('g1');}else if(name==='threat-preview'){game.load(demoFen);syncPieces();selectSquare('d4');}else if(name==='checkmate'){game.reset();for(const m of ['f3','e5','g4','Qh4#'])game.move(m);syncPieces();showResult();}else throw new Error(`Unknown state ${name}`);resetCamera(true);return{state:name};},setPausedForScreenshot:(value:boolean)=>{paused=value;},setReducedMotion:(value:boolean)=>{reduced=value;},hideDebugUi:()=>{}};
}
