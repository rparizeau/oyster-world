export type CheckerColor = 'white' | 'black';

export interface BoardPoint {
  color: CheckerColor | null;
  count: number;
}

export interface DiceState {
  values: number[];     // e.g. [3, 5] or [4, 4, 4, 4] for doubles
  remaining: number[];  // dice not yet used (consumed as moves are made)
}

export interface CubeState {
  value: number;                  // 1 | 2 | 4 | 8 | 16 | 32 | 64
  owner: CheckerColor | null;     // null = centered
  offeredBy: CheckerColor | null; // non-null while offer is pending
}

export interface MatchState {
  target: number;
  scores: { white: number; black: number };
  crawfordGame: boolean;     // doubling suspended this game (Crawford rule)
  postCrawford: boolean;     // Crawford game has been played; cube resumes
}

export type BackgammonPhase =
  | 'rolling'          // Current player must click Roll
  | 'moving'           // Current player has dice, must move
  | 'double_offered'   // Cube offer pending; other player must accept/decline
  | 'match_over'       // Match complete (only used in match mode)
  | 'game_over';       // Game complete

export interface BackgammonState {
  // Board
  points: BoardPoint[];             // [0] = point 1 ... [23] = point 24
  bar: { white: number; black: number };
  borneOff: { white: number; black: number };

  // Turn
  currentTurn: CheckerColor;
  phase: BackgammonPhase;

  // Dice
  dice: DiceState | null;           // null during 'rolling' and 'double_offered'

  // Doubling cube
  cube: CubeState;
  cubeEnabled: boolean;

  // Match
  match: MatchState | null;         // null if single-game mode

  // Player color assignment
  colorMap: Record<string, CheckerColor>; // playerId → color

  // Pending move sequence (partial turn tracking)
  pendingMoves: PendingMoveEntry[];

  // Bot move queue — full planned sequence computed once, executed move-by-move
  botMoveQueue?: CheckerMove[];

  // Result
  winner: CheckerColor | null;
  winType: 'normal' | 'gammon' | 'backgammon' | null;
  pointsScored: number | null;      // Cube value × win multiplier

  // Bot timing
  botActionAt: number | null;
}

export interface CheckerMove {
  from: number | 'bar';   // point 1–24, or 'bar'
  to: number | 'off';     // point 1–24, or 'off' (borne off)
  dieUsed: number;        // which die value was consumed
}

// Snapshot of board used for undo safety
export interface BoardSnapshot {
  points: BoardPoint[];
  bar: { white: number; black: number };
  borneOff: { white: number; black: number };
}

// Pending move entry — includes pre-move snapshot for safe undo
export interface PendingMoveEntry {
  move: CheckerMove;
  boardBefore: BoardSnapshot;
}

// Sanitized state (same struct; no hidden information in backgammon)
export type SanitizedBackgammonState = BackgammonState;
