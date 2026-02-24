import type { Card, Suit, Rank, EuchreRound } from './types';

/**
 * Check if two suits are the same color.
 * Spades & Clubs = black, Hearts & Diamonds = red.
 */
export function isSameColor(a: Suit, b: Suit): boolean {
  const blacks: Suit[] = ['spades', 'clubs'];
  const reds: Suit[] = ['hearts', 'diamonds'];
  return (blacks.includes(a) && blacks.includes(b)) || (reds.includes(a) && reds.includes(b));
}

/**
 * Get the same-color partner suit.
 * Spades <-> Clubs, Hearts <-> Diamonds.
 */
export function getPartnerSuit(suit: Suit): Suit {
  const map: Record<Suit, Suit> = {
    spades: 'clubs',
    clubs: 'spades',
    hearts: 'diamonds',
    diamonds: 'hearts',
  };
  return map[suit];
}

/**
 * Get the "effective suit" of a card given the current trump.
 * The Left Bower (Jack of the same-color suit) belongs to the trump suit.
 */
export function getEffectiveSuit(card: Card, trumpSuit: Suit): Suit {
  if (
    card.rank === 'J' &&
    card.suit !== trumpSuit &&
    isSameColor(card.suit, trumpSuit)
  ) {
    return trumpSuit;
  }
  return card.suit;
}

/**
 * Get trump rank (higher = better).
 * Right Bower = 8, Left Bower = 7, A = 6, K = 5, Q = 4, 10 = 3, 9 = 2
 */
export function getTrumpRank(card: Card, trumpSuit: Suit): number {
  if (card.rank === 'J' && card.suit === trumpSuit) return 8; // Right Bower
  if (card.rank === 'J' && isSameColor(card.suit, trumpSuit)) return 7; // Left Bower
  const ranks: Record<Rank, number> = { 'A': 6, 'K': 5, 'Q': 4, '10': 3, '9': 2, 'J': 0 };
  return ranks[card.rank];
}

/**
 * Get standard rank for non-trump cards (higher = better).
 * A = 6, K = 5, Q = 4, J = 3, 10 = 2, 9 = 1
 */
export function getStandardRank(card: Card): number {
  const ranks: Record<Rank, number> = { 'A': 6, 'K': 5, 'Q': 4, 'J': 3, '10': 2, '9': 1 };
  return ranks[card.rank];
}

/**
 * Compare two cards in the context of a trick.
 *
 * CONTRACT:
 * - Returns POSITIVE if card `a` beats card `b`
 * - Returns NEGATIVE if card `b` beats card `a`
 * - Returns ZERO if equal (should not occur in Euchre — all 24 cards are unique)
 *
 * USAGE:
 * Trick winner MUST be determined by reducing across ALL played cards:
 *   const winner = trick.reduce((best, current) =>
 *     compareCards(current.card, best.card, ledSuit, trumpSuit) > 0 ? current : best
 *   );
 */
export function compareCards(a: Card, b: Card, leadSuit: Suit, trumpSuit: Suit): number {
  const aEffective = getEffectiveSuit(a, trumpSuit);
  const bEffective = getEffectiveSuit(b, trumpSuit);

  const aIsTrump = aEffective === trumpSuit;
  const bIsTrump = bEffective === trumpSuit;

  // Trump beats non-trump
  if (aIsTrump && !bIsTrump) return 1;
  if (!aIsTrump && bIsTrump) return -1;

  // Both trump: use trump ranking
  if (aIsTrump && bIsTrump) {
    return getTrumpRank(a, trumpSuit) - getTrumpRank(b, trumpSuit);
  }

  // Neither trump: only cards matching lead suit can win
  const aFollows = aEffective === leadSuit;
  const bFollows = bEffective === leadSuit;
  if (aFollows && !bFollows) return 1;
  if (!aFollows && bFollows) return -1;
  if (!aFollows && !bFollows) return 0; // Neither follows, neither wins

  // Both follow suit: standard ranking
  return getStandardRank(a) - getStandardRank(b);
}

/**
 * Get playable cards from a hand given the led suit.
 *
 * INVARIANT: Uses getEffectiveSuit() so the Left Bower is treated
 * as trump, not as its printed suit.
 */
export function getPlayableCards(hand: Card[], leadSuit: Suit | null, trumpSuit: Suit): Card[] {
  if (!leadSuit) return hand; // Leading — can play anything

  // Check if player has any cards of the led suit (using effective suit)
  const followCards = hand.filter((c) => getEffectiveSuit(c, trumpSuit) === leadSuit);

  if (followCards.length > 0) return followCards; // Must follow suit
  return hand; // Can't follow — play anything
}

/**
 * Single source of truth for how many cards complete a trick.
 * MUST be used everywhere trick completion is checked — never hardcode 3 or 4.
 */
export function expectedCardsThisTrick(round: EuchreRound): number {
  return round.goingAlone ? 3 : 4;
}

/**
 * Advance seat index clockwise, skipping inactive partner during Going Alone.
 */
export function nextActiveSeat(currentSeat: number, round: EuchreRound): number {
  let next = (currentSeat + 1) % 4;
  if (round.goingAlone && next === round.inactivePartnerSeatIndex) {
    next = (next + 1) % 4;
  }
  return next;
}
