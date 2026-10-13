import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

/** Official handbook still lists this edition on the date checked. Rules of play,
 * not tournament clocks, touch-move penalties, or arbiter administration. */
export const RULES_SOURCE = {
  url: 'https://handbook.fide.com/chapter/E012023',
  edition: 'FIDE 西洋棋規則（2023-01-01 生效）',
  checkedAt: '2026-10-13',
  limitation: '自動辨識常見死局：王對王、王與單象／單馬對王、僅剩同色格象與王。極罕見的封鎖死局不做完整可達性證明，可由雙方同意和局。此休閒遊戲不採計時、摸子必走或裁判罰則。',
} as const;
export type DrawClaim = 'threefold' | 'fifty-move';
export interface MoveIntent { from: Square; to: Square; promotion?: string }
export interface GameStatus {
  over: boolean;
  kind: 'playing' | 'checkmate' | 'stalemate' | 'dead-position' | 'fivefold' | 'seventy-five';
  title: string;
  reason: string;
  winner?: Color;
  claimable: DrawClaim[];
  repetitions: number;
  halfmoveClock: number;
}
const names: Record<PieceSymbol, string> = { p: '兵', n: '馬', b: '象', r: '車', q: '后', k: '王' };
const rules: Record<PieceSymbol, string> = {
  p: '兵向前直走一格；起始位置可直走兩格，但沿路須空。吃子必須向前斜走一格。',
  n: '馬走「兩格加一格」的 L 形，可以跳過沿途棋子。',
  b: '象沿斜線走任意格，不能跨過棋子。',
  r: '車沿橫線或直線走任意格，不能跨過棋子。',
  q: '后沿橫線、直線或斜線走任意格，不能跨過棋子。',
  k: '王通常向任意方向走一格，但不能進入敵方攻擊範圍，也不能與敵王相鄰。',
};
const opposite = (color: Color): Color => color === 'w' ? 'b' : 'w';
const xy = (s: Square) => [s.charCodeAt(0) - 97, Number(s[1]) - 1] as const;
const at = (x: number, y: number) => `${String.fromCharCode(97 + x)}${y + 1}` as Square;
const upper = (s: string) => s.toUpperCase();
function kingSquare(game: Chess, color: Color): Square | undefined {
  return game.board().flat().find(p => p?.type === 'k' && p.color === color)?.square;
}
function label(game: Chess, square: Square): string {
  const p = game.get(square);
  return `${upper(square)}${p ? ` 的${p.color === 'w' ? '白' : '黑'}${names[p.type]}` : ''}`;
}
/** fen() canonicalizes en-passant: only an actually legal capture preserves it,
 * including a pinned pawn. The move clocks never belong to repetition identity. */
export function positionKey(game: Chess): string { return game.fen().split(' ').slice(0, 4).join(' '); }
const keyFromFen = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
/** Verbose history reconstructs the original start and each legal position.
 * It works with custom-FEN PGNs and never mutates the caller's final position. */
export function repetitionCounts(game: Chess): Map<string, number> {
  const history = game.history({ verbose: true });
  const counts = new Map<string, number>();
  const add = (fen: string) => { const k = keyFromFen(fen); counts.set(k, (counts.get(k) || 0) + 1); };
  add(history[0]?.before ?? game.fen());
  for (const move of history) add(move.after);
  return counts;
}
function availableClaims(repetitions: number, halfmoveClock: number): DrawClaim[] {
  const claims: DrawClaim[] = [];
  if (repetitions >= 3) claims.push('threefold');
  if (halfmoveClock >= 100) claims.push('fifty-move');
  return claims;
}
export function getGameStatus(game: Chess): GameStatus {
  const repetitions = repetitionCounts(game).get(positionKey(game)) || 1;
  const halfmoveClock = Number(game.fen().split(' ')[4]);
  const base = { repetitions, halfmoveClock, claimable: [] as DrawClaim[] };
  // Article 9.6.2: checkmate on the final move takes precedence over 75 moves.
  if (game.isCheckmate()) return { ...base, over: true, kind: 'checkmate', title: '將死', reason: '王正被將軍，且沒有任何合法走法可解除。將死優先於七十五回合和局（5.1.1、9.6.2）。', winner: opposite(game.turn()) };
  if (game.isStalemate()) return { ...base, over: true, kind: 'stalemate', title: '逼和', reason: '行動方沒有合法走法，但王沒有被將軍，因此立即和局（5.2.1）。' };
  if (game.isInsufficientMaterial()) return { ...base, over: true, kind: 'dead-position', title: '死局和局', reason: '目前剩餘子力屬於已確認無法透過任何合法走法將死的局面（5.2.2）。' };
  if (repetitions >= 5) return { ...base, over: true, kind: 'fivefold', title: '五次重複和局', reason: '包含行動方、王車易位及可吃過路兵權利在內的相同局面，已出現至少五次，自動和局（9.6.1）。' };
  if (halfmoveClock >= 150) return { ...base, over: true, kind: 'seventy-five', title: '七十五回合和局', reason: '雙方各連續七十五步沒有走兵或吃子，自動和局（9.6.2）。' };
  return { ...base, over: false, kind: 'playing', title: game.isCheck() ? '將軍' : '對局中', reason: game.isCheck() ? '本回合必須移王、吃掉將軍棋子，或擋住攻擊線；每一步都必須讓王安全。' : '所有亮起的走法均符合棋種規則，而且走完後己王不會遭到將軍。', claimable: availableClaims(repetitions, halfmoveClock) };
}
export function claimDraw(game: Chess, intended?: MoveIntent): { valid: boolean; reasons: DrawClaim[]; message: string; intended?: MoveIntent } {
  if (getGameStatus(game).over) return { valid: false, reasons: [], message: '這盤棋已經結束。' };
  let reasons: DrawClaim[];
  if (intended) {
    const next = new Chess(game.fen());
    let move: Move;
    try { move = next.move(intended); } catch { return { valid: false, reasons: [], message: '指定的下一步不是合法走法，無法據此申請和局。' }; }
    const counts = repetitionCounts(game);
    reasons = availableClaims((counts.get(positionKey(next)) || 0) + 1, Number(next.fen().split(' ')[4]));
    if (reasons.length) return { valid: true, reasons, intended: { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) }, message: `宣告下一步 ${move.san} 後即可形成${reasons.includes('threefold') ? '第三次相同局面' : '雙方各五十步未走兵或吃子'}，申請立即和局；不必實際走出該步（9.2.1.1、9.3.1）。` };
  } else reasons = getGameStatus(game).claimable;
  return reasons.length
    ? { valid: true, reasons, message: `${reasons.includes('threefold') ? '同一局面已出現三次' : '雙方各五十步未走兵或吃子'}，行動方申請和局成立（9.2、9.3）。` }
    : { valid: false, reasons: [], message: '目前尚未達三次重複或五十回合條件；可以指定下一步，檢查是否走出該步即可申請。' };
}
/** Candidate claims share one history scan; opening the menu never replays it per move. */
export function intendedDrawMoves(game: Chess): Move[] {
  const counts = repetitionCounts(game);
  const clock = Number(game.fen().split(' ')[4]);
  if (clock < 99 && ![...counts.values()].some(count => count >= 2)) return [];
  return game.moves({ verbose: true }).filter(move => {
    const fields = move.after.split(' ');
    return Number(fields[4]) >= 100 || (counts.get(fields.slice(0, 4).join(' ')) || 0) >= 2;
  });
}
function pathBetween(from: Square, to: Square): Square[] {
  const [fx, fy] = xy(from), [tx, ty] = xy(to), dx = Math.sign(tx - fx), dy = Math.sign(ty - fy);
  const result: Square[] = [];
  for (let x = fx + dx, y = fy + dy; x !== tx || y !== ty; x += dx, y += dy) result.push(at(x, y));
  return result;
}
function pinAttacker(game: Chess, square: Square): Square | undefined {
  const piece = game.get(square); if (!piece || piece.type === 'k') return;
  const king = kingSquare(game, piece.color); if (!king) return;
  const [kx, ky] = xy(king), [px, py] = xy(square), dx = px - kx, dy = py - ky;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return;
  if (pathBetween(king, square).some(s => game.get(s))) return;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  for (let x = px + sx, y = py + sy; x >= 0 && x < 8 && y >= 0 && y < 8; x += sx, y += sy) {
    const s = at(x, y), p = game.get(s); if (!p) continue;
    if (p.color !== piece.color && (p.type === 'q' || p.type === (dx && dy ? 'b' : 'r'))) return s;
    return;
  }
}
export function explainMove(game: Chess, move: Move): string {
  const before = game.fen() === move.before ? game : new Chess(move.before);
  let reason: string;
  if (move.isKingsideCastle() || move.isQueensideCastle()) reason = `${move.isKingsideCastle() ? '王翼' : '后翼'}易位：王與該車仍有易位權，中間無子；王目前、途經格及落點都未被攻擊。`;
  else if (move.isEnPassant()) reason = `吃過路兵：敵兵上一步剛走兩格，你的兵可立刻斜走到 ${upper(move.to)}，吃掉 ${upper(`${move.to[0]}${move.from[1]}`)} 的兵；移走兩兵後己王仍安全。`;
  else if (move.piece === 'p') reason = move.isBigPawn() ? '兵在起始排，前方兩格皆空，因此可以直進兩格。' : move.isCapture() ? '兵向前斜走一格，落點有敵棋，因此可以吃子。' : '兵向前直走一格，落點為空，因此可以前進。';
  else if (move.piece === 'n') reason = '馬走兩格再橫移一格的 L 形，可以跳過沿途棋子；落點沒有己方棋子。';
  else if (move.piece === 'k') reason = '王走到相鄰一格；吃子及移動後重新檢查，落點不受敵方攻擊，也不與敵王相鄰。';
  else {
    const [fx, fy] = xy(move.from), [tx, ty] = xy(move.to);
    reason = `${names[move.piece]}沿${fx === tx ? '直線' : fy === ty ? '橫線' : '斜線'}走到 ${upper(move.to)}，沿路沒有棋子阻擋${move.isCapture() ? '，可吃掉落點的敵棋' : '，落點為空'}。`;
  }
  if (move.isPromotion()) reason += `兵抵達底線，立即升變為${names[move.promotion!] }（也可選后、車、象、馬，不限先前被吃掉的棋）。`;
  if (before.isCheck()) {
    const king = kingSquare(before, move.color)!;
    const checkers = before.attackers(king, opposite(move.color));
    reason += move.piece === 'k' ? '這一步讓王離開將軍威脅。' : checkers.includes(move.to) || (move.isEnPassant() && checkers.includes(`${move.to[0]}${move.from[1]}` as Square)) ? '這一步吃掉將軍棋子，解除將軍。' : '這一步擋住將軍路線，解除將軍。';
  } else if (pinAttacker(before, move.from)) reason += '這枚棋被釘住，但此步仍封住攻擊線或吃掉攻擊者，所以合法。';
  else if (move.piece !== 'k' && !move.isEnPassant() && !move.isKingsideCastle() && !move.isQueensideCastle()) reason += '走完後己王仍安全。';
  if (move.san.endsWith('#')) reason += '同時將死對方。';
  else if (move.san.endsWith('+')) reason += '同時對敵王將軍。';
  return reason;
}
export function explainIllegalMove(game: Chess, from: Square, to: Square): string {
  const piece = game.get(from);
  if (!piece) return `${upper(from)} 沒有棋子。`;
  if (piece.color !== game.turn()) return `目前輪到${game.turn() === 'w' ? '白' : '黑'}方，不能移動對方棋子。`;
  if (from === to) return '起點與終點相同；再點一次棋子可取消選取。';
  const legal = game.moves({ square: from, verbose: true }).find(m => m.to === to);
  if (legal) return explainMove(game, legal);
  const target = game.get(to);
  const [fx, fy] = xy(from), [tx, ty] = xy(to), dx = tx - fx, dy = ty - fy;
  const castle = piece.type === 'k' && Math.abs(dx) === 2 && dy === 0;
  if (castle) {
    const home = piece.color === 'w' ? '1' : '8', kingSide = dx > 0;
    if (from !== `e${home}` || !game.getCastlingRights(piece.color)[kingSide ? 'k' : 'q']) return '不能王車易位：王或該側的車曾經移動、被吃掉，或此局面沒有保留易位權。移回原位也不會恢復權利。';
    if (game.isCheck()) return '王正在被將軍，不能用王車易位逃離將軍；必須用其他合法走法解除。';
    const route = (kingSide ? ['f', 'g'] : ['d', 'c', 'b']).map(file => `${file}${home}` as Square);
    const blocker = route.find(s => game.get(s));
    if (blocker) return `不能王車易位：王與車之間的 ${label(game, blocker)} 擋住路線。`;
    const attacked = route.slice(0, 2).find(s => game.isAttacked(s, opposite(piece.color)));
    if (attacked) return `不能王車易位：王必須經過或抵達的 ${upper(attacked)} 正受敵方攻擊。`;
    return '此局面不符合王車易位條件；請選擇亮起的合法落點。';
  }
  if (target?.color === piece.color) return `${upper(to)} 已被己方${names[target.type]}佔據，不能落在己方棋子上。`;
  if (target?.type === 'k') return '王不能被吃掉；必須以將軍並封住所有逃法的「將死」結束對局。';
  if (piece.type === 'p') {
    const dir = piece.color === 'w' ? 1 : -1, start = piece.color === 'w' ? 1 : 6;
    if (dy * dir <= 0) return '兵只能向前，不能後退或橫走。';
    if (dx === 0 && (dy === dir || dy === 2 * dir)) {
      if (dy === 2 * dir && fy !== start) return '兵只有在起始排才能一次前進兩格。';
      const blocker = [...(Math.abs(dy) === 2 ? [at(fx, fy + dir)] : []), to].find(s => game.get(s));
      if (blocker) return `${label(game, blocker)} 擋住前方；兵不能直走吃子，也不能跨過棋子。`;
    } else if (Math.abs(dx) === 1 && dy === dir) {
      const ep = game.fen({ forceEnpassantSquare: true }).split(' ')[3];
      if (!target && ep !== to) return '兵斜走必須吃子；這裡沒有敵棋，也不符合「敵兵上一步剛走兩格」的吃過路兵條件。';
    } else return '兵只能直進一格、起始排直進兩格，或向前斜吃一格。';
  } else if (piece.type === 'n') {
    if (!((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1))) return '馬只能走兩格加一格的 L 形；不能直線或斜線任意移動。';
  } else if (piece.type === 'k') {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return '王通常只能走到相鄰一格；橫走兩格只限符合條件的王車易位。';
  } else {
    const diagonal = Math.abs(dx) === Math.abs(dy), straight = dx === 0 || dy === 0;
    if ((piece.type === 'b' && !diagonal) || (piece.type === 'r' && !straight) || (piece.type === 'q' && !diagonal && !straight)) return `${names[piece.type]}的走法不符合這條路線。${rules[piece.type]}`;
    const blocker = pathBetween(from, to).find(s => game.get(s));
    if (blocker) return `${label(game, blocker)} 擋住路線；${names[piece.type]}不能跨過棋子。`;
  }
  // It is a geometrically valid move. Demonstrate which king attack prevents it,
  // including discovered attacks after en-passant removes both pawns.
  const probe = new Chess(game.fen());
  probe.remove(from); probe.remove(to);
  if (piece.type === 'p' && dx !== 0 && !target) probe.remove(`${to[0]}${from[1]}` as Square);
  probe.put(piece, to);
  const king = kingSquare(probe, piece.color), attackers = king ? probe.attackers(king, opposite(piece.color)) : [];
  const attackText = attackers.map(s => label(probe, s)).join('、');
  if (piece.type === 'k') return `王不能走到 ${upper(to)}：${attackText || '敵方棋子'}會攻擊這個位置（敵方被釘住的棋子仍算攻擊範圍）。`;
  const pinned = pinAttacker(game, from);
  if (pinned) return `${upper(from)} 的${names[piece.type]}被 ${label(game, pinned)} 釘住；這樣走會暴露己王，不能離開保護線。`;
  return game.isCheck() ? `己王仍會受到 ${attackText || '敵棋'} 將軍；目前只能走能解除所有將軍威脅的棋。` : `這樣走會讓己王被 ${attackText || '敵棋'} 將軍，因此不合法${piece.type === 'p' && dx !== 0 && !target ? '；吃過路兵移除兩枚兵後，也要重新檢查王的安全' : ''}。`;
}
export function getSelectionGuide(game: Chess, square: Square): { summary: string; restrictions: string[]; moves: { move: Move; reason: string }[] } {
  const piece = game.get(square);
  if (!piece) return { summary: '這一格沒有棋子。', restrictions: [], moves: [] };
  if (piece.color !== game.turn()) return { summary: '現在輪到對方，請選行動方的棋子。', restrictions: [], moves: [] };
  const moves = game.moves({ square, verbose: true });
  const restrictions = ['不能落在己方棋子上；任何走法都不能讓己王被將軍（3.1、3.9.2）。'];
  const king = kingSquare(game, piece.color)!;
  if (game.isCheck()) {
    const attackers = game.attackers(king, opposite(piece.color));
    restrictions.unshift(`己王正被 ${attackers.map(s => label(game, s)).join('、')} 將軍。${attackers.length > 1 ? '雙重將軍時只能移王，且落點必須安全。' : '必須移王、吃掉攻擊者或擋住攻擊線；不能只顧其他威脅。'}`);
  }
  const pin = pinAttacker(game, square);
  if (pin) restrictions.unshift(`這枚${names[piece.type]}被 ${label(game, pin)} 釘住：只能沿保護線移動或吃掉攻擊者；馬無法沿線移動。`);
  if (['b', 'r', 'q'].includes(piece.type)) restrictions.push('每條射線遇到第一枚棋子就停止；若是敵棋，可以吃掉，但不能越過它。');
  if (piece.type === 'p') restrictions.push('吃過路兵只能緊接敵兵走兩格後使用；到達底線必須選后、車、象或馬升變（3.7）。');
  if (piece.type === 'k') restrictions.push('易位要求王與該車尚有易位權、中間無子，而且王目前、經過及抵達的格子都不能被攻擊（3.8.2）。');
  if (!moves.length) restrictions.unshift('這枚棋目前沒有合法走法；可改選其他己方棋子。');
  return { summary: rules[piece.type], restrictions, moves: moves.map(move => ({ move, reason: explainMove(game, move) })) };
}
