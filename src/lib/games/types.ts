import type { Player } from '@/lib/types';

export interface GameAction {
  type: string;
  payload?: unknown;
  actionId?: string;
}

export interface AdvancementResult {
  newState: unknown;
  canApply: (currentState: unknown) => boolean;
  roomEvents: { event: string; data: unknown }[];
  playerEvents: { playerId: string; event: string; data: unknown }[];
  recurse: boolean;
  updatedPlayers?: Player[];
}

export interface GameModule<TState = unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialize(players: Player[], settings?: Record<string, any>): TState;
  processAction(state: TState, playerId: string, action: GameAction): TState;
  getBotAction(state: TState, botId: string): GameAction;
  checkGameOver(state: TState): { isOver: boolean; winnerId?: string; isDraw?: boolean };
  sanitizeForPlayer(state: TState, playerId: string): unknown;
  processAdvancement(state: TState, players: Player[], now: number): AdvancementResult | null;
  processPlayerReplacement(
    state: TState, departingPlayerId: string, replacementBotId: string,
    playerIndex: number, players: Player[]
  ): TState;
}
