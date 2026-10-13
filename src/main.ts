import {getGameStatus,getSelectionGuide,explainMove,explainIllegalMove,claimDraw,intendedDrawMoves,RULES_SOURCE} from './rules-guide';
import type {Difficulty} from './ai-search';
import * as THREE from 'three';
import {ContactShadows,getGraphicsMode,setGraphicsMode,onGraphicsChange,installGraphicsDiagnostics} from './surface-shading';
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
const world=createWorld(scene,renderer);const effects=new BattleEffects(scene);const contacts=new ContactShadows(scene,32);installGraphicsDiagnostics(renderer,debug);
const pieces=new Map<string,THREE.Group>();
const cameraCutaways=new Set<THREE.Group>();
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
let matchMode:'local'|'ai'='local',humanColor:'w'|'b'='w',difficulty:Difficulty='normal';
let adjudication:{kind:string;reason:string;winner?:'w'|'b'}|null=null;
let thinking=false,aiWorker:Worker|null=null,aiTimer:ReturnType<typeof setTimeout>|null=null,aiTimeout:ReturnType<typeof setTimeout>|null=null,aiGeneration=0,aiError='',aiStats:any=null;
let journalTab:'moves'|'history'='moves',illegalMessage='';
let cachedRuleFen='',cachedRules:ReturnType<typeof getGameStatus>|null=null;
const moveReasons=new Map<string,string>();
let commanderVoice=true;
let cinematic=true,muted=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,volume=.65;
let elapsed=0,frame=0,paused=false,modalKind='',gameId=0;
let toastTimer:ReturnType<typeof setTimeout>;
let transition:{elapsed:number,duration:number,from:THREE.Vector3,to:THREE.Vector3,lookFrom:THREE.Vector3,lookTo:THREE.Vector3}|null=null;
type Action={move:Move,root:THREE.Group,target?:THREE.Group,from:THREE.Vector3,to:THREE.Vector3,impact:THREE.Vector3,stance:THREE.Vector3,dir:THREE.Vector3,elapsed:number,duration:number,hit:boolean,hitstop:number,started:boolean,swung:boolean,step:number,camPos:THREE.Vector3,camTarget:THREE.Vector3,returnPos:THREE.Vector3,returnTarget:THREE.Vector3,film:boolean,castle?:{root:THREE.Group,from:THREE.Vector3,to:THREE.Vector3}};
let action:Action|null=null;
const gold=new THREE.Color('#f3c275'),red=new THREE.Color('#fc8761');
const moveColor=new THREE.Color('#46ceff'),attackColor=new THREE.Color('#ff655b');

function phoneLayout(){return matchMedia('(max-width:760px), (max-height:500px) and (pointer:coarse)').matches;}
function overviewPosition(){
  if(!phoneLayout()&&camera.aspect>=.8){const narrow=stage.clientWidth/stage.clientHeight<1;return new THREE.Vector3(narrow?5.8:11.6,narrow?28.8:16.9,(narrow?23.8:17.6)*viewSide);}
  // Fit every board corner and tall helmet above the touch toolbar.
  const probe=new THREE.PerspectiveCamera(39,camera.aspect,.1,120),direction=new THREE.Vector3(0,.89,.45*viewSide).normalize(),lower=stage.clientWidth>stage.clientHeight?-.91:-.69;
  for(let distance=16;distance<=52;distance+=.25){probe.position.copy(direction).multiplyScalar(distance);probe.lookAt(0,0,0);probe.updateMatrixWorld();let fits=true;
    for(const x of[-6.2,6.2])for(const z of[-6.2,6.2])for(const y of[0,2.1]){const v=new THREE.Vector3(x,y,z).project(probe);if(Math.abs(v.x)>.94||v.y>.93||v.y<lower)fits=false;}
    if(fits)return probe.position.clone();
  }return direction.multiplyScalar(52);
}
function resetCamera(instant=false){const p=overviewPosition();if(instant){camera.position.copy(p);controls.target.set(0,0,0);controls.update();}else moveCamera(p,new THREE.Vector3(),.7);}
function moveCamera(to:THREE.Vector3,lookTo:THREE.Vector3,duration=.7){transition={elapsed:0,duration,from:camera.position.clone(),to,lookFrom:controls.target.clone(),lookTo};}
resetCamera(true);

function toast(message:string){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2700);}
function openModal(content:string,kind:string){cancelAI();modalKind=kind;modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${kind}" tabindex="-1">${content}</div>`;modal.hidden=false;modal.querySelector<HTMLElement>('button,input,.modal')?.focus();}
function closeModal(){modal.hidden=true;modalKind='';renderer.domElement.focus({preventScroll:true});queueMicrotask(scheduleAI);}
function unlock(){void audio.unlock();}
document.addEventListener('pointerdown',unlock,{passive:true});
document.addEventListener('pointerup',unlock,{passive:true});
document.addEventListener('click',unlock,{passive:true});

function loadSaved(){try{const pgn=localStorage.getItem('imperium-pgn');if(pgn)game.loadPgn(pgn);const s=JSON.parse(localStorage.getItem('imperium-settings')||'{}');commanderVoice=s.commanderVoice??true;cinematic=s.cinematic??true;muted=s.muted??false;volume=s.volume??.65;reduced=s.reduced??reduced;matchMode=s.matchMode==='ai'?'ai':'local';humanColor=s.humanColor==='b'?'b':'w';difficulty=['easy','normal','hard'].includes(s.difficulty)?s.difficulty:'normal';adjudication=s.adjudication?.fen===game.fen()?s.adjudication:null;}catch{game.reset();}}
if(!debug)loadSaved();
audio.setVolume(volume);audio.setMuted(muted);
function save(){if(debug)return;try{localStorage.setItem('imperium-pgn',game.pgn());localStorage.setItem('imperium-settings',JSON.stringify({cinematic,muted,volume,reduced,commanderVoice,matchMode,humanColor,difficulty,adjudication:adjudication?{...adjudication,fen:game.fen()}:null}));}catch{/* Private browsing may disable storage. */}}
function cinemaEnabled(){return cinematic&&!reduced;}
function setCinematic(enabled:boolean){
  cinematic=enabled;
  // An explicit request for the film camera overrides reduced motion in this game.
  // Keep the system preference as the initial default until the player chooses.
  if(enabled)reduced=false;
  syncSettings();
}
function syncSettings(){
  const film=cinemaEnabled();
  $('sound').innerHTML=svg(muted?'muted':'sound');$('sound').setAttribute('aria-pressed',String(!muted));$('sound').title=muted?'開啟音效':'靜音';
  $('cinema').classList.toggle('active',film);$('cinema').setAttribute('aria-pressed',String(film));$('cinema').innerHTML=svg('film')+`運鏡：${film?'開':'關'}`;
  $('cinema').title=reduced?'減少動態已啟用；點一下開啟完整電影運鏡':film?'關閉電影運鏡':'開啟電影運鏡';
  const cinemaSwitch=document.getElementById('setting-cinema') as HTMLInputElement|null,motionSwitch=document.getElementById('setting-motion') as HTMLInputElement|null;
  if(cinemaSwitch)cinemaSwitch.checked=film;if(motionSwitch)motionSwitch.checked=reduced;
  const note=document.getElementById('cinema-status');if(note)note.textContent=reduced?'減少動態已啟用；開啟運鏡會切回完整動畫':film?'移動與攻擊時，切入兵種專屬鏡位':'目前使用固定戰術視角';
  document.documentElement.classList.toggle('reduced-motion',reduced);
  audio.setMuted(muted);audio.setVolume(volume);audio.setAnnouncer(commanderVoice);save();
}

function clearGroup(group:THREE.Group){for(const obj of [...group.children]){group.remove(obj);if(obj instanceof THREE.Mesh){obj.geometry.dispose();(obj.material as THREE.Material).dispose();}}}
function clearFear(relax=true){if(relax&&fears.size)audio.announce('relief');if(relax)for(const square of fears){if(!pieces.has(square))continue;const sprite=new THREE.Sprite(reliefMaterial);sprite.scale.set(.72,.5,1);sprite.position.copy(squarePosition(square)).add(new THREE.Vector3(0,2.05,0));sprite.renderOrder=9;scene.add(sprite);const old=reliefs.get(square);if(old)scene.remove(old.sprite);reliefs.set(square,{time:0,sprite});}fears.clear();fearGroup.clear();fearSprites.clear();}
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
function syncPieces(){cameraCutaways.clear();for(const p of pieces.values())scene.remove(p);pieces.clear();clearFear(false);for(const r of reliefs.values())scene.remove(r.sprite);reliefs.clear();for(const row of game.board())for(const p of row)if(p){const root=createPiece(p.type,p.color);root.userData.square=p.square;root.userData.type=p.type;root.userData.color=p.color;root.position.copy(squarePosition(p.square));root.rotation.y=p.color==='w'?Math.PI:0;pieces.set(p.square,root);scene.add(root);}selected=null;legal=[];const hist=game.history({verbose:true});lastSquares=hist.length?[hist[hist.length-1].from,hist[hist.length-1].to]:[];refreshMarks();updateUI();}
const demoFen='4k3/8/3n4/8/1b1R2p1/8/8/7K w - - 0 1';
function matchViewSide(){return matchMode==='ai'&&humanColor==='b'?-1:1;}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
function ruleStatus(){const fen=game.fen();if(!cachedRules||cachedRuleFen!==fen){cachedRuleFen=fen;cachedRules=getGameStatus(game);}return adjudication?{...cachedRules,over:true,kind:adjudication.kind,title:adjudication.winner?'戰役終結':'和棋',reason:adjudication.reason,winner:adjudication.winner}:cachedRules;}
function invalidateRules(){cachedRules=null;illegalMessage='';}
function humanTurn(){return matchMode==='local'||game.turn()===humanColor;}
function reasonFor(move:Move){const key=move.before+' '+move.lan;let reason=moveReasons.get(key);if(!reason){reason=explainMove(new Chess(move.before),move);moveReasons.set(key,reason);}return reason;}
function historyHtml(){const history=game.history({verbose:true});if(!history.length)return '<div class="history-empty"><em>⚔</em>尚未落子。<br>每一步完成後，這裡會保留走法原因。</div>';return history.map((move,index)=>`<article class="history-step"><header><span class="ply-number">${index+1}.</span><b>${move.san}</b><small>${move.color==='w'?'白':'黑'} · ${move.from.toUpperCase()} → ${move.to.toUpperCase()}</small></header><p>${escapeHtml(reasonFor(move))}</p></article>`).join('');}
function guideHtml(){const status=ruleStatus(),source=`<p class="rule-source">依據 <a href="${RULES_SOURCE.url}" target="_blank" rel="noopener">FIDE 現行棋規</a> · 2023 生效版<br>核對日期：2026-10-13</p>`;if(status.over)return `<p class="rule-summary">${escapeHtml(status.reason)}</p>${source}`;if(!selected)return `<p class="rule-summary">${game.isCheck()?'君王正在被將軍。只能走解除將軍的步，不能忽略威脅。':'先選一枚己方棋子。每一個合法目的地都會附上走法原因。'}</p><p class="rule-summary">${humanTurn()?'藍格是移動，紅格是吃子。點不能走的格子，也會解釋限制。':'現在由 AI 行棋，你仍可查看棋譜與旋轉棋盤。'}</p>${source}`;const guide=getSelectionGuide(game,selected);const steps=guide.moves.filter((entry,index,list)=>list.findIndex(e=>e.move.to===entry.move.to)===index);return `${illegalMessage?`<div class="illegal-reason" role="status">${escapeHtml(illegalMessage)}</div>`:''}<p class="rule-summary">${escapeHtml(guide.summary)}</p>${guide.restrictions.length?`<ul class="rule-restrictions">${guide.restrictions.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>`:''}${steps.map(({move,reason})=>`<button class="legal-step ${move.captured?'attack':''}" data-destination="${move.to}" aria-label="走到 ${move.to}"><strong>${move.from.toUpperCase()} → ${move.to.toUpperCase()}<small>${move.captured?'吃子':move.isKingsideCastle()||move.isQueensideCastle()?'王車易位':'移動'}</small></strong><p>${escapeHtml(move.promotion?'兵合法到達底線後，接著選擇升變為后、車、象或馬；是否將軍依選擇決定。':reason)}</p></button>`).join('')}${source}`;}
function updateJournal(){const guide=$('rule-guide'),history=$('history');guide.innerHTML=guideHtml();history.innerHTML=historyHtml();guide.hidden=journalTab!=='moves';history.hidden=journalTab!=='history';document.querySelectorAll<HTMLElement>('[data-journal-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.journalTab===journalTab)));if(journalTab==='history')history.scrollTop=history.scrollHeight;}
function openJournal(){openModal(`<div class="eyebrow">THE COMMANDER’S JOURNAL</div><h2>走得明白，才是戰術。</h2><div class="journal-tabs" role="tablist"><button data-journal-tab="moves" role="tab" aria-selected="${journalTab==='moves'}">走法與限制</button><button data-journal-tab="history" role="tab" aria-selected="${journalTab==='history'}">每步棋譜</button></div><div id="modal-guide" class="rule-guide" ${journalTab==='history'?'hidden':''}>${guideHtml()}</div><div id="modal-history" class="history-list" ${journalTab==='moves'?'hidden':''}>${historyHtml()}</div><button data-open-draw class="secondary" style="margin-top:15px">和棋選項</button><div class="modal-actions"><button class="primary" data-close>返回棋盤</button></div>`,'走法與棋譜');modal.querySelector('.modal')!.classList.add('journal-modal');}
function updateUI(){const turn=game.turn(),history=game.history({verbose:true}),status=ruleStatus();
 world.setTurn(turn,reduced||frame===0);document.documentElement.dataset.turn=turn;
 $('turn-banner').textContent=`${turn==='w'?'☀ 白方':'☾ 黑方'}${thinking?' · AI 思考中':'行動'}`;
 document.querySelector('.scene-tag')!.textContent=turn==='w'?'白方回合 · 曜金神殿':'黑方回合 · 黑曜長夜';
 $('turn-title').textContent=status.over?status.title:thinking?'AI 正在思考':turn==='w'?'白方行動':'黑方行動';
 $('turn-description').textContent=status.over?status.reason:game.isCheck()?'⚠ 被將軍：必須先解除威脅。':thinking?'本機運算中，可以旋轉或查看棋譜。':`${turn==='w'?'曜金帝國':'黑曜軍團'}${selected?'，點亮格落子。':'，選擇一名戰士。'}`;
 $('match-config').textContent=matchMode==='ai'?`AI · 你執${humanColor==='w'?'白':'黑'}`:'雙人 · 換模式';
 $('ai-status').hidden=!thinking&&!aiError;$('ai-status').textContent=aiError||`◌ AI 思考中 · ${difficulty==='easy'?'入門':difficulty==='hard'?'挑戰':'標準'} · 本機運算`;$('ai-retry').hidden=!aiError;
 $('round-number').textContent=`ROUND ${String(game.moveNumber()).padStart(2,'0')}`;$('move-count').textContent=String(history.length);
 for(const c of ['w','b']){$(`player-${c}`).classList.toggle('active',turn===c&&!status.over);const captured=history.filter(m=>m.color===c&&m.captured).map(m=>pieceNames[m.captured!].symbol).join(' ');$(`captured-${c}`).innerHTML=`<small>${matchMode==='ai'?(c===humanColor?'你':'AI'):'已俘獲'}</small>${captured||'—'}`;}
 updateJournal();const canUndo=matchMode==='local'?history.length>0:history.some(m=>m.color===humanColor);
 $('undo').toggleAttribute('disabled',!canUndo||!!action);$('cancel-selection').toggleAttribute('disabled',!selected||!!action);$('claim-draw').textContent=status.claimable.length?'可申請和棋 · 查看':'和棋選項';
 if(selected){const p=game.get(selected)!,info=pieceNames[p.type],captures=new Set(legal.filter(m=>m.isCapture()||m.isEnPassant()).map(m=>m.to)).size,moves=new Set(legal.map(m=>m.to)).size;
 $('unit-info').innerHTML=`<div class="unit-heading"><span class="unit-symbol">${info.symbol}</span><div><div class="unit-title">${info.title} · ${selected.toUpperCase()}</div><div class="unit-subtitle">${info.english}</div></div></div><p class="unit-description"><span class="unit-rule">${info.rule}<br></span><span class="destination-count"><span class="move-count">◇ ${moves-captures} 格移動</span> · <span class="attack-count">⚔ ${captures} 格吃子</span></span> <button id="inspect" style="background:none;color:#dcc58e;border:0;padding:4px;font-size:10px">近看 ↗</button></p>${illegalMessage?`<div id="rule-feedback">${escapeHtml(illegalMessage)}</div>`:''}`;
 }else $('unit-info').innerHTML=`<div class="unit-heading"><span class="unit-symbol">♜</span><div><div class="unit-title">${status.over?'戰役已落幕':matchMode==='ai'?'挑戰帝國棋手':'你的軍團，聽候號令。'}</div><div class="unit-subtitle">COMMAND WITH CONFIDENCE</div></div></div><p class="unit-description">${status.over?'開啟棋譜，回顧每步走法。':'點棋子看合法走法與原因。<br>藍格移動 · 紅格吃子'}</p>`;
}
function selectSquare(square:Square){if(action||ruleStatus().over)return;if(!humanTurn()){toast('現在是 AI 的回合，請等它落子。');return;}
 const possible=legal.filter(m=>m.to===square);
 if(selected&&possible.length){if(possible.some(m=>m.isPromotion()))choosePromotion(selected,square);else commitMove(selected,square);return;}
 const piece=game.get(square);
 if(selected&&square!==selected&&piece?.color!==game.turn()){illegalMessage=explainIllegalMove(game,selected,square);audio.play('invalid');toast(illegalMessage);journalTab='moves';updateUI();return;}
 clearFear();illegalMessage='';journalTab='moves';
 if(piece?.color===game.turn()&&selected!==square){selected=square;legal=game.moves({square,verbose:true});audio.play('select',piece.type);for(const m of legal)if(m.isCapture())fearSquare(m.to);else if(m.isEnPassant())fearSquare(`${m.to[0]}${square[1]}`);if(fears.size)audio.announce('fear');if(!legal.length)toast(getSelectionGuide(game,square).summary);}
 else{if(piece&&piece.color!==game.turn())toast(`現在輪到${game.turn()==='w'?'白':'黑'}方，這是對方的棋子。`);selected=null;legal=[];}
 refreshMarks();updateUI();
}
function choosePromotion(from:Square,to:Square){openModal(`<div class="eyebrow">A NEW LEGEND RISES</div><h2>戰功晉升</h2><p>你的步兵已抵達敵方底線。<br>選擇新的兵種，繼續征戰。</p><div class="promotion-choices">${['q','r','b','n'].map(p=>`<button data-promotion="${p}"><strong>${pieceNames[p].symbol}</strong><small>${pieceNames[p].name}</small></button>`).join('')}</div><button class="secondary" data-close>返回棋盤</button>`,'升變');modal.querySelectorAll<HTMLButtonElement>('[data-promotion]').forEach(button=>button.onclick=()=>{closeModal();commitMove(from,to,button.dataset.promotion!);});}

function commitMove(from:Square,to:Square,promotion='q',byAI=false){
  if(action||ruleStatus().over||(!byAI&&!humanTurn()))return;cancelAI();let move:Move;try{move=game.move({from,to,promotion});}catch{toast(explainIllegalMove(game,from,to));return;}invalidateRules();journalTab='history';
  const root=pieces.get(from)!;const captureSquare=move.isEnPassant()?`${to[0]}${from[1]}`:to;const target=move.captured?pieces.get(captureSquare):undefined;
  const start=squarePosition(from),end=squarePosition(to),impact=target?squarePosition(captureSquare):end.clone(),dir=impact.clone().sub(start).normalize();
  selected=null;legal=[];clearFear();previewRoute(null);clearGroup(highlightGroup);transition=null;
  controls.update();controls.enabled=false;
  action={move,root,target,from:start,to:end,impact,stance:impact.clone().addScaledVector(dir,target?-.63:0),dir,elapsed:0,duration:reduced?.6:cinematic?(target?4.5:3.05):target?1.8:1.25,hit:false,hitstop:0,started:false,swung:false,step:0,camPos:camera.position.clone(),camTarget:controls.target.clone(),returnPos:new THREE.Vector3(),returnTarget:new THREE.Vector3(),film:cinemaEnabled()};
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
  $('undo').setAttribute('disabled','');$('cancel-selection').setAttribute('disabled','');clearTimeout(toastTimer);$('toast').classList.remove('visible');$('turn-description').textContent='軍令已下，戰士正在行動。';const count=$('unit-info').querySelector('.destination-count');if(count)count.textContent=`前往 ${to.toUpperCase()}${target?' · 發起攻擊':''}`;
  if(target)fearSquare(captureSquare);
  effects.ring(start,move.color==='w'?gold:red,.5);
  updateJournal();$('move-count').textContent=String(game.history().length);$('ai-status').hidden=true;$('ai-retry').hidden=true;$('turn-title').textContent=move.color==='w'?'白方行動':'黑方行動';$('turn-banner').textContent=move.color==='w'?'☀ 白方行動':'☾ 黑方行動';
}
const clamp=THREE.MathUtils.clamp;
const smooth=(t:number)=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function animateAction(dt:number){
  const a=action;if(!a)return;audio.setBattlePosition(a.root.position.clone().project(camera).x);
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
    // A shot sequence per archetype: establish, track, wind-up, contact, exit.
    // Keep to the weapon side and widen portrait shots so both combatants fit.
    const side=new THREE.Vector3(-a.dir.z,0,a.dir.x),portrait=camera.aspect<1;
    const profiles={p:{height:1.3,distance:5.0,arc:.18},r:{height:.64,distance:5.7,arc:.35},n:{height:1.65,distance:6.2,arc:.35},b:{height:2.1,distance:5.3,arc:.28},q:{height:1.45,distance:5.0,arc:.40},k:{height:.93,distance:5.3,arc:.20}};
    const profile=profiles[type],duel=a.target?smooth((t-.46)/.11)*(1-smooth((t-.78)/.08)):0;
    const focus=a.root.position.clone().add(new THREE.Vector3(0,type==='n'?1.1:.98,0));
    if(a.target)focus.lerp(a.impact.clone().add(new THREE.Vector3(0,.96,0)),duel*.43);
    const distance=(portrait?profile.distance*1.32:profile.distance)-duel*(portrait?.30:.65);
    const angle=.24+profile.arc*Math.sin(Math.PI*clamp((t-.12)/.75,0,1));
    const shot=focus.clone().addScaledVector(side,distance*Math.cos(angle)).addScaledVector(a.dir,distance*Math.sin(angle));
    shot.y=focus.y+profile.height-duel*.22;
    if(type==='r'){shot.y-=Math.sin(run*Math.PI)*.2;shot.addScaledVector(a.dir,-Math.sin(run*Math.PI)*.8);}
    if(type==='n'){shot.y+=Math.sin(run*Math.PI)*.6;shot.addScaledVector(side,Math.sin(run*Math.PI)*.55);}
    if(type==='b')shot.y+=(1-smooth((t-.40)/.18))*.6;
    const aftermath=a.target?smooth((t-.735)/.10)*(1-smooth((t-.84)/.03)):0;
    if(a.target&&aftermath>0){focus.lerp(a.target.position.clone().add(new THREE.Vector3(0,.6,0)),aftermath*.2);shot.y+=aftermath*.65;shot.addScaledVector(side,aftermath*.9);}
    shot.y=Math.max(BOARD_Y+.62,shot.y);
    if(t<.20){const k=smooth(t/.20);camera.position.lerpVectors(a.camPos,shot,k);controls.target.lerpVectors(a.camTarget,focus,k);}
    else if(t<.86){camera.position.copy(shot);controls.target.copy(focus);a.returnPos.copy(camera.position);a.returnTarget.copy(controls.target);}
    else{const k=smooth((t-.86)/.14);camera.position.lerpVectors(a.returnPos,a.camPos,k);controls.target.lerpVectors(a.returnTarget,a.camTarget,k);}
    if(a.target&&t>=impactTime&&t<.735&&!reduced){const strength=(1-(t-impactTime)/.045)*.065;camera.position.x+=Math.sin(elapsed*113)*strength;camera.position.y+=Math.cos(elapsed*91)*strength;}
    camera.lookAt(controls.target);const impactPunch=a.target&&t>=impactTime?Math.exp(-(t-impactTime)*85)*4.2:0;
    // Cut away foreground bystanders that the tracking camera would intersect.
    // Combatants stay visible; syncPieces restores the full army after the shot.
    if(t>.08&&t<.90){
      const sight=controls.target.clone().sub(camera.position),length=sight.length();sight.normalize();
      for(const root of pieces.values()){
        if(root===a.root||root===a.target||root===a.castle?.root)continue;
        const center=root.position.clone().add(new THREE.Vector3(0,(root.userData.height||1.8)*.55,0));
        const relative=center.clone().sub(camera.position),along=relative.dot(sight);
        const offAxis=relative.addScaledVector(sight,-along).length();
        if(center.distanceTo(camera.position)<2.0||(along>0&&along<length-.65&&offAxis<1.05)){root.visible=false;cameraCutaways.add(root);}
      }
    }else if(t>=.94){for(const root of cameraCutaways)root.visible=true;cameraCutaways.clear();}
    camera.fov=39+Math.sin(run*Math.PI)*(type==='r'?6:type==='n'?3.5:2)-duel*1.5+impactPunch;camera.updateProjectionMatrix();
  }
  if(t>=1)finishAction();
}
function finishAction(){if(!action)return;const a=action;
  if(a.film){camera.position.copy(a.camPos);controls.target.copy(a.camTarget);camera.fov=39;camera.updateProjectionMatrix();}
  action=null;audio.setBattlePosition(0);effects.clearWeaponTrail();controls.enabled=true;stage.classList.remove('cinematic');syncPieces();save();
  if(ruleStatus().over){audio.play(game.isCheckmate()?'victory':'check');audio.announce(game.isCheckmate()?'checkmate':'draw');const id=gameId;setTimeout(()=>{if(id===gameId&&ruleStatus().over)showResult();},450);}
  else if(game.isCheck()){audio.play('check');audio.announce('check');toast('將軍！君王需要你的保護。');}
  scheduleAI();
}
function showResult(){const status=ruleStatus(),winner=status.winner==='w'?'曜金帝國':'黑曜軍團';openModal(`<div class="eyebrow">${status.winner?'VICTORY IS ETERNAL':'AN HONOURABLE DRAW'}</div><div style="font-size:58px;color:#d4b878">${status.winner?'♚':'⚔'}</div><h2>${status.winner?`${winner}獲勝`:'榮耀和局'}</h2><p>${escapeHtml(status.reason)}<br>共 ${game.history().length} 步，每步理由已記錄。</p><div class="modal-actions"><button class="secondary" data-close>檢視戰場</button><button class="primary" id="rematch">再戰一局</button></div>`,'戰役結果');$('rematch').onclick=()=>startNew();}
function startNew(fen?:string){cancelAI();gameId++;adjudication=null;invalidateRules();if(action){const a=action;action=null;effects.clearWeaponTrail();controls.enabled=true;stage.classList.remove('cinematic');camera.fov=39;camera.updateProjectionMatrix();camera.position.copy(a.camPos);controls.target.copy(a.camTarget);}if(fen){game.load(fen);matchMode='local';}else game.reset();viewSide=matchMode==='ai'&&humanColor==='b'?-1:1;moveReasons.clear();journalTab='moves';closeModal();syncPieces();resetCamera();save();audio.announce('begin');toast(fen?'演示戰局已就緒，可查看每一步的理由。':matchMode==='ai'?`AI 對弈開始，你執${humanColor==='w'?'白':'黑'}。`:'新的戰役，白方先行。');scheduleAI();}
function undo(){if(action||!game.history().length)return;cancelAI();gameId++;adjudication=null;game.undo();if(matchMode==='ai'&&game.turn()!==humanColor&&game.history().length)game.undo();invalidateRules();closeModal();syncPieces();audio.play('undo');save();toast(matchMode==='ai'?'已退回到你上一次決策前。':'已撤回上一步。');scheduleAI();}
function askNew(){if(action)return;openModal(`<div class="eyebrow">CHOOSE YOUR CAMPAIGN</div><h2>挑選你的對手</h2><div class="match-form"><label>對弈模式<select id="match-mode"><option value="local" ${matchMode==='local'?'selected':''}>本機雙人 · 兩人輪流</option><option value="ai" ${matchMode==='ai'?'selected':''}>挑戰 AI · 本機電腦棋手</option></select></label><label>你的陣營<select id="human-side"><option value="w" ${humanColor==='w'?'selected':''}>白方 · 先行</option><option value="b" ${humanColor==='b'?'selected':''}>黑方 · 後行</option></select></label><label>AI 難度<select id="ai-difficulty"><option value="easy" ${difficulty==='easy'?'selected':''}>入門 · 快速思考</option><option value="normal" ${difficulty==='normal'?'selected':''}>標準 · 多算幾步</option><option value="hard" ${difficulty==='hard'?'selected':''}>挑戰 · 較長思考</option></select></label><p class="match-hint">AI 在這台裝置運算，不需要連線或帳號。開始新局會取代目前棋局。</p></div><div class="modal-actions"><button class="secondary" data-close>繼續目前棋局</button><button class="primary" id="confirm-new">開始新局</button></div>`,'新的戰役');const sync=()=>{const ai=$<HTMLSelectElement>('match-mode').value==='ai';$<HTMLSelectElement>('human-side').disabled=!ai;$<HTMLSelectElement>('ai-difficulty').disabled=!ai;};$('match-mode').onchange=sync;sync();$('confirm-new').onclick=()=>{matchMode=$<HTMLSelectElement>('match-mode').value as 'local'|'ai';humanColor=$<HTMLSelectElement>('human-side').value as 'w'|'b';difficulty=$<HTMLSelectElement>('ai-difficulty').value as Difficulty;startNew();};}
function drawOptions(){if(action||ruleStatus().over)return;const mayClaim=humanTurn(),current=claimDraw(game),intended=mayClaim?intendedDrawMoves(game):[];openModal(`<div class="eyebrow">FIDE · DRAW CLAIM</div><h2>和棋選項</h2><p>三次重複或五十回合可申請和棋。<br>五次重複或七十五回合會自動和棋；將死優先。</p>${!mayClaim?'<p>現在輪到 AI，由 AI 決定是否申請和棋。關閉選單後繼續思考。</p>':current.valid?`<p>${escapeHtml(current.message)}</p><button id="claim-now" class="primary">申請現在的和棋</button>`:'<p>目前局面尚未符合可申請條件。</p>'}${intended.length?`<p>也可先指定下一步，依它將形成的局面申請（不先落子）：</p>${intended.map(move=>`<button class="claim-intended" data-claim-from="${move.from}" data-claim-to="${move.to}" data-claim-promotion="${move.promotion||''}">${move.san} · ${move.from.toUpperCase()} → ${move.to.toUpperCase()}${move.promotion?` 升${pieceNames[move.promotion].name}`:''}</button>`).join('')}`:''}<p class="rule-source">${escapeHtml(RULES_SOURCE.limitation)}</p>${matchMode==='local'&&game.history().length>=2?'<button id="offer-draw" class="secondary">向對方提議和棋</button>':''}<div class="modal-actions"><button class="primary" data-close>繼續下棋</button></div>`,'和棋選項');const button=document.getElementById('claim-now');if(button)button.onclick=()=>completeClaim();const offer=document.getElementById('offer-draw');if(offer)offer.onclick=()=>{const side=game.turn()==='w'?'白':'黑';openModal(`<div class="eyebrow">DRAW OFFER</div><h2>${side}方提議和棋</h2><p>請交給${side==='白'?'黑':'白'}方決定。<br>接受後本局立即結束。</p><div class="modal-actions"><button class="secondary" data-close>不同意，繼續</button><button class="primary" id="accept-draw">雙方同意和棋</button></div>`,'和棋提議');$('accept-draw').onclick=()=>{adjudication={kind:'agreement',reason:'雙方在各走至少一步後同意和棋（5.2.3）。'};save();updateUI();audio.announce('draw');showResult();};};}
function completeClaim(intended?:{from:Square;to:Square;promotion?:string}){if(!humanTurn())return;const claim=claimDraw(game,intended);if(!claim.valid){toast(claim.message);return;}cancelAI();adjudication={kind:'claimed',reason:claim.message};save();updateUI();audio.announce('draw');showResult();}
function cancelAI(){aiGeneration++;if(aiTimer)clearTimeout(aiTimer);if(aiTimeout)clearTimeout(aiTimeout);aiTimer=aiTimeout=null;aiWorker?.terminate();aiWorker=null;thinking=false;aiError='';}
function scheduleAI(){if(matchMode!=='ai'||humanTurn()||action||ruleStatus().over||!modal.hidden||document.hidden||aiWorker||aiTimer||aiError)return;thinking=true;updateUI();const generation=aiGeneration,fen=game.fen();aiTimer=setTimeout(()=>{aiTimer=null;if(generation!==aiGeneration)return;const fail=(message:string)=>{cancelAI();aiError=message;updateUI();};try{const worker=new Worker(new URL('./ai.worker.ts',import.meta.url),{type:'module'});aiWorker=worker;aiTimeout=setTimeout(()=>fail('AI 沒有及時回應，請重試。棋局已保留。'),12000);worker.onerror=()=>fail('AI 載入失敗，請重試或切換本機雙人。');worker.onmessage=event=>{if(generation!==aiGeneration||fen!==game.fen()||humanTurn()||ruleStatus().over)return;const result=event.data;if(result.error){fail('AI 思考發生錯誤，請重試。');return;}aiStats={depth:result.depth,nodes:result.nodes,elapsedMs:result.elapsedMs};cancelAI();if(result.claimDraw){const claim=claimDraw(game,result.intendedClaim);if(claim.valid){adjudication={kind:'claimed',reason:'AI 申請和棋：'+claim.message};save();updateUI();showResult();return;}}const move=result.move;if(!move||!game.moves({verbose:true}).some(m=>m.from===move.from&&m.to===move.to&&m.promotion===move.promotion)){fail('AI 回傳的走法未通過合法性檢查，請重試。');return;}commitMove(move.from,move.to,move.promotion||'q',true);};worker.postMessage({id:generation,fen,pgn:game.pgn(),difficulty});}catch{fail('這個瀏覽器無法啟動本機 AI，請重試或選本機雙人。');}},180);}
function syncGraphicsButtons(){document.querySelectorAll<HTMLButtonElement>('[data-graphics]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.graphics===getGraphicsMode()));button.onclick=()=>setGraphicsMode(button.dataset.graphics as 'basic'|'enhanced');});}
onGraphicsChange(syncGraphicsButtons);
function settings(){if(action)return;openModal(`<div class="eyebrow">MAKE THE BATTLE YOURS</div><h2>戰場設定</h2><div class="setting-row graphics-row"><span>光影品質<small>隨時切換，棋局繼續</small></span><div class="graphics-choices" role="group" aria-label="光影品質"><button id="graphics-basic" data-graphics="basic" class="secondary" aria-pressed="false">基本光影</button><button id="graphics-enhanced" data-graphics="enhanced" class="secondary" aria-pressed="false">加強光影</button></div></div><label class="setting-row"><span>電影運鏡<small id="cinema-status"></small></span><input class="switch" id="setting-cinema" type="checkbox" ${cinemaEnabled()?'checked':''}></label><label class="setting-row"><span>減少動態<small>固定視角、加速行動、停用震動</small></span><input class="switch" id="setting-motion" type="checkbox" ${reduced?'checked':''}></label><label class="setting-row"><span>軍團語音<small>將軍、戰果與害怕／鬆口氣反應</small></span><input class="switch" id="setting-voice" type="checkbox" ${commanderVoice?'checked':''}></label><label class="setting-row"><span>戰場音量<small>所有聲音在本機合成</small></span><input id="setting-volume" type="range" min="0" max="1" step=".05" value="${volume}" aria-label="戰場音量"></label><div class="demo-choices"><button class="secondary" id="demo">戰車演示</button><button class="secondary" id="sword-demo">揮劍演示</button></div><div class="modal-actions"><button class="primary" data-close>返回戰場</button></div><button id="settings-new" style="margin-top:20px;border:0;background:none;color:#a9b49d;font-size:11px">開始新的標準對局</button><p style="font-size:9px;margin-bottom:0">演示會開啟獨立戰局，取代目前棋局。</p>`,'設定');
  syncGraphicsButtons();syncSettings();
  $<HTMLInputElement>('setting-cinema').onchange=e=>setCinematic((e.target as HTMLInputElement).checked);
  $<HTMLInputElement>('setting-motion').onchange=e=>{reduced=(e.target as HTMLInputElement).checked;syncSettings();};
  $<HTMLInputElement>('setting-voice').onchange=e=>{commanderVoice=(e.target as HTMLInputElement).checked;syncSettings();};
  $<HTMLInputElement>('setting-volume').oninput=e=>{volume=Number((e.target as HTMLInputElement).value);audio.setVolume(volume);save();};
  $('demo').onclick=()=>{startNew(demoFen);toast('點選 D4 戰車：三名敵棋都會嚇到發抖。');};$('sword-demo').onclick=()=>{startNew(demoFen.replace('1b1R2p1','1b1Q2p1'));toast('點選 D4 女皇，再點紅格敵棋，觀看揮劍與戰吼。');};$('settings-new').onclick=askNew;
}
function help(){openModal(`<div class="eyebrow">THE COMMANDER'S HANDBOOK</div><h2>指揮你的軍團</h2><div class="help-grid"><p><b>01 · 選擇戰士</b><br>可以本機雙人，或選擇 AI 對手與執棋顏色。白方先行。點選己方棋子，藍色菱形格可移動，紅色交叉劍格可攻擊。滑過目的地可預覽同色路線。</p><p><b>02 · 下達命令</b><br>點選合法目標完成移動。能被吃掉的敵人會害怕發抖！動畫期間點「略過動畫」或按空白鍵可略過。</p><p><b>03 · 奪取王權</b><br>依 FIDE 現行棋規核對合法走法。點「走法／棋譜」查看每步原因；三次重複／五十回合可申請，五次／七十五回合自動和棋。</p><p>再點已選棋子或「取消」可取消命令。<br>單指拖曳旋轉 · 雙指張合縮放<br><span class="keyboard">U</span>悔棋 <span class="keyboard">F</span>換邊 <span class="keyboard">R</span>全景 <span class="keyboard">ESC</span>取消</p></div><div class="modal-actions"><button class="primary" data-close>進入戰場</button></div>`,'玩法說明');}
modal.addEventListener('click',e=>{if((e.target as HTMLElement).closest('[data-close]')||e.target===modal)closeModal();});
$('match-config').onclick=askNew;$('open-journal').onclick=openJournal;$('claim-draw').onclick=drawOptions;$('ai-retry').onclick=()=>{cancelAI();scheduleAI();};
document.addEventListener('click',e=>{const target=e.target as HTMLElement;const tab=target.closest<HTMLElement>('[data-journal-tab]');if(tab){journalTab=tab.dataset.journalTab as 'moves'|'history';updateJournal();if(modalKind==='走法與棋譜'){const g=$('modal-guide'),h=$('modal-history');g.hidden=journalTab!=='moves';h.hidden=journalTab!=='history';}return;}const dest=target.closest<HTMLElement>('[data-destination]');if(dest&&selected){const square=dest.dataset.destination as Square;closeModal();selectSquare(square);return;}const claim=target.closest<HTMLElement>('[data-claim-from]');if(claim)completeClaim({from:claim.dataset.claimFrom as Square,to:claim.dataset.claimTo as Square,promotion:claim.dataset.claimPromotion||undefined});if(target.closest('[data-open-draw]'))drawOptions();});
$('sound').onclick=()=>{muted=!muted;syncSettings();};$('settings').onclick=settings;$('help').onclick=help;$('new-game').onclick=askNew;$('undo').onclick=undo;
$('flip').onclick=()=>{if(action)return;viewSide*=-1;resetCamera();};$('reset-camera').onclick=()=>{if(!action)resetCamera();};$('cinema').onclick=()=>{if(action)return;setCinematic(!cinemaEnabled());toast(cinemaEnabled()?'電影運鏡已開啟。':'切換為戰術視角。');};$('skip').onclick=finishAction;$('cancel-selection').onclick=clearSelection;
$('unit-info').addEventListener('click',e=>{if((e.target as HTMLElement).closest('#inspect')&&selected&&!action){const root=pieces.get(selected)!;const pos=root.position.clone().add(new THREE.Vector3(0,.8,0));const front=root.userData.color==='w'?-1:1;moveCamera(pos.clone().add(new THREE.Vector3(2.6,1.8,front*3.2)),pos,.8);}});

function clearSelection(){if(action)return;illegalMessage='';selected=null;legal=[];clearFear();refreshMarks();updateUI();}
let pointerStart={x:0,y:0,id:-1,moved:false,touch:false};const activePointers=new Set<number>();let multiTouch=false;
function resetPointers(){activePointers.clear();multiTouch=false;pointerStart.id=-1;pointerStart.moved=true;}
renderer.domElement.addEventListener('pointerdown',e=>{activePointers.add(e.pointerId);if(activePointers.size>1){multiTouch=true;pointerStart.moved=true;return;}pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId,moved:false,touch:e.pointerType==='touch'};transition=null;});
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
renderer.domElement.addEventListener('pointerup',e=>{activePointers.delete(e.pointerId);if(multiTouch){if(!activePointers.size)resetPointers();return;}const tap=e.pointerId===pointerStart.id&&!pointerStart.moved&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)<=(pointerStart.touch?10:7);pointerStart.id=-1;if(!tap||action||!modal.hidden)return;const square=pickSquare(e.clientX,e.clientY);if(square)selectSquare(square);else clearSelection();});
renderer.domElement.addEventListener('pointermove',e=>{if(e.pointerId===pointerStart.id&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>(pointerStart.touch?10:7))pointerStart.moved=true;if(e.pointerType==='touch'||e.buttons||action||!selected||!modal.hidden)return;const square=pickSquare(e.clientX,e.clientY,true);previewRoute(square&&legal.some(m=>m.to===square)?square:null);renderer.domElement.style.cursor=hovered?'pointer':'grab';});
renderer.domElement.addEventListener('pointerleave',()=>previewRoute(null));
renderer.domElement.addEventListener('pointercancel',resetPointers);renderer.domElement.addEventListener('lostpointercapture',e=>{if(activePointers.has(e.pointerId))resetPointers();});
window.addEventListener('blur',resetPointers);document.addEventListener('visibilitychange',()=>{if(document.hidden){resetPointers();cancelAI();}else scheduleAI();});
document.addEventListener('keydown',e=>{if(e.key==='Tab'&&!modal.hidden){const focusables=[...modal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];if(focusables.length){const first=focusables[0],last=focusables[focusables.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return;}if(e.key==='Escape'){if(!modal.hidden)closeModal();else if(action)finishAction();else clearSelection();return;}if(!modal.hidden)return;unlock();if(e.code==='Space'){e.preventDefault();finishAction();}if(e.key.toLowerCase()==='u')undo();if(e.key.toLowerCase()==='f')$('flip').click();if(e.key.toLowerCase()==='r')$('reset-camera').click();});
const resizeObserver=new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);renderer.setPixelRatio(Math.min(devicePixelRatio,w<760?1.5:1.6));transition=null;if(action){action.camPos.copy(overviewPosition());action.camTarget.set(0,0,0);}else resetCamera(true);});resizeObserver.observe(stage);

syncPieces();syncSettings();$('loading').remove();if(matchViewSide()===-1){viewSide=-1;resetCamera(true);}scheduleAI();
const clock=new THREE.Clock();
function render(){requestAnimationFrame(render);const dt=Math.min(clock.getDelta(),.07);frame++;
  if(!paused){elapsed+=dt;world.update(elapsed,reduced);effects.update(dt);
    for(const [square,root]of pieces){if(action&&(root===action.root||root===action.target||root===action.castle?.root))continue;const afraid=fears.has(square),relief=reliefs.get(square);animatePiece(root,afraid?'fear':relief?'relief':'idle',afraid?1:relief?relief.time/1.45:0,reduced?0:elapsed);const pos=squarePosition(square);root.position.copy(pos);root.rotation.set(0,root.userData.color==='w'?Math.PI:0,0);if(afraid&&!reduced){root.position.x+=Math.sin(elapsed*47+pos.z)*.027;root.position.y+=Math.abs(Math.sin(elapsed*23))*.025;root.rotation.z=Math.sin(elapsed*39+pos.x)*.038;}else if(relief&&!reduced){root.position.y-=Math.sin(relief.time/1.45*Math.PI)*.045;root.rotation.x=-Math.sin(relief.time/1.45*Math.PI)*.06;}}
    for(const [square,r]of reliefs){r.time+=dt;r.sprite.position.y=BOARD_Y+2.05+r.time*.18;r.sprite.scale.setScalar(.65*Math.min(1,r.time*8)*Math.min(1,(1.45-r.time)*5));if(r.time>=1.45){scene.remove(r.sprite);reliefs.delete(square);}}
    for(const [square,sprite]of fearSprites){sprite.position.copy(squarePosition(square)).add(new THREE.Vector3(Math.sin(elapsed*7)*.05,2.17+Math.sin(elapsed*5)*.07,0));sprite.material.rotation=Math.sin(elapsed*13)*.07;}
    if(action)animateAction(dt);else if(transition){transition.elapsed+=dt;const k=smooth(transition.elapsed/transition.duration);camera.position.lerpVectors(transition.from,transition.to,k);controls.target.lerpVectors(transition.lookFrom,transition.lookTo,k);camera.lookAt(controls.target);if(k>=1)transition=null;}else controls.update();
  }
  batchRestingArmy();
  contacts.update([...pieces.values()].filter(root=>root.visible).map(root=>({x:root.position.x,y:BOARD_Y+.004,z:root.position.z,rx:root.userData.type==='r'?.69:.48,rz:root.userData.type==='n'?.70:.47,yaw:root.rotation.y,height:Math.max(0,root.position.y-BOARD_Y)})));
  renderer.render(scene,camera);
  if(debug){const gl=renderer.getContext();const info=gl.getExtension('WEBGL_debug_renderer_info');(window as any).__THREE_GAME_DIAGNOSTICS__={frame,fps:Math.round(1/Math.max(dt,.001)),game:{fen:game.fen(),turn:game.turn(),moves:game.history().length,selected,legal:legal.map(m=>m.to),fear:[...fears],animating:!!action,actionProgress:action?action.elapsed/action.duration:0,gameOver:ruleStatus().over},renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},memory:renderer.info.memory,quality:{atmosphere:world.theme(),graphics:getGraphicsMode(),dpr:renderer.getPixelRatio(),shadowMapSize:world.shadowLight.shadow.mapSize.x,shadowLights:1,postPasses:0},gpu:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};}
}
render();
if(debug){
  (window as any).__CHESS_DEBUG__={voiceStatus:()=>audio.voiceStatus(),camera:()=>({position:camera.position.toArray(),target:controls.target.toArray(),distance:camera.position.distanceTo(controls.target)}),state:()=>({mode:matchMode,humanColor,difficulty,thinking,aiError,aiStats,status:ruleStatus(),illegalMessage,fen:game.fen(),selected,legal:legal.map(m=>m.to),fears:[...fears],relief:[...reliefs.keys()],animating:!!action,history:game.history(),turn:game.turn(),gameOver:ruleStatus().over,cinematic,reduced,muted,pieces:pieces.size}),load:(fen:string)=>{cancelAI();adjudication=null;matchMode='local';if(action)finishAction();gameId++;cancelAI();game.load(fen);invalidateRules();syncPieces();closeModal();},project:(square:string,height=.1)=>{const v=squarePosition(square);v.y+=height;v.project(camera);const r=renderer.domElement.getBoundingClientRect();return{x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};},combat:()=>{if(!action)return null;const weapon=getWeaponPose(action.root);const joints=['torso','weapon-arm','weapon-elbow','weapon-wrist'].map(name=>{const o=action!.root.getObjectByName(name);return{name,rotation:o?.rotation.toArray()};});return{progress:action.elapsed/action.duration,hit:action.hit,root:action.root.position.toArray(),target:action.target?.position.toArray(),impact:action.impact.toArray(),weapon:weapon?{base:weapon.base.toArray(),tip:weapon.tip.toArray()}:null,joints};},ranges:()=>({selected,hovered,moves:[...new Set(legal.filter(m=>!m.isCapture()&&!m.isEnPassant()).map(m=>m.to))],attacks:[...new Set(legal.filter(m=>m.isCapture()||m.isEnPassant()).map(m=>m.to))],routeColor:routeGroup.children.length?(routeGroup.children[0] as THREE.Mesh).material instanceof THREE.MeshBasicMaterial?((routeGroup.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHexString():null:null}),pieceStats:()=>[...pieces.entries()].map(([s,g])=>{const box=new THREE.Box3().setFromObject(g);return{square:s,type:g.userData.type,size:box.getSize(new THREE.Vector3()).toArray()};})};
  (window as any).__THREE_GAME_TEST_HOOKS__={seed:()=>{elapsed=0;},setState:async(name:string)=>{if(action)finishAction();closeModal();paused=false;elapsed=0;cinematic=true;reduced=false;transition=null;viewSide=1;if(name==='active-play'){game.reset();game.move('e4');game.move('e5');syncPieces();selectSquare('g1');}else if(name==='threat-preview'){game.load(demoFen);syncPieces();selectSquare('d4');}else if(name==='checkmate'){game.reset();for(const m of ['f3','e5','g4','Qh4#'])game.move(m);syncPieces();showResult();}else throw new Error(`Unknown state ${name}`);resetCamera(true);world.setTurn(game.turn(),true);return{state:name};},setPausedForScreenshot:(value:boolean)=>{paused=value;},setReducedMotion:(value:boolean)=>{reduced=value;},hideDebugUi:()=>{}};
}
