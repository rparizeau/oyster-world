export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string; // e.g., "9S", "JH" (rank + suit initial)
}

export interface TrickCard {
  playerId: string;
  seatIndex: number;
  card: Card;
}

export interface EuchreRound {
  // Deck & dealing
  hands: Record<string, Card[]>; // playerId -> cards in hand
  kitty: Card[]; // 4 cards, kitty[0] is the face-up card

  // Trump calling
  trumpPhase: 'round1' | 'round2' | 'dealer_discard' | 'playing' | 'round_over';
  trumpSuit: Suit | null;
  callingPlayerId: string | null;
  callingTeam: 'a' | 'b' | null;
  goingAlone: boolean;
  alonePlayerId: string | null;
  inactivePartnerSeatIndex: number | null;

  // Face-up card tracking
  faceUpCard: Card;
  dealerDiscarded: boolean;

  // Current action
  currentTurnSeatIndex: number;

  // Trump calling pass tracking
  passedPlayers: string[];

  // Trick play
  currentTrick: TrickCard[];
  trickLeadSeatIndex: number;
  tricksWon: { a: number; b: number };
  tricksPlayed: number;

  // Dealer discard
  dealerPickedUp: Card | null; // The face-up card dealer picked up (Round 1 only)
}

export interface WhosDealGameState {
  // Teams
  teams: {
    a: { playerIds: [string, string]; score: number };
    b: { playerIds: [string, string]; score: number };
  };

  // Seating (clockwise order, indices 0-3)
  seats: string[]; // [playerId, playerId, playerId, playerId]

  // Settings
  targetScore: number; // 5, 7, 10, or 11

  // Dealer tracking
  dealerSeatIndex: number;

  // Round state
  round: EuchreRound | null;

  // Game phase
  phase: 'playing' | 'game_over';

  // Result
  winningTeam: 'a' | 'b' | null;

  // Timing (serverless-safe)
  botActionAt: number | null;
  phaseEndsAt: number | null;
}

export interface WhosDealSettings {
  targetScore: 5 | 7 | 10 | 11;
  teams: {
    a: [string, string];
    b: [string, string];
  };
}
