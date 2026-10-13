import { Chess, type Move, type PieceSymbol } from 'chess.js';
import { getGameStatus, positionKey, repetitionCounts, type MoveIntent } from './rules-guide';

export type Difficulty = 'easy' | 'normal' | 'hard';
export const AI_LEVELS = {
  easy: { timeMs: 150, maxDepth: 3, label: '新兵' },
  normal: { timeMs: 500, maxDepth: 5, label: '軍官' },
  hard: { timeMs: 1200, maxDepth: 7, label: '統帥' },
} as const;
export interface SearchOptions { difficulty?: Difficulty; timeMs?: number; maxDepth?: number }
export interface SearchResult {
  move: MoveIntent | null;
  claimDraw: boolean;
  intendedClaim?: MoveIntent;
  depth: number;
  nodes: number;
  score: number;
  elapsedMs: number;
}
const values: Record<PieceSymbol, number> = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
const MATE = 100000;
const TIMEOUT = Symbol('search deadline');
function intent(move: Move): MoveIntent { return { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) }; }
function moveKey(move: Move | MoveIntent): string { return `${move.from}${move.to}${move.promotion || ''}`; }
/** Modest material/placement evaluation. Deliberately no external engine, model,
 * network request, tablebase or server. All search runs inside a cancellable worker. */
function evaluate(game: Chess): number {
  const board = game.board().flat();
  const nonPawnMaterial = board.reduce((total, p) => total + (p && !['p', 'k'].includes(p.type) ? values[p.type] : 0), 0);
  const endgame = nonPawnMaterial < 2400;
  let score = 0, whiteBishops = 0, blackBishops = 0;
  for (const p of board) {
    if (!p) continue;
    const x = p.square.charCodeAt(0) - 97, rank = Number(p.square[1]) - 1, y = p.color === 'w' ? rank : 7 - rank;
    const center = 3.5 - (Math.abs(x - 3.5) + Math.abs(rank - 3.5)) / 2;
    let positional = 0;
    switch (p.type) {
      case 'p': positional = y * (endgame ? 13 : 7) + center * 5 - (x === 0 || x === 7 ? 5 : 0); break;
      case 'n': positional = center * 22 - (x === 0 || x === 7 || rank === 0 || rank === 7 ? 22 : 0); break;
      case 'b': positional = center * 11 + (y > 0 ? 8 : 0); p.color === 'w' ? whiteBishops++ : blackBishops++; break;
      case 'r': positional = (y === 6 ? 25 : 0) + (x > 1 && x < 6 ? 5 : 0); break;
      case 'q': positional = center * 5 - (!endgame && y > 2 ? 8 : 0); break;
      case 'k': positional = endgame ? center * 24 : -center * 18 - y * 8 + (y === 0 && (x === 2 || x === 6) ? 28 : 0); break;
    }
    score += (p.color === 'w' ? 1 : -1) * (values[p.type] + positional);
  }
  if (whiteBishops >= 2) score += 28;
  if (blackBishops >= 2) score -= 28;
  return (game.turn() === 'w' ? score : -score) + 8;
}
function orderMoves(moves: Move[], preferred?: string): Move[] {
  const priority = (move: Move) => (moveKey(move) === preferred ? 200000 : 0)
    + (move.san.endsWith('#') ? 100000 : 0)
    + (move.captured ? values[move.captured] * 12 - values[move.piece] : 0)
    + (move.promotion ? values[move.promotion] * 10 : 0)
    + (move.san.endsWith('+') ? 70 : 0)
    + (move.isKingsideCastle() || move.isQueensideCastle() ? 60 : 0);
  return moves.sort((a, b) => priority(b) - priority(a));
}
/** Iterative deepening + alpha-beta + bounded capture quiescence. Uses only
 * chess.js public APIs; the caller's board and move history survive timeouts. */
export function findBestMove(game: Chess, options: SearchOptions = {}): SearchResult {
  const began = performance.now(), level = AI_LEVELS[options.difficulty || 'normal'];
  const budget = Math.max(10, Math.min(5000, options.timeMs ?? level.timeMs));
  const deadline = began + budget, maxDepth = Math.max(1, Math.min(10, options.maxDepth ?? level.maxDepth));
  const status = getGameStatus(game);
  let nodes = 0, depth = 0;
  if (status.over) return { move: null, claimDraw: false, depth, nodes, score: status.kind === 'checkmate' ? -MATE : 0, elapsedMs: performance.now() - began };
  const counts = repetitionCounts(game);
  let roots = orderMoves(game.moves({ verbose: true }));
  const immediateMate = roots.find(m => m.san.endsWith('#'));
  if (immediateMate) return { move: intent(immediateMate), claimDraw: false, depth: 1, nodes: roots.length, score: MATE - 1, elapsedMs: performance.now() - began };
  const canClaimNow = status.claimable.length > 0;
  let bestMove: Move | null = canClaimNow ? null : roots[0];
  let bestScore = canClaimNow ? 0 : evaluate(game), bestIntended: Move | undefined;
  const checkTime = () => { if (performance.now() >= deadline) throw TIMEOUT; };
  const moveAndSearch = (move: Move, run: () => number): number => {
    game.move(intent(move));
    const key = positionKey(game); counts.set(key, (counts.get(key) || 0) + 1);
    try { return run(); }
    finally { const count = counts.get(key)! - 1; if (count) counts.set(key, count); else counts.delete(key); game.undo(); }
  };
  const drawState = () => {
    const clock = Number(game.fen().split(' ')[4]), reps = counts.get(positionKey(game)) || 1;
    return { automatic: clock >= 150 || reps >= 5 || game.isInsufficientMaterial(), claim: clock >= 100 || reps >= 3 };
  };
  const search = (remaining: number, alpha: number, beta: number, ply: number, quietLeft: number): number => {
    checkTime(); nodes++;
    const moves = game.moves({ verbose: true });
    const checked = game.isCheck();
    if (!moves.length) return checked ? -MATE + ply : 0;
    const draw = drawState(); if (draw.automatic) return 0;
    // A claim is an available action, not a forced outcome. Winning lines may continue.
    let best = draw.claim ? 0 : -Infinity;
    if (draw.claim) { alpha = Math.max(alpha, 0); if (alpha >= beta) return alpha; }
    if (ply >= 24) return Math.max(best, evaluate(game));
    if (remaining <= 0 && !checked) {
      const stand = evaluate(game); best = Math.max(best, stand);
      if (best >= beta) return best;
      alpha = Math.max(alpha, best);
      if (quietLeft <= 0) return best;
    }
    const candidates = remaining > 0 || checked ? moves : moves.filter(m => m.captured || m.promotion);
    orderMoves(candidates);
    for (const move of candidates) {
      const score = moveAndSearch(move, () => {
        const childDraw = drawState();
        const result = -search(remaining - 1, -beta, -alpha, ply + 1, remaining > 0 ? quietLeft : quietLeft - 1);
        // Before making this move the player may claim the resulting third
        // repetition / 50 moves. Immediate checkmate remains preferable.
        return childDraw.claim ? Math.max(0, result) : result;
      });
      best = Math.max(best, score); alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  };
  for (let targetDepth = 1; targetDepth <= maxDepth; targetDepth++) {
    let iterationBest: Move | null = null, iterationIntended: Move | undefined;
    let iterationScore = canClaimNow ? 0 : -Infinity;
    try {
      for (const move of roots) {
        checkTime();
        let canClaimIntended = false;
        const score = moveAndSearch(move, () => {
          canClaimIntended = drawState().claim;
          const found = -search(targetDepth - 1, -Infinity, -iterationScore, 1, 5);
          return canClaimIntended ? Math.max(0, found) : found;
        });
        if (score > iterationScore || (!canClaimNow && !iterationBest)) {
          iterationScore = score; iterationBest = move;
          iterationIntended = canClaimIntended && score === 0 ? move : undefined;
        }
      }
      bestMove = iterationBest; bestScore = iterationScore; bestIntended = iterationIntended; depth = targetDepth;
      roots = orderMoves(roots, bestMove ? moveKey(bestMove) : undefined);
      if (bestScore >= MATE - 100) break;
    } catch (error) { if (error !== TIMEOUT) throw error; break; }
  }
  return {
    move: bestIntended || !bestMove ? null : intent(bestMove),
    claimDraw: !!bestIntended || (canClaimNow && !bestMove),
    ...(bestIntended ? { intendedClaim: intent(bestIntended) } : {}),
    depth, nodes, score: bestScore, elapsedMs: performance.now() - began,
  };
}
