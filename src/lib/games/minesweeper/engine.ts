import type { GameModule, GameAction } from '../types';
import type { Player } from '@/lib/types';
import type { MinesweeperGameState } from './types';

export const minesweeperModule: GameModule<MinesweeperGameState> = {
  initialize(_players: Player[], settings?: Record<string, unknown>): MinesweeperGameState {
    return {
      difficulty: (settings?.difficulty as MinesweeperGameState['difficulty']) || 'easy',
      phase: 'ready',
      rows: 0,
      cols: 0,
      cellSize: 0,
      mineCount: 0,
      cells: [],
      minePositions: null,
      revealedCount: 0,
      flagCount: 0,
      startedAt: null,
      endedAt: null,
      elapsed: null,
      triggeredMineIndex: null,
    };
  },

  processAction(state: MinesweeperGameState, _playerId: string, _action: GameAction): MinesweeperGameState {
    return state;
  },

  getBotAction(_state: MinesweeperGameState, _botId: string): GameAction {
    return { type: 'noop' };
  },

  checkGameOver(state: MinesweeperGameState) {
    return {
      isOver: state.phase === 'won' || state.phase === 'lost',
      winnerId: undefined,
      isDraw: false,
    };
  },

  sanitizeForPlayer(state: MinesweeperGameState, _playerId: string) {
    return state;
  },

  processAdvancement(_state: MinesweeperGameState, _players: Player[], _now: number) {
    return null;
  },

  processPlayerReplacement(state: MinesweeperGameState, _departingId: string, _botId: string, _index: number, _players: Player[]) {
    return state;
  },
};
