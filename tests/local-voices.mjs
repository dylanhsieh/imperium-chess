import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=metal']});
const page=await browser.newPage();await page.setViewport({width:1280,height:850});
const errors=[],files=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.url().includes('/audio/'))files.push({url:r.url(),status:r.status()})});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const voices=()=>page.evaluate(()=>window.__CHESS_DEBUG__.voiceStatus());
async function click(s){const p=await page.evaluate(s=>window.__CHESS_DEBUG__.project(s,.7),s);await page.mouse.click(p.x,p.y);await wait(65);}
async function duel(fen,from,to){await page.evaluate(f=>window.__CHESS_DEBUG__.load(f),fen);await click(from);await click(to);await page.waitForFunction(()=>(window.__CHESS_DEBUG__.combat()?.progress??0)>.635,{polling:'raf'});const attack=await voices();await page.waitForFunction(()=>window.__CHESS_DEBUG__.combat()?.hit,{polling:'raf'});const defeat=await voices();await page.waitForFunction(()=>!window.__CHESS_DEBUG__.state().animating);return{attack,defeat};}
try{
await page.goto('http://127.0.0.1:5188/?debug=1&v=voices',{waitUntil:'networkidle0'});await page.click('#settings');await page.waitForFunction(()=>window.__CHESS_DEBUG__.voiceStatus().loaded===6,{timeout:15000});await page.click('#sword-demo');assert.equal((await page.evaluate(()=>window.__CHESS_DEBUG__.pieceStats())).find(p=>p.square==='d4').type,'q');
const queen=await duel('k7/8/8/8/3Q2p1/8/8/7K w - - 0 1','d4','g4');assert.ok(queen.attack.last.includes('female-attack'));assert.ok(queen.defeat.last.includes('male-defeat'));assert.equal(queen.defeat.played,2);
await page.setOfflineMode(true);const pawn=await duel('k7/8/8/3p4/4P3/8/8/7K w - - 0 1','e4','d5');assert.ok(pawn.attack.last.includes('male-attack'));assert.notEqual(pawn.attack.last.split('-').at(-1),queen.attack.last.split('-').at(-1));assert.equal(pawn.defeat.played,4);
await page.click('#sound');const muted=await duel('k7/8/8/3p4/4P3/8/8/7K w - - 0 1','e4','d5');assert.equal(muted.defeat.played,4);await page.click('#sound');assert.equal(errors.length,0);assert.equal(files.length,6);assert.ok(files.every(f=>f.status===200));
const report={queen,pawn,muted,files,errors,offlinePlayback:true};await fs.writeFile('artifacts/weapon-revision/voices.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
