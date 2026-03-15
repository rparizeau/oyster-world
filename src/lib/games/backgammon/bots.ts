import type { BackgammonState, CheckerColor, CheckerMove, BoardPoint } from './types';
import { generateSequences } from './engine';
import { BOT_MOVE_SEQUENCE_CAP, HOME_BOARD_SIZE, MAX_CHECKERS } from './constants';

interface BoardState {
  points: BoardPoint[];
  bar: { white: number; black: number };
  borneOff: { white: number; black: number };
}

function opponent(color: CheckerColor): CheckerColor {
  return color === 'white' ? 'black' : 'white';
}

function clonePoints(points: BoardPoint[]): BoardPoint[] {
  return points.map(p => ({ ...p }));
}

function applyMoveToBoard(board: BoardState, move: CheckerMove, color: CheckerColor): BoardState {
  const newPoints = clonePoints(board.points);
  const newBar = { ...board.bar };
  const newBorneOff = { ...board.borneOff };

  if (move.from === 'bar') {
    newBar[color]--;
  } else {
    const srcIdx = (move.from as number) - 1;
    newPoints[srcIdx] = { ...newPoints[srcIdx], count: newPoints[srcIdx].count - 1 };
    if (newPoints[srcIdx].count === 0) newPoints[srcIdx].color = null;
  }

  if (move.to === 'off') {
    newBorneOff[color]++;
  } else {
    const destIdx = (move.to as number) - 1;
    if (newPoints[destIdx].color === opponent(color) && newPoints[destIdx].count === 1) {
      newBar[opponent(color)]++;
      newPoints[destIdx] = { color, count: 1 };
    } else {
      newPoints[destIdx] = { color, count: newPoints[destIdx].count + 1 };
    }
  }

  return { points: newPoints, bar: newBar, borneOff: newBorneOff };
}

function applySequence(board: BoardState, moves: CheckerMove[], color: CheckerColor): BoardState {
  let current = board;
  for (const move of moves) {
    current = applyMoveToBoard(current, move, color);
  }
  return current;
}

/** Home board range indices */
function homeRange(color: CheckerColor): [number, number] {
  return color === 'white' ? [0, 5] : [18, 23];
}

/** Calculate pip count for a color */
function pipCount(board: BoardState, color: CheckerColor): number {
  let pips = 0;
  for (let i = 0; i < 24; i++) {
    if (board.points[i].color === color && board.points[i].count > 0) {
      const pointNum = i + 1;
      const dist = color === 'white' ? pointNum : 25 - pointNum;
      pips += dist * board.points[i].count;
    }
  }
  // Bar checkers: 25 pips each (must re-enter from opponent's home)
  pips += board.bar[color] * 25;
  return pips;
}

/** Score a board position for the given color */
function scoreBoard(board: BoardState, color: CheckerColor, originalBoard: BoardState): number {
  let score = 0;
  const opp = opponent(color);
  const [hlo, hhi] = homeRange(color);
  const [oppHlo, oppHhi] = homeRange(opp);

  // Pip count improvement (lower is better for us)
  const pipDelta = pipCount(originalBoard, color) - pipCount(board, color);
  score += pipDelta * 5;

  // Made points in home board
  for (let i = hlo; i <= hhi; i++) {
    if (board.points[i].color === color && board.points[i].count >= 2) {
      score += 3;
    }
  }

  // Blots (single checkers exposed)
  for (let i = 0; i < 24; i++) {
    if (board.points[i].color === color && board.points[i].count === 1) {
      if (i >= oppHlo && i <= oppHhi) {
        score -= 4; // Blot in opponent's home (high risk)
      } else {
        score -= 2; // Blot elsewhere
      }
    }
  }

  // Hitting opponent's blot (compare bars)
  const hitsScored = board.bar[opp] - originalBoard.bar[opp];
  score += hitsScored * 3;

  // Own checkers on bar
  score -= board.bar[color] * 5;

  // Anchoring in opponent's home board
  for (let i = oppHlo; i <= oppHhi; i++) {
    if (board.points[i].color === color && board.points[i].count >= 2) {
      score += 2;
    }
  }

  // Borne off progress
  score += board.borneOff[color] * 3;

  return score;
}

/** Filter sequences per backgammon rules */
function filterSequences(sequences: CheckerMove[][], totalDice: number): CheckerMove[][] {
  if (sequences.length === 0) return [];
  const maxLen = Math.max(...sequences.map(s => s.length));
  let filtered = sequences.filter(s => s.length === maxLen);
  if (maxLen === 1 && totalDice === 2) {
    const withHigher = filtered.filter(s => s[0].dieUsed === Math.max(...filtered.map(f => f[0].dieUsed)));
    if (withHigher.length > 0) filtered = withHigher;
  }
  return filtered;
}

/**
 * Compute the best move sequence for the bot.
 */
export function getBestMoveSequence(state: BackgammonState, botColor: CheckerColor): CheckerMove[] {
  if (!state.dice || state.dice.remaining.length === 0) return [];

  const board: BoardState = {
    points: state.points,
    bar: state.bar,
    borneOff: state.borneOff,
  };

  let sequences = generateSequences(board, botColor, state.dice.remaining);
  sequences = filterSequences(sequences, state.dice.values.length);

  if (sequences.length === 0) return [];

  // Cap evaluation
  const toEval = sequences.slice(0, BOT_MOVE_SEQUENCE_CAP);

  let bestScore = -Infinity;
  let bestSeq: CheckerMove[] = toEval[0];

  for (const seq of toEval) {
    const resultBoard = applySequence(board, seq, botColor);
    const s = scoreBoard(resultBoard, botColor, board);
    if (s > bestScore) {
      bestScore = s;
      bestSeq = seq;
    }
  }

  return bestSeq;
}
