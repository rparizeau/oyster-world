import type { GameState, BlackCard, WhiteCard } from '@/lib/types';

// Sanitized game state from the server (no hands, no decks)
export interface SanitizedGameState {
  currentRound: number;
  targetScore: number;
  czarIndex: number;
  phase: GameState['phase'];
  phaseEndsAt: number | null;
  blackCard: BlackCard;
  submissions: Record<string, WhiteCard[]>;
  revealOrder: string[];
  roundWinnerId: string | null;
}

// Toast notification type
export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
}

export const GAME_DISPLAY_NAMES: Record<string, string> = {
  'terrible-people': 'Terrible People',
  '4-kate': 'Take 4',
  'whos-deal': "Who's Deal?",
  'minesweeper': 'Minesweeper',
};
