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
    id: '4-kate',
    name: 'Take 4',
    description: 'Classic Connect 4. Drop pieces. Get four in a row.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '❤️',
  },
  {
    id: 'whos-deal',
    name: "Who's Deal?",
    description: 'Classic Euchre. Pick trump. Take tricks. Talk trash.',
    minPlayers: 4,
    maxPlayers: 4,
    icon: '🃏',
  },
  {
    id: 'terrible-people',
    name: 'Terrible People',
    description: 'Fill in the blanks. Be terrible.',
    minPlayers: 4,
    maxPlayers: 4,
    icon: '😈',
  },
  {
    id: 'minesweeper',
    name: 'Land Mines',
    description: 'Dodge the mines. Clear the board.',
    minPlayers: 1,
    maxPlayers: 1,
    icon: '💣',
  },
  {
    id: 'battleship',
    name: 'Battleship',
    description: 'Place your fleet. Sink the enemy. Rule the sea.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🚢',
  },
  {
    id: 'wordle',
    name: 'Daily Pearl',
    description: 'Guess the daily word. Six tries. New pearl every 12 hours.',
    minPlayers: 1,
    maxPlayers: 1,
    icon: '🦪',
  },
];

export function getGameConfig(gameId: string): GameConfig | undefined {
  return GAME_REGISTRY.find((g) => g.id === gameId);
}
