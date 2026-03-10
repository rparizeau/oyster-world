import type { FourKateState, CellColor } from './engine';
import { BOARD_COLS, BOARD_ROWS, WIN_LENGTH } from './constants';
import { getLowestAvailableRow, checkWinFromCell } from './engine';

// --- Bot AI: Minimax with alpha-beta pruning ---

const SEARCH_DEPTH = 7;

// Column ordering for move exploration (center-first improves pruning)
const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];

function getValidColumns(board: CellColor[][]): number[] {
  const cols: number[] = [];
  for (const col of COLUMN_ORDER) {
    if (getLowestAvailableRow(board, col) !== -1) cols.push(col);
  }
  return cols;
}

function dropPiece(board: CellColor[][], col: number, color: CellColor): number {
  const row = getLowestAvailableRow(board, col);
  if (row === -1) return -1;
  board[col][row] = color;
  return row;
}

function undropPiece(board: CellColor[][], col: number, row: number): void {
  board[col][row] = null;
}

function isBoardFull(board: CellColor[][]): boolean {
  for (let col = 0; col < BOARD_COLS; col++) {
    if (board[col][BOARD_ROWS - 1] === null) return false;
  }
  return true;
}

// Evaluate a window of 4 cells for scoring
function scoreWindow(window: CellColor[], botColor: 'red' | 'yellow', oppColor: 'red' | 'yellow'): number {
  let botCount = 0;
  let oppCount = 0;
  let emptyCount = 0;

  for (const cell of window) {
    if (cell === botColor) botCount++;
    else if (cell === oppColor) oppCount++;
    else emptyCount++;
  }

  // Only one color can score in a window
  if (botCount > 0 && oppCount > 0) return 0;

  if (botCount === 4) return 100000;
  if (oppCount === 4) return -100000;
  if (botCount === 3 && emptyCount === 1) return 50;
  if (botCount === 2 && emptyCount === 2) return 5;
  if (oppCount === 3 && emptyCount === 1) return -40;
  if (oppCount === 2 && emptyCount === 2) return -3;

  return 0;
}

// Static board evaluation heuristic
function evaluateBoard(board: CellColor[][], botColor: 'red' | 'yellow'): number {
  const oppColor: 'red' | 'yellow' = botColor === 'red' ? 'yellow' : 'red';
  let score = 0;

  // Center column bonus — pieces in center are more valuable
  const centerCol = Math.floor(BOARD_COLS / 2);
  for (let row = 0; row < BOARD_ROWS; row++) {
    if (board[centerCol][row] === botColor) score += 6;
    else if (board[centerCol][row] === oppColor) score -= 6;
  }

  // Score all horizontal windows
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col <= BOARD_COLS - WIN_LENGTH; col++) {
      const window: CellColor[] = [];
      for (let i = 0; i < WIN_LENGTH; i++) window.push(board[col + i][row]);
      score += scoreWindow(window, botColor, oppColor);
    }
  }

  // Score all vertical windows
  for (let col = 0; col < BOARD_COLS; col++) {
    for (let row = 0; row <= BOARD_ROWS - WIN_LENGTH; row++) {
      const window: CellColor[] = [];
      for (let i = 0; i < WIN_LENGTH; i++) window.push(board[col][row + i]);
      score += scoreWindow(window, botColor, oppColor);
    }
  }

  // Score diagonal (up-right) windows
  for (let col = 0; col <= BOARD_COLS - WIN_LENGTH; col++) {
    for (let row = 0; row <= BOARD_ROWS - WIN_LENGTH; row++) {
      const window: CellColor[] = [];
      for (let i = 0; i < WIN_LENGTH; i++) window.push(board[col + i][row + i]);
      score += scoreWindow(window, botColor, oppColor);
    }
  }

  // Score diagonal (down-right) windows
  for (let col = 0; col <= BOARD_COLS - WIN_LENGTH; col++) {
    for (let row = WIN_LENGTH - 1; row < BOARD_ROWS; row++) {
      const window: CellColor[] = [];
      for (let i = 0; i < WIN_LENGTH; i++) window.push(board[col + i][row - i]);
      score += scoreWindow(window, botColor, oppColor);
    }
  }

  return score;
}

function minimax(
  board: CellColor[][],
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  botColor: 'red' | 'yellow',
  oppColor: 'red' | 'yellow',
): number {
  const validCols = getValidColumns(board);

  // Terminal checks
  if (depth === 0 || validCols.length === 0) {
    return evaluateBoard(board, botColor);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const col of validCols) {
      const row = dropPiece(board, col, botColor);
      if (row === -1) continue;

      // Check for immediate win
      const win = checkWinFromCell(board, col, row, botColor);
      let evalScore: number;
      if (win) {
        evalScore = 100000 + depth; // prefer faster wins
      } else if (isBoardFull(board)) {
        evalScore = 0;
      } else {
        evalScore = minimax(board, depth - 1, alpha, beta, false, botColor, oppColor);
      }

      undropPiece(board, col, row);

      if (evalScore > maxEval) maxEval = evalScore;
      if (maxEval > alpha) alpha = maxEval;
      if (alpha >= beta) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const col of validCols) {
      const row = dropPiece(board, col, oppColor);
      if (row === -1) continue;

      const win = checkWinFromCell(board, col, row, oppColor);
      let evalScore: number;
      if (win) {
        evalScore = -(100000 + depth); // prefer blocking faster losses
      } else if (isBoardFull(board)) {
        evalScore = 0;
      } else {
        evalScore = minimax(board, depth - 1, alpha, beta, true, botColor, oppColor);
      }

      undropPiece(board, col, row);

      if (evalScore < minEval) minEval = evalScore;
      if (minEval < beta) beta = minEval;
      if (alpha >= beta) break;
    }
    return minEval;
  }
}

export function getBotMove(state: FourKateState, botColor: 'red' | 'yellow'): number {
  const oppColor: 'red' | 'yellow' = botColor === 'red' ? 'yellow' : 'red';

  // Work on a mutable copy of the board
  const board: CellColor[][] = state.board.map((col) => [...col]);
  const validCols = getValidColumns(board);

  if (validCols.length === 0) return 0;
  if (validCols.length === 1) return validCols[0];

  // Immediate win check (always take the win)
  for (const col of validCols) {
    const row = dropPiece(board, col, botColor);
    if (row === -1) continue;
    const win = checkWinFromCell(board, col, row, botColor);
    undropPiece(board, col, row);
    if (win) return col;
  }

  // Immediate block check (must block opponent win)
  for (const col of validCols) {
    const row = dropPiece(board, col, oppColor);
    if (row === -1) continue;
    const win = checkWinFromCell(board, col, row, oppColor);
    undropPiece(board, col, row);
    if (win) return col;
  }

  // Minimax search for the best move
  let bestScore = -Infinity;
  const bestCols: number[] = [];

  for (const col of validCols) {
    const row = dropPiece(board, col, botColor);
    if (row === -1) continue;

    const score = minimax(board, SEARCH_DEPTH - 1, -Infinity, Infinity, false, botColor, oppColor);
    undropPiece(board, col, row);

    if (score > bestScore) {
      bestScore = score;
      bestCols.length = 0;
      bestCols.push(col);
    } else if (score === bestScore) {
      bestCols.push(col);
    }
  }

  // Pick randomly among equally-scored best moves for variety
  return bestCols[Math.floor(Math.random() * bestCols.length)];
}
