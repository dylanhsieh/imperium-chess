import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/v3-release/motion'; await fs.mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=metal']});
const report={unpaused:true,shots:[],errors:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try {
 const page=await browser.newPage();await page.setViewport({width:1440,height:940,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(`${process.env.TEST_URL||'http://127.0.0.1:5194'}/?debug=1`,{waitUntil:'networkidle0'});
 const fixtures=[['pawn','k7/7p/8/3p4/4P3/8/8/7K w - - 0 1','e4','d5'],['rook','4k3/8/3n4/8/1b1R2p1/8/8/7K w - - 0 1','d4','g4'],['knight','k7/7p/8/5p2/3N4/8/8/7K w - - 0 1','d4','f5'],['bishop','k7/7p/5p2/8/3B4/8/8/7K w - - 0 1','d4','f6'],['queen','k7/7p/8/8/3Q2p1/8/8/7K w - - 0 1','d4','g4'],['king','k7/7p/8/8/3Kp3/8/8/8 w - - 0 1','d4','e4']];
 for(const mobile of [false,true]) {
  if(mobile)await page.setViewport({width:390,height:844,deviceScaleFactor:1.5,isMobile:true,hasTouch:true});
  for(const [type,fen,from,to]of(mobile?fixtures.filter(f=>f[0]==='rook'):fixtures)) {
   await page.evaluate(fen=>window.__CHESS_DEBUG__.load(fen),fen);await wait(200);
   for(const square of[from,to]){const p=await page.evaluate(s=>window.__CHESS_DEBUG__.project(s,.7),square);if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);await wait(40);}
   assert(await page.evaluate(()=>window.__CHESS_DEBUG__.state().animating));
   const shot={type,mobile,samples:[],captures:[]},marks=[.38,.59,.69,.77];report.shots.push(shot);
   let mark=0;
   for(let n=0;n<160;n++) {
    const sample=await page.evaluate(()=>({combat:window.__CHESS_DEBUG__.combat(),camera:window.__CHESS_DEBUG__.camera(),voices:window.__CHESS_DEBUG__.voiceStatus()}));
    if(!sample.combat)break;shot.samples.push(sample);
    if(mark<marks.length&&sample.combat.progress>=marks[mark]){const name=`${mobile?'phone':'desktop'}-${type}-${mark}`;await page.screenshot({path:`${out}/${name}.png`});shot.captures.push({name,progress:sample.combat.progress});mark++;}
    await wait(35);
   }
   assert.equal(await page.evaluate(()=>window.__CHESS_DEBUG__.state().animating),false);
   assert(shot.samples.some(s=>s.combat.hit));assert.equal(shot.captures.length,4);
   assert.equal(await page.$$eval('#history .history-step',es=>es.length),1);
   const contact=shot.samples.find(s=>s.combat.hit)?.combat;
   if(contact.weapon){const point=contact.weapon.base.map((v,i)=>v+(contact.weapon.tip[i]-v)*.84);shot.contactErrorXZ=Math.hypot(point[0]-contact.impact[0],point[2]-contact.impact[2]);assert(shot.contactErrorXZ<.3);}
   assert.equal((await page.evaluate(()=>window.__CHESS_DEBUG__.voiceStatus())).played,0);
   await wait(250);
  }
 }
 assert.deepEqual(report.errors,[]);
}catch(e){report.failure=String(e);process.exitCode=1;}finally{await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({shots:report.shots.map(s=>({type:s.type,mobile:s.mobile,samples:s.samples.length,contactErrorXZ:s.contactErrorXZ,captures:s.captures})),errors:report.errors,failure:report.failure},null,2));}
