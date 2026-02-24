import type { Player } from '@/lib/types';
import type { GameModule, GameAction } from '../types';
import type { WhosDealGameState, WhosDealSettings, EuchreRound, Card, Suit, Rank, TrickCard } from './types';
import {
  getEffectiveSuit,
  compareCards,
  getPlayableCards,
  expectedCardsThisTrick,
  nextActiveSeat,
} from './helpers';
import {
  CARDS_PER_HAND,
  TRICKS_PER_ROUND,
  KITTY_SIZE,
  BOT_ACTION_DELAY_RANGE_MS,
  ROUND_RESULT_DISPLAY_MS,
} from './constants';

// --- Error class for validation failures that need specific error messages ---

export class WhosDealError extends Error {
  constructor(message: string, public code: string, public status: number = 400) {
    super(message);
    this.name = 'WhosDealError';
  }
}

// --- Deck creation & shuffling ---

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['9', '10', 'J', 'Q', 'K', 'A'];

function suitInitial(suit: Suit): string {
  return suit[0].toUpperCase(); // S, H, D, C
}

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}${suitInitial(suit)}` });
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// --- Bot timing ---

export function getBotActionTimestamp(): number {
  const [min, max] = BOT_ACTION_DELAY_RANGE_MS;
  return Date.now() + min + Math.random() * (max - min);
}

// --- Helpers ---

function getTeamForPlayer(state: WhosDealGameState, playerId: string): 'a' | 'b' | null {
  if (state.teams.a.playerIds.includes(playerId)) return 'a';
  if (state.teams.b.playerIds.includes(playerId)) return 'b';
  return null;
}

export function getTeamForSeat(seatIndex: number): 'a' | 'b' {
  return (seatIndex === 0 || seatIndex === 2) ? 'a' : 'b';
}

export function getSeatIndex(state: WhosDealGameState, playerId: string): number {
  return state.seats.indexOf(playerId);
}

function getPartnerSeatIndex(seatIndex: number): number {
  return (seatIndex + 2) % 4;
}

// --- Deal a new round (pure — does NOT set botActionAt) ---

function dealRound(state: WhosDealGameState): WhosDealGameState {
  const deck = shuffleDeck(createDeck());

  const hands: Record<string, Card[]> = {};
  let idx = 0;
  for (const playerId of state.seats) {
    hands[playerId] = deck.slice(idx, idx + CARDS_PER_HAND);
    idx += CARDS_PER_HAND;
  }
  const kitty = deck.slice(idx, idx + KITTY_SIZE);

  const round: EuchreRound = {
    hands,
    kitty,
    trumpPhase: 'round1',
    trumpSuit: null,
    callingPlayerId: null,
    callingTeam: null,
    goingAlone: false,
    alonePlayerId: null,
    inactivePartnerSeatIndex: null,
    faceUpCard: kitty[0],
    dealerDiscarded: false,
    currentTurnSeatIndex: (state.dealerSeatIndex + 1) % 4,
    passedPlayers: [],
    currentTrick: [],
    trickLeadSeatIndex: 0,
    tricksWon: { a: 0, b: 0 },
    tricksPlayed: 0,
    dealerPickedUp: null,
  };

  return {
    ...state,
    round,
    botActionAt: null,
    phaseEndsAt: null,
  };
}

// --- Helper: set bot timing if next player is bot ---

function withBotTiming(state: WhosDealGameState, players: Player[]): WhosDealGameState {
  if (!state.round) return state;
  const phase = state.round.trumpPhase;
  if (phase === 'round_over') return state;
  if (state.phase === 'game_over') return state;

  const currentPlayerId = state.seats[state.round.currentTurnSeatIndex];
  const currentPlayer = players.find(p => p.id === currentPlayerId);
  if (currentPlayer?.isBot) {
    return { ...state, botActionAt: getBotActionTimestamp() };
  }
  return state;
}

// --- Initialize ---

function initialize(players: Player[], settings?: Record<string, unknown>): WhosDealGameState {
  const whosDealSettings = settings as WhosDealSettings | undefined;

  const targetScore = whosDealSettings?.targetScore || 10;
  const teamAIds = whosDealSettings?.teams?.a || [players[0].id, players[2]?.id || players[0].id];
  const teamBIds = whosDealSettings?.teams?.b || [players[1].id, players[3]?.id || players[1].id];

  // Seats: 0 & 2 = Team A, 1 & 3 = Team B
  const seats = [teamAIds[0], teamBIds[0], teamAIds[1], teamBIds[1]];

  const state: WhosDealGameState = {
    teams: {
      a: { playerIds: [teamAIds[0], teamAIds[1]], score: 0 },
      b: { playerIds: [teamBIds[0], teamBIds[1]], score: 0 },
    },
    seats,
    targetScore,
    dealerSeatIndex: 0,
    round: null,
    phase: 'playing',
    winningTeam: null,
    botActionAt: null,
    phaseEndsAt: null,
  };

  return withBotTiming(dealRound(state), players);
}

// --- Action: call-trump (round1) ---

function handleCallTrumpRound1(
  state: WhosDealGameState,
  playerId: string,
  payload: { pickUp?: boolean; goAlone?: boolean },
): WhosDealGameState {
  const round = state.round!;
  if (round.trumpPhase !== 'round1') return state;

  const seatIndex = getSeatIndex(state, playerId);
  if (seatIndex !== round.currentTurnSeatIndex) {
    throw new WhosDealError('Not your turn', 'NOT_YOUR_TURN', 403);
  }

  if (!payload.pickUp) return state;

  const trumpSuit = round.faceUpCard.suit;
  const callingTeam = getTeamForPlayer(state, playerId)!;

  const goingAlone = !!payload.goAlone;
  const alonePlayerId = goingAlone ? playerId : null;
  const inactivePartnerSeatIndex = goingAlone ? getPartnerSeatIndex(seatIndex) : null;

  // Dealer picks up face-up card (now has 6 cards)
  const dealerPlayerId = state.seats[state.dealerSeatIndex];
  const dealerHand = [...round.hands[dealerPlayerId], round.faceUpCard];
  const newHands = { ...round.hands, [dealerPlayerId]: dealerHand };

  return {
    ...state,
    round: {
      ...round,
      hands: newHands,
      trumpPhase: 'dealer_discard',
      trumpSuit,
      callingPlayerId: playerId,
      callingTeam,
      goingAlone,
      alonePlayerId,
      inactivePartnerSeatIndex,
      currentTurnSeatIndex: state.dealerSeatIndex,
      dealerPickedUp: round.faceUpCard,
    },
    botActionAt: null,
  };
}

// --- Action: pass-trump (round1) ---

function handlePassTrumpRound1(
  state: WhosDealGameState,
  playerId: string,
): WhosDealGameState {
  const round = state.round!;
  if (round.trumpPhase !== 'round1') return state;

  const seatIndex = getSeatIndex(state, playerId);
  if (seatIndex !== round.currentTurnSeatIndex) {
    throw new WhosDealError('Not your turn', 'NOT_YOUR_TURN', 403);
  }

  // Idempotency
  if (round.passedPlayers.includes(playerId)) return state;

  const newPassedPlayers = [...round.passedPlayers, playerId];

  // All 4 passed → round 2
  if (newPassedPlayers.length >= 4) {
    return {
      ...state,
      round: {
        ...round,
        trumpPhase: 'round2',
        passedPlayers: [],
        currentTurnSeatIndex: (state.dealerSeatIndex + 1) % 4,
      },
      botActionAt: null,
    };
  }

  // Next player
  const nextSeat = (round.currentTurnSeatIndex + 1) % 4;
  return {
    ...state,
    round: {
      ...round,
      passedPlayers: newPassedPlayers,
      currentTurnSeatIndex: nextSeat,
    },
    botActionAt: null,
  };
}

// --- Action: call-trump (round2) ---

function handleCallTrumpRound2(
  state: WhosDealGameState,
  playerId: string,
  payload: { suit?: Suit; goAlone?: boolean },
): WhosDealGameState {
  const round = state.round!;
  if (round.trumpPhase !== 'round2') return state;

  const seatIndex = getSeatIndex(state, playerId);
  if (seatIndex !== round.currentTurnSeatIndex) {
    throw new WhosDealError('Not your turn', 'NOT_YOUR_TURN', 403);
  }

  if (!payload.suit) {
    throw new WhosDealError('Must specify a suit', 'INVALID_SUIT', 400);
  }

  if (payload.suit === round.faceUpCard.suit) {
    throw new WhosDealError('Cannot call that suit', 'INVALID_SUIT', 400);
  }

  const trumpSuit = payload.suit;
  const callingTeam = getTeamForPlayer(state, playerId)!;

  const goingAlone = !!payload.goAlone;
  const alonePlayerId = goingAlone ? playerId : null;
  const inactivePartnerSeatIndex = goingAlone ? getPartnerSeatIndex(seatIndex) : null;

  // Transition directly to playing (no dealer discard in round 2)
  const tempRound: EuchreRound = {
    ...round,
    trumpPhase: 'playing',
    trumpSuit,
    callingPlayerId: playerId,
    callingTeam,
    goingAlone,
    alonePlayerId,
    inactivePartnerSeatIndex,
    currentTrick: [],
    tricksWon: { a: 0, b: 0 },
    tricksPlayed: 0,
  };

  // First trick lead: left of dealer, skipping inactive partner
  const trickLeadSeatIndex = nextActiveSeat(state.dealerSeatIndex, tempRound);
  tempRound.trickLeadSeatIndex = trickLeadSeatIndex;
  tempRound.currentTurnSeatIndex = trickLeadSeatIndex;

  return {
    ...state,
    round: tempRound,
    botActionAt: null,
  };
}

// --- Action: pass-trump (round2, with Stick the Dealer) ---

function handlePassTrumpRound2(
  state: WhosDealGameState,
  playerId: string,
): WhosDealGameState {
  const round = state.round!;
  if (round.trumpPhase !== 'round2') return state;

  const seatIndex = getSeatIndex(state, playerId);
  if (seatIndex !== round.currentTurnSeatIndex) {
    throw new WhosDealError('Not your turn', 'NOT_YOUR_TURN', 403);
  }

  // STICK THE DEALER: dealer CANNOT pass when all others have passed
  if (seatIndex === state.dealerSeatIndex && round.passedPlayers.length >= 3) {
    throw new WhosDealError('Dealer must call', 'MUST_CALL', 400);
  }

  // Idempotency
  if (round.passedPlayers.includes(playerId)) return state;

  const newPassedPlayers = [...round.passedPlayers, playerId];
  const nextSeat = (round.currentTurnSeatIndex + 1) % 4;

  return {
    ...state,
    round: {
      ...round,
      passedPlayers: newPassedPlayers,
      currentTurnSeatIndex: nextSeat,
    },
    botActionAt: null,
  };
}

// --- Action: discard (dealer_discard phase) ---

function handleDiscard(
  state: WhosDealGameState,
  playerId: string,
  payload: { cardId?: string },
): WhosDealGameState {
  const round = state.round!;
  if (round.trumpPhase !== 'dealer_discard') return state;

  const dealerPlayerId = state.seats[state.dealerSeatIndex];
  if (playerId !== dealerPlayerId) {
    throw new WhosDealError('Not the dealer', 'NOT_DEALER', 403);
  }

  if (!payload.cardId) {
    throw new WhosDealError('Must specify a card to discard', 'INVALID_CARD', 400);
  }

  const hand = round.hands[dealerPlayerId];
  if (hand.length !== 6) return state; // Idempotency: already discarded

  const cardIndex = hand.findIndex(c => c.id === payload.cardId);
  if (cardIndex === -1) {
    throw new WhosDealError('Card not in hand', 'INVALID_CARD', 400);
  }

  const newHand = [...hand];
  newHand.splice(cardIndex, 1);
  const newHands = { ...round.hands, [dealerPlayerId]: newHand };

  // Transition to playing
  const tempRound: EuchreRound = {
    ...round,
    hands: newHands,
    trumpPhase: 'playing',
    dealerDiscarded: true,
    currentTrick: [],
    tricksWon: { a: 0, b: 0 },
    tricksPlayed: 0,
  };

  // First trick lead: left of dealer, skipping inactive partner
  const trickLeadSeatIndex = nextActiveSeat(state.dealerSeatIndex, tempRound);
  tempRound.trickLeadSeatIndex = trickLeadSeatIndex;
  tempRound.currentTurnSeatIndex = trickLeadSeatIndex;

  return {
    ...state,
    round: tempRound,
    botActionAt: null,
  };
}

// --- Action: play-card ---

function handlePlayCard(
  state: WhosDealGameState,
  playerId: string,
  payload: { cardId?: string },
): WhosDealGameState {
  const round = state.round!;
  if (round.trumpPhase !== 'playing') return state;

  const seatIndex = getSeatIndex(state, playerId);

  if (round.goingAlone && seatIndex === round.inactivePartnerSeatIndex) {
    throw new WhosDealError('Partner is going alone', 'INACTIVE_PARTNER', 403);
  }

  if (seatIndex !== round.currentTurnSeatIndex) {
    throw new WhosDealError('Not your turn', 'NOT_YOUR_TURN', 403);
  }

  if (!payload.cardId) {
    throw new WhosDealError('Must specify a card', 'INVALID_CARD', 400);
  }

  const hand = round.hands[playerId];
  const cardIndex = hand.findIndex(c => c.id === payload.cardId);
  if (cardIndex === -1) {
    throw new WhosDealError('Card not in hand', 'INVALID_CARD', 400);
  }

  const card = hand[cardIndex];

  // Follow suit validation
  const ledSuit = round.currentTrick.length > 0
    ? getEffectiveSuit(round.currentTrick[0].card, round.trumpSuit!)
    : null;

  const playableCards = getPlayableCards(hand, ledSuit, round.trumpSuit!);
  if (!playableCards.find(c => c.id === card.id)) {
    throw new WhosDealError('Must follow suit', 'MUST_FOLLOW_SUIT', 400);
  }

  // Play the card
  const newHand = [...hand];
  newHand.splice(cardIndex, 1);

  const trickCard: TrickCard = { playerId, seatIndex, card };
  const newTrick = [...round.currentTrick, trickCard];
  const newHands = { ...round.hands, [playerId]: newHand };

  // Trick complete?
  if (newTrick.length === expectedCardsThisTrick(round)) {
    return completeTrick(state, newHands, newTrick);
  }

  // Trick not complete — advance to next player
  const tempRound: EuchreRound = { ...round, hands: newHands, currentTrick: newTrick };
  const nextSeat = nextActiveSeat(seatIndex, tempRound);

  return {
    ...state,
    round: {
      ...tempRound,
      currentTurnSeatIndex: nextSeat,
    },
    botActionAt: null,
  };
}

// --- Trick completion ---

function completeTrick(
  state: WhosDealGameState,
  hands: Record<string, Card[]>,
  trick: TrickCard[],
): WhosDealGameState {
  const round = state.round!;

  // Determine led suit and trick winner
  const ledSuit = getEffectiveSuit(trick[0].card, round.trumpSuit!);
  const winner = trick.reduce((best, current) =>
    compareCards(current.card, best.card, ledSuit, round.trumpSuit!) > 0 ? current : best
  );

  const winningTeam = getTeamForSeat(winner.seatIndex);
  const newTricksWon = {
    ...round.tricksWon,
    [winningTeam]: round.tricksWon[winningTeam] + 1,
  };
  const newTricksPlayed = round.tricksPlayed + 1;

  // Round over?
  if (newTricksPlayed === TRICKS_PER_ROUND) {
    return scoreRound(state, hands, newTricksWon, winner.seatIndex);
  }

  // Next trick — winner leads
  return {
    ...state,
    round: {
      ...round,
      hands,
      currentTrick: [],
      trickLeadSeatIndex: winner.seatIndex,
      currentTurnSeatIndex: winner.seatIndex,
      tricksWon: newTricksWon,
      tricksPlayed: newTricksPlayed,
    },
    botActionAt: null,
  };
}

// --- Round scoring ---

function scoreRound(
  state: WhosDealGameState,
  hands: Record<string, Card[]>,
  tricksWon: { a: number; b: number },
  lastTrickWinnerSeat: number,
): WhosDealGameState {
  const round = state.round!;
  const callingTeam = round.callingTeam!;
  const defendingTeam: 'a' | 'b' = callingTeam === 'a' ? 'b' : 'a';

  let pointsToTeam: 'a' | 'b';
  let points: number;

  const callingTricks = tricksWon[callingTeam];

  if (round.goingAlone) {
    if (callingTricks === 5) {
      pointsToTeam = callingTeam;
      points = 4;
    } else if (callingTricks >= 3) {
      pointsToTeam = callingTeam;
      points = 1;
    } else {
      pointsToTeam = defendingTeam;
      points = 2;
    }
  } else {
    if (callingTricks === 5) {
      pointsToTeam = callingTeam;
      points = 2;
    } else if (callingTricks >= 3) {
      pointsToTeam = callingTeam;
      points = 1;
    } else {
      pointsToTeam = defendingTeam;
      points = 2;
    }
  }

  const newTeams = {
    ...state.teams,
    [pointsToTeam]: {
      ...state.teams[pointsToTeam],
      score: state.teams[pointsToTeam].score + points,
    },
  };

  const isGameOver = newTeams[pointsToTeam].score >= state.targetScore;

  return {
    ...state,
    teams: newTeams,
    round: {
      ...round,
      hands,
      trumpPhase: 'round_over',
      tricksWon,
      tricksPlayed: TRICKS_PER_ROUND,
      currentTrick: [],
      trickLeadSeatIndex: lastTrickWinnerSeat,
    },
    phase: isGameOver ? 'game_over' : 'playing',
    winningTeam: isGameOver ? pointsToTeam : null,
    botActionAt: null,
    phaseEndsAt: isGameOver ? null : Date.now() + ROUND_RESULT_DISPLAY_MS,
  };
}

// --- Action: play-again ---

function handlePlayAgain(state: WhosDealGameState): WhosDealGameState {
  if (state.phase !== 'game_over') return state;

  return dealRound({
    ...state,
    teams: {
      a: { ...state.teams.a, score: 0 },
      b: { ...state.teams.b, score: 0 },
    },
    dealerSeatIndex: 0,
    phase: 'playing',
    winningTeam: null,
    round: null,
  });
}

// --- processAction dispatcher ---

function processAction(
  state: WhosDealGameState,
  playerId: string,
  action: GameAction,
): WhosDealGameState {
  if (!state.round && action.type !== 'play-again') return state;

  const payload = (action.payload || {}) as Record<string, unknown>;

  switch (action.type) {
    case 'call-trump': {
      const round = state.round!;
      if (round.trumpPhase === 'round1') {
        return handleCallTrumpRound1(state, playerId, payload as { pickUp?: boolean; goAlone?: boolean });
      }
      if (round.trumpPhase === 'round2') {
        return handleCallTrumpRound2(state, playerId, payload as { suit?: Suit; goAlone?: boolean });
      }
      return state;
    }
    case 'pass-trump': {
      const round = state.round!;
      if (round.trumpPhase === 'round1') {
        return handlePassTrumpRound1(state, playerId);
      }
      if (round.trumpPhase === 'round2') {
        return handlePassTrumpRound2(state, playerId);
      }
      return state;
    }
    case 'discard': {
      return handleDiscard(state, playerId, payload as { cardId?: string });
    }
    case 'play-card': {
      return handlePlayCard(state, playerId, payload as { cardId?: string });
    }
    case 'play-again': {
      return handlePlayAgain(state);
    }
    default:
      return state;
  }
}

// --- Advance to next round (called from heartbeat after round_over display) ---

export function advanceToNextRound(state: WhosDealGameState, players: Player[]): WhosDealGameState {
  if (!state.round || state.round.trumpPhase !== 'round_over') return state;
  if (state.phase === 'game_over') return state;

  const newState = dealRound({
    ...state,
    dealerSeatIndex: (state.dealerSeatIndex + 1) % 4,
    round: null,
  });

  return withBotTiming(newState, players);
}

// --- Phase/bot timing checks ---

export function shouldAdvancePhase(state: WhosDealGameState, now: number): boolean {
  if (!state.phaseEndsAt) return false;
  return now >= state.phaseEndsAt;
}

export function shouldExecuteBotAction(state: WhosDealGameState, now: number): boolean {
  if (!state.botActionAt) return false;
  return now >= state.botActionAt;
}

// --- Compute bot timing for a given state + players ---

export function computeBotTiming(state: WhosDealGameState, players: Player[]): number | null {
  if (!state.round) return null;
  const phase = state.round.trumpPhase;
  if (phase === 'round_over') return null;
  if (state.phase === 'game_over') return null;

  const currentPlayerId = state.seats[state.round.currentTurnSeatIndex];
  const currentPlayer = players.find(p => p.id === currentPlayerId);
  if (currentPlayer?.isBot) {
    return getBotActionTimestamp();
  }
  return null;
}

// --- GameModule implementation ---

export const whosDealModule: GameModule<WhosDealGameState> = {
  initialize(players: Player[], settings?: Record<string, unknown>): WhosDealGameState {
    return initialize(players, settings);
  },

  processAction(state: WhosDealGameState, playerId: string, action: GameAction): WhosDealGameState {
    return processAction(state, playerId, action);
  },

  getBotAction(state: WhosDealGameState, botId: string): GameAction {
    // Delegate to bots module — imported dynamically to avoid circular deps
    // The heartbeat/action route handles this directly using bots.ts
    return { type: 'noop' };
  },

  checkGameOver(state: WhosDealGameState): { isOver: boolean; winnerId?: string; isDraw?: boolean } {
    return { isOver: state.phase === 'game_over' };
  },

  sanitizeForPlayer(state: WhosDealGameState, playerId: string): unknown {
    if (!state.round) return state;

    const handCounts: Record<string, number> = {};
    for (const [pid, hand] of Object.entries(state.round.hands)) {
      handCounts[pid] = hand.length;
    }

    return {
      ...state,
      round: {
        ...state.round,
        hands: undefined,
        kitty: undefined,
        myHand: state.round.hands[playerId] || [],
        handCounts,
      },
    };
  },
};
