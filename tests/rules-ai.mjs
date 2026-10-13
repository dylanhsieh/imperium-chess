import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Chess } from 'chess.js';
import { fileURLToPath } from 'node:url';

const compiled = await build({ stdin: { contents: "export * from './rules-guide'; export * from './ai-search';", resolveDir: fileURLToPath(new URL('../src/', import.meta.url)), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { getGameStatus, claimDraw, explainMove, explainIllegalMove, getSelectionGuide, positionKey, repetitionCounts, intendedDrawMoves, findBestMove } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const results = [];
function check(name, test) { try { test(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.message }); } }
const contains = (text, word) => assert.ok(text.includes(word), `${JSON.stringify(text)} should contain ${word}`);
const play = (game, list) => list.forEach(move => game.move(move));
const fen = value => new Chess(value);
const knightCycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];

check('Batched next-move claims match full validation without mutating history', () => {
  const game = new Chess();
  assert.deepEqual(intendedDrawMoves(game), []);
  play(game, [...knightCycle, ...knightCycle.slice(0, 3)]);
  const before = game.pgn();
  assert.deepEqual(intendedDrawMoves(game).map(m => m.san), ['Ng8']);
  assert.equal(game.pgn(), before);
  const fifty = fen('7k/8/8/8/8/8/R7/K7 w - - 99 60');
  assert.ok(intendedDrawMoves(fifty).length > 0);
  for (const move of intendedDrawMoves(fifty)) assert.ok(claimDraw(fifty, move).valid);
});
check('Initial board: 20 legal moves and no automatic/claimable draw', () => {
  const game = new Chess(); assert.equal(game.moves().length, 20); assert.equal(getGameStatus(game).over, false); assert.deepEqual(getGameStatus(game).claimable, []);
});
check('Pawn double-step explains start rank and clear path', () => {
  const game = new Chess(); contains(explainMove(game, game.moves({ square: 'e2', verbose: true }).find(m => m.to === 'e4')), '前方兩格皆空');
});
check('Pawn cannot advance into enemy, diagonal empty or retreat', () => {
  const game = fen('7k/8/8/8/4p3/4P3/8/7K w - - 0 1');
  contains(explainIllegalMove(game, 'e3', 'e4'), '不能直走吃子'); contains(explainIllegalMove(game, 'e3', 'd4'), '這裡沒有敵棋'); contains(explainIllegalMove(game, 'e3', 'e2'), '不能後退');
});
check('Sliding path identifies first blocking piece', () => { contains(explainIllegalMove(new Chess(), 'a1', 'a4'), 'A2'); });
check('Knight jumps while bishops cannot leave diagonal', () => {
  const game = new Chess(); contains(explainMove(game, game.moves({ square: 'b1', verbose: true })[0]), '跳過'); contains(explainIllegalMove(game, 'c1', 'c3'), '斜線');
});
check('Pinned knight has zero legal moves and names attacking rook', () => {
  const game = fen('4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1'); const guide = getSelectionGuide(game, 'e2'); assert.equal(guide.moves.length, 0); contains(guide.restrictions.join(' '), 'E8'); contains(explainIllegalMove(game, 'e2', 'c3'), '釘住');
});
check('Pinned rook may stay on pin line and capture attacker', () => {
  const game = fen('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1'); const guide = getSelectionGuide(game, 'e2'); assert.ok(guide.moves.every(m => m.move.to[0] === 'e')); contains(guide.moves.find(m => m.move.to === 'e8').reason, '仍封住'); contains(explainIllegalMove(game, 'e2', 'd2'), '釘住');
});
check('Single legal check evasion is explicitly explained', () => {
  const game = fen('7k/7R/6K1/8/8/8/8/8 b - - 0 1'); assert.equal(game.moves().length, 1); assert.equal(game.moves({ verbose: true })[0].to, 'g8'); contains(getSelectionGuide(game, 'h8').moves[0].reason, '離開將軍');
});
check('Multiple check evasions are each legal and explain king safety', () => {
  const game = fen('4r2k/8/8/8/8/8/8/4K3 w - - 0 1'); const guide = getSelectionGuide(game, 'e1'); assert.ok(guide.moves.length > 1); assert.ok(guide.moves.every(item => item.reason.includes('離開將軍')));
});
check('Blocking a check identifies it as the reason', () => {
  const game = fen('4r2k/8/8/8/8/8/R7/4K3 w - - 0 1'); const move = game.moves({ square: 'a2', verbose: true }).find(m => m.to === 'e2'); contains(explainMove(game, move), '擋住將軍路線'); contains(explainIllegalMove(game, 'a2', 'b2'), '己王仍會');
});
check('Double check only permits safe king moves', () => {
  const game = fen('4r2k/8/8/8/1b6/8/R7/4K3 w - - 0 1'); assert.ok(game.moves({ verbose: true }).every(m => m.piece === 'k')); contains(getSelectionGuide(game, 'a2').restrictions.join(' '), '雙重將軍');
});
check('King may not enter attacked squares or approach enemy king', () => {
  const game = fen('7k/8/8/8/8/4r3/8/4K3 w - - 0 1'); contains(explainIllegalMove(game, 'e1', 'e2'), 'E3');
  contains(explainIllegalMove(fen('8/8/8/8/8/4k3/8/4K3 w - - 0 1'), 'e1', 'e2'), '黑王');
});
check('Castling clear path and preserved rights allow both sides', () => {
  const game = fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'); const castles = game.moves({ verbose: true }).filter(m => m.isKingsideCastle() || m.isQueensideCastle()); assert.equal(castles.length, 2); contains(explainMove(game, castles[0]), '易位權');
});
check('Castling is forbidden through attack, while checked, or after rights lost', () => {
  contains(explainIllegalMove(fen('4kr2/8/8/8/8/8/8/4K2R w K - 0 1'), 'e1', 'g1'), 'F1');
  contains(explainIllegalMove(fen('4r2k/8/8/8/8/8/8/4K2R w K - 0 1'), 'e1', 'g1'), '正在被將軍');
  contains(explainIllegalMove(fen('7k/8/8/8/8/8/8/4K2R w - - 0 1'), 'e1', 'g1'), '不會恢復');
});
check('En passant legal only immediately after double push', () => {
  const game = fen('7k/8/8/3pP3/8/8/8/7K w - d6 0 2'); const move = game.moves({ square: 'e5', verbose: true }).find(m => m.isEnPassant()); assert.ok(move); contains(explainMove(game, move), 'D5');
  play(game, ['Kh2', 'Kh7']); contains(explainIllegalMove(game, 'e5', 'd6'), '上一步剛走兩格');
});
check('En passant cannot uncover attack on king', () => {
  const game = fen('4r2k/8/8/3pP3/8/8/8/4K3 w - d6 0 2'); assert.ok(!game.moves({ verbose: true }).some(m => m.isEnPassant())); contains(explainIllegalMove(game, 'e5', 'd6'), '釘住');
  const horizontal = fen('7k/8/8/r4pPK/8/8/8/8 w - f6 0 2'); contains(explainIllegalMove(horizontal, 'g5', 'f6'), '移除兩枚兵');
});
check('Promotion exposes all four choices, including underpromotion', () => {
  const game = fen('7k/P7/8/8/8/8/8/7K w - - 0 1'); const moves = game.moves({ square: 'a7', verbose: true }); assert.deepEqual(moves.map(m => m.promotion).sort(), ['b', 'n', 'q', 'r']); assert.ok(moves.every(m => explainMove(game, m).includes('立即升變')));
});
check('Stalemate is distinct from checkmate', () => {
  assert.equal(getGameStatus(fen('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1')).kind, 'stalemate');
  const game = new Chess(); play(game, ['f3', 'e5', 'g4', 'Qh4#']); assert.equal(getGameStatus(game).kind, 'checkmate'); assert.equal(getGameStatus(game).winner, 'b');
});
check('Dead positions recognized conservatively; two knights/opposite bishops are not automatically dead', () => {
  for (const value of ['7k/8/8/8/8/8/8/K7 w - - 0 1', '7k/8/8/8/8/8/8/KN6 w - - 0 1', '7k/8/8/8/8/8/8/KB6 w - - 0 1', '7k/8/8/8/8/3b4/8/KB6 w - - 0 1']) assert.equal(getGameStatus(fen(value)).kind, 'dead-position');
  assert.equal(getGameStatus(fen('7k/8/8/8/8/8/8/KNN5 w - - 0 1')).over, false);
  assert.equal(getGameStatus(fen('7k/8/8/8/8/4b3/8/KB6 w - - 0 1')).over, false);
});
check('Threefold is claimable, not automatic; fivefold is automatic', () => {
  const game = new Chess(); play(game, [...knightCycle, ...knightCycle]); const three = getGameStatus(game); assert.equal(three.over, false); assert.equal(three.repetitions, 3); assert.deepEqual(three.claimable, ['threefold']); assert.ok(claimDraw(game).valid);
  play(game, [...knightCycle, ...knightCycle]); assert.equal(getGameStatus(game).kind, 'fivefold');
});
check('Intended next move can claim third repetition without changing board/history', () => {
  const game = new Chess(); play(game, [...knightCycle, ...knightCycle.slice(0, 3)]); const before = game.pgn(); const claim = claimDraw(game, { from: 'f6', to: 'g8' }); assert.ok(claim.valid); assert.deepEqual(claim.reasons, ['threefold']); assert.equal(game.pgn(), before); assert.equal(claimDraw(game, { from: 'f6', to: 'f8' }).valid, false);
});
check('50 moves claim, intended 50th, 75 automatic; pawn/capture resets clock', () => {
  const game = fen('4k2r/8/8/8/8/8/8/4K1N1 w - - 99 1'); assert.equal(claimDraw(game).valid, false); assert.ok(claimDraw(game, { from: 'g1', to: 'f3' }).valid); game.move('Nf3'); assert.equal(getGameStatus(game).over, false); assert.deepEqual(getGameStatus(game).claimable, ['fifty-move']);
  assert.equal(getGameStatus(fen('4k2r/8/8/8/8/8/8/4K1N1 w - - 150 76')).kind, 'seventy-five');
  const pawn = fen('4k2r/8/8/8/8/8/P7/4K3 w - - 99 1'); assert.equal(claimDraw(pawn, { from: 'a2', to: 'a3' }).valid, false);
  const promotion = fen('7k/P7/8/8/8/8/8/7K w - - 99 1'); assert.equal(claimDraw(promotion, { from: 'a7', to: 'a8', promotion: 'n' }).valid, false);
});
check('Checkmate on halfmove 150 overrides 75-move draw', () => {
  const game = fen('7k/8/5KQ1/8/8/8/8/8 w - - 149 1'); game.move('Qg7#'); assert.equal(getGameStatus(game).halfmoveClock, 150); assert.equal(getGameStatus(game).kind, 'checkmate');
});
check('Repetition keys preserve side/castling rights and ignore clocks', () => {
  const game = fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), first = positionKey(game); play(game, ['Kf1', 'Kf8', 'Ke1', 'Ke8']); assert.notEqual(positionKey(game), first); assert.equal(getGameStatus(game).repetitions, 1);
  assert.equal(positionKey(fen('7k/8/8/8/8/8/8/KR6 w - - 0 1')), positionKey(fen('7k/8/8/8/8/8/8/KR6 w - - 50 26')));
});
check('Repetition identity includes only legal en-passant, including pinned pawn', () => {
  const same = (a, b) => assert.equal(positionKey(fen(a)), positionKey(fen(b)));
  same('4k3/8/8/3p4/8/8/8/4K2R w - d6 0 1', '4k3/8/8/3p4/8/8/8/4K2R w - - 0 1');
  same('4r2k/8/8/3pP3/8/8/8/4K3 w - d6 0 2', '4r2k/8/8/3pP3/8/8/8/4K3 w - - 0 2');
  assert.notEqual(positionKey(fen('7k/8/8/3pP3/8/8/8/7K w - d6 0 2')), positionKey(fen('7k/8/8/3pP3/8/8/8/7K w - - 0 2')));
});
check('PGN reload preserves repetition evidence and counting is nonmutating', () => {
  const game = new Chess(); play(game, [...knightCycle, ...knightCycle]); const pgn = game.pgn(); repetitionCounts(game); assert.equal(game.pgn(), pgn); const restored = new Chess(); restored.loadPgn(pgn); assert.equal(getGameStatus(restored).repetitions, 3);
});
check('AI returns legal move at every difficulty, within a bounded deadline, without mutating state', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const game = new Chess(), before = game.pgn(); const result = findBestMove(game, { difficulty, timeMs: 90 }); assert.ok(result.move); assert.ok(game.moves({ verbose: true }).some(m => m.from === result.move.from && m.to === result.move.to)); assert.equal(game.pgn(), before); assert.ok(result.elapsedMs < 500, `deadline ${result.elapsedMs}`); assert.ok(result.nodes > 0);
  }
});
check('AI finds mate in one instead of a draw claim or 75-move rule', () => {
  const game = fen('7k/8/5KQ1/8/8/8/8/8 w - - 149 1'); const result = findBestMove(game, { timeMs: 100 }); assert.ok(result.move); game.move(result.move); assert.ok(game.isCheckmate()); assert.equal(result.claimDraw, false);
});
check('AI captures hanging queen and handles promotion', () => {
  const game = fen('4k3/8/8/8/4q3/8/4R3/4K3 w - - 0 1'); const result = findBestMove(game, { timeMs: 250 }); assert.equal(result.move?.to, 'e4');
  const promotion = fen('7k/Pr6/8/8/8/8/8/7K w - - 0 1'); const promoted = findBestMove(promotion, { timeMs: 200 }); assert.equal(promoted.move?.from, 'a7'); assert.ok(['q', 'r'].includes(promoted.move?.promotion));
});
check('AI must escape check; terminal positions produce no move', () => {
  const game = fen('7k/7R/6K1/8/8/8/8/8 b - - 0 1'); const result = findBestMove(game, { timeMs: 80 }); assert.equal(result.move?.to, 'g8');
  assert.equal(findBestMove(fen('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1')).move, null);
});
check('AI may claim threefold when losing, retaining original history', () => {
  const game = fen('1q4k1/8/8/8/8/8/8/6K1 w - - 0 1'); const cycle = ['Kh1', 'Kh8', 'Kg1', 'Kg8']; play(game, [...cycle, ...cycle]); const before = game.pgn(); const result = findBestMove(game, { timeMs: 150 }); assert.equal(result.claimDraw, true); assert.equal(result.move, null); assert.equal(game.pgn(), before);
});
check('AI can declare an intended repetition claim when current position is not claimable', () => {
  const game = fen('6k1/8/8/8/8/8/8/1Q4K1 w - - 0 1'); const cycle = ['Kh1', 'Kh8', 'Kg1', 'Kg8']; play(game, [...cycle, ...cycle.slice(0, 3)]);
  assert.equal(claimDraw(game).valid, false); assert.ok(claimDraw(game, { from: 'h8', to: 'g8' }).valid);
  const result = findBestMove(game, { timeMs: 200 }); assert.equal(result.claimDraw, true); assert.equal(result.intendedClaim?.to, 'g8'); assert.equal(result.move, null);
});
check('Queenside castling permits attacked rook and attacked B file when king path is safe', () => {
  const game = fen('rr2k3/8/8/8/8/8/8/R3K3 w Q - 0 1'); assert.ok(game.isAttacked('a1', 'b')); assert.ok(game.isAttacked('b1', 'b')); assert.ok(game.moves({ verbose: true }).some(m => m.isQueensideCastle()));
});
console.log(JSON.stringify({ suite: 'FIDE play rules, explanations and local worker engine', passed: results.filter(x => x.passed).length, total: results.length, results }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
