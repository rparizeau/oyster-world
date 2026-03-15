import type { Player } from '@/lib/types';
import type { GameModule, GameAction, AdvancementResult } from '../types';
import type {
  BackgammonState, CheckerColor, BoardPoint, CheckerMove,
  DiceState, BoardSnapshot, PendingMoveEntry, CubeState, MatchState,
} from './types';
import {
  STARTING_POSITION, BOARD_POINTS, MAX_CHECKERS, HOME_BOARD_SIZE,
  MAX_SEQUENCE_SEARCH, WHITE_ENTRY_OFFSET, MAX_CUBE_VALUE,
  BOT_ROLL_DELAY_MS, BOT_MOVE_DELAY_MS, BOT_CONFIRM_DELAY_MS,
  BOT_ACCEPT_DOUBLE_DELAY_MS,
} from './constants';
import { getBestMoveSequence } from './bots';

// ─── Helpers ──────────────────────────────────────────────────────────

function opponent(color: CheckerColor): CheckerColor {
  return color === 'white' ? 'black' : 'white';
}

function clonePoints(points: BoardPoint[]): BoardPoint[] {
  return points.map(p => ({ ...p }));
}

function snapshotBoard(state: BackgammonState): BoardSnapshot {
  return {
    points: clonePoints(state.points),
    bar: { ...state.bar },
    borneOff: { ...state.borneOff },
  };
}

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function getPlayerColor(state: BackgammonState, playerId: string): CheckerColor | null {
  return state.colorMap[playerId] ?? null;
}

function getPlayerIdForColor(state: BackgammonState, color: CheckerColor): string {
  for (const [pid, c] of Object.entries(state.colorMap)) {
    if (c === color) return pid;
  }
  return '';
}

/** Direction of movement: white moves high→low (24→1), black moves low→high (1→24) */
function moveDirection(color: CheckerColor): number {
  return color === 'white' ? -1 : 1;
}

/** Home board indices for a color */
function homeRange(color: CheckerColor): [number, number] {
  // White home: points 1-6 (indices 0-5)
  // Black home: points 19-24 (indices 18-23)
  return color === 'white' ? [0, 5] : [18, 23];
}

/** Check if all checkers are in the home board (can bear off) */
function allInHome(state: BackgammonState, color: CheckerColor): boolean {
  if (state.bar[color] > 0) return false;
  const [lo, hi] = homeRange(color);
  for (let i = 0; i < BOARD_POINTS; i++) {
    if (i >= lo && i <= hi) continue;
    if (state.points[i].color === color && state.points[i].count > 0) return false;
  }
  return true;
}

/** Bar entry point index for a die value */
function barEntryIndex(color: CheckerColor, die: number): number {
  // White enters from opponent's home (points 24-19, indices 23-18): index = 25 - die - 1 = 24 - die
  // Black enters from opponent's home (points 1-6, indices 0-5): index = die - 1
  return color === 'white' ? WHITE_ENTRY_OFFSET - die - 1 : die - 1;
}

/** Can a checker land on this point? */
function canLand(point: BoardPoint, color: CheckerColor): boolean {
  return point.color === null || point.color === color || point.count <= 1;
}

/** Highest occupied point index in home board (relative: 1-6 from bearing off edge) */
function highestOccupiedHome(state: BackgammonState, color: CheckerColor): number {
  const [lo, hi] = homeRange(color);
  if (color === 'white') {
    // White bears off past point 1. Highest = furthest from point 1 = index 5 (point 6)
    for (let i = hi; i >= lo; i--) {
      if (state.points[i].color === color && state.points[i].count > 0) return i - lo + 1;
    }
  } else {
    // Black bears off past point 24. Highest = furthest from point 24 = index 18 (point 19)
    for (let i = lo; i <= hi; i++) {
      if (state.points[i].color === color && state.points[i].count > 0) return hi - i + 1;
    }
  }
  return 0;
}

// ─── Move Generation ──────────────────────────────────────────────────

interface BoardState {
  points: BoardPoint[];
  bar: { white: number; black: number };
  borneOff: { white: number; black: number };
}

function getMovesForDie(board: BoardState, color: CheckerColor, die: number): CheckerMove[] {
  const moves: CheckerMove[] = [];
  const dir = moveDirection(color);

  // Bar re-entry
  if (board.bar[color] > 0) {
    const entryIdx = barEntryIndex(color, die);
    if (entryIdx >= 0 && entryIdx < BOARD_POINTS && canLand(board.points[entryIdx], color)) {
      moves.push({ from: 'bar', to: entryIdx + 1, dieUsed: die }); // to is 1-indexed point
    }
    return moves; // Must clear bar first
  }

  const canBearOff = allInHomeBoard(board, color);

  for (let i = 0; i < BOARD_POINTS; i++) {
    if (board.points[i].color !== color || board.points[i].count === 0) continue;

    const pointNum = i + 1; // 1-indexed
    const destNum = pointNum + die * dir;

    // Normal move
    if (destNum >= 1 && destNum <= 24) {
      const destIdx = destNum - 1;
      if (canLand(board.points[destIdx], color)) {
        moves.push({ from: pointNum, to: destNum, dieUsed: die });
      }
    }

    // Bear off
    if (canBearOff) {
      const [lo, hi] = homeRange(color);
      if (i >= lo && i <= hi) {
        if (color === 'white') {
          // White bears off past point 1: need die >= pointNum
          if (die === pointNum) {
            moves.push({ from: pointNum, to: 'off', dieUsed: die });
          } else if (die > pointNum) {
            // Can bear off with higher die only if no higher occupied point
            const highest = highestOccupiedHomeBoard(board, color);
            if (pointNum === highest) {
              moves.push({ from: pointNum, to: 'off', dieUsed: die });
            }
          }
        } else {
          // Black bears off past point 24: need die >= (25 - pointNum)
          const distFromEdge = 25 - pointNum;
          if (die === distFromEdge) {
            moves.push({ from: pointNum, to: 'off', dieUsed: die });
          } else if (die > distFromEdge) {
            const highest = highestOccupiedHomeBoard(board, color);
            if (pointNum === highestToPointNum(board, color, highest)) {
              moves.push({ from: pointNum, to: 'off', dieUsed: die });
            }
          }
        }
      }
    }
  }

  return moves;
}

function allInHomeBoard(board: BoardState, color: CheckerColor): boolean {
  if (board.bar[color] > 0) return false;
  const [lo, hi] = homeRange(color);
  for (let i = 0; i < BOARD_POINTS; i++) {
    if (i >= lo && i <= hi) continue;
    if (board.points[i].color === color && board.points[i].count > 0) return false;
  }
  return true;
}

/** Return the highest "distance from bearing off edge" of occupied points in home */
function highestOccupiedHomeBoard(board: BoardState, color: CheckerColor): number {
  const [lo, hi] = homeRange(color);
  if (color === 'white') {
    for (let i = hi; i >= lo; i--) {
      if (board.points[i].color === color && board.points[i].count > 0) return i + 1; // pointNum
    }
  } else {
    for (let i = lo; i <= hi; i++) {
      if (board.points[i].color === color && board.points[i].count > 0) return i + 1; // pointNum
    }
  }
  return 0;
}

function highestToPointNum(_board: BoardState, _color: CheckerColor, highest: number): number {
  return highest; // Already a pointNum
}

function applyMoveToBoard(board: BoardState, move: CheckerMove, color: CheckerColor): BoardState {
  const newPoints = clonePoints(board.points);
  const newBar = { ...board.bar };
  const newBorneOff = { ...board.borneOff };

  // Remove from source
  if (move.from === 'bar') {
    newBar[color]--;
  } else {
    const srcIdx = (move.from as number) - 1;
    newPoints[srcIdx] = { ...newPoints[srcIdx], count: newPoints[srcIdx].count - 1 };
    if (newPoints[srcIdx].count === 0) newPoints[srcIdx].color = null;
  }

  // Place at destination
  if (move.to === 'off') {
    newBorneOff[color]++;
  } else {
    const destIdx = (move.to as number) - 1;
    // Hit opponent's blot
    if (newPoints[destIdx].color === opponent(color) && newPoints[destIdx].count === 1) {
      newBar[opponent(color)]++;
      newPoints[destIdx] = { color, count: 1 };
    } else {
      newPoints[destIdx] = { color, count: newPoints[destIdx].count + 1 };
    }
  }

  return { points: newPoints, bar: newBar, borneOff: newBorneOff };
}

/**
 * Generate all complete move sequences for given dice remaining.
 * Returns arrays of CheckerMove sequences.
 */
export function generateSequences(
  board: BoardState,
  color: CheckerColor,
  diceRemaining: number[],
): CheckerMove[][] {
  if (diceRemaining.length === 0) return [[]];

  const sequences: CheckerMove[][] = [];
  const usedDice = new Set<number>(); // Deduplicate identical die values

  for (let d = 0; d < diceRemaining.length; d++) {
    const die = diceRemaining[d];
    if (usedDice.has(die)) continue;
    usedDice.add(die);

    const moves = getMovesForDie(board, color, die);
    for (const move of moves) {
      const newBoard = applyMoveToBoard(board, move, color);
      const remaining = [...diceRemaining];
      remaining.splice(d, 1);
      const subSequences = generateSequences(newBoard, color, remaining);
      for (const sub of subSequences) {
        sequences.push([move, ...sub]);
      }
      if (sequences.length >= MAX_SEQUENCE_SEARCH) return sequences;
    }
  }

  return sequences;
}

/** Filter sequences per backgammon rules (must use max dice, higher die if only one) */
function filterSequences(sequences: CheckerMove[][], totalDice: number): CheckerMove[][] {
  if (sequences.length === 0) return [];

  const maxLen = Math.max(...sequences.map(s => s.length));
  // Must use all dice if any sequence does
  let filtered = sequences.filter(s => s.length === maxLen);

  // If only one die can be used and it's not doubles, must use the higher die
  if (maxLen === 1 && totalDice === 2) {
    const withHigher = filtered.filter(s => s[0].dieUsed === Math.max(...filtered.map(f => f[0].dieUsed)));
    if (withHigher.length > 0) filtered = withHigher;
  }

  return filtered;
}

/** Get legal first moves from the current state */
export function getLegalMoves(state: BackgammonState): CheckerMove[] {
  if (!state.dice || state.dice.remaining.length === 0) return [];

  const board: BoardState = {
    points: state.points,
    bar: state.bar,
    borneOff: state.borneOff,
  };

  const sequences = generateSequences(board, state.currentTurn, state.dice.remaining);
  const filtered = filterSequences(sequences, state.dice.values.length);

  // Deduplicate first moves
  const seen = new Set<string>();
  const moves: CheckerMove[] = [];
  for (const seq of filtered) {
    if (seq.length === 0) continue;
    const key = `${seq[0].from}-${seq[0].to}-${seq[0].dieUsed}`;
    if (!seen.has(key)) {
      seen.add(key);
      moves.push(seq[0]);
    }
  }
  return moves;
}

/** Check if the player has used as many dice as required */
function hasUsedRequiredDice(state: BackgammonState): boolean {
  if (!state.dice || state.dice.remaining.length === 0) return true;

  const board: BoardState = {
    points: state.points,
    bar: state.bar,
    borneOff: state.borneOff,
  };

  const sequences = generateSequences(board, state.currentTurn, state.dice.remaining);
  // If no further sequences possible, the player is stuck
  if (sequences.every(s => s.length === 0)) return true;

  return false;
}

function checkWin(state: BackgammonState): { winner: CheckerColor; winType: 'normal' | 'gammon' | 'backgammon'; pointsScored: number } | null {
  for (const color of ['white', 'black'] as CheckerColor[]) {
    if (state.borneOff[color] >= MAX_CHECKERS) {
      const loser = opponent(color);
      const winType = detectWinType(state, loser);
      const multiplier = winType === 'backgammon' ? 3 : winType === 'gammon' ? 2 : 1;
      const pointsScored = (state.cube.value || 1) * multiplier;
      return { winner: color, winType, pointsScored };
    }
  }
  return null;
}

function detectWinType(state: BackgammonState, loser: CheckerColor): 'normal' | 'gammon' | 'backgammon' {
  if (state.borneOff[loser] > 0) return 'normal';
  // Check if loser has checkers on bar or in winner's home board
  const winner = opponent(loser);
  const [wlo, whi] = homeRange(winner);
  const hasOnBar = state.bar[loser] > 0;
  const hasInWinnerHome = state.points.some((p, i) =>
    i >= wlo && i <= whi && p.color === loser && p.count > 0
  );
  if (hasOnBar || hasInWinnerHome) return 'backgammon';
  return 'gammon';
}

function initializeBoard(): BoardPoint[] {
  const points: BoardPoint[] = Array.from({ length: BOARD_POINTS }, () => ({
    color: null,
    count: 0,
  }));
  for (let i = 0; i < STARTING_POSITION.length; i++) {
    const pos = STARTING_POSITION[i];
    if (pos) {
      points[i] = { color: pos.color, count: pos.count };
    }
  }
  return points;
}

function createInitialState(
  players: Player[],
  settings?: Record<string, unknown>,
): BackgammonState {
  // Randomly assign colors
  const shuffled = Math.random() < 0.5;
  const colorMap: Record<string, CheckerColor> = {};
  colorMap[players[0].id] = shuffled ? 'black' : 'white';
  colorMap[players[1].id] = shuffled ? 'white' : 'black';

  // Random first turn
  const currentTurn: CheckerColor = Math.random() < 0.5 ? 'white' : 'black';

  const cubeEnabled = settings?.cubeEnabled === true;
  const matchEnabled = settings?.matchEnabled === true;
  const matchTarget = (settings?.matchTarget as number) || 5;

  const match: MatchState | null = matchEnabled
    ? { target: matchTarget, scores: { white: 0, black: 0 }, crawfordGame: false, postCrawford: false }
    : null;

  // Check if first turn is a bot
  const firstPlayerId = getPlayerIdForColorFromMap(colorMap, currentTurn);
  const firstPlayer = players.find(p => p.id === firstPlayerId);
  const botActionAt = firstPlayer?.isBot ? Date.now() + BOT_ROLL_DELAY_MS : null;

  return {
    points: initializeBoard(),
    bar: { white: 0, black: 0 },
    borneOff: { white: 0, black: 0 },
    currentTurn,
    phase: 'rolling',
    dice: null,
    cube: { value: 1, owner: null, offeredBy: null },
    cubeEnabled,
    match,
    colorMap,
    pendingMoves: [],
    botMoveQueue: undefined,
    winner: null,
    winType: null,
    pointsScored: null,
    botActionAt,
  };
}

function getPlayerIdForColorFromMap(colorMap: Record<string, CheckerColor>, color: CheckerColor): string {
  for (const [pid, c] of Object.entries(colorMap)) {
    if (c === color) return pid;
  }
  return '';
}

// ─── Game Module ──────────────────────────────────────────────────────

export const backgammonModule: GameModule<BackgammonState> = {
  initialize(players, settings) {
    return createInitialState(players, settings);
  },

  processAction(state, playerId, action) {
    const color = getPlayerColor(state, playerId);
    if (!color) return state;

    switch (action.type) {
      case 'ROLL':
        return handleRoll(state, color);
      case 'MOVE_CHECKER':
        return handleMoveChecker(state, color, action.payload as { from: number | 'bar'; to: number | 'off'; dieUsed: number });
      case 'UNDO_MOVE':
        return handleUndoMove(state, color);
      case 'CONFIRM_MOVES':
        return handleConfirmMoves(state, color);
      case 'OFFER_DOUBLE':
        return handleOfferDouble(state, color);
      case 'ACCEPT_DOUBLE':
        return handleAcceptDouble(state, color);
      case 'DECLINE_DOUBLE':
        return handleDeclineDouble(state, color);
      default:
        return state;
    }
  },

  getBotAction(state, botId) {
    const color = getPlayerColor(state, botId);
    if (!color) return { type: 'noop' };

    if (state.phase === 'rolling') {
      return { type: 'ROLL' };
    }

    if (state.phase === 'double_offered') {
      return { type: 'ACCEPT_DOUBLE' };
    }

    if (state.phase === 'moving') {
      // If we have a queued move sequence, use it
      if (state.botMoveQueue && state.botMoveQueue.length > 0) {
        const next = state.botMoveQueue[0];
        return { type: 'MOVE_CHECKER', payload: next };
      }

      // Compute best sequence
      const sequence = getBestMoveSequence(state, color);
      if (sequence.length === 0) {
        return { type: 'CONFIRM_MOVES' };
      }

      return { type: 'MOVE_CHECKER', payload: sequence[0] };
    }

    return { type: 'noop' };
  },

  checkGameOver(state) {
    if (state.phase === 'game_over' || state.phase === 'match_over') {
      const winnerId = state.winner ? getPlayerIdForColor(state, state.winner) : undefined;
      return { isOver: true, winnerId };
    }
    return { isOver: false };
  },

  sanitizeForPlayer(state, _playerId) {
    // Backgammon has no hidden information - return as-is (deep copy)
    return JSON.parse(JSON.stringify(state));
  },

  processAdvancement(state, players, now) {
    if (state.botActionAt === null || now < state.botActionAt) return null;

    // Find the bot that should act
    let botId: string | null = null;
    if (state.phase === 'double_offered') {
      // The non-offering player must respond
      const respondingColor = opponent(state.cube.offeredBy!);
      const pid = getPlayerIdForColor(state, respondingColor);
      const p = players.find(pl => pl.id === pid);
      if (p?.isBot) botId = pid;
    } else {
      const pid = getPlayerIdForColor(state, state.currentTurn);
      const p = players.find(pl => pl.id === pid);
      if (p?.isBot) botId = pid;
    }

    if (!botId) return null;

    const action = this.getBotAction(state, botId);
    if (action.type === 'noop') return null;

    const newState = this.processAction(state, botId, action);
    if (newState === state) return null;

    // Build events
    const roomEvents: AdvancementResult['roomEvents'] = [];
    const color = getPlayerColor(state, botId)!;

    if (action.type === 'ROLL') {
      const legalMoves = getLegalMoves(newState);
      roomEvents.push({
        event: 'dice-rolled',
        data: { color, dice: newState.dice?.values, legalMoves },
      });
      if (newState.phase === 'rolling' && newState.currentTurn !== state.currentTurn) {
        roomEvents.push({
          event: 'turn-passed',
          data: { color, reason: 'no_legal_moves' },
        });
      }
    } else if (action.type === 'MOVE_CHECKER') {
      const move = action.payload as CheckerMove;
      const hitOpp = state.points[(move.to as number) - 1]?.color === opponent(color)
        && state.points[(move.to as number) - 1]?.count === 1
        && move.to !== 'off';
      roomEvents.push({
        event: 'checker-moved',
        data: {
          move,
          pendingMoves: newState.pendingMoves.map(e => e.move),
          remainingDice: newState.dice?.remaining,
          hit: hitOpp,
        },
      });
    } else if (action.type === 'CONFIRM_MOVES') {
      roomEvents.push({
        event: 'turn-confirmed',
        data: { gameState: JSON.parse(JSON.stringify(newState)) },
      });
      if (newState.phase === 'game_over') {
        roomEvents.push({
          event: 'game-over',
          data: {
            winner: newState.winner,
            winType: newState.winType,
            pointsScored: newState.pointsScored,
            match: newState.match,
          },
        });
      }
    } else if (action.type === 'ACCEPT_DOUBLE') {
      roomEvents.push({
        event: 'double-accepted',
        data: { acceptedBy: color, newCubeValue: newState.cube.value },
      });
    }

    return {
      newState,
      canApply: (current: unknown) =>
        (current as BackgammonState).botActionAt === state.botActionAt,
      roomEvents,
      playerEvents: [],
      recurse: true,
    };
  },

  processPlayerReplacement(state, departingPlayerId, replacementBotId, _playerIndex, players) {
    const newColorMap = { ...state.colorMap };
    const departingColor = newColorMap[departingPlayerId];
    if (departingColor) {
      newColorMap[replacementBotId] = departingColor;
      delete newColorMap[departingPlayerId];
    }

    let botActionAt = state.botActionAt;
    // If it's now the bot's turn, set botActionAt
    const currentPlayerId = getPlayerIdForColorFromMap(newColorMap, state.currentTurn);
    const currentPlayer = players.find(p => p.id === currentPlayerId);
    if (currentPlayer?.isBot && !botActionAt) {
      if (state.phase === 'rolling') {
        botActionAt = Date.now() + BOT_ROLL_DELAY_MS;
      } else if (state.phase === 'moving') {
        botActionAt = Date.now() + BOT_MOVE_DELAY_MS;
      }
    }

    // Check double_offered phase
    if (state.phase === 'double_offered' && state.cube.offeredBy) {
      const respondingColor = opponent(state.cube.offeredBy);
      const responderId = getPlayerIdForColorFromMap(newColorMap, respondingColor);
      const responder = players.find(p => p.id === responderId);
      if (responder?.isBot && !botActionAt) {
        botActionAt = Date.now() + BOT_ACCEPT_DOUBLE_DELAY_MS;
      }
    }

    return { ...state, colorMap: newColorMap, botActionAt };
  },
};

// ─── Action Handlers ──────────────────────────────────────────────────

function handleRoll(state: BackgammonState, color: CheckerColor): BackgammonState {
  if (state.phase !== 'rolling' || state.currentTurn !== color) return state;

  const d1 = rollDie();
  const d2 = rollDie();
  const isDoubles = d1 === d2;
  const values = isDoubles ? [d1, d1, d1, d1] : [d1, d2];
  const remaining = [...values];

  const dice: DiceState = { values, remaining };
  let newState: BackgammonState = { ...state, dice, phase: 'moving', pendingMoves: [], botMoveQueue: undefined };

  // Check if any legal moves exist
  const legalMoves = getLegalMoves(newState);
  if (legalMoves.length === 0) {
    // Auto-pass: no legal moves
    const nextColor = opponent(color);
    newState = {
      ...newState,
      currentTurn: nextColor,
      phase: 'rolling',
      dice: null,
      pendingMoves: [],
      botMoveQueue: undefined,
      botActionAt: null,
    };
  } else {
    // For bots, compute and store the move sequence
    const currentPlayerId = getPlayerIdForColor(newState, color);
    // We don't set botMoveQueue here; getBotAction will compute it
    // But we do need to set botActionAt for the moving phase
    if (newState.botActionAt !== null) {
      newState = { ...newState, botActionAt: Date.now() + BOT_MOVE_DELAY_MS };
    }
  }

  return newState;
}

function handleMoveChecker(
  state: BackgammonState,
  color: CheckerColor,
  payload: { from: number | 'bar'; to: number | 'off'; dieUsed: number },
): BackgammonState {
  if (state.phase !== 'moving' || state.currentTurn !== color) return state;
  if (!state.dice || state.dice.remaining.length === 0) return state;
  if (!payload) return state;

  const { from, to, dieUsed } = payload;

  // Validate this is a legal move
  const legalMoves = getLegalMoves(state);
  const isLegal = legalMoves.some(m => m.from === from && m.to === to && m.dieUsed === dieUsed);
  if (!isLegal) return state;

  // Snapshot before applying
  const boardBefore = snapshotBoard(state);

  // Apply move
  const board = applyMoveToBoard(
    { points: state.points, bar: state.bar, borneOff: state.borneOff },
    { from, to, dieUsed },
    color,
  );

  // Consume die
  const remaining = [...state.dice.remaining];
  const dieIndex = remaining.indexOf(dieUsed);
  if (dieIndex !== -1) remaining.splice(dieIndex, 1);

  const pendingMoves: PendingMoveEntry[] = [
    ...state.pendingMoves,
    { move: { from, to, dieUsed }, boardBefore },
  ];

  // Update bot move queue (pop first move)
  let botMoveQueue = state.botMoveQueue;
  if (botMoveQueue && botMoveQueue.length > 0) {
    botMoveQueue = botMoveQueue.slice(1);
  }

  let newState: BackgammonState = {
    ...state,
    points: board.points,
    bar: board.bar,
    borneOff: board.borneOff,
    dice: { ...state.dice, remaining },
    pendingMoves,
    botMoveQueue,
  };

  // Auto-confirm if no dice remaining
  if (remaining.length === 0) {
    return doConfirmMoves(newState);
  }

  // Check if any more legal moves exist; if not, auto-confirm
  const nextLegalMoves = getLegalMoves(newState);
  if (nextLegalMoves.length === 0 && hasUsedRequiredDice(newState)) {
    return doConfirmMoves(newState);
  }

  // Set bot timing for next move
  if (state.botActionAt !== null) {
    newState = { ...newState, botActionAt: Date.now() + BOT_MOVE_DELAY_MS };
  }

  return newState;
}

function handleUndoMove(state: BackgammonState, color: CheckerColor): BackgammonState {
  if (state.phase !== 'moving' || state.currentTurn !== color) return state;
  if (state.pendingMoves.length === 0) return state;

  const pending = [...state.pendingMoves];
  const entry = pending.pop()!;

  // Restore board from snapshot
  const remaining = [...(state.dice?.remaining || []), entry.move.dieUsed];

  return {
    ...state,
    points: entry.boardBefore.points,
    bar: entry.boardBefore.bar,
    borneOff: entry.boardBefore.borneOff,
    dice: state.dice ? { ...state.dice, remaining } : null,
    pendingMoves: pending,
    botMoveQueue: undefined,
  };
}

function handleConfirmMoves(state: BackgammonState, color: CheckerColor): BackgammonState {
  if (state.phase !== 'moving' || state.currentTurn !== color) return state;
  if (state.pendingMoves.length === 0) return state;
  if (!hasUsedRequiredDice(state)) return state;

  return doConfirmMoves(state);
}

function doConfirmMoves(state: BackgammonState): BackgammonState {
  // Check for game over
  const result = checkWin(state);
  if (result) {
    let newState: BackgammonState = {
      ...state,
      phase: 'game_over',
      winner: result.winner,
      winType: result.winType,
      pointsScored: result.pointsScored,
      pendingMoves: [],
      dice: null,
      botActionAt: null,
      botMoveQueue: undefined,
    };

    // Update match scores
    if (newState.match) {
      const scores = { ...newState.match.scores };
      scores[result.winner] += result.pointsScored;
      const match = { ...newState.match, scores };

      if (scores[result.winner] >= match.target) {
        newState = { ...newState, phase: 'match_over', match };
      } else {
        newState = { ...newState, match };
      }
    }

    return newState;
  }

  // Switch turn
  const nextColor = opponent(state.currentTurn);
  return {
    ...state,
    currentTurn: nextColor,
    phase: 'rolling',
    dice: null,
    pendingMoves: [],
    botActionAt: null,
    botMoveQueue: undefined,
  };
}

function handleOfferDouble(state: BackgammonState, color: CheckerColor): BackgammonState {
  if (state.phase !== 'rolling' || state.currentTurn !== color) return state;
  if (!state.cubeEnabled) return state;
  if (state.cube.value >= MAX_CUBE_VALUE) return state;
  if (state.cube.owner !== null && state.cube.owner !== color) return state;
  if (state.match?.crawfordGame) return state;

  return {
    ...state,
    phase: 'double_offered',
    cube: { ...state.cube, offeredBy: color },
    botActionAt: null,
  };
}

function handleAcceptDouble(state: BackgammonState, color: CheckerColor): BackgammonState {
  if (state.phase !== 'double_offered') return state;
  if (state.cube.offeredBy === color) return state; // Can't accept your own offer

  const newCubeValue = state.cube.value * 2;
  return {
    ...state,
    phase: 'rolling',
    cube: { value: newCubeValue, owner: color, offeredBy: null },
    botActionAt: null,
  };
}

function handleDeclineDouble(state: BackgammonState, color: CheckerColor): BackgammonState {
  if (state.phase !== 'double_offered') return state;
  if (state.cube.offeredBy === color) return state; // Can't decline your own offer

  const winner = state.cube.offeredBy!;
  const pointsScored = state.cube.value; // Current value (not doubled)

  let newState: BackgammonState = {
    ...state,
    phase: 'game_over',
    winner,
    winType: 'normal',
    pointsScored,
    cube: { ...state.cube, offeredBy: null },
    botActionAt: null,
  };

  // Update match scores
  if (newState.match) {
    const scores = { ...newState.match.scores };
    scores[winner] += pointsScored;
    const match = { ...newState.match, scores };

    if (scores[winner] >= match.target) {
      newState = { ...newState, phase: 'match_over', match };
    } else {
      newState = { ...newState, match };
    }
  }

  return newState;
}
