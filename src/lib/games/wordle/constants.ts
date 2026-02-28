export const MAX_GUESSES = 6;
export const WORD_LENGTH = 5;

export const KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'delete'],
];

export const LOCALSTORAGE_PREFIX = 'wordle:';

// Tile colors (ocean design system)
export const TILE_COLORS: Record<string, string> = {
  correct: '#6bbfa3',   // glass/success green
  present: '#f0c27f',   // pearl gold
  absent: '#2a3a5c',    // muted deep blue
  empty: 'transparent',
};

// Keyboard key colors
export const KEY_COLORS: Record<string, { bg: string; text: string }> = {
  correct: { bg: '#6bbfa3', text: '#080c1a' },
  present: { bg: '#f0c27f', text: '#080c1a' },
  absent: { bg: '#1a2440', text: 'rgba(245,230,202,.35)' },
  unused: { bg: 'rgba(245,230,202,.12)', text: 'var(--cream)' },
};

export const TILE_BORDER_COLORS: Record<string, string> = {
  correct: '#6bbfa3',
  present: '#f0c27f',
  absent: '#2a3a5c',
  empty: 'rgba(245,230,202,.15)',
  active: 'rgba(245,230,202,.4)',
};

export const SHAKE_DURATION_MS = 400;
export const TOAST_DURATION_MS = 1500;
export const REVEAL_DURATION_MS = 300;
export const REVEAL_STAGGER_MS = 150;
