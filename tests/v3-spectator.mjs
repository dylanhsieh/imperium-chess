import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/v3-release/spectator',url=process.env.TEST_URL||'http://127.0.0.1:5195';await fs.mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=metal']});
const report={checks:[],errors:[],audioRequests:[],viewports:[]},wait=ms=>new Promise(r=>setTimeout(r,ms));
try{for(const [width,height]of[[1440,940],[390,844],[844,390],[360,640]]){
 const mobile=width!==1440,page=await browser.newPage();await page.setViewport({width,height,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});page.on('request',r=>{if(/\.(wav|mp3|ogg)/.test(r.url()))report.audioRequests.push(r.url())});
 await page.goto(url+'/?debug=1',{waitUntil:'networkidle0'});
 const state=()=>page.evaluate(()=>window.__CHESS_DEBUG__.state());
 const tap=async selector=>{const p=await page.$eval(selector,e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y)};
 await tap('#watch-start');await tap('#watch-pause');assert.equal((await state()).watchPaused,true);await wait(1600);assert.equal((await state()).history.length,0);
 await tap('#watch-pause');await page.waitForFunction(()=>window.__CHESS_DEBUG__.combat()?.progress>.22,{timeout:12000});await tap('#watch-pause');
 const paused=await page.evaluate(()=>window.__CHESS_DEBUG__.combat()),history=(await state()).history;await wait(900);assert.deepEqual(await page.evaluate(()=>window.__CHESS_DEBUG__.combat()),paused);assert.deepEqual((await state()).history,history);
 const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.watch-controls button')].filter(e=>!e.hidden).map(e=>{const r=e.getBoundingClientRect();return{id:e.id,w:r.width,h:r.height,visible:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e}}),stage:document.querySelector('#stage').getBoundingClientRect().toJSON()}));assert(!layout.overflow);assert(layout.buttons.every(b=>b.w>=44&&b.h>=44&&b.visible));report.viewports.push({width,height,layout});await page.screenshot({path:`${out}/${width}-paused.png`});
 await tap('#watch-pause');await page.waitForFunction(()=>window.__CHESS_DEBUG__.state().history.length>=2,{timeout:15000});
 await tap('#watch-takeover');const before=(await state()).history;const combat=await page.evaluate(()=>window.__CHESS_DEBUG__.combat());await wait(500);assert.deepEqual(await page.evaluate(()=>window.__CHESS_DEBUG__.combat()),combat);
 await tap('[data-takeover="local"]');assert.equal((await state()).mode,'local');assert.deepEqual((await state()).history,before);await wait(1100);assert.deepEqual((await state()).history,before);
 await tap('#watch-start');await tap('#watch-pause');await tap('#watch-takeover');const side=(await state()).turn;await tap(`[data-takeover="${side}"]`);assert.equal((await state()).mode,'ai');assert.equal((await state()).humanColor,side);assert.deepEqual((await state()).history,before);await wait(1100);assert.deepEqual((await state()).history,before);
 report.checks.push(`${width}x${height}: real ${mobile?'touch':'mouse'} start, cancel thinking, freeze action, resume both AI, modal freeze, local/side takeover preserve position and reject stale AI`);
 if(!mobile){await tap('#watch-start');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setReducedMotion(true));await page.waitForFunction(()=>window.__CHESS_DEBUG__.state().history.length>=20||window.__CHESS_DEBUG__.state().gameOver,{timeout:90000});await tap('#watch-pause');report.bot=await state();assert(report.bot.history.length>=20||report.bot.gameOver);report.checks.push('Dual AI progresses 20 legal plies without human moves');}
 await page.close();
 }
 const page=await browser.newPage();await page.setViewport({width:1440,height:940});await page.goto(url,{waitUntil:'networkidle0'});await page.click('#watch-start');await page.click('#watch-pause');await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$eval('#watch-pause',e=>e.getAttribute('aria-pressed')),'true');assert.equal(await page.evaluate(()=>typeof window.__CHESS_DEBUG__),'undefined');report.checks.push('Production reload preserves paused spectator mode; debug helpers absent');assert.deepEqual(report.audioRequests,[]);assert.deepEqual(report.errors,[]);
}catch(e){report.failure=String(e);process.exitCode=1;}finally{await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
