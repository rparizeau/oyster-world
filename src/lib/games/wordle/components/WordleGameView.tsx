'use client';

import { useMemo } from 'react';
import type { WordleGameState, LetterGuess, LetterState } from '../types';
import {
  MAX_GUESSES, WORD_LENGTH, KEYBOARD_ROWS,
  TILE_COLORS, TILE_BORDER_COLORS, KEY_COLORS,
  REVEAL_STAGGER_MS,
} from '../constants';

interface WordleGameViewProps {
  game: WordleGameState;
  countdown: string;
  onTypeLetter: (letter: string) => void;
  onDeleteLetter: () => void;
  onSubmitGuess: () => void;
}

export default function WordleGameView({
  game, countdown,
  onTypeLetter, onDeleteLetter, onSubmitGuess,
}: WordleGameViewProps) {
  return (
    <div className="flex flex-col items-center w-full max-w-[360px] mx-auto px-2 pt-2 pb-4"
      style={{ height: 'calc(100dvh - 48px)' }}>

      {/* Toast */}
      {game.toast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 animate-fade-in">
          <div className="rounded-lg px-4 py-2 font-body font-bold text-sm"
            style={{
              background: 'rgba(245,230,202,.95)',
              color: '#080c1a',
            }}>
            {game.toast}
          </div>
        </div>
      )}

      {/* Guess Grid */}
      <div className="flex flex-col gap-[5px] my-auto">
        {Array.from({ length: MAX_GUESSES }, (_, rowIndex) => (
          <GuessRow
            key={rowIndex}
            rowIndex={rowIndex}
            guess={game.guesses[rowIndex]}
            currentGuess={rowIndex === game.guessCount ? game.currentGuess : undefined}
            isShaking={game.shakeRow === rowIndex}
            isRevealing={game.revealingRow === rowIndex}
            phase={game.phase}
          />
        ))}
      </div>

      {/* Game Over Overlay */}
      {game.phase !== 'playing' && game.revealingRow === null && (
        <GameOverOverlay
          game={game}
          countdown={countdown}
        />
      )}

      {/* Keyboard */}
      <div className="flex flex-col gap-[6px] mt-auto w-full">
        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} className="flex justify-center gap-[5px]">
            {row.map((key) => (
              <KeyButton
                key={key}
                keyValue={key}
                state={game.keyboardState[key]}
                disabled={game.phase !== 'playing' || game.revealingRow !== null}
                onPress={() => {
                  if (key === 'enter') onSubmitGuess();
                  else if (key === 'delete') onDeleteLetter();
                  else onTypeLetter(key);
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Guess Row ---

function GuessRow({
  rowIndex, guess, currentGuess, isShaking, isRevealing, phase,
}: {
  rowIndex: number;
  guess?: LetterGuess[];
  currentGuess?: string;
  isShaking: boolean;
  isRevealing: boolean;
  phase: WordleGameState['phase'];
}) {
  // Completed guess row
  if (guess) {
    return (
      <div
        className={isShaking ? 'wordle-shake' : ''}
        style={{ display: 'flex', gap: '5px' }}
      >
        {guess.map((letterGuess, i) => (
          <LetterTile
            key={i}
            letter={letterGuess.letter}
            state={letterGuess.state}
            isRevealing={isRevealing}
            revealDelay={i * REVEAL_STAGGER_MS}
            isWinBounce={phase === 'won' && rowIndex === (guess ? rowIndex : -1) && !isRevealing}
            bounceDelay={i * 80}
            isLastGuessRow={true}
          />
        ))}
      </div>
    );
  }

  // Current input row
  if (currentGuess !== undefined) {
    return (
      <div
        className={isShaking ? 'wordle-shake' : ''}
        style={{ display: 'flex', gap: '5px' }}
      >
        {Array.from({ length: WORD_LENGTH }, (_, i) => (
          <LetterTile
            key={i}
            letter={currentGuess[i] || ''}
            state="empty"
            hasInput={i < currentGuess.length}
          />
        ))}
      </div>
    );
  }

  // Empty future row
  return (
    <div style={{ display: 'flex', gap: '5px' }}>
      {Array.from({ length: WORD_LENGTH }, (_, i) => (
        <LetterTile key={i} letter="" state="empty" />
      ))}
    </div>
  );
}

// --- Letter Tile ---

function LetterTile({
  letter, state, isRevealing, revealDelay, hasInput, isWinBounce, bounceDelay, isLastGuessRow,
}: {
  letter: string;
  state: LetterState;
  isRevealing?: boolean;
  revealDelay?: number;
  hasInput?: boolean;
  isWinBounce?: boolean;
  bounceDelay?: number;
  isLastGuessRow?: boolean;
}) {
  const isPopIn = hasInput && state === 'empty';
  const revealed = isLastGuessRow && !isRevealing && state !== 'empty';

  const bgColor = revealed || (isRevealing) ? TILE_COLORS[state] : 'transparent';
  const borderColor = hasInput && state === 'empty'
    ? TILE_BORDER_COLORS.active
    : revealed || isRevealing
      ? TILE_BORDER_COLORS[state]
      : TILE_BORDER_COLORS.empty;

  return (
    <div
      className={`
        flex items-center justify-center font-display font-bold text-[1.6rem] uppercase select-none
        ${isRevealing ? 'wordle-flip' : ''}
        ${isPopIn ? 'wordle-pop' : ''}
      `}
      style={{
        width: '58px',
        height: '58px',
        border: `2px solid ${borderColor}`,
        backgroundColor: bgColor,
        color: state !== 'empty' && (revealed || isRevealing) ? '#fff' : 'var(--cream)',
        animationDelay: isRevealing ? `${revealDelay}ms` : undefined,
        animationFillMode: isRevealing ? 'both' : undefined,
        transition: !isRevealing ? 'border-color 0.1s' : undefined,
      }}
    >
      {letter.toUpperCase()}
    </div>
  );
}

// --- Keyboard Key ---

function KeyButton({
  keyValue, state, disabled, onPress,
}: {
  keyValue: string;
  state?: LetterState;
  disabled: boolean;
  onPress: () => void;
}) {
  const isWide = keyValue === 'enter' || keyValue === 'delete';
  const colors = state ? KEY_COLORS[state] : KEY_COLORS.unused;

  const label = useMemo(() => {
    if (keyValue === 'enter') return 'ENTER';
    if (keyValue === 'delete') return (
      <svg width="20" height="16" viewBox="0 0 20 16" fill="currentColor">
        <path d="M7.06 0L0 8l7.06 8h12.76V0H7.06zm10.26 11.54l-1.42 1.42L12.46 9.5l-3.44 3.46-1.42-1.42L11.04 8 7.6 4.54l1.42-1.42L12.46 6.5l3.44-3.38 1.42 1.42L13.88 8l3.44 3.54z" />
      </svg>
    );
    return keyValue.toUpperCase();
  }, [keyValue]);

  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className="flex items-center justify-center rounded-md font-body font-bold select-none active:scale-95 transition-transform"
      style={{
        minWidth: isWide ? '58px' : '30px',
        flex: isWide ? '1.4' : '1',
        height: '52px',
        fontSize: isWide ? '0.65rem' : '0.82rem',
        backgroundColor: colors.bg,
        color: colors.text,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        letterSpacing: isWide ? '0.05em' : undefined,
      }}
    >
      {label}
    </button>
  );
}

// --- Game Over Overlay ---

function GameOverOverlay({
  game, countdown,
}: {
  game: WordleGameState;
  countdown: string;
}) {
  const won = game.phase === 'won';

  return (
    <div className="flex flex-col items-center gap-3 py-3 animate-fade-in">
      <div className="text-center">
        <div className="font-display text-sm text-cream/60">
          {won ? `Solved in ${game.guessCount}` : 'Better luck next time'}
        </div>
        {!won && (
          <div className="font-display text-lg text-pearl mt-0.5">
            {game.targetWord.toUpperCase()}
          </div>
        )}
      </div>

      <div className="text-center">
        <div className="text-[0.65rem] font-body text-cream/40 uppercase tracking-wider">Next word</div>
        <div className="font-display text-xl text-cream tabular-nums">{countdown}</div>
      </div>
    </div>
  );
}
