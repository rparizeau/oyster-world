// --- Room & Player ---

export interface Room {
  // Identity
  roomCode: string;          // 6-char uppercase alphanumeric (e.g., "X7KQ2M")
  createdAt: number;         // Unix timestamp

  // Lifecycle
  status: 'waiting' | 'playing' | 'finished';
  ownerId: string;           // Current room owner (transfers on leave)

  // Game selection
  gameId: string;            // From GAME_REGISTRY (e.g., 'terrible-people', '4-kate')

  // Players (ordered by join time)
  players: Player[];         // Length varies by game (2 for Take 4, 4 for Terrible People)

  // Game-specific lobby settings (optional, used by games like Who's Deal?)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: Record<string, any>;

  // Game state (null until game starts, polymorphic based on gameId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  game: GameState | Record<string, any> | null;
}

export interface Player {
  id: string;                // UUID generated on join
  name: string;              // Display name (entered by user)
  isBot: boolean;
  isConnected: boolean;      // Tracks active connection
  joinedAt: number;
  score: number;
}

// --- Game State (CAH Module) ---

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

// --- Player Session ---

export interface PlayerSession {
  playerId: string;
  playerName: string;
  roomCode: string;
  joinedAt: number;
}
// TTL: 2 hours (auto-cleanup)

// --- API Errors ---

export interface ApiError {
  error: string;    // Human-readable message
  code: string;     // Machine-readable code
}

// Standard codes: ROOM_NOT_FOUND, ROOM_FULL, GAME_IN_PROGRESS, NOT_OWNER,
// INVALID_PHASE, ALREADY_SUBMITTED, INVALID_SUBMISSION, UNAUTHORIZED,
// RACE_CONDITION, INVALID_REQUEST, INVALID_NAME, INVALID_GAME,
// INVALID_SETTING, INVALID_SWAP, INTERNAL_ERROR
// Who's Deal engine codes: NOT_YOUR_TURN, INVALID_SUIT, MUST_CALL,
// NOT_DEALER, INVALID_CARD, INACTIVE_PARTNER, MUST_FOLLOW_SUIT
