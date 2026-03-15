export { backgammonModule, getLegalMoves as getBackgammonLegalMoves } from './engine';
export type {
  BackgammonState,
  SanitizedBackgammonState,
  CheckerColor,
  CheckerMove,
  BoardPoint,
  DiceState,
  CubeState,
  MatchState,
  BackgammonPhase,
  PendingMoveEntry,
  BoardSnapshot,
} from './types';
export {
  BOT_ROLL_DELAY_MS,
  BOT_MOVE_DELAY_MS,
  BOT_CONFIRM_DELAY_MS,
  BOT_ACCEPT_DOUBLE_DELAY_MS,
  MATCH_TARGET_OPTIONS,
} from './constants';
