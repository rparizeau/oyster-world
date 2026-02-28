'use client';

import { useReducer, useEffect, useCallback, useRef, useState } from 'react';
import type { WordleGameState, WordleAction, LetterGuess, LetterState } from '@/lib/games/wordle/types';
import { MAX_GUESSES, WORD_LENGTH, REVEAL_STAGGER_MS } from '@/lib/games/wordle/constants';
import {
  getWordSlotId, getDailyWord, getMillisUntilNextRotation,
  evaluateGuess, isValidGuess,
  loadLocalState, saveLocalState, cleanOldLocalState,
} from '@/lib/games/wordle/helpers';

// --- Reducer ---

function wordleReducer(state: WordleGameState, action: WordleAction): WordleGameState {
  switch (action.type) {
    case 'init': {
      const { targetWord, slotId, savedGuesses } = action;

      // Replay saved guesses if restoring from localStorage
      if (savedGuesses && savedGuesses.length > 0) {
        const guesses: LetterGuess[][] = [];
        const keyboardState: Record<string, LetterState> = {};

        for (const word of savedGuesses) {
          const evaluated = evaluateGuess(word, targetWord);
          guesses.push(evaluated);

          // Update keyboard state
          for (const { letter, state: ls } of evaluated) {
            const existing = keyboardState[letter];
            if (!existing || priority(ls) > priority(existing)) {
              keyboardState[letter] = ls;
            }
          }
        }

        const lastGuess = savedGuesses[savedGuesses.length - 1];
        const won = lastGuess === targetWord;
        const lost = !won && savedGuesses.length >= MAX_GUESSES;

        return {
          phase: won ? 'won' : lost ? 'lost' : 'playing',
          targetWord,
          guesses,
          currentGuess: '',
          guessCount: savedGuesses.length,
          keyboardState,
          slotId,
          completedAt: won || lost ? Date.now() : null,
          shakeRow: null,
          toast: null,
          revealingRow: null,
        };
      }

      return {
        phase: 'playing',
        targetWord,
        guesses: [],
        currentGuess: '',
        guessCount: 0,
        keyboardState: {},
        slotId,
        completedAt: null,
        shakeRow: null,
        toast: null,
        revealingRow: null,
      };
    }

    case 'type-letter': {
      if (state.phase !== 'playing') return state;
      if (state.revealingRow !== null) return state;
      if (state.currentGuess.length >= WORD_LENGTH) return state;
      return { ...state, currentGuess: state.currentGuess + action.letter.toLowerCase() };
    }

    case 'delete-letter': {
      if (state.phase !== 'playing') return state;
      if (state.revealingRow !== null) return state;
      if (state.currentGuess.length === 0) return state;
      return { ...state, currentGuess: state.currentGuess.slice(0, -1) };
    }

    case 'submit-guess': {
      if (state.phase !== 'playing') return state;
      if (state.revealingRow !== null) return state;

      const guess = state.currentGuess;

      if (guess.length < WORD_LENGTH) {
        return { ...state, shakeRow: state.guessCount, toast: 'Not enough letters' };
      }

      if (!isValidGuess(guess)) {
        return { ...state, shakeRow: state.guessCount, toast: 'Not in word list' };
      }

      // Evaluate the guess
      const evaluated = evaluateGuess(guess, state.targetWord);
      const newGuesses = [...state.guesses, evaluated];
      const newGuessCount = state.guessCount + 1;

      // Update keyboard state
      const newKeyboardState = { ...state.keyboardState };
      for (const { letter, state: ls } of evaluated) {
        const existing = newKeyboardState[letter];
        if (!existing || priority(ls) > priority(existing)) {
          newKeyboardState[letter] = ls;
        }
      }

      const won = guess === state.targetWord;
      const lost = !won && newGuessCount >= MAX_GUESSES;

      // Start reveal animation — phase change happens after reveal completes
      return {
        ...state,
        guesses: newGuesses,
        currentGuess: '',
        guessCount: newGuessCount,
        keyboardState: newKeyboardState,
        revealingRow: newGuessCount - 1,
        // Don't change phase yet — wait for reveal animation
        phase: state.phase,
        completedAt: state.completedAt,
        shakeRow: null,
        toast: null,
      };
    }

    case 'clear-reveal': {
      if (state.revealingRow === null) return state;

      // Now check if game is over after reveal completes
      const lastGuessRow = state.guesses[state.revealingRow];
      const lastWord = lastGuessRow?.map(l => l.letter).join('') ?? '';
      const won = lastWord === state.targetWord;
      const lost = !won && state.guessCount >= MAX_GUESSES;

      const toastMessages = won
        ? ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!']
        : [];
      const winToast = won ? toastMessages[Math.min(state.guessCount - 1, 5)] : null;
      const loseToast = lost ? state.targetWord.toUpperCase() : null;

      return {
        ...state,
        revealingRow: null,
        phase: won ? 'won' : lost ? 'lost' : 'playing',
        completedAt: won || lost ? Date.now() : null,
        toast: winToast || loseToast || null,
      };
    }

    case 'clear-shake': {
      return { ...state, shakeRow: null };
    }

    case 'clear-toast': {
      return { ...state, toast: null };
    }

    case 'new-word': {
      return {
        phase: 'playing',
        targetWord: action.targetWord,
        guesses: [],
        currentGuess: '',
        guessCount: 0,
        keyboardState: {},
        slotId: action.slotId,
        completedAt: null,
        shakeRow: null,
        toast: null,
        revealingRow: null,
      };
    }

    default:
      return state;
  }
}

/** Priority ordering for keyboard state updates: correct > present > absent */
function priority(state: LetterState): number {
  if (state === 'correct') return 3;
  if (state === 'present') return 2;
  if (state === 'absent') return 1;
  return 0;
}

// --- Initial state ---

const emptyState: WordleGameState = {
  phase: 'playing',
  targetWord: '',
  guesses: [],
  currentGuess: '',
  guessCount: 0,
  keyboardState: {},
  slotId: '',
  completedAt: null,
  shakeRow: null,
  toast: null,
  revealingRow: null,
};

// --- Format countdown as HH:MM:SS ---

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Hook ---

export function useWordle() {
  const [game, dispatch] = useReducer(wordleReducer, emptyState);
  const [countdown, setCountdown] = useState('');
  const initRef = useRef(false);

  // Initialize on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    cleanOldLocalState();

    const slotId = getWordSlotId();
    const targetWord = getDailyWord(slotId);
    const saved = loadLocalState(slotId);

    dispatch({
      type: 'init',
      targetWord,
      slotId,
      savedGuesses: saved?.guesses,
    });
  }, []);

  // Physical keyboard listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture if focused on an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        dispatch({ type: 'submit-guess' });
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        dispatch({ type: 'delete-letter' });
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        dispatch({ type: 'type-letter', letter: e.key.toLowerCase() });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Save to localStorage on every completed guess
  useEffect(() => {
    if (!game.slotId || game.guessCount === 0) return;

    const guessWords = game.guesses.map(row => row.map(l => l.letter).join(''));
    saveLocalState(game.slotId, {
      guesses: guessWords,
      completed: game.phase !== 'playing',
      won: game.phase === 'won',
      timestamp: Date.now(),
    });
  }, [game.guessCount, game.phase, game.guesses, game.slotId]);

  // Shake auto-clear
  useEffect(() => {
    if (game.shakeRow === null) return;
    const timer = setTimeout(() => dispatch({ type: 'clear-shake' }), 400);
    return () => clearTimeout(timer);
  }, [game.shakeRow]);

  // Toast auto-clear (longer for game-over messages)
  useEffect(() => {
    if (game.toast === null) return;
    const duration = game.phase !== 'playing' ? 3000 : 1500;
    const timer = setTimeout(() => dispatch({ type: 'clear-toast' }), duration);
    return () => clearTimeout(timer);
  }, [game.toast, game.phase]);

  // Reveal animation auto-clear
  useEffect(() => {
    if (game.revealingRow === null) return;
    const totalDuration = WORD_LENGTH * REVEAL_STAGGER_MS + 300; // stagger + flip duration
    const timer = setTimeout(() => dispatch({ type: 'clear-reveal' }), totalDuration);
    return () => clearTimeout(timer);
  }, [game.revealingRow]);

  // Countdown timer (updates every second when game is complete)
  useEffect(() => {
    if (game.phase === 'playing') {
      setCountdown('');
      return;
    }

    function updateCountdown() {
      setCountdown(formatCountdown(getMillisUntilNextRotation()));
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [game.phase]);

  // Slot rotation check (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const currentSlotId = getWordSlotId();
      if (currentSlotId !== game.slotId && game.slotId !== '') {
        const newWord = getDailyWord(currentSlotId);
        dispatch({ type: 'new-word', targetWord: newWord, slotId: currentSlotId });
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [game.slotId]);

  // Action handlers
  const handleTypeLetter = useCallback((letter: string) => {
    dispatch({ type: 'type-letter', letter });
  }, []);

  const handleDeleteLetter = useCallback(() => {
    dispatch({ type: 'delete-letter' });
  }, []);

  const handleSubmitGuess = useCallback(() => {
    dispatch({ type: 'submit-guess' });
  }, []);

  return {
    game,
    countdown,
    handleTypeLetter,
    handleDeleteLetter,
    handleSubmitGuess,
  };
}
