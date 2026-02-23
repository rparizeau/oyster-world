export interface GameConfig {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  icon?: string;
}

export const GAME_REGISTRY: GameConfig[] = [
  {
    id: 'terrible-people',
    name: 'Terrible People',
    description: 'Fill in the blanks. Be terrible.',
    minPlayers: 4,
    maxPlayers: 4,
    icon: '\u{1F0CF}',
  },
  {
    id: '4-kate',
    name: '4 Kate',
    description: 'Classic Connect 4. Drop pieces. Get four in a row.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '\u{1F534}',
  },
];

export function getGameConfig(gameId: string): GameConfig | undefined {
  return GAME_REGISTRY.find((g) => g.id === gameId);
}
