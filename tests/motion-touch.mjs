import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});const errors=[],external=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5188')&&!r.url().startsWith('data:'))external.push(r.url())});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const state=()=>page.evaluate(()=>window.__CHESS_DEBUG__.state());
async function click(s,h=.7){const p=await page.evaluate(([s,h])=>window.__CHESS_DEBUG__.project(s,h),[s,h]);await page.mouse.click(p.x,p.y);await wait(80);}
const results=[];
try{
await page.goto('http://127.0.0.1:5188/?debug=1',{waitUntil:'networkidle0'});
// Timed real-input frame evidence avoids platform-specific video encoders.
const frameEvidence=[];
for(const [type,fen,from,to]of [
['rook','4k3/8/3n4/8/1b1R2p1/8/8/7K w - - 0 1','d4','g4'],
['knight','k7/8/8/5p2/3N4/8/8/7K w - - 0 1','d4','f5'],
['bishop','k7/8/5p2/8/3B4/8/8/7K w - - 0 1','d4','f6'],
['queen','k7/8/8/8/3Q2p1/8/8/7K w - - 0 1','d4','g4'],
['pawn','k7/8/8/3p4/4P3/8/8/7K w - - 0 1','e4','d5'],
['king','k7/8/8/8/3Kp3/8/8/8 w - - 0 1','d4','e4']]){
await page.evaluate(fen=>window.__CHESS_DEBUG__.load(fen),fen);await click(from);assert.equal((await state()).selected,from);await wait(type==='rook'?600:180);if(type==='rook'){await page.keyboard.press('Escape');await wait(750);await click(from);await wait(350);}await click(to);assert.ok((await state()).animating);
await wait(1600);await page.screenshot({path:`artifacts/final-pass/${type}-motion.png`});frameEvidence.push({type,phase:'locomotion',state:await state()});await wait(1100);await page.screenshot({path:`artifacts/final-pass/${type}-impact.png`});frameEvidence.push({type,phase:'impact',state:await state()});await page.waitForFunction(()=>!window.__CHESS_DEBUG__.state().animating,{timeout:9000});assert.ok((await state()).history[0].includes('x'));results.push(type);await wait(180);
}
await fs.writeFile('artifacts/final-pass/six-piece-motion.json',JSON.stringify(frameEvidence,null,2));
const mobile=await browser.newPage();await mobile.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});await mobile.evaluateOnNewDocument(()=>{const AC=window.AudioContext;window.__contexts=[];window.AudioContext=class extends AC{constructor(...a){super(...a);window.__contexts.push(this)}}});await mobile.goto('http://127.0.0.1:5188/?debug=1',{waitUntil:'networkidle0'});
for(const [sq,h]of [['e2',.7],['e4',.02]]){const p=await mobile.evaluate(([s,h])=>window.__CHESS_DEBUG__.project(s,h),[sq,h]);await mobile.touchscreen.tap(p.x,p.y);await wait(200);}
await mobile.waitForFunction(()=>!window.__CHESS_DEBUG__.state().animating);assert.equal((await mobile.evaluate(()=>window.__CHESS_DEBUG__.state())).history[0],'e4');assert.equal(await mobile.evaluate(()=>window.__contexts[0]?.state),'running');
await page.setOfflineMode(true);await page.evaluate(()=>window.__CHESS_DEBUG__.load('k7/8/8/8/3R2p1/8/8/7K w - - 0 1'));await click('d4');await click('g4');await page.keyboard.press('Space');assert.equal((await state()).history[0],'Rxg4');
assert.equal(errors.length,0);assert.equal(external.length,0);const report={sixPieceCinematics:results,touchMove:'e2-e4',firstTouchAudio:'running',offlineMove:'Rxg4',externalRequests:external,errors};await fs.writeFile('artifacts/final-pass/motion-touch.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
