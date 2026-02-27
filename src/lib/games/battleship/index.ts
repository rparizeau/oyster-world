export { battleshipModule } from './engine';
export type {
  BattleshipState,
  SanitizedBattleshipState,
  PlayerBoard,
  Ship,
  Coordinate,
  ShotRecord,
  ShotResult,
  ShipPlacement,
  ShipTemplate,
} from './types';
export {
  SHIP_SETS,
  VALID_COMBOS,
  DEFAULT_GRID_SIZE,
  BOT_SETUP_DELAY_MS,
  BOT_SHOT_DELAY_MS,
} from './constants';
