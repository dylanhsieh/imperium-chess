import { Chess } from 'chess.js';
import { findBestMove, type Difficulty } from './ai-search';
interface Request { id: number | string; fen?: string; pgn?: string; difficulty?: Difficulty; timeMs?: number }
// The owner terminates this worker on new game, undo, or a mode change. There is
// deliberately no shared main-thread search that could stall touch input/rendering.
self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const game = new Chess(request.fen);
    if (request.pgn) game.loadPgn(request.pgn);
    const difficulty = request.difficulty && ['easy', 'normal', 'hard'].includes(request.difficulty) ? request.difficulty : 'normal';
    self.postMessage({ id: request.id, ...findBestMove(game, { difficulty, timeMs: request.timeMs }) });
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : 'AI 無法讀取局面' });
  }
};
