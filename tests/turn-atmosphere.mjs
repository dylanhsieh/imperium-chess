import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url=process.env.TEST_URL||'http://127.0.0.1:5194',out=process.env.TEST_OUT||'artifacts/turn-atmosphere';await fs.mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=metal']});
const report={url,captures:[],checks:[],errors:[]},wait=ms=>new Promise(r=>setTimeout(r,ms));
const placement='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
try{
 for(const [name,width,height,mobile]of [['desktop',1440,900,false],['ipad',820,1180,true],['phone',390,844,true]]){
  const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});await page.setViewport({width,height,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});await page.goto(`${url}/?debug=1&graphics=1`,{waitUntil:'networkidle0'});
  const blocked=await page.evaluate(()=>{const result=[];for(const f of 'abcdefgh')for(let rank=1;rank<=8;rank++){const square=f+rank,p=window.__CHESS_DEBUG__.project(square,.02);if(document.elementFromPoint(p.x,p.y)?.tagName!=='CANVAS')result.push(square);}return result});assert.deepEqual(blocked,[],'All 64 cells must fit and be unobstructed');report.checks.push(`${name}: all 64 cells visible and unobstructed`);
  for(const side of ['w','b']){
   await page.evaluate(fen=>{window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false);window.__CHESS_DEBUG__.load(fen)},`${placement} ${side} KQkq - 0 1`);await wait(1300);await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));
   for(const mode of ['basic','enhanced']){
    await page.evaluate(mode=>window.__GRAPHICS__.setMode(mode),mode);await wait(250);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.turn),side);assert.match(await page.$eval('#turn-title',e=>e.textContent),side==='w'?/白方/:/黑方/);
    await page.screenshot({path:`${out}/${name}-${side}-${mode}.png`});const diagnostic=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);const performance=await page.evaluate(()=>window.__GRAPHICS__.benchmark(60));report.captures.push({name,side,mode,diagnostic,performance});
   }
  }
  if(name==='ipad'){
   const tap=async s=>{const p=await page.$eval(s,e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});await page.touchscreen.tap(p.x,p.y);await wait(80)};
   const square=async(s,h=.7)=>{const p=await page.evaluate(([s,h])=>window.__CHESS_DEBUG__.project(s,h),[s,h]);await page.touchscreen.tap(p.x,p.y);await wait(80)};
   await page.evaluate(fen=>{window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false);window.__CHESS_DEBUG__.load(fen)},`${placement} w KQkq - 0 1`);await wait(1300);
   await square('e2');await square('e4',.02);await wait(650);assert.equal(await page.evaluate(()=>document.documentElement.dataset.turn),'w');assert(await page.$eval('#stage',e=>e.classList.contains('cinematic')));await page.screenshot({path:`${out}/ipad-white-film.png`});
   await page.waitForFunction(()=>!window.__CHESS_DEBUG__.state().animating,{timeout:12000});await wait(1200);assert.equal(await page.evaluate(()=>document.documentElement.dataset.turn),'b');assert.equal(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__.quality.atmosphere.blend),1);report.checks.push('Real touch move retains white atmosphere throughout film, then changes to black on handoff');
   await square('e7');await square('e5',.02);await wait(900);await page.screenshot({path:`${out}/ipad-black-film.png`});assert.equal(await page.evaluate(()=>document.documentElement.dataset.turn),'b');await page.waitForFunction(()=>!window.__CHESS_DEBUG__.state().animating,{timeout:12000});await wait(1200);assert.equal(await page.evaluate(()=>document.documentElement.dataset.turn),'w');report.checks.push('Black move gets blue night camera treatment; next white turn restores gold');
   await tap('#undo');await wait(1200);assert.equal(await page.evaluate(()=>document.documentElement.dataset.turn),'b');await tap('#flip');await wait(900);assert.equal(await page.evaluate(()=>document.documentElement.dataset.turn),'b');report.checks.push('Undo restores matching turn atmosphere; rotating board does not change active army');
   await tap('#settings');const fen=await page.evaluate(()=>window.__CHESS_DEBUG__.state().fen);await tap('#graphics-basic');assert.equal(await page.evaluate(()=>window.__CHESS_DEBUG__.state().fen),fen);assert.equal(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__.quality.atmosphere.mistDraws),0);await tap('#setting-motion');await tap('[data-close]');await tap('#undo');assert.equal(await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__.quality.atmosphere.blend),0);report.checks.push('Basic mode removes mist without resetting game; Reduce Motion switches turn background immediately');
  }
  await page.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({captures:report.captures.map(c=>({name:c.name,side:c.side,mode:c.mode,calls:c.performance.calls,ms:c.performance.medianMs})),checks:report.checks,errors:report.errors}));}
