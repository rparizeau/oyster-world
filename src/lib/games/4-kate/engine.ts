import type { Player } from '@/lib/types';
import type { GameModule, GameAction, AdvancementResult } from '@/lib/games/types';
import { BOARD_COLS, BOARD_ROWS, WIN_LENGTH, BOT_MOVE_DELAY_MS } from './constants';
import { getBotMove } from './bots';

// --- Types ---

export type CellColor = 'red' | 'yellow' | null;

export interface FourKateState {
  board: CellColor[][];           // board[col][row], row 0 = bottom
  players: { red: string; yellow: string };
  currentTurn: 'red' | 'yellow';
  firstTurn: 'red' | 'yellow';
  phase: 'playing' | 'game_over';
  turnStartedAt: number;
  botActionAt: number | null;
  winner: string | null;          // playerId or null
  winningCells: [number, number][] | null;  // [col, row][]
  moves: { col: number; row: number; color: 'red' | 'yellow' }[];
  gamesPlayed: number;
  isDraw: boolean;
}

// --- Helpers ---

function createEmptyBoard(): CellColor[][] {
  const board: CellColor[][] = [];
  for (let col = 0; col < BOARD_COLS; col++) {
    board[col] = new Array(BOARD_ROWS).fill(null);
  }
  return board;
}

function getLowestAvailableRow(board: CellColor[][], col: number): number {
  for (let row = 0; row < BOARD_ROWS; row++) {
    if (board[col][row] === null) return row;
  }
  return -1; // column full
}

function getPlayerColor(state: FourKateState, playerId: string): 'red' | 'yellow' | null {
  if (state.players.red === playerId) return 'red';
  if (state.players.yellow === playerId) return 'yellow';
  return null;
}

// --- Win detection ---

const DIRECTIONS: [number, number][] = [
  [1, 0],   // horizontal
  [0, 1],   // vertical
  [1, 1],   // diagonal up-right
  [1, -1],  // diagonal down-right
];

function checkWinFromCell(
  board: CellColor[][],
  col: number,
  row: number,
  color: CellColor
): [number, number][] | null {
  if (!color) return null;

  for (const [dc, dr] of DIRECTIONS) {
    const cells: [number, number][] = [[col, row]];

    // Check positive direction
    for (let i = 1; i < WIN_LENGTH; i++) {
      const c = col + dc * i;
      const r = row + dr * i;
      if (c < 0 || c >= BOARD_COLS || r < 0 || r >= BOARD_ROWS) break;
      if (board[c][r] !== color) break;
      cells.push([c, r]);
    }

    // Check negative direction
    for (let i = 1; i < WIN_LENGTH; i++) {
      const c = col - dc * i;
      const r = row - dr * i;
      if (c < 0 || c >= BOARD_COLS || r < 0 || r >= BOARD_ROWS) break;
      if (board[c][r] !== color) break;
      cells.push([c, r]);
    }

    if (cells.length >= WIN_LENGTH) return cells;
  }

  return null;
}

function isBoardFull(board: CellColor[][]): boolean {
  for (let col = 0; col < BOARD_COLS; col++) {
    if (board[col][BOARD_ROWS - 1] === null) return false;
  }
  return true;
}

// --- Pure game engine ---

export function initialize(players: Player[], gamesPlayed: number = 0): FourKateState {
  const now = Date.now();
  // Red = first player (room creator), Yellow = second player
  const redId = players[0].id;
  const yellowId = players[1].id;

  // Alternate who goes first based on gamesPlayed
  const firstTurn: 'red' | 'yellow' = gamesPlayed % 2 === 0 ? 'red' : 'yellow';

  const hasBotTurn = (firstTurn === 'red' && players[0].isBot) ||
                     (firstTurn === 'yellow' && players[1].isBot);

  return {
    board: createEmptyBoard(),
    players: { red: redId, yellow: yellowId },
    currentTurn: firstTurn,
    firstTurn,
    phase: 'playing',
    turnStartedAt: now,
    botActionAt: hasBotTurn ? now + BOT_MOVE_DELAY_MS : null,
    winner: null,
    winningCells: null,
    moves: [],
    gamesPlayed,
    isDraw: false,
  };
}

export function processDropAction(
  state: FourKateState,
  playerId: string,
  column: number
): FourKateState {
  // Validate phase
  if (state.phase !== 'playing') return state;

  // Validate it's this player's turn
  const color = getPlayerColor(state, playerId);
  if (!color || color !== state.currentTurn) return state;

  // Validate column
  if (column < 0 || column >= BOARD_COLS) return state;

  // Find lowest available row
  const row = getLowestAvailableRow(state.board, column);
  if (row === -1) return state; // column full

  // Turn-level idempotency: check if a move was already made at this turn index
  const expectedMoveCount = state.moves.length;
  // If the last move is from the same color, this is a duplicate
  if (expectedMoveCount > 0 && state.moves[expectedMoveCount - 1].color === color) {
    return state;
  }

  // Place the piece
  const newBoard = state.board.map((col) => [...col]);
  newBoard[column][row] = color;

  const newMoves = [...state.moves, { col: column, row, color }];

  // Check for win
  const winningCells = checkWinFromCell(newBoard, column, row, color);
  if (winningCells) {
    return {
      ...state,
      board: newBoard,
      moves: newMoves,
      phase: 'game_over',
      winner: playerId,
      winningCells,
      botActionAt: null,
      isDraw: false,
    };
  }

  // Check for draw
  if (isBoardFull(newBoard)) {
    return {
      ...state,
      board: newBoard,
      moves: newMoves,
      phase: 'game_over',
      winner: null,
      winningCells: null,
      botActionAt: null,
      isDraw: true,
    };
  }

  // Switch turn
  const nextTurn: 'red' | 'yellow' = color === 'red' ? 'yellow' : 'red';
  const now = Date.now();

  return {
    ...state,
    board: newBoard,
    moves: newMoves,
    currentTurn: nextTurn,
    turnStartedAt: now,
    botActionAt: null, // Will be set by the caller if needed (heartbeat sets it)
  };
}

export function processPlayAgain(state: FourKateState, players: Player[]): FourKateState {
  if (state.phase !== 'game_over') return state;

  const now = Date.now();
  const newGamesPlayed = state.gamesPlayed + 1;

  // Colors stay fixed — preserve existing player-color mapping
  const firstTurn: 'red' | 'yellow' = newGamesPlayed % 2 === 0 ? 'red' : 'yellow';

  const firstTurnPlayerId = firstTurn === 'red' ? state.players.red : state.players.yellow;
  const firstTurnPlayer = players.find((p) => p.id === firstTurnPlayerId);
  const hasBotTurn = firstTurnPlayer?.isBot ?? false;

  return {
    board: createEmptyBoard(),
    players: state.players, // preserve color assignments
    currentTurn: firstTurn,
    firstTurn,
    phase: 'playing',
    turnStartedAt: now,
    botActionAt: hasBotTurn ? now + BOT_MOVE_DELAY_MS : null,
    winner: null,
    winningCells: null,
    moves: [],
    gamesPlayed: newGamesPlayed,
    isDraw: false,
  };
}

export function shouldExecuteBotAction(state: FourKateState, now: number): boolean {
  if (!state.botActionAt) return false;
  return now >= state.botActionAt;
}

// --- Exported for win detection reuse in bots ---
export { checkWinFromCell, getLowestAvailableRow, isBoardFull, getPlayerColor, createEmptyBoard };

// --- GameModule implementation ---

export const fourKateModule: GameModule<FourKateState> = {
  initialize(players: Player[]): FourKateState {
    return initialize(players, 0);
  },

  processAction(state: FourKateState, playerId: string, action: GameAction): FourKateState {
    switch (action.type) {
      case 'drop': {
        const payload = action.payload as { column: number } | undefined;
        if (payload === undefined || payload.column === undefined) return state;
        return processDropAction(state, playerId, payload.column);
      }
      case 'play-again': {
        // play-again is handled by the dedicated route which has access to players
        // But we support it here as a fallback via the generic action route
        return state;
      }
      default:
        return state;
    }
  },

  getBotAction(state: FourKateState, botId: string): GameAction {
    const color = getPlayerColor(state, botId);
    if (!color || state.currentTurn !== color || state.phase !== 'playing') {
      return { type: 'noop' };
    }
    const column = getBotMove(state, color);
    return { type: 'drop', payload: { column } };
  },

  checkGameOver(state: FourKateState) {
    if (state.phase === 'game_over') {
      return {
        isOver: true,
        winnerId: state.winner ?? undefined,
        isDraw: state.isDraw,
      };
    }
    return { isOver: false };
  },

  sanitizeForPlayer(state: FourKateState, _playerId: string) {
    // Connect 4 is full information — return everything
    return state;
  },

  processAdvancement(state: FourKateState, players: Player[], now: number): AdvancementResult | null {
    if (state.phase !== 'playing') return null;
    if (!state.botActionAt || now < state.botActionAt) return null;

    // Find the bot whose turn it is
    const currentPlayerId = state.currentTurn === 'red' ? state.players.red : state.players.yellow;
    const currentPlayer = players.find((p) => p.id === currentPlayerId);
    if (!currentPlayer?.isBot) return null;

    const moveCountBefore = state.moves.length;
    const color = getPlayerColor(state, currentPlayerId);
    if (!color) return null;

    const column = getBotMove(state, color);
    const newState = processDropAction(state, currentPlayerId, column);

    // If state didn't change, skip
    if (newState === state || newState.moves.length === moveCountBefore) return null;

    // If game continues and next player is also a bot, set botActionAt
    let stateToSave = newState;
    if (newState.phase === 'playing') {
      const nextPlayerId = newState.currentTurn === 'red' ? newState.players.red : newState.players.yellow;
      const nextPlayer = players.find((p) => p.id === nextPlayerId);
      if (nextPlayer?.isBot) {
        stateToSave = { ...newState, botActionAt: Date.now() + BOT_MOVE_DELAY_MS };
      }
    }

    const lastMove = stateToSave.moves[stateToSave.moves.length - 1];
    const roomEvents: AdvancementResult['roomEvents'] = [];

    if (lastMove) {
      roomEvents.push({
        event: 'move-made',
        data: {
          column: lastMove.col,
          row: lastMove.row,
          color: lastMove.color,
          currentTurn: stateToSave.currentTurn,
          board: stateToSave.board,
        },
      });
    }

    if (stateToSave.phase === 'game_over') {
      roomEvents.push({
        event: 'game-over',
        data: {
          winner: stateToSave.winner,
          winningCells: stateToSave.winningCells,
          finalBoard: stateToSave.board,
          isDraw: stateToSave.isDraw,
        },
      });
    }

    return {
      newState: stateToSave,
      canApply: (current) => (current as FourKateState).moves.length === moveCountBefore,
      roomEvents,
      playerEvents: [],
      recurse: stateToSave.phase === 'playing' && stateToSave.botActionAt !== null,
    };
  },

  processPlayerReplacement(
    state: FourKateState, departingPlayerId: string, replacementBotId: string,
    _playerIndex: number, _players: Player[]
  ): FourKateState {
    const players = { ...state.players };

    if (players.red === departingPlayerId) {
      players.red = replacementBotId;
    } else if (players.yellow === departingPlayerId) {
      players.yellow = replacementBotId;
    }

    let botActionAt = state.botActionAt;
    const currentTurnPlayerId = state.currentTurn === 'red' ? players.red : players.yellow;
    if (state.phase === 'playing' && currentTurnPlayerId === replacementBotId) {
      botActionAt = Date.now() + BOT_MOVE_DELAY_MS;
    }

    return { ...state, players, botActionAt };
  },
};
