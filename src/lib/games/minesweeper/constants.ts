import type { Difficulty } from './types';

// Grid sizing
export const MIN_CELL_SIZE = 36;
export const MIN_COLS = 8;
export const MAX_COLS = 20;
export const MIN_ROWS = 10;
export const MAX_ROWS = 24;
export const GRID_PADDING = 16;
export const BOTTOM_PADDING = 16;

// Mine density per difficulty
export const MINE_DENSITY: Record<Difficulty, number> = {
  easy: 0.12,
  medium: 0.16,
  hard: 0.20,
};

export const DEFAULT_DIFFICULTY: Difficulty = 'easy';

// Interaction
export const FLAG_LONG_PRESS_MS = 400;
export const LONG_PRESS_MOVE_THRESHOLD = 10;

// Number colors (classic minesweeper palette adjusted for dark bg)
export const NUMBER_COLORS: Record<number, string> = {
  1: '#4A90D9',
  2: '#6BBF7A',
  3: '#E85B5B',
  4: '#7B68C4',
  5: '#C45B5B',
  6: '#5BB8B0',
  7: '#D4D4D4',
  8: '#8B8B8B',
};
