import type { FourKateState, CellColor } from './engine';
import { BOARD_COLS, BOARD_ROWS, WIN_LENGTH } from './constants';
import { getLowestAvailableRow, checkWinFromCell } from './engine';

// --- Bot AI: Priority-based strategy ---

function getValidColumns(board: CellColor[][]): number[] {
  const cols: number[] = [];
  for (let col = 0; col < BOARD_COLS; col++) {
    if (getLowestAvailableRow(board, col) !== -1) cols.push(col);
  }
  return cols;
}

function simulateDrop(board: CellColor[][], col: number, color: CellColor): { board: CellColor[][]; row: number } | null {
  const row = getLowestAvailableRow(board, col);
  if (row === -1) return null;
  const newBoard = board.map((c) => [...c]);
  newBoard[col][row] = color;
  return { board: newBoard, row };
}

function findWinningColumn(board: CellColor[][], color: 'red' | 'yellow'): number | null {
  for (let col = 0; col < BOARD_COLS; col++) {
    const result = simulateDrop(board, col, color);
    if (!result) continue;
    if (checkWinFromCell(result.board, col, result.row, color)) {
      return col;
    }
  }
  return null;
}

function findDoubleThreatColumn(board: CellColor[][], color: 'red' | 'yellow'): number | null {
  for (let col = 0; col < BOARD_COLS; col++) {
    const result = simulateDrop(board, col, color);
    if (!result) continue;

    // Count how many winning columns the opponent would need to block after this move
    let threats = 0;
    for (let nextCol = 0; nextCol < BOARD_COLS; nextCol++) {
      const nextResult = simulateDrop(result.board, nextCol, color);
      if (!nextResult) continue;
      if (checkWinFromCell(nextResult.board, nextCol, nextResult.row, color)) {
        threats++;
      }
    }
    if (threats >= 2) return col;
  }
  return null;
}

function wouldGiveOpponentWin(board: CellColor[][], col: number, myColor: 'red' | 'yellow'): boolean {
  const oppColor: 'red' | 'yellow' = myColor === 'red' ? 'yellow' : 'red';
  const row = getLowestAvailableRow(board, col);
  if (row === -1) return false;

  // Check if placing here would let opponent win by playing on top
  const rowAbove = row + 1;
  if (rowAbove >= BOARD_ROWS) return false;

  const testBoard = board.map((c) => [...c]);
  testBoard[col][row] = myColor;
  testBoard[col][rowAbove] = oppColor;

  return checkWinFromCell(testBoard, col, rowAbove, oppColor) !== null;
}

// Center preference ordering: 3, 2, 4, 1, 5, 0, 6
const CENTER_PREFERENCE = [3, 2, 4, 1, 5, 0, 6];

export function getBotMove(state: FourKateState, botColor: 'red' | 'yellow'): number {
  const { board } = state;
  const oppColor: 'red' | 'yellow' = botColor === 'red' ? 'yellow' : 'red';
  const validCols = getValidColumns(board);

  if (validCols.length === 0) return 0; // shouldn't happen
  if (validCols.length === 1) return validCols[0];

  // 1. WIN: Can I complete 4 in a row?
  const winCol = findWinningColumn(board, botColor);
  if (winCol !== null) return winCol;

  // 2. BLOCK: Can opponent complete 4 in a row next move?
  const blockCol = findWinningColumn(board, oppColor);
  if (blockCol !== null) return blockCol;

  // 3. DOUBLE THREAT: Can I create two ways to win?
  const doubleThreatCol = findDoubleThreatColumn(board, botColor);
  if (doubleThreatCol !== null && !wouldGiveOpponentWin(board, doubleThreatCol, botColor)) {
    return doubleThreatCol;
  }

  // 4. CENTER PREFERENCE + 5. AVOID GIVING WIN
  const safeCols = validCols.filter((col) => !wouldGiveOpponentWin(board, col, botColor));

  if (safeCols.length > 0) {
    for (const col of CENTER_PREFERENCE) {
      if (safeCols.includes(col)) return col;
    }
    return safeCols[0];
  }

  // 6. RANDOM from remaining valid columns (all give opponent a win, pick least bad)
  for (const col of CENTER_PREFERENCE) {
    if (validCols.includes(col)) return col;
  }
  return validCols[Math.floor(Math.random() * validCols.length)];
}
