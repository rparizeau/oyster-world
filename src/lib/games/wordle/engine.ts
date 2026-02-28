import type { GameModule, GameAction } from '../types';
import type { Player } from '@/lib/types';
import type { WordleServerState } from './types';

export const wordleModule: GameModule<WordleServerState> = {
  initialize(_players: Player[], _settings?: Record<string, unknown>): WordleServerState {
    return { phase: 'playing' };
  },

  processAction(state: WordleServerState, _playerId: string, _action: GameAction): WordleServerState {
    return state;
  },

  getBotAction(_state: WordleServerState, _botId: string): GameAction {
    return { type: 'noop' };
  },

  checkGameOver(_state: WordleServerState) {
    return { isOver: false, winnerId: undefined, isDraw: false };
  },

  sanitizeForPlayer(state: WordleServerState, _playerId: string) {
    return state;
  },

  processAdvancement(_state: WordleServerState, _players: Player[], _now: number) {
    return null;
  },

  processPlayerReplacement(state: WordleServerState, _departingId: string, _botId: string, _index: number, _players: Player[]) {
    return state;
  },
};
