import puppeteer from 'puppeteer-core';
import { Chess } from 'chess.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=metal']});
const report={seed:20261013,humanTurns:0,plies:0,captures:0,checks:0,ai:[],errors:[]};let seed=report.seed;
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:940});page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(`${process.env.TEST_URL||'http://127.0.0.1:5194'}/?debug=1`,{waitUntil:'networkidle0'});
 const state=()=>page.evaluate(()=>window.__CHESS_DEBUG__.state());
 await page.click('#match-config');await page.select('#match-mode','ai');await page.select('#ai-difficulty','easy');await page.click('#confirm-new');await page.click('#sound');await new Promise(r=>setTimeout(r,850));
 for(let turn=0;turn<20;turn++){
  const before=await state();if(before.gameOver)break;assert.equal(before.turn,'w');assert.equal(before.aiError,'');
  const game=new Chess(before.fen),moves=game.moves({verbose:true});seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const attacking=moves.filter(m=>m.captured);const move=(attacking.length?attacking:moves)[seed%(attacking.length||moves.length)];
  const point=await page.evaluate(s=>window.__CHESS_DEBUG__.project(s,.7),move.from);await page.mouse.click(point.x,point.y);
  assert.equal((await state()).selected,move.from,`real input selects ${move.from}`);
  const target=`#rule-guide [data-destination="${move.to}"]`;await page.$eval(target,e=>e.scrollIntoView({block:'center'}));await page.click(target);
  if(move.promotion)await page.click(`[data-promotion="${move.promotion}"]`);
  await page.click('#skip');report.humanTurns++;
  if((await state()).gameOver)break;
  await page.waitForFunction(n=>{const s=window.__CHESS_DEBUG__.state();return s.history.length>n||s.gameOver||s.aiError;},{timeout:15000},before.history.length+1);
  let after=await state();assert.equal(after.aiError,'');if(after.animating)await page.click('#skip');after=await state();
  if(after.aiStats)report.ai.push(after.aiStats);if(after.gameOver)break;
 }
 const final=await state(),replay=new Chess();for(const san of final.history){const m=replay.move(san);if(m.captured)report.captures++;if(m.san.includes('+')||m.san.includes('#'))report.checks++;}
 assert.equal(replay.fen(),final.fen);assert.equal(final.aiError,'');assert.deepEqual(report.errors,[]);assert(report.humanTurns>=5);
 report.plies=final.history.length;report.result=final.status;report.pgn=replay.pgn();await page.screenshot({path:'artifacts/v2-release/bot-final.png'});
}catch(e){report.failure=String(e);process.exitCode=1;}finally{await fs.writeFile('artifacts/v2-release/bot-report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
