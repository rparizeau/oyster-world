export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Cell {
  index: number;
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number;
}

export interface MinesweeperGameState {
  rows: number;
  cols: number;
  cellSize: number;
  mineCount: number;
  difficulty: Difficulty;

  cells: Cell[];

  phase: 'ready' | 'playing' | 'won' | 'lost';

  minePositions: number[] | null;

  revealedCount: number;
  flagCount: number;
  startedAt: number | null;
  endedAt: number | null;
  elapsed: number | null;

  triggeredMineIndex: number | null;
}

export interface MinesweeperSettings {
  difficulty: Difficulty;
}

export type MinesweeperAction =
  | { type: 'init'; containerWidth: number; containerHeight: number; difficulty: Difficulty }
  | { type: 'reveal'; index: number }
  | { type: 'flag'; index: number }
  | { type: 'chord'; index: number }
  | { type: 'new-game'; containerWidth: number; containerHeight: number }
  | { type: 'tick' };
