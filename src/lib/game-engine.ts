import type { Room, GameState, BlackCard, WhiteCard } from './types';
import {
  HAND_SIZE,
  DEFAULT_TARGET_SCORE,
  CZAR_REVEAL_DURATION_MS,
  ROUND_RESULT_DURATION_MS,
  BOT_SUBMIT_DELAY_RANGE_MS,
  BOT_JUDGE_DELAY_MS,
} from './constants';
import { shuffle } from './utils';
import { getBotActionTimestamp } from './bots';

export interface CardData {
  black: BlackCard[];
  white: WhiteCard[];
}

/**
 * Initialize a new game from a room and card data.
 * Pure function — returns a new GameState.
 */
export function initializeGame(room: Room, cards: CardData, now: number): GameState {
  const blackDeck = shuffle(cards.black);
  const whiteDeck = shuffle(cards.white);

  // Deal HAND_SIZE cards to each player
  const hands: Record<string, WhiteCard[]> = {};
  for (const player of room.players) {
    hands[player.id] = whiteDeck.splice(0, HAND_SIZE);
  }

  // Draw first black card
  const blackCard = blackDeck.shift()!;

  return {
    currentRound: 1,
    targetScore: DEFAULT_TARGET_SCORE,
    czarIndex: 0,
    phase: 'czar_reveal',
    phaseEndsAt: now + CZAR_REVEAL_DURATION_MS,
    botActionAt: null,
    blackCard,
    submissions: {},
    revealOrder: [],
    roundWinnerId: null,
    hands,
    blackDeck,
    whiteDeck,
    discardWhite: [],
    discardBlack: [],
  };
}

/**
 * Transition from czar_reveal to submitting phase.
 * Sets botActionAt for any bots that need to submit.
 */
export function startSubmittingPhase(state: GameState, players: { id: string; isBot: boolean }[], now: number): GameState {
  // Find the earliest bot action timestamp for non-Czar bots
  let botActionAt: number | null = null;
  for (let i = 0; i < players.length; i++) {
    if (i === state.czarIndex) continue; // Skip Czar
    if (players[i].isBot) {
      const timestamp = getBotActionTimestamp(BOT_SUBMIT_DELAY_RANGE_MS);
      if (!botActionAt || timestamp < botActionAt) {
        botActionAt = timestamp;
      }
    }
  }

  return {
    ...state,
    phase: 'submitting',
    phaseEndsAt: null,
    botActionAt,
  };
}

/**
 * Submit cards for a player. Returns updated GameState or throws an error string.
 */
export type GameResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };

export function submitCards(
  state: GameState,
  playerId: string,
  cardIds: string[],
  players: { id: string; isBot: boolean }[]
): GameResult<GameState> {
  // Validate phase
  if (state.phase !== 'submitting') {
    return { ok: false, error: 'Not in submitting phase', code: 'INVALID_PHASE' };
  }

  // Validate not the Czar
  if (players[state.czarIndex]?.id === playerId) {
    return { ok: false, error: 'Czar cannot submit cards', code: 'INVALID_SUBMISSION' };
  }

  // Validate not already submitted
  if (state.submissions[playerId]) {
    return { ok: false, error: 'Already submitted', code: 'ALREADY_SUBMITTED' };
  }

  // Validate card count matches pick
  if (cardIds.length !== state.blackCard.pick) {
    return { ok: false, error: `Must submit exactly ${state.blackCard.pick} card(s)`, code: 'INVALID_SUBMISSION' };
  }

  // Validate cards exist in hand
  const hand = state.hands[playerId];
  if (!hand) {
    return { ok: false, error: 'Player has no hand', code: 'INVALID_SUBMISSION' };
  }

  const submittedCards: WhiteCard[] = [];
  for (const cardId of cardIds) {
    const card = hand.find((c) => c.id === cardId);
    if (!card) {
      return { ok: false, error: `Card ${cardId} not in hand`, code: 'INVALID_SUBMISSION' };
    }
    submittedCards.push(card);
  }

  // Remove submitted cards from hand
  const newHand = hand.filter((c) => !cardIds.includes(c.id));

  // Add submission
  const newSubmissions = { ...state.submissions, [playerId]: submittedCards };
  const newHands = { ...state.hands, [playerId]: newHand };

  // Check if all non-Czar players have submitted
  const nonCzarPlayers = players.filter((_, i) => i !== state.czarIndex);
  const allSubmitted = nonCzarPlayers.every((p) => newSubmissions[p.id]);

  let newState: GameState = {
    ...state,
    submissions: newSubmissions,
    hands: newHands,
  };

  if (allSubmitted) {
    // Transition to judging
    newState = transitionToJudging(newState, players);
  }

  return { ok: true, data: newState };
}

/**
 * Transition to judging phase with shuffled reveal order.
 */
function transitionToJudging(state: GameState, players: { id: string; isBot: boolean }[]): GameState {
  const revealOrder = getShuffledRevealOrder(state, players);
  const now = Date.now();

  // Check if Czar is a bot — if so, set botActionAt
  let botActionAt: number | null = null;
  if (players[state.czarIndex]?.isBot) {
    botActionAt = now + BOT_JUDGE_DELAY_MS;
  }

  return {
    ...state,
    phase: 'judging',
    phaseEndsAt: null,
    botActionAt,
    revealOrder,
  };
}

/**
 * Judge selects a winner. Returns updated GameState.
 */
export type JudgeResult = { ok: true; state: GameState; updatedPlayers: { id: string; isBot: boolean; score: number }[] } | { ok: false; error: string; code: string };

export function judgeWinner(
  state: GameState,
  czarId: string,
  winnerId: string,
  players: { id: string; isBot: boolean; score: number }[]
): JudgeResult {
  if (state.phase !== 'judging') {
    return { ok: false, error: 'Not in judging phase', code: 'INVALID_PHASE' };
  }

  // Validate requester is Czar
  if (players[state.czarIndex]?.id !== czarId) {
    return { ok: false, error: 'Only the Czar can judge', code: 'UNAUTHORIZED' };
  }

  // Idempotent: if winner already selected, return success
  if (state.roundWinnerId !== null) {
    return { ok: false, error: 'Winner already selected', code: 'ALREADY_SUBMITTED' };
  }

  // Validate winner exists in submissions
  if (!state.submissions[winnerId]) {
    return { ok: false, error: 'Invalid winner', code: 'INVALID_SUBMISSION' };
  }

  const now = Date.now();

  // Increment winner's score
  const updatedPlayers = players.map((p) =>
    p.id === winnerId ? { ...p, score: p.score + 1 } : p
  );

  // Check win condition
  const winner = updatedPlayers.find((p) => p.id === winnerId)!;
  const isGameOver = winner.score >= state.targetScore;

  const newState: GameState = {
    ...state,
    roundWinnerId: winnerId,
    phase: isGameOver ? 'game_over' : 'round_result',
    phaseEndsAt: isGameOver ? null : now + ROUND_RESULT_DURATION_MS,
    botActionAt: null,
  };

  return { ok: true, state: newState, updatedPlayers };
}

/**
 * Advance to the next round. Discards played cards, replenishes hands,
 * rotates Czar, draws new black card.
 */
export function advanceRound(state: GameState, players: { id: string; isBot: boolean }[], now: number): GameState {
  // Discard all submitted white cards
  const discarded: WhiteCard[] = [...state.discardWhite];
  for (const cards of Object.values(state.submissions)) {
    discarded.push(...cards);
  }

  let whiteDeck = [...state.whiteDeck];
  const hands = { ...state.hands };

  // Replenish each player's hand to HAND_SIZE
  for (const player of players) {
    const hand = hands[player.id] || [];
    const needed = HAND_SIZE - hand.length;
    if (needed > 0) {
      // If deck is too small, reshuffle discard
      if (whiteDeck.length < needed) {
        whiteDeck = [...whiteDeck, ...shuffle(discarded)];
        discarded.length = 0;
      }
      hands[player.id] = [...hand, ...whiteDeck.splice(0, needed)];
    }
  }

  // Advance Czar (wrap around)
  const newCzarIndex = (state.czarIndex + 1) % players.length;

  // Discard current black card, draw new one
  const discardedBlack = [...state.discardBlack, state.blackCard];
  let blackDeck = [...state.blackDeck];
  if (blackDeck.length === 0) {
    blackDeck = shuffle(discardedBlack);
    discardedBlack.length = 0;
  }
  const blackCard = blackDeck.shift()!;

  return {
    ...state,
    currentRound: state.currentRound + 1,
    czarIndex: newCzarIndex,
    phase: 'czar_reveal',
    phaseEndsAt: now + CZAR_REVEAL_DURATION_MS,
    botActionAt: null,
    blackCard,
    submissions: {},
    revealOrder: [],
    roundWinnerId: null,
    hands,
    blackDeck,
    whiteDeck,
    discardWhite: discarded,
    discardBlack: discardedBlack,
  };
}

/**
 * Check if any player has reached the target score.
 */
export function checkWinCondition(
  players: { id: string; score: number }[],
  targetScore: number
): { isGameOver: boolean; winnerId?: string } {
  const winner = players.find((p) => p.score >= targetScore);
  return winner ? { isGameOver: true, winnerId: winner.id } : { isGameOver: false };
}

/**
 * Get shuffled non-Czar player IDs for anonymous submission display.
 */
export function getShuffledRevealOrder(
  state: GameState,
  players: { id: string }[]
): string[] {
  const nonCzarIds = players
    .filter((_, i) => i !== state.czarIndex)
    .map((p) => p.id);
  return shuffle(nonCzarIds);
}

/**
 * Check if the current phase should auto-advance based on timestamp.
 */
export function shouldAdvancePhase(state: GameState, now: number): boolean {
  if (!state.phaseEndsAt) return false;
  return now >= state.phaseEndsAt;
}

/**
 * Check if a pending bot action should execute based on timestamp.
 */
export function shouldExecuteBotAction(state: GameState, now: number): boolean {
  if (!state.botActionAt) return false;
  return now >= state.botActionAt;
}

/**
 * Reinitialize game for "Play Again" — reshuffle, redeal, reset scores.
 */
export function reinitializeGame(room: Room, cards: CardData, now: number): GameState {
  return initializeGame(room, cards, now);
}
