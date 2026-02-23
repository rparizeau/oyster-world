import type { Player } from '@/lib/types';

export interface GameAction {
  type: string;
  payload?: unknown;
  actionId?: string;
}

export interface GameModule<TState = unknown> {
  initialize(players: Player[]): TState;
  processAction(state: TState, playerId: string, action: GameAction): TState;
  getBotAction(state: TState, botId: string): GameAction;
  checkGameOver(state: TState): { isOver: boolean; winnerId?: string; isDraw?: boolean };
  sanitizeForPlayer(state: TState, playerId: string): unknown;
}
