import puppeteer from 'puppeteer-core';
import { Chess } from 'chess.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url=process.env.PUBLIC_URL||'https://dylanhsieh.github.io/imperium-chess/',out=process.env.RELEASE_OUT||'../public-release/imperium-v2';await fs.mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=metal']});
const report={url,checks:[],errors:[],workers:[],audio:[],resources:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));let page;
try{
 // Calibrate actual board coordinates from the matching local build, then use
 // trusted touch input on the public production page with no test helpers.
 page=await browser.newPage();await page.setViewport({width:390,height:844,deviceScaleFactor:1.5,isMobile:true,hasTouch:true});
 await page.goto(`${process.env.TEST_URL||'http://127.0.0.1:5194'}/?debug=1`,{waitUntil:'networkidle0'});
 const points=await page.evaluate(()=>Object.fromEntries([['e2',.7],['e4',.02],['g1',.7]].map(([s,h])=>[s,window.__CHESS_DEBUG__.project(s,h)])));
 await page.close();page=await browser.newPage();await page.setViewport({width:390,height:844,deviceScaleFactor:1.5,isMobile:true,hasTouch:true});
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('workercreated',w=>report.workers.push(w.url()));
 page.on('response',r=>{if(r.url().startsWith(url)){const entry={url:r.url(),status:r.status()};report.resources.push(entry);if(r.url().endsWith('.wav'))report.audio.push(entry);}});
 const response=await page.goto(`${url}?v=2.0.0`,{waitUntil:'networkidle0'});assert.equal(response.status(),200);
 assert.equal(await page.evaluate(()=>!!window.__CHESS_DEBUG__||!!window.__THREE_GAME_TEST_HOOKS__),false);
 const tap=async selector=>{await page.$eval(selector,e=>e.scrollIntoView({block:'center'}));const p=await page.$eval(selector,e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});await page.touchscreen.tap(p.x,p.y);};
 await tap('#match-config');await page.select('#match-mode','ai');await page.select('#ai-difficulty','easy');await tap('#confirm-new');await wait(900);
 await page.touchscreen.tap(points.e2.x,points.e2.y);await wait(80);await page.touchscreen.tap(points.e4.x,points.e4.y);
 await page.waitForFunction(()=>/1\. e4 (?!\*)\S/.test(localStorage.getItem('imperium-pgn')||''),{timeout:20000});await wait(400);
 const pgn=await page.evaluate(()=>localStorage.getItem('imperium-pgn'));const game=new Chess();game.loadPgn(pgn);assert.equal(game.history().length,2);assert.equal(game.turn(),'w');report.pgn=pgn;
 report.checks.push('Public phone page loads new release without debug helpers; touch e4 and real Worker AI reply are legal and saved');
 await page.screenshot({path:`${out}/public-ai-phone.png`});
 await tap('#settings');for(const mode of['enhanced','basic']){await tap(`#graphics-${mode}`);assert.equal(await page.$eval(`#graphics-${mode}`,e=>e.getAttribute('aria-pressed')),'true');}
 await tap('[data-close]');assert.equal(await page.evaluate(()=>localStorage.getItem('imperium-pgn')),pgn);report.checks.push('Both shaders toggle on public site without changing game');
 await page.touchscreen.tap(points.g1.x,points.g1.y);await tap('#open-journal');assert((await page.$$eval('#modal-guide .legal-step',e=>e.length))>0);
 await page.screenshot({path:`${out}/public-rules-phone.png`});await tap('#modal [data-journal-tab="history"]');assert.equal(await page.$$eval('#modal-history .history-step',e=>e.length),2);report.checks.push('Public candidate reasons and two-ply explained journal work through touch');
 assert.equal(report.audio.length,12);assert(report.audio.every(r=>r.status===200));assert(report.workers.some(u=>u.startsWith(`${url}assets/ai.worker-`)));assert.deepEqual(report.errors,[]);assert(report.resources.every(r=>r.status<400));
 report.checks.push('Relative Pages subpath serves AI worker, bundled Three.js and all 12 local voice clips successfully');
}catch(e){report.failure=String(e);process.exitCode=1;if(page)await page.screenshot({path:`${out}/failure.png`});}finally{await browser.close();await fs.writeFile(`${out}/public-smoke.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,errors:report.errors,failure:report.failure,workers:report.workers},null,2));}
