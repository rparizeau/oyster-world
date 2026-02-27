import type { ShipTemplate } from './types';

export const DEFAULT_GRID_SIZE = 10;

export const SHIP_SETS: Record<string, ShipTemplate[]> = {
  classic: [
    { id: 'carrier', name: 'Carrier', size: 5 },
    { id: 'battleship', name: 'Battleship', size: 4 },
    { id: 'cruiser', name: 'Cruiser', size: 3 },
    { id: 'submarine', name: 'Submarine', size: 3 },
    { id: 'destroyer', name: 'Destroyer', size: 2 },
  ],
  quick: [
    { id: 'battleship', name: 'Battleship', size: 4 },
    { id: 'cruiser', name: 'Cruiser', size: 3 },
    { id: 'submarine', name: 'Submarine', size: 3 },
    { id: 'destroyer', name: 'Destroyer', size: 2 },
  ],
  blitz: [
    { id: 'cruiser', name: 'Cruiser', size: 3 },
    { id: 'submarine', name: 'Submarine', size: 2 },
    { id: 'destroyer', name: 'Destroyer', size: 2 },
  ],
};

export const VALID_COMBOS: Record<number, string[]> = {
  10: ['classic', 'quick', 'blitz'],
  8: ['classic', 'quick', 'blitz'],
  7: ['quick', 'blitz'],
};

export const BOT_SETUP_DELAY_MS: [number, number] = [1000, 2000];
export const BOT_SHOT_DELAY_MS: [number, number] = [1500, 3000];
