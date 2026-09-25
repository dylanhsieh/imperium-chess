import {chromium} from '@playwright/test';
import {inspectPage,parseArgs} from './inspect-threejs-canvas.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/release-check';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=metal']});
try{for(const [mode,state]of [['desktop','active-play'],['desktop','threat-preview'],['desktop','checkmate'],['mobile','active-play']]){
const context=await browser.newContext({viewport:mode==='desktop'?{width:1440,height:940}:{width:390,height:844},deviceScaleFactor:1,isMobile:mode==='mobile',hasTouch:mode==='mobile'});
const args=parseArgs(['--url','http://127.0.0.1:5188/?debug=1','--out',out,'--state',state,'--run-id','release-check',...(mode==='mobile'?['--mobile']:[])]);
const report=await inspectPage(await context.newPage(),args);await fs.writeFile(`${out}/${mode}-${state}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({mode,state,result:report.result,errors:[...report.consoleErrors,...report.pageErrors],gpu:report.gpu}));assert.ok(report.result.ok);assert.equal(report.pageErrors.length+report.consoleErrors.length,0);await context.close();
}}finally{await browser.close();}
