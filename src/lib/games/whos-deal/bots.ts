import type { WhosDealGameState, Card, Suit } from './types';
import type { GameAction } from '../types';
import {
  getEffectiveSuit,
  compareCards,
  getPlayableCards,
  getTrumpRank,
  getStandardRank,
  isSameColor,
  getPartnerSuit,
} from './helpers';
import { getSeatIndex, getTeamForSeat } from './engine';

// --- Trump Calling: Round 1 ---

function shouldOrderUpRound1(
  hand: Card[],
  faceUpSuit: Suit,
  isDealer: boolean,
): { orderUp: boolean; goAlone: boolean } {
  const trumpCards = hand.filter(c => getEffectiveSuit(c, faceUpSuit) === faceUpSuit);
  const hasRightBower = hand.some(c => c.rank === 'J' && c.suit === faceUpSuit);
  const hasLeftBower = hand.some(c => c.rank === 'J' && c.suit !== faceUpSuit && isSameColor(c.suit, faceUpSuit));

  // 1. Has Right Bower → order it up
  if (hasRightBower) {
    return { orderUp: true, goAlone: shouldGoAlone(hand, faceUpSuit) };
  }

  // 2. Has Left Bower + 2 other trump
  if (hasLeftBower && trumpCards.length >= 3) {
    return { orderUp: true, goAlone: shouldGoAlone(hand, faceUpSuit) };
  }

  // 3. Has 3+ cards of face-up suit with face cards
  const faceCards = trumpCards.filter(c => ['J', 'Q', 'K', 'A'].includes(c.rank));
  if (trumpCards.length >= 3 && faceCards.length >= 1) {
    return { orderUp: true, goAlone: shouldGoAlone(hand, faceUpSuit) };
  }

  // 4. Dealer with decent hand (2+ trump)
  if (isDealer && trumpCards.length >= 2) {
    return { orderUp: true, goAlone: false };
  }

  // 5. Pass
  return { orderUp: false, goAlone: false };
}

// --- Trump Calling: Round 2 ---

function chooseSuitRound2(
  hand: Card[],
  faceUpSuit: Suit,
  mustCall: boolean,
): { suit: Suit; goAlone: boolean } | null {
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const validSuits = suits.filter(s => s !== faceUpSuit);

  let bestSuit: Suit | null = null;
  let bestScore = -1;

  for (const suit of validSuits) {
    const cardsOfSuit = hand.filter(c => getEffectiveSuit(c, suit) === suit);
    const hasRightBower = hand.some(c => c.rank === 'J' && c.suit === suit);
    const hasLeftBower = hand.some(c => c.rank === 'J' && c.suit !== suit && isSameColor(c.suit, suit));

    // Score: count + bonus for bowers
    let score = cardsOfSuit.length;
    if (hasRightBower) score += 3;
    if (hasLeftBower) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestSuit = suit;
    }
  }

  // Voluntarily call if strong enough (3+ effective cards or bower)
  if (bestSuit && bestScore >= 3) {
    return { suit: bestSuit, goAlone: shouldGoAlone(hand, bestSuit) };
  }

  // Stick the dealer: must call
  if (mustCall && bestSuit) {
    return { suit: bestSuit, goAlone: false };
  }

  return null;
}

// --- Going Alone Decision ---

function shouldGoAlone(hand: Card[], trumpSuit: Suit): boolean {
  const hasRightBower = hand.some(c => c.rank === 'J' && c.suit === trumpSuit);
  const hasLeftBower = hand.some(c => c.rank === 'J' && c.suit !== trumpSuit && isSameColor(c.suit, trumpSuit));
  const trumpCards = hand.filter(c => getEffectiveSuit(c, trumpSuit) === trumpSuit);
  const offSuitAces = hand.filter(c => c.rank === 'A' && getEffectiveSuit(c, trumpSuit) !== trumpSuit);

  // Right + Left + 1 other trump + 1 off-suit Ace
  if (hasRightBower && hasLeftBower && trumpCards.length >= 3 && offSuitAces.length >= 1) {
    return true;
  }

  // Right + 3 other trump
  if (hasRightBower && trumpCards.length >= 4) {
    return true;
  }

  return false;
}

// --- Dealer Discard ---

function chooseDealerDiscard(hand: Card[], trumpSuit: Suit): string {
  // Never discard Right or Left Bower
  const isRightBower = (c: Card) => c.rank === 'J' && c.suit === trumpSuit;
  const isLeftBower = (c: Card) => c.rank === 'J' && c.suit !== trumpSuit && isSameColor(c.suit, trumpSuit);

  // Find non-trump cards (excluding bowers)
  const nonTrump = hand.filter(c =>
    getEffectiveSuit(c, trumpSuit) !== trumpSuit && !isRightBower(c) && !isLeftBower(c)
  );

  if (nonTrump.length > 0) {
    // Discard lowest non-trump
    nonTrump.sort((a, b) => getStandardRank(a) - getStandardRank(b));
    return nonTrump[0].id;
  }

  // All trump — discard lowest (9 of trump), never a bower
  const discardable = hand.filter(c => !isRightBower(c) && !isLeftBower(c));
  discardable.sort((a, b) => getTrumpRank(a, trumpSuit) - getTrumpRank(b, trumpSuit));
  return discardable[0].id;
}

// --- Trick Play ---

function chooseTrickCard(
  state: WhosDealGameState,
  botId: string,
): string {
  const round = state.round!;
  const hand = round.hands[botId];
  const trumpSuit = round.trumpSuit!;
  const botSeatIndex = getSeatIndex(state, botId);
  const botTeam = getTeamForSeat(botSeatIndex);

  // Get playable cards
  const ledSuit = round.currentTrick.length > 0
    ? getEffectiveSuit(round.currentTrick[0].card, trumpSuit)
    : null;
  const playable = getPlayableCards(hand, ledSuit, trumpSuit);

  if (playable.length === 1) return playable[0].id;

  // --- LEADING ---
  if (round.currentTrick.length === 0) {
    return chooseLeadCard(playable, trumpSuit);
  }

  // --- FOLLOWING ---
  const isFollowingSuit = ledSuit !== null && playable.some(c => getEffectiveSuit(c, trumpSuit) === ledSuit);

  // Check if partner is currently winning
  const partnerIsWinning = isPartnerWinningTrick(state, botId);

  if (isFollowingSuit) {
    // Following suit
    if (partnerIsWinning) {
      // Play lowest legal card
      return lowestCard(playable, trumpSuit).id;
    }

    // Can we win? Find lowest winning card
    const winningCard = findLowestWinningCard(playable, round.currentTrick, ledSuit!, trumpSuit);
    if (winningCard) return winningCard.id;

    // Can't win — play lowest
    return lowestCard(playable, trumpSuit).id;
  }

  // --- CAN'T FOLLOW SUIT ---
  if (partnerIsWinning) {
    // Throw lowest off-suit
    return lowestCard(playable, trumpSuit).id;
  }

  // Trump if we have trump and trick is worth winning
  const trumpInHand = playable.filter(c => getEffectiveSuit(c, trumpSuit) === trumpSuit);
  if (trumpInHand.length > 0) {
    // Play lowest trump
    trumpInHand.sort((a, b) => getTrumpRank(a, trumpSuit) - getTrumpRank(b, trumpSuit));
    return trumpInHand[0].id;
  }

  // Throw lowest
  return lowestCard(playable, trumpSuit).id;
}

function chooseLeadCard(playable: Card[], trumpSuit: Suit): string {
  // 1. Lead Right Bower
  const rightBower = playable.find(c => c.rank === 'J' && c.suit === trumpSuit);
  if (rightBower) return rightBower.id;

  // 2. Lead off-suit Ace
  const offSuitAce = playable.find(c => c.rank === 'A' && getEffectiveSuit(c, trumpSuit) !== trumpSuit);
  if (offSuitAce) return offSuitAce.id;

  // 3. Lead highest trump if 2+ trump
  const trumpCards = playable.filter(c => getEffectiveSuit(c, trumpSuit) === trumpSuit);
  if (trumpCards.length >= 2) {
    trumpCards.sort((a, b) => getTrumpRank(b, trumpSuit) - getTrumpRank(a, trumpSuit));
    return trumpCards[0].id;
  }

  // 4. Lead lowest card
  return lowestCard(playable, trumpSuit).id;
}

function isPartnerWinningTrick(state: WhosDealGameState, botId: string): boolean {
  const round = state.round!;
  if (round.currentTrick.length === 0) return false;

  const botSeatIndex = getSeatIndex(state, botId);
  const partnerSeatIndex = (botSeatIndex + 2) % 4;
  const trumpSuit = round.trumpSuit!;
  const ledSuit = getEffectiveSuit(round.currentTrick[0].card, trumpSuit);

  // Find current best card in trick
  const currentWinner = round.currentTrick.reduce((best, current) =>
    compareCards(current.card, best.card, ledSuit, trumpSuit) > 0 ? current : best
  );

  return currentWinner.seatIndex === partnerSeatIndex;
}

function findLowestWinningCard(
  playable: Card[],
  currentTrick: { card: Card }[],
  ledSuit: Suit,
  trumpSuit: Suit,
): Card | null {
  // Find the current best card in trick
  const currentBest = currentTrick.reduce((best, current) =>
    compareCards(current.card, best.card, ledSuit, trumpSuit) > 0 ? current : best
  );

  // Find cards that beat the current best
  const winners = playable.filter(c =>
    compareCards(c, currentBest.card, ledSuit, trumpSuit) > 0
  );

  if (winners.length === 0) return null;

  // Return the lowest winning card
  winners.sort((a, b) => {
    const aIsTrump = getEffectiveSuit(a, trumpSuit) === trumpSuit;
    const bIsTrump = getEffectiveSuit(b, trumpSuit) === trumpSuit;
    if (aIsTrump && !bIsTrump) return 1;
    if (!aIsTrump && bIsTrump) return -1;
    if (aIsTrump && bIsTrump) return getTrumpRank(a, trumpSuit) - getTrumpRank(b, trumpSuit);
    return getStandardRank(a) - getStandardRank(b);
  });

  return winners[0];
}

function lowestCard(cards: Card[], trumpSuit: Suit): Card {
  const sorted = [...cards].sort((a, b) => {
    const aIsTrump = getEffectiveSuit(a, trumpSuit) === trumpSuit;
    const bIsTrump = getEffectiveSuit(b, trumpSuit) === trumpSuit;
    // Non-trump before trump (lower value)
    if (!aIsTrump && bIsTrump) return -1;
    if (aIsTrump && !bIsTrump) return 1;
    if (aIsTrump && bIsTrump) return getTrumpRank(a, trumpSuit) - getTrumpRank(b, trumpSuit);
    return getStandardRank(a) - getStandardRank(b);
  });
  return sorted[0];
}

// --- Main bot action entry point ---

export function getWhosDealBotAction(
  state: WhosDealGameState,
  botId: string,
): GameAction {
  const round = state.round;
  if (!round) return { type: 'noop' };

  const botSeatIndex = getSeatIndex(state, botId);
  if (botSeatIndex !== round.currentTurnSeatIndex) return { type: 'noop' };

  switch (round.trumpPhase) {
    case 'round1': {
      const isDealer = botSeatIndex === state.dealerSeatIndex;
      const result = shouldOrderUpRound1(round.hands[botId], round.faceUpCard.suit, isDealer);
      if (result.orderUp) {
        return { type: 'call-trump', payload: { pickUp: true, goAlone: result.goAlone } };
      }
      return { type: 'pass-trump' };
    }

    case 'round2': {
      const isDealer = botSeatIndex === state.dealerSeatIndex;
      const mustCall = isDealer && round.passedPlayers.length >= 3;
      const result = chooseSuitRound2(round.hands[botId], round.faceUpCard.suit, mustCall);
      if (result) {
        return { type: 'call-trump', payload: { suit: result.suit, goAlone: result.goAlone } };
      }
      return { type: 'pass-trump' };
    }

    case 'dealer_discard': {
      const cardId = chooseDealerDiscard(round.hands[botId], round.trumpSuit!);
      return { type: 'discard', payload: { cardId } };
    }

    case 'playing': {
      const cardId = chooseTrickCard(state, botId);
      return { type: 'play-card', payload: { cardId } };
    }

    default:
      return { type: 'noop' };
  }
}
