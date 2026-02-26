import type { Player } from '@/lib/types';
import type { GameState, BlackCard, WhiteCard } from './types';
import type { GameModule, GameAction, AdvancementResult } from '@/lib/games/types';
import {
  HAND_SIZE,
  DEFAULT_TARGET_SCORE,
  CZAR_REVEAL_DURATION_MS,
  ROUND_RESULT_DURATION_MS,
  BOT_SUBMIT_DELAY_RANGE_MS,
  BOT_JUDGE_DELAY_MS,
} from '@/lib/constants';
import { shuffle } from '@/lib/utils';
import { getBotActionTimestamp, selectRandomCards, selectRandomWinner } from './bots';
import { loadCards } from './cards';

export class TerriblePeopleError extends Error {
  constructor(message: string, public code: string, public status: number = 400) {
    super(message);
    this.name = 'TerriblePeopleError';
  }
}

export interface CardData {
  black: BlackCard[];
  white: WhiteCard[];
}

// --- Pure game engine functions ---

export function initializeGame(players: Player[], cards: CardData, now: number): GameState {
  const blackDeck = shuffle(cards.black);
  const whiteDeck = shuffle(cards.white);

  const hands: Record<string, WhiteCard[]> = {};
  for (const player of players) {
    hands[player.id] = whiteDeck.splice(0, HAND_SIZE);
  }

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

export function startSubmittingPhase(state: GameState, players: Player[], now: number): GameState {
  let botActionAt: number | null = null;
  for (let i = 0; i < players.length; i++) {
    if (i === state.czarIndex) continue;
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

export type GameResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };

export function submitCards(
  state: GameState,
  playerId: string,
  cardIds: string[],
  players: Player[]
): GameResult<GameState> {
  if (state.phase !== 'submitting') {
    return { ok: false, error: 'Not in submitting phase', code: 'INVALID_PHASE' };
  }

  if (players[state.czarIndex]?.id === playerId) {
    return { ok: false, error: 'Czar cannot submit cards', code: 'INVALID_SUBMISSION' };
  }

  if (state.submissions[playerId]) {
    return { ok: false, error: 'Already submitted', code: 'ALREADY_SUBMITTED' };
  }

  if (cardIds.length !== state.blackCard.pick) {
    return { ok: false, error: `Must submit exactly ${state.blackCard.pick} card(s)`, code: 'INVALID_SUBMISSION' };
  }

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

  const newHand = hand.filter((c) => !cardIds.includes(c.id));
  const newSubmissions = { ...state.submissions, [playerId]: submittedCards };
  const newHands = { ...state.hands, [playerId]: newHand };

  const nonCzarPlayers = players.filter((_, i) => i !== state.czarIndex);
  const allSubmitted = nonCzarPlayers.every((p) => newSubmissions[p.id]);

  let newState: GameState = {
    ...state,
    submissions: newSubmissions,
    hands: newHands,
  };

  if (allSubmitted) {
    newState = transitionToJudging(newState, players);
  }

  return { ok: true, data: newState };
}

function transitionToJudging(state: GameState, players: Player[]): GameState {
  const revealOrder = getShuffledRevealOrder(state, players);
  const now = Date.now();

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

export type JudgeResult = { ok: true; state: GameState; updatedPlayers: Player[] } | { ok: false; error: string; code: string };

export function judgeWinner(
  state: GameState,
  czarId: string,
  winnerId: string,
  players: Player[]
): JudgeResult {
  if (state.phase !== 'judging') {
    return { ok: false, error: 'Not in judging phase', code: 'INVALID_PHASE' };
  }

  if (players[state.czarIndex]?.id !== czarId) {
    return { ok: false, error: 'Only the Czar can judge', code: 'UNAUTHORIZED' };
  }

  if (state.roundWinnerId !== null) {
    return { ok: false, error: 'Winner already selected', code: 'ALREADY_SUBMITTED' };
  }

  if (!state.submissions[winnerId]) {
    return { ok: false, error: 'Invalid winner', code: 'INVALID_SUBMISSION' };
  }

  const now = Date.now();

  const updatedPlayers = players.map((p) =>
    p.id === winnerId ? { ...p, score: p.score + 1 } : p
  );

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

export function advanceRound(state: GameState, players: Player[], now: number): GameState {
  const discarded: WhiteCard[] = [...state.discardWhite];
  for (const cards of Object.values(state.submissions)) {
    discarded.push(...cards);
  }

  let whiteDeck = [...state.whiteDeck];
  const hands = { ...state.hands };

  for (const player of players) {
    const hand = hands[player.id] || [];
    const needed = HAND_SIZE - hand.length;
    if (needed > 0) {
      if (whiteDeck.length < needed) {
        whiteDeck = [...whiteDeck, ...shuffle(discarded)];
        discarded.length = 0;
      }
      hands[player.id] = [...hand, ...whiteDeck.splice(0, needed)];
    }
  }

  const newCzarIndex = (state.czarIndex + 1) % players.length;

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

export function checkWinCondition(
  players: { id: string; score: number }[],
  targetScore: number
): { isGameOver: boolean; winnerId?: string } {
  const winner = players.find((p) => p.score >= targetScore);
  return winner ? { isGameOver: true, winnerId: winner.id } : { isGameOver: false };
}

export function getShuffledRevealOrder(
  state: GameState,
  players: { id: string }[]
): string[] {
  const nonCzarIds = players
    .filter((_, i) => i !== state.czarIndex)
    .map((p) => p.id);
  return shuffle(nonCzarIds);
}

export function shouldAdvancePhase(state: GameState, now: number): boolean {
  if (!state.phaseEndsAt) return false;
  return now >= state.phaseEndsAt;
}

export function shouldExecuteBotAction(state: GameState, now: number): boolean {
  if (!state.botActionAt) return false;
  return now >= state.botActionAt;
}

export function reinitializeGame(players: Player[], cards: CardData, now: number): GameState {
  return initializeGame(players, cards, now);
}

// --- GameModule implementation ---

export const terriblePeopleModule: GameModule<GameState> = {
  initialize(players: Player[]): GameState {
    const cards = loadCards();
    const now = Date.now();
    return initializeGame(players, cards, now);
  },

  processAction(state: GameState, playerId: string, action: GameAction): GameState {
    switch (action.type) {
      case 'submit': {
        const payload = action.payload as { cardIds: string[]; _players: Player[] } | undefined;
        if (!payload?.cardIds || !payload._players) return state;

        // Idempotent: already submitted
        if (state.submissions[playerId]) return state;

        const result = submitCards(state, playerId, payload.cardIds, payload._players);
        if (!result.ok) {
          throw new TerriblePeopleError(result.error, result.code);
        }
        return result.data;
      }
      case 'judge': {
        const payload = action.payload as { winnerId: string; _players: Player[] } | undefined;
        if (!payload?.winnerId || !payload._players) return state;

        // Idempotent: winner already selected
        if (state.roundWinnerId !== null) return state;

        const result = judgeWinner(state, playerId, payload.winnerId, payload._players);
        if (!result.ok) {
          throw new TerriblePeopleError(result.error, result.code);
        }
        return result.state;
      }
      case 'play-again': {
        return state;
      }
      default:
        return state;
    }
  },

  getBotAction(state: GameState, botId: string): GameAction {
    if (state.phase === 'submitting') {
      const hand = state.hands[botId];
      if (hand) {
        const cardIds = selectRandomCards(hand, state.blackCard.pick);
        return { type: 'submit', payload: { cardIds } };
      }
    }
    if (state.phase === 'judging') {
      const czarId = botId; // bot is the czar
      const winnerId = selectRandomWinner(state.submissions, czarId);
      return { type: 'judge', payload: { winnerId } };
    }
    return { type: 'noop' };
  },

  checkGameOver(state: GameState) {
    if (state.phase === 'game_over') {
      return { isOver: true, winnerId: state.roundWinnerId ?? undefined };
    }
    return { isOver: false };
  },

  sanitizeForPlayer(state: GameState, _playerId: string) {
    return {
      currentRound: state.currentRound,
      targetScore: state.targetScore,
      czarIndex: state.czarIndex,
      phase: state.phase,
      phaseEndsAt: state.phaseEndsAt,
      blackCard: state.blackCard,
      submissions: state.submissions,
      revealOrder: state.revealOrder,
      roundWinnerId: state.roundWinnerId,
    };
  },

  processAdvancement(state: GameState, players: Player[], now: number): AdvancementResult | null {
    // Phase advancement: czar_reveal → submitting
    if (state.phase === 'czar_reveal' && shouldAdvancePhase(state, now)) {
      const newGame = startSubmittingPhase(state, players, now);
      return {
        newState: newGame,
        canApply: (current) => {
          const g = current as GameState;
          return g.phase === 'czar_reveal' && shouldAdvancePhase(g, now);
        },
        roomEvents: [{
          event: 'phase-changed',
          data: {
            phase: 'submitting',
            blackCard: newGame.blackCard,
            czarId: players[newGame.czarIndex]?.id,
            czarIndex: newGame.czarIndex,
            currentRound: newGame.currentRound,
            phaseEndsAt: newGame.phaseEndsAt,
          },
        }],
        playerEvents: [],
        recurse: true,
      };
    }

    // Phase advancement: round_result → next round (czar_reveal)
    if (state.phase === 'round_result' && shouldAdvancePhase(state, now)) {
      const newGame = advanceRound(state, players, now);
      const playerEvents: AdvancementResult['playerEvents'] = [];
      for (const player of players) {
        const hand = newGame.hands[player.id];
        if (hand) {
          playerEvents.push({ playerId: player.id, event: 'hand-updated', data: { hand } });
        }
      }
      return {
        newState: newGame,
        canApply: (current) => {
          const g = current as GameState;
          return g.phase === 'round_result' && shouldAdvancePhase(g, now);
        },
        roomEvents: [{
          event: 'phase-changed',
          data: {
            phase: 'czar_reveal',
            blackCard: newGame.blackCard,
            czarId: players[newGame.czarIndex]?.id,
            czarIndex: newGame.czarIndex,
            currentRound: newGame.currentRound,
            phaseEndsAt: newGame.phaseEndsAt,
          },
        }],
        playerEvents,
        recurse: true,
      };
    }

    // Bot action: submit cards during submitting phase
    if (state.phase === 'submitting' && shouldExecuteBotAction(state, now)) {
      let currentGame = { ...state };
      let stateChanged = false;
      const roomEvents: AdvancementResult['roomEvents'] = [];

      for (let i = 0; i < players.length; i++) {
        if (i === state.czarIndex) continue;
        const player = players[i];
        if (!player.isBot) continue;
        if (currentGame.submissions[player.id]) continue;

        const hand = currentGame.hands[player.id];
        if (!hand || hand.length === 0) continue;

        const cardIds = selectRandomCards(hand, currentGame.blackCard.pick);
        const result = submitCards(currentGame, player.id, cardIds, players);

        if (result.ok) {
          currentGame = result.data;
          stateChanged = true;
          roomEvents.push({ event: 'player-submitted', data: { playerId: player.id } });
        }
      }

      if (!stateChanged) return null;

      // If all submitted, also emit judging events
      if (currentGame.phase === 'judging') {
        const anonymousSubmissions = currentGame.revealOrder.map((id) => ({
          id,
          cards: currentGame.submissions[id],
        }));

        roomEvents.push({
          event: 'phase-changed',
          data: {
            phase: 'judging',
            blackCard: currentGame.blackCard,
            czarId: players[currentGame.czarIndex]?.id,
            czarIndex: currentGame.czarIndex,
            currentRound: currentGame.currentRound,
          },
        });
        roomEvents.push({
          event: 'submissions-revealed',
          data: { submissions: anonymousSubmissions },
        });
      }

      return {
        newState: currentGame,
        canApply: (current) => (current as GameState).phase === 'submitting',
        roomEvents,
        playerEvents: [],
        recurse: currentGame.phase === 'judging',
      };
    }

    // Bot action: judge during judging phase
    if (state.phase === 'judging' && shouldExecuteBotAction(state, now)) {
      const czar = players[state.czarIndex];
      if (!czar || !czar.isBot) return null;
      if (state.roundWinnerId !== null) return null;

      const winnerId = selectRandomWinner(state.submissions, czar.id);
      if (!winnerId) return null;

      const result = judgeWinner(state, czar.id, winnerId, players);
      if (!result.ok) return null;

      const newGameState = result.state;
      const winnerPlayer = players.find((p) => p.id === winnerId)!;

      const scores: Record<string, number> = {};
      for (const p of result.updatedPlayers) {
        scores[p.id] = p.score;
      }

      const roomEvents: AdvancementResult['roomEvents'] = [{
        event: 'round-result',
        data: {
          winnerId,
          winnerName: winnerPlayer.name,
          submission: newGameState.submissions[winnerId],
          scores,
          isGameOver: newGameState.phase === 'game_over',
        },
      }];

      if (newGameState.phase === 'game_over') {
        roomEvents.push({
          event: 'game-over',
          data: {
            finalScores: scores,
            winnerId,
            winnerName: winnerPlayer.name,
          },
        });
      }

      return {
        newState: newGameState,
        canApply: (current) => {
          const g = current as GameState;
          return g.phase === 'judging' && g.roundWinnerId === null;
        },
        roomEvents,
        playerEvents: [],
        recurse: false,
        updatedPlayers: result.updatedPlayers,
      };
    }

    return null;
  },

  processPlayerReplacement(
    state: GameState, departingPlayerId: string, replacementBotId: string,
    playerIndex: number, players: Player[]
  ): GameState {
    const hands = { ...state.hands };
    const submissions = { ...state.submissions };

    if (hands[departingPlayerId]) {
      hands[replacementBotId] = hands[departingPlayerId];
      delete hands[departingPlayerId];
    }

    if (submissions[departingPlayerId]) {
      submissions[replacementBotId] = submissions[departingPlayerId];
      delete submissions[departingPlayerId];
    }

    let botActionAt = state.botActionAt;

    if (state.phase === 'submitting' && !submissions[replacementBotId] && playerIndex !== state.czarIndex) {
      botActionAt = getBotActionTimestamp(BOT_SUBMIT_DELAY_RANGE_MS);
    }

    if (state.phase === 'judging' && playerIndex === state.czarIndex && state.roundWinnerId === null) {
      botActionAt = Date.now() + BOT_JUDGE_DELAY_MS;
    }

    const revealOrder = state.revealOrder.map((id) =>
      id === departingPlayerId ? replacementBotId : id
    );

    return { ...state, hands, submissions, botActionAt, revealOrder };
  },
};
