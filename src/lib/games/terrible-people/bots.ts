import type { WhiteCard } from '@/lib/types';

/**
 * Select random card IDs from a hand.
 */
export function selectRandomCards(hand: WhiteCard[], count: number): string[] {
  const shuffled = [...hand].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((c) => c.id);
}

/**
 * Select a random winner from submissions (excluding the Czar).
 */
export function selectRandomWinner(
  submissions: Record<string, WhiteCard[]>,
  czarId: string
): string {
  const candidates = Object.keys(submissions).filter((id) => id !== czarId);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Get a timestamp for when a bot should act: now + random delay within range.
 */
export function getBotActionTimestamp(delayRange: readonly [number, number]): number {
  const [min, max] = delayRange;
  const delay = min + Math.random() * (max - min);
  return Date.now() + delay;
}
