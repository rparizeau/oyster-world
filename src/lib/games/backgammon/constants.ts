import type { CheckerColor } from './types';

export const BOT_ROLL_DELAY_MS = 1200;
export const BOT_MOVE_DELAY_MS = 800;
export const BOT_CONFIRM_DELAY_MS = 400;
export const BOT_ACCEPT_DOUBLE_DELAY_MS = 1000;

export const MAX_CHECKERS = 15;
export const BOARD_POINTS = 24;
export const HOME_BOARD_SIZE = 6;

export const DEFAULT_MATCH_TARGET = 5;
export const MATCH_TARGET_OPTIONS = [3, 5, 7, 9, 11];

export const MAX_CUBE_VALUE = 64;

export const BOT_MOVE_SEQUENCE_CAP = 200;
export const MAX_SEQUENCE_SEARCH = 200;

export const WHITE_ENTRY_OFFSET = 25; // White bar entry: point = 25 - die

// Starting position: [pointIndex]: { color, count }
export const STARTING_POSITION: Array<{ color: CheckerColor; count: number } | null> = [
  { color: 'black', count: 2 }, // point 1 (index 0)
  null, null, null, null,
  { color: 'white', count: 5 }, // point 6 (index 5)
  null,
  { color: 'white', count: 3 }, // point 8 (index 7)
  null, null, null,
  { color: 'black', count: 5 }, // point 12 (index 11)
  { color: 'white', count: 5 }, // point 13 (index 12)
  null, null, null,
  { color: 'black', count: 3 }, // point 17 (index 16)
  null,
  { color: 'black', count: 5 }, // point 19 (index 18)
  null, null, null,
  { color: 'white', count: 2 }, // point 24 (index 23)
];
