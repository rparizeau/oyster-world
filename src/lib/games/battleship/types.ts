// --- Battleship Game Types ---

export interface Coordinate {
  row: number;
  col: number;
}

export interface Ship {
  id: string;
  name: string;
  size: number;
  positions: Coordinate[];
  hits: Coordinate[];
  sunk: boolean;
}

export interface ShotRecord {
  row: number;
  col: number;
  result: 'hit' | 'miss';
  shipId?: string;
}

export interface ShotResult {
  attackerId: string;
  defenderId: string;
  row: number;
  col: number;
  result: 'hit' | 'miss' | 'sunk';
  shipName?: string;
  shipPositions?: Coordinate[];
}

export interface PlayerBoard {
  ships: Ship[];
  shotsReceived: ShotRecord[];
}

export interface BattleshipState {
  phase: 'setup' | 'playing' | 'game_over';
  gridSize: number;
  shipSet: string;
  boards: Record<string, PlayerBoard>;
  turnOrder: [string, string];
  currentTurn: string;
  winner: string | null;
  setupReady: string[];
  lastShot: ShotResult | null;
  shotHistory: ShotResult[];
  botActionAt: number | null;
}

export interface SanitizedBattleshipState {
  phase: 'setup' | 'playing' | 'game_over';
  gridSize: number;
  myBoard: {
    ships: Ship[];
    shotsReceived: ShotRecord[];
  };
  opponentBoard: {
    shotsReceived: ShotRecord[];
    sunkShips: Ship[];
    shipsRemaining: number;
  };
  currentTurn: string;
  isMyTurn: boolean;
  lastShot: ShotResult | null;
  winner: string | null;
  turnOrder: [string, string];
  setupReady: string[];
  opponentShips?: Ship[];
}

export interface ShipPlacement {
  shipId: string;
  start: Coordinate;
  orientation: 'horizontal' | 'vertical';
}

export interface ShipTemplate {
  id: string;
  name: string;
  size: number;
}
