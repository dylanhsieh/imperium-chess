import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/weapon-revision';await fs.mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage();await page.setViewport({width:1440,height:940,deviceScaleFactor:1});
const errors=[],external=[],results=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5188')&&!r.url().startsWith('data:'))external.push(r.url())});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const state=()=>page.evaluate(()=>window.__CHESS_DEBUG__.state());
async function point(s,h=.7){return page.evaluate(([s,h])=>window.__CHESS_DEBUG__.project(s,h),[s,h]);}
async function click(s,h=.7){const p=await point(s,h);await page.mouse.click(p.x,p.y);await wait(65);}
async function hover(s,h=.02){const p=await point(s,h);await page.mouse.move(p.x,p.y);await wait(80);}
async function ranges(){return page.evaluate(()=>window.__CHESS_DEBUG__.ranges());}
try{
 await page.goto('http://127.0.0.1:5188/?debug=1&v=weapons',{waitUntil:'networkidle0'});
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('threat-preview'));
 assert.deepEqual((await ranges()).attacks.sort(),['b4','d6','g4']);
 await hover('d5');assert.equal((await ranges()).routeColor,'46ceff');assert.equal((await ranges()).hovered,'d5');await page.screenshot({path:`${out}/blue-movement-route.png`});
 await hover('g4',.7);assert.equal((await ranges()).routeColor,'ff655b');assert.ok(await page.$eval('#route-label',e=>e.textContent.includes('攻擊')));await page.screenshot({path:`${out}/red-attack-route.png`});
 await page.keyboard.press('Escape');assert.equal((await ranges()).hovered,null);assert.equal((await state()).relief.length,3);results.push('Distinct blue move and red attack tiles / route colors; cancellation clears route and relieves enemies');
 await page.evaluate(()=>window.__CHESS_DEBUG__.load('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'));await click('e5');assert.deepEqual((await ranges()).moves,['e6']);assert.deepEqual((await ranges()).attacks,['d6']);assert.deepEqual((await state()).fears,['d5']);await hover('d6');assert.ok(await page.$eval('#route-label',e=>e.textContent.includes('吃過路兵')));results.push('En passant distinguishes destination d6 from victim d5');
 const reports=[];
 for(const [name,fen,from,to]of [
 ['pawn','k7/8/8/3p4/4P3/8/8/7K w - - 0 1','e4','d5'],
 ['queen','k7/8/8/8/3Q2p1/8/8/7K w - - 0 1','d4','g4'],
 ['king','k7/8/8/8/3Kp3/8/8/8 w - - 0 1','d4','e4'],
 ['bishop','k7/8/5p2/8/3B4/8/8/7K w - - 0 1','d4','f6'],
 ['knight','k7/8/8/5p2/3N4/8/8/7K w - - 0 1','d4','f5'],
 ['rook','4k3/8/3n4/8/1b1R2p1/8/8/7K w - - 0 1','d4','g4'],
 ['black-queen','k7/8/8/8/1P2q3/8/8/7K b - - 0 1','e4','b4'],
 ['en-passant','4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1','e5','d6']]){
  await page.evaluate(fen=>window.__CHESS_DEBUG__.load(fen),fen);await click(from);assert.equal((await state()).selected,from);
  if(name==='knight'){await hover(to,.7);assert.equal((await ranges()).routeColor,'ff655b');await page.screenshot({path:`${out}/knight-route.png`});}
  await page.evaluate(()=>{window.__motion=[];window.__capture=true;function record(){if(!window.__capture)return;const c=window.__CHESS_DEBUG__.combat();if(c)window.__motion.push(c);requestAnimationFrame(record)}requestAnimationFrame(record)});
  await click(to,name==='en-passant'?.02:.7);assert.ok((await state()).animating);
  for(const [phase,threshold]of [['windup',.60],['swing',.66],['contact',.69],['followthrough',.74],['recovery',.83]]){
   await page.waitForFunction(t=>(window.__CHESS_DEBUG__.combat()?.progress??0)>=t,{polling:'raf',timeout:9000},threshold);
   await page.screenshot({path:`${out}/${name}-${phase}.png`});
  }
  await page.waitForFunction(()=>!window.__CHESS_DEBUG__.state().animating,{timeout:9000});
  const frames=await page.evaluate(()=>{window.__capture=false;return window.__motion});
  const firstHit=frames.find(f=>f.hit);assert.ok(firstHit,`${name} hit`);assert.ok(firstHit.progress>=.69&&firstHit.progress<.715,`${name} hit timing`);
  let contactError=null;
  if(name!=='rook'){
   assert.ok(firstHit.weapon,`${name} weapon sockets`);const edge=firstHit.weapon.base.map((v,i)=>v+(firstHit.weapon.tip[i]-v)*.84);
   contactError=Math.hypot(edge[0]-firstHit.impact[0],edge[2]-firstHit.impact[2]);assert.ok(contactError<.30,`${name} cutting edge contact error ${contactError}`);assert.ok(edge[1]>.55&&edge[1]<1.85,`${name} contact height ${edge[1]}`);
   const elbowPoses=new Set(frames.filter(f=>f.progress>.51&&f.progress<.81).map(f=>JSON.stringify(f.joints.find(j=>j.name==='weapon-elbow')?.rotation)));assert.ok(elbowPoses.size>8,`${name} elbow actually moves`);
  }
  assert.ok((await state()).history[0].includes('x'));reports.push({name,contactError,firstHit,frames});
 }
 await fs.writeFile(`${out}/weapon-motion.json`,JSON.stringify(reports,null,2));results.push('8 real-input captures: 3 sword roles, staff, lance, ram, opposite-facing queen, en passant; timed windup/swing/contact/followthrough/recovery screenshots');
 await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('threat-preview'));await wait(180);await page.screenshot({path:`${out}/mobile-ranges.png`});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
 assert.equal(errors.length,0);assert.equal(external.length,0);await fs.writeFile(`${out}/checks.json`,JSON.stringify({results,errors,external,contacts:reports.map(({name,contactError})=>({name,contactError})),diagnostics:await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__)},null,2));console.log(JSON.stringify({results,errors,external}));
}catch(e){await page.screenshot({path:`${out}/failure.png`});console.error(e);process.exitCode=1;}finally{await browser.close();}
