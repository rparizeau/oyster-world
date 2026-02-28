import type { LetterGuess, LetterState, WordleLocalState } from './types';
import { WORD_LENGTH, LOCALSTORAGE_PREFIX } from './constants';
import { ANSWER_WORDS, isValidGuess } from './words';

// --- Word rotation ---

/** Deterministic slot ID from current local time. Rotates at 4:15 AM and 4:15 PM. */
export function getWordSlotId(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  // Slot 0: 4:15 AM → 4:14 PM, Slot 1: 4:15 PM → 4:14 AM (next day)
  const totalMinutes = hours * 60 + minutes;
  const morningBoundary = 4 * 60 + 15; // 4:15 AM = 255
  const eveningBoundary = 16 * 60 + 15; // 4:15 PM = 975

  let slot: number;
  let slotDay = day;

  if (totalMinutes < morningBoundary) {
    // Before 4:15 AM → still previous day's evening slot
    slot = 1;
    // Adjust day back by 1 for the slot ID
    const yesterday = new Date(year, month - 1, day - 1);
    slotDay = yesterday.getDate();
  } else if (totalMinutes < eveningBoundary) {
    // 4:15 AM → 4:14 PM → morning slot
    slot = 0;
  } else {
    // 4:15 PM → 4:14 AM → evening slot
    slot = 1;
  }

  return `${year}-${month}-${slotDay}-${slot}`;
}

/** Simple string hash → positive integer */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash);
}

/** Get the daily word for the current time slot */
export function getDailyWord(slotId?: string): string {
  const id = slotId ?? getWordSlotId();
  const index = hashString(id) % ANSWER_WORDS.length;
  return ANSWER_WORDS[index];
}

/** Milliseconds until the next 4:15 boundary */
export function getMillisUntilNextRotation(now = new Date()): number {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ms = now.getMilliseconds();

  const totalMs = ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
  const morningMs = (4 * 60 + 15) * 60 * 1000;
  const eveningMs = (16 * 60 + 15) * 60 * 1000;

  if (totalMs < morningMs) return morningMs - totalMs;
  if (totalMs < eveningMs) return eveningMs - totalMs;
  // Next morning (4:15 AM tomorrow)
  const endOfDay = 24 * 60 * 60 * 1000;
  return endOfDay - totalMs + morningMs;
}

// --- Guess evaluation ---

/** Core Wordle algorithm: evaluate a guess against the target word.
 *  Handles duplicate letters correctly:
 *  - First pass: mark exact matches (correct)
 *  - Second pass: mark present letters (only if target still has unmatched occurrences)
 */
export function evaluateGuess(guess: string, target: string): LetterGuess[] {
  const result: LetterGuess[] = Array.from({ length: WORD_LENGTH }, (_, i) => ({
    letter: guess[i],
    state: 'absent' as LetterState,
  }));

  // Count remaining target letters (not yet matched)
  const remaining: Record<string, number> = {};
  for (const ch of target) {
    remaining[ch] = (remaining[ch] || 0) + 1;
  }

  // First pass: mark correct (exact position matches)
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === target[i]) {
      result[i].state = 'correct';
      remaining[guess[i]]--;
    }
  }

  // Second pass: mark present (right letter, wrong position)
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i].state === 'correct') continue;
    if (remaining[guess[i]] && remaining[guess[i]] > 0) {
      result[i].state = 'present';
      remaining[guess[i]]--;
    }
  }

  return result;
}

/** Check if a word is a valid guess */
export { isValidGuess };

// --- localStorage persistence ---

export function loadLocalState(slotId: string): WordleLocalState | null {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_PREFIX + slotId);
    if (!raw) return null;
    return JSON.parse(raw) as WordleLocalState;
  } catch {
    return null;
  }
}

export function saveLocalState(slotId: string, state: WordleLocalState): void {
  try {
    localStorage.setItem(LOCALSTORAGE_PREFIX + slotId, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

/** Remove localStorage entries older than 48 hours */
export function cleanOldLocalState(): void {
  try {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LOCALSTORAGE_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as WordleLocalState;
        if (parsed.timestamp < cutoff) {
          keysToRemove.push(key);
        }
      } catch {
        // Corrupt entry — remove it
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // Silently fail
  }
}
