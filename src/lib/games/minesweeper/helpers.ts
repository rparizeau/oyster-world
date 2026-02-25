import type { Cell, Difficulty } from './types';
import {
  MIN_CELL_SIZE,
  MIN_COLS, MAX_COLS,
  MIN_ROWS, MAX_ROWS,
  DEEPBAR_HEIGHT,
  HEADER_HEIGHT,
  BOTTOM_PADDING,
  MINE_DENSITY,
} from './constants';

export function calculateGrid(
  containerWidth: number,
  viewportHeight: number,
  difficulty: Difficulty,
): { rows: number; cols: number; cellSize: number; mineCount: number } {
  // containerWidth is the measured width of the actual grid container (respects max-w-lg + padding)
  const availW = containerWidth;
  const availH = viewportHeight - DEEPBAR_HEIGHT - HEADER_HEIGHT - BOTTOM_PADDING;

  // Account for 1px gap between cells: cols * cellSize + (cols - 1) * 1px ≤ availW
  // Solving: cols ≤ (availW + 1) / (MIN_CELL_SIZE + 1)
  let cols = Math.floor((availW + 1) / (MIN_CELL_SIZE + 1));
  cols = Math.max(MIN_COLS, Math.min(MAX_COLS, cols));

  let rows = Math.floor((availH + 1) / (MIN_CELL_SIZE + 1));
  rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, rows));

  // Cell size: fill available width evenly, subtracting total gap space
  const totalGapW = (cols - 1) * 1;
  const cellSize = Math.floor((availW - totalGapW) / cols);

  const totalCells = rows * cols;
  const mineCount = Math.max(
    1,
    Math.min(totalCells - 9, Math.round(totalCells * MINE_DENSITY[difficulty])),
  );

  return { rows, cols, cellSize, mineCount };
}

export function toRowCol(index: number, cols: number): [number, number] {
  return [Math.floor(index / cols), index % cols];
}

export function toIndex(row: number, col: number, cols: number): number {
  return row * cols + col;
}

export function getNeighbours(index: number, rows: number, cols: number): number[] {
  const [r, c] = toRowCol(index, cols);
  const neighbours: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        neighbours.push(toIndex(nr, nc, cols));
      }
    }
  }
  return neighbours;
}

export function generateMines(
  totalCells: number,
  mineCount: number,
  excludeIndices: Set<number>,
  rows: number,
  cols: number,
): { minePositions: number[]; cells: Cell[] } {
  const eligible: number[] = [];
  for (let i = 0; i < totalCells; i++) {
    if (!excludeIndices.has(i)) eligible.push(i);
  }

  // Fisher-Yates shuffle
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  const minePositions = eligible.slice(0, mineCount);
  const mineSet = new Set(minePositions);

  const cells: Cell[] = Array.from({ length: totalCells }, (_, i) => ({
    index: i,
    mine: mineSet.has(i),
    revealed: false,
    flagged: false,
    adjacentMines: 0,
  }));

  for (const pos of minePositions) {
    for (const n of getNeighbours(pos, rows, cols)) {
      cells[n].adjacentMines++;
    }
  }

  return { minePositions, cells };
}

export function floodFill(
  startIndex: number,
  cells: Cell[],
  rows: number,
  cols: number,
): number[] {
  const revealed: number[] = [];
  const queue: number[] = [startIndex];

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const cell = cells[idx];

    if (cell.revealed || cell.flagged) continue;

    cell.revealed = true;
    revealed.push(idx);

    if (cell.adjacentMines === 0) {
      for (const n of getNeighbours(idx, rows, cols)) {
        if (!cells[n].revealed && !cells[n].flagged) {
          queue.push(n);
        }
      }
    }
  }

  return revealed;
}
