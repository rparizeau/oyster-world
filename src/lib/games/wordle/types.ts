export type LetterState = 'correct' | 'present' | 'absent' | 'empty';

export interface LetterGuess {
  letter: string;
  state: LetterState;
}

export interface WordleGameState {
  phase: 'playing' | 'won' | 'lost';
  targetWord: string;
  guesses: LetterGuess[][];
  currentGuess: string;
  guessCount: number;
  keyboardState: Record<string, LetterState>;
  slotId: string;
  completedAt: number | null;
  shakeRow: number | null;
  toast: string | null;
  revealingRow: number | null;
}

export type WordleAction =
  | { type: 'init'; targetWord: string; slotId: string; savedGuesses?: string[] }
  | { type: 'type-letter'; letter: string }
  | { type: 'delete-letter' }
  | { type: 'submit-guess' }
  | { type: 'clear-shake' }
  | { type: 'clear-toast' }
  | { type: 'clear-reveal' }
  | { type: 'new-word'; targetWord: string; slotId: string };

export interface WordleLocalState {
  guesses: string[];
  completed: boolean;
  won: boolean;
  timestamp: number;
}

// Minimal server state — all logic runs client-side
export interface WordleServerState {
  phase: 'playing';
}
