// --- Game State (Terrible People) ---

export interface GameState {
  // Round tracking
  currentRound: number;
  targetScore: number;       // Default: 7 (first to X wins)

  // Card Czar rotation
  czarIndex: number;         // Index in players array

  // Current round
  phase: 'czar_reveal' | 'submitting' | 'judging' | 'round_result' | 'game_over';
  phaseEndsAt: number | null;    // Unix timestamp — when current phase auto-advances
  botActionAt: number | null;    // Unix timestamp — when pending bot action should execute
  blackCard: BlackCard;

  // Submissions (keyed by player ID)
  submissions: Record<string, WhiteCard[]>;

  // Reveal order (shuffled player IDs — hides who submitted what during judging)
  revealOrder: string[];

  // Winner of current round
  roundWinnerId: string | null;

  // Hands (keyed by player ID)
  hands: Record<string, WhiteCard[]>;

  // Deck tracking
  blackDeck: BlackCard[];    // Remaining black cards
  whiteDeck: WhiteCard[];    // Remaining white cards
  discardWhite: WhiteCard[]; // Used white cards
  discardBlack: BlackCard[]; // Used black cards
}

// --- Cards ---

export interface BlackCard {
  id: string;
  text: string;              // Contains underscore(s) "_" as blanks
  pick: number;              // How many white cards to play (1 or 2)
}

export interface WhiteCard {
  id: string;
  text: string;
}
