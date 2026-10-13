import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Chess } from 'chess.js';

const url = process.env.TEST_URL || 'http://127.0.0.1:5194';
const out = 'artifacts/v2-release';
await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'] });
const report = { url, checks: [], errors: [], workers: [], limitations: ['Mobile emulation on desktop GPU; no physical phone or Safari claim.'] };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let page;
async function setup(mobile = false, debug = true) {
  if (page) await page.close();
  page = await browser.newPage();
  await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true } : { width: 1440, height: 940, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('workercreated', worker => report.workers.push(worker.url()));
  await page.goto(`${url}/${debug ? '?debug=1' : ''}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#match-config');
  if (debug) await page.waitForFunction(() => window.__CHESS_DEBUG__);
  await wait(200);
}
const state = () => page.evaluate(() => window.__CHESS_DEBUG__.state());
const load = fen => page.evaluate(fen => window.__CHESS_DEBUG__.load(fen), fen);
async function tap(selector, mobile = false) {
  await page.$eval(selector, e => e.scrollIntoView({ block: 'center' }));
  const p = await page.$eval(selector, e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}
async function square(s, height = .7, mobile = false) {
  const p = await page.evaluate(([s, h]) => window.__CHESS_DEBUG__.project(s, h), [s, height]);
  if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  await wait(45);
}
async function config(side = 'w', level = 'easy', mobile = false) {
  await tap('#match-config', mobile);
  await page.select('#match-mode', 'ai'); await page.select('#human-side', side); await page.select('#ai-difficulty', level);
  await tap('#confirm-new', mobile); await wait(60);
}
async function settled(count) {
  await page.waitForFunction(n => window.__CHESS_DEBUG__.state().history.length === n && !window.__CHESS_DEBUG__.state().animating && !window.__CHESS_DEBUG__.state().thinking, { timeout: 15000 }, count);
}
async function playOpening(mobile = false) {
  await wait(800); await square('e2', .7, mobile); await square('e4', .02, mobile);
  assert.equal((await state()).history.length, 1);
  await tap('#skip', mobile);
}
try {
  await setup();
  await square('e2');
  const candidates = await page.$$eval('#rule-guide .legal-step', els => els.map(e => e.textContent));
  assert.equal(candidates.length, 2); assert(candidates.some(t => t.includes('前方兩格皆空')));
  await square('e5', .02); assert.equal((await state()).selected, 'e2'); assert((await state()).illegalMessage);
  await page.screenshot({ path: `${out}/illegal-reason-desktop.png` });
  report.checks.push('Every candidate shows a reason; illegal click preserves selection and explains restriction');
  await load('4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1'); await square('e2');
  assert.deepEqual((await state()).legal, []); assert.match(await page.$eval('#rule-guide', e => e.textContent), /E8/);
  report.checks.push('Pinned knight identifies E8 attacker and explains zero legal moves');
  await load('7k/P7/8/8/8/8/8/7K w - - 0 1'); await square('a7');
  assert.match(await page.$eval('#rule-guide .legal-step', e => e.textContent), /后、車、象或馬/);
  await tap('#rule-guide [data-destination="a8"]'); await tap('[data-promotion="n"]'); await tap('#skip');
  assert.match(await page.$eval('#history', e => e.textContent), /升變為馬/);
  // Reset before the old result timeout; the previous dead-position result must not leak.
  await load(new Chess().fen()); await wait(650); assert.equal(await page.$eval('#modal', e => e.hidden), true);
  report.checks.push('Promotion candidate explains all four choices; history records chosen knight; stale result is cancelled');
  await load('7k/8/8/8/8/8/R7/K7 w - - 100 60'); assert.equal((await state()).gameOver, false);
  await tap('#claim-draw'); await tap('#claim-now'); assert.equal((await state()).status.kind, 'claimed');
  await load('7k/8/8/8/8/8/R7/K7 w - - 99 60'); const before = (await state()).fen;
  await tap('#claim-draw'); assert((await page.$$('[data-claim-from]')).length > 0); await tap('[data-claim-from]');
  assert.equal((await state()).fen, before); assert.equal((await state()).status.kind, 'claimed');
  await load('7k/8/8/8/8/8/R7/K7 w - - 150 90'); assert.equal((await state()).status.kind, 'seventy-five');
  report.checks.push('50-move claim is optional; intended claim does not execute move; 75-move rule ends automatically');
  await load(new Chess().fen()); await config('w', 'hard'); await playOpening();
  assert((await state()).thinking); const frameBefore = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.frame);
  await wait(350); const frameAfter = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__.frame);
  assert(frameAfter - frameBefore > 3); await settled(2);
  assert.equal((await state()).turn, 'w'); assert.equal((await state()).aiError, '');
  const replay = new Chess(); for (const san of (await state()).history) replay.move(san); assert.equal(replay.fen(), (await state()).fen);
  report.ai = { stats: (await state()).aiStats, framesDuring350ms: frameAfter - frameBefore };
  assert.equal(await page.$$eval('#history .history-step', e => e.length), 2);
  await wait(400);await page.screenshot({ path: `${out}/ai-desktop.png` });
  await tap('#undo'); assert.equal((await state()).history.length, 0);
  report.checks.push('AI runs in a real Worker while rendering continues, returns legal move, logs reasons; Undo removes full pair');
  await playOpening(); assert((await state()).thinking); await tap('#undo'); await wait(1600);
  assert.equal((await state()).history.length, 0); assert.equal((await state()).thinking, false);
  report.checks.push('Undo during thinking terminates old Worker; no stale move appears');
  await playOpening(); await tap('#match-config'); await wait(1400);
  assert.equal((await state()).history.length, 1); assert.equal((await state()).thinking, false);
  await page.select('#match-mode', 'local'); await tap('#confirm-new'); await wait(1400);
  assert.equal((await state()).mode, 'local'); assert.equal((await state()).history.length, 0);
  report.checks.push('Opening mode dialog pauses AI; starting local game rejects old AI reply');
  await config('b'); await settled(1); assert.equal((await state()).turn, 'b');
  assert((await page.evaluate(() => window.__CHESS_DEBUG__.camera())).position[2] < 0);
  assert.equal(await page.$eval('#undo', e => e.disabled), true);
  report.checks.push('Playing black rotates board and AI plays white opening; cannot Undo before human first move');
  const voices = await page.evaluate(() => window.__CHESS_DEBUG__.voiceStatus()); report.voices = voices;
  assert.equal(voices.loaded, 12); assert(voices.announcements > 0);
  await tap('#sound'); assert.equal((await state()).muted, true); await tap('#sound');
  await tap('#settings'); await tap('#setting-voice'); await tap('[data-close]');
  report.checks.push('All 12 local voice clips decode; actual gestures play announcements; mute and voice setting operate');

  await setup(true); await config('w', 'easy', true); await playOpening(true); await settled(2);
  const cdp = await page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await square('g1', .7, true); await tap('#open-journal', true);
  const journal = await page.$$eval('#modal-guide .legal-step', els => els.map(e => ({ text: e.textContent, height: e.getBoundingClientRect().height })));
  assert(journal.length > 0); assert(journal.every(e => e.height >= 44 && e.text.includes('L 形')));
  await page.screenshot({ path: `${out}/rules-phone.png` });
  await tap('#modal [data-journal-tab="history"]', true); assert.equal(await page.$$eval('#modal-history .history-step', e => e.length), 2);
  await page.screenshot({ path: `${out}/history-phone.png` });
  await tap('#modal [data-close]', true); await tap('#cancel-selection', true);
  await page.screenshot({ path: `${out}/ai-phone.png` });
  report.checks.push('Phone touch AI game, scrollable rule candidates and per-move history work with 4x CPU throttling');

  // Production storage reload and AI-turn draw menu without debug hooks.
  await setup(false, false);
  assert.equal(await page.evaluate(() => !!window.__CHESS_DEBUG__ || !!window.__THREE_GAME_TEST_HOOKS__), false);
  const stored = new Chess('7k/8/8/8/8/8/R7/K7 w - - 100 60');
  await page.evaluate(pgn => { localStorage.setItem('imperium-pgn', pgn); localStorage.setItem('imperium-settings', JSON.stringify({ matchMode: 'ai', humanColor: 'b', difficulty: 'hard', cinematic: false })); }, stored.pgn());
  // Pause at DOM creation, before the worker's 180 ms start delay.
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#claim-draw'); await tap('#claim-draw');
  assert.equal(await page.$('#claim-now'), null); assert.match(await page.$eval('#modal', e => e.textContent), /由 AI 決定/);
  await tap('[data-close]');
  await page.waitForFunction(() => document.querySelector('#modal').hidden === false || document.querySelector('#history .history-step'), { timeout: 15000 });
  assert.match(await page.$eval('#match-config', e => e.textContent), /你執黑/);
  report.checks.push('Production has no debug helpers; PGN/mode restored; AI-turn draw menu is read-only and resumes AI');
  assert(report.workers.some(u => /assets\/ai\.worker-.*\.js/.test(u)));
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = String(error); console.error(error);
  if (page) { await page.screenshot({ path: `${out}/v2-failure.png` }); report.failedState = await state().catch(() => null); }
  process.exitCode = 1;
} finally {
  await fs.writeFile(`${out}/browser-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); await browser.close();
}
