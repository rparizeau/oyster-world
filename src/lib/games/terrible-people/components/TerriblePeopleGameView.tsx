'use client';

import type { Room } from '@/lib/types';
import type { WhiteCard } from '../types';
import type { SanitizedGameState } from '@/app/room/[roomCode]/types';

interface TerriblePeopleGameViewProps {
  room: Room;
  gameState: SanitizedGameState;
  playerId: string | null;
  isOwner: boolean;
  isCzar: boolean;
  hand: WhiteCard[];
  selectedCards: string[];
  hasSubmitted: boolean;
  submitting: boolean;
  judging: boolean;
  revealedSubmissions: { id: string; cards: WhiteCard[] }[];
  roundResult: { winnerId: string; winnerName: string; submission: WhiteCard[]; scores: Record<string, number>; isGameOver: boolean } | null;
  gameOver: { finalScores: Record<string, number>; winnerId: string; winnerName: string } | null;
  leaving: boolean;
  phaseKey: number;
  onToggleCard: (cardId: string) => void;
  onSubmit: () => void;
  onJudge: (winnerId: string) => void;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export default function TerriblePeopleGameView({
  room,
  gameState,
  playerId,
  isOwner,
  isCzar,
  hand,
  selectedCards,
  hasSubmitted,
  submitting,
  judging,
  revealedSubmissions,
  roundResult,
  gameOver,
  leaving,
  phaseKey,
  onToggleCard,
  onSubmit,
  onJudge,
  onPlayAgain,
  onLeave,
}: TerriblePeopleGameViewProps) {
  const czar = room.players[gameState.czarIndex];
  const phase = gameState.phase;

  // Game Over screen
  if (phase === 'game_over' || gameOver) {
    return (
      <GameOverView
        room={room}
        roundResult={roundResult}
        gameOver={gameOver}
        isOwner={isOwner}
        leaving={leaving}
        onPlayAgain={onPlayAgain}
        onLeave={onLeave}
      />
    );
  }

  const nonCzarCount = room.players.length - 1;
  const submittedCount = Object.keys(gameState.submissions).length;

  return (
    <div className="flex flex-1 flex-col p-4 pb-6 max-w-lg mx-auto w-full">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted bg-surface-light rounded-lg px-2.5 py-1">
            Round {gameState.currentRound}
          </span>
          <span className="text-xs text-muted">
            First to {gameState.targetScore}
          </span>
        </div>
        <span className="status-dot connected" title="Connected" />
      </div>

      {/* Player strip with scores */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {room.players.map((p, i) => (
          <div
            key={p.id}
            className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border transition-all ${
              p.id === playerId && i !== gameState.czarIndex
                ? 'border-accent/50 bg-accent/5'
                : 'border-border bg-surface'
            }`}
            style={i === gameState.czarIndex ? { borderColor: 'var(--pearl)', background: 'rgba(240,194,127,.08)', boxShadow: '0 0 10px rgba(240,194,127,0.15)' } : undefined}
          >
            <div className="flex items-center gap-1">
              {i === gameState.czarIndex && (
                <svg className="w-3.5 h-3.5" style={{ color: 'var(--pearl)' }} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                  <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
                </svg>
              )}
              <span className={`text-[11px] font-semibold truncate max-w-[60px] ${
                p.isBot ? 'text-muted' : 'text-foreground'
              }`}>
                {p.name}
              </span>
            </div>
            <span className="text-lg font-black tabular-nums">{p.score}</span>
          </div>
        ))}
      </div>

      {/* Black card */}
      <div className="card-black mb-5 animate-fade-in-up" key={`black-${gameState.currentRound}`}>
        <p className="pr-16" dangerouslySetInnerHTML={{ __html: formatBlackCard(gameState.blackCard.text) }} />
        {gameState.blackCard.pick > 1 && (
          <span className="absolute top-3 right-3 bg-white/10 rounded-lg px-2 py-0.5 text-xs font-bold">
            PICK {gameState.blackCard.pick}
          </span>
        )}
      </div>

      {/* Phase-specific content */}
      <div key={phaseKey} className="animate-fade-in flex-1">
        {phase === 'czar_reveal' && (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 mb-3">
              <svg className="w-5 h-5" style={{ color: 'var(--pearl)' }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
              </svg>
              <p className="text-cream text-lg font-semibold">
                {czar?.name} is The Crown
              </p>
            </div>
            <p className="text-muted text-sm animate-pulse-soft">Reading the prompt...</p>
          </div>
        )}

        {phase === 'submitting' && (
          <SubmittingPhase
            isCzar={isCzar}
            czarName={czar?.name ?? 'The Crown'}
            hand={hand}
            selectedCards={selectedCards}
            hasSubmitted={hasSubmitted}
            submitting={submitting}
            submittedCount={submittedCount}
            nonCzarCount={nonCzarCount}
            pick={gameState.blackCard.pick}
            onToggleCard={onToggleCard}
            onSubmit={onSubmit}
          />
        )}

        {phase === 'judging' && (
          <JudgingPhase
            isCzar={isCzar}
            czarName={czar?.name ?? 'The Crown'}
            revealedSubmissions={revealedSubmissions}
            judging={judging}
            onJudge={onJudge}
          />
        )}

        {phase === 'round_result' && roundResult && (
          <RoundResultPhase
            winnerName={roundResult.winnerName}
            submission={roundResult.submission}
          />
        )}
      </div>

      {/* Leave button - minimal at bottom */}
      <div className="mt-auto pt-4">
        <button
          onClick={onLeave}
          disabled={leaving}
          className="w-full text-xs text-muted hover:text-danger transition-colors py-2"
        >
          {leaving ? 'Leaving...' : 'Leave Game'}
        </button>
      </div>
    </div>
  );
}

// ====================
// SUBMITTING PHASE
// ====================
function SubmittingPhase({
  isCzar,
  czarName,
  hand,
  selectedCards,
  hasSubmitted,
  submitting,
  submittedCount,
  nonCzarCount,
  pick,
  onToggleCard,
  onSubmit,
}: {
  isCzar: boolean;
  czarName: string;
  hand: WhiteCard[];
  selectedCards: string[];
  hasSubmitted: boolean;
  submitting: boolean;
  submittedCount: number;
  nonCzarCount: number;
  pick: number;
  onToggleCard: (cardId: string) => void;
  onSubmit: () => void;
}) {
  if (isCzar) {
    return (
      <div className="text-center py-8">
        <p className="text-foreground text-lg font-semibold mb-2">Waiting for answers...</p>
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: nonCzarCount }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                i < submittedCount ? 'bg-success' : 'bg-surface-lighter'
              }`}
            />
          ))}
        </div>
        <p className="text-muted text-xs mt-2">{submittedCount}/{nonCzarCount} submitted</p>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div className="text-center py-8 animate-scale-in">
        <div className="w-14 h-14 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-success text-lg font-semibold">Cards submitted!</p>
        <p className="text-muted text-sm mt-1">
          Waiting for others... ({submittedCount}/{nonCzarCount})
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-foreground">
          Pick {pick} card{pick > 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: nonCzarCount }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i < submittedCount ? 'bg-success' : 'bg-surface-lighter'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Player's hand - horizontal scroll on mobile, grid on desktop */}
      <div className="hand-scroll mb-4 md:grid md:grid-cols-2 md:gap-2 md:overflow-visible">
        {hand.map((card, i) => {
          const isSelected = selectedCards.includes(card.id);
          const selectionIndex = selectedCards.indexOf(card.id);

          return (
            <button
              key={card.id}
              onClick={() => onToggleCard(card.id)}
              className={`card-white text-left w-[160px] md:w-auto min-h-[100px] border-2 transition-all ${
                isSelected
                  ? 'border-accent shadow-[0_0_12px_rgba(240,194,127,0.3)] !transform-none'
                  : 'border-transparent hover:border-border-light'
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {isSelected && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                  {selectionIndex + 1}
                </span>
              )}
              <span className="text-card-white-text">{card.text}</span>
            </button>
          );
        })}
      </div>

      {/* Submit button */}
      <button
        onClick={onSubmit}
        disabled={selectedCards.length !== pick || submitting}
        className="w-full rounded-xl bg-accent px-6 py-3.5 font-bold text-[#080c1a] hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Submitting...
          </>
        ) : (
          `Submit ${pick} Card${pick > 1 ? 's' : ''}`
        )}
      </button>
    </div>
  );
}

// ====================
// JUDGING PHASE
// ====================
function JudgingPhase({
  isCzar,
  czarName,
  revealedSubmissions,
  judging,
  onJudge,
}: {
  isCzar: boolean;
  czarName: string;
  revealedSubmissions: { id: string; cards: WhiteCard[] }[];
  judging: boolean;
  onJudge: (winnerId: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-3">
        {isCzar ? 'Pick the funniest answer:' : `${czarName} is choosing...`}
      </p>

      <div className="flex flex-col gap-3">
        {revealedSubmissions.map((sub, i) => (
          <button
            key={sub.id}
            onClick={() => isCzar && !judging ? onJudge(sub.id) : undefined}
            disabled={!isCzar || judging}
            className={`card-white text-left !p-4 border-2 animate-fade-in-up ${
              isCzar && !judging
                ? 'border-transparent hover:border-accent hover:shadow-[0_0_12px_rgba(240,194,127,0.2)] cursor-pointer'
                : 'border-transparent cursor-default !transform-none'
            }`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {sub.cards.map((card, j) => (
              <span key={card.id} className="text-card-white-text">
                {j > 0 && <span className="text-muted mx-1">&</span>}
                {card.text}
              </span>
            ))}
          </button>
        ))}
      </div>

      {isCzar && !judging && (
        <p className="text-center text-muted text-xs mt-4 animate-pulse-soft">
          Tap a card to pick the winner
        </p>
      )}
    </div>
  );
}

// ====================
// ROUND RESULT PHASE
// ====================
function RoundResultPhase({
  winnerName,
  submission,
}: {
  winnerName: string;
  submission: WhiteCard[];
}) {
  return (
    <div className="text-center py-4">
      <p className="text-xs text-muted uppercase tracking-[0.15em] font-semibold mb-1">Round Winner</p>
      <p className="text-2xl font-black text-foreground mb-4 animate-bounce-in">
        {winnerName}
      </p>
      <div className="card-white inline-block !p-5 border-2 border-success shadow-[0_0_20px_rgba(107,191,163,0.2)] animate-winner-reveal">
        {submission.map((card, i) => (
          <span key={card.id} className="text-card-white-text text-lg">
            {i > 0 && <span className="text-muted mx-1">&</span>}
            {card.text}
          </span>
        ))}
      </div>
      <p className="text-muted text-sm mt-5 animate-pulse-soft">
        Next round starting soon...
      </p>
    </div>
  );
}

// ====================
// GAME OVER
// ====================
function GameOverView({
  room,
  roundResult,
  gameOver,
  isOwner,
  leaving,
  onPlayAgain,
  onLeave,
}: {
  room: Room;
  roundResult: { winnerId: string; winnerName: string; submission: WhiteCard[]; scores: Record<string, number>; isGameOver: boolean } | null;
  gameOver: { finalScores: Record<string, number>; winnerId: string; winnerName: string } | null;
  isOwner: boolean;
  leaving: boolean;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
  const scores = gameOver?.finalScores ?? roundResult?.scores ?? {};
  const winnerName = gameOver?.winnerName ?? roundResult?.winnerName ?? 'Unknown';

  const ranked = [...room.players].sort(
    (a, b) => (scores[b.id] ?? b.score) - (scores[a.id] ?? a.score)
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 animate-fade-in">
      {/* Trophy */}
      <div className="animate-bounce-in">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(240,194,127,.15)' }}>
          <svg className="w-10 h-10" style={{ color: 'var(--pearl)' }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
            <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
          </svg>
        </div>
      </div>

      <div className="text-center">
        <h1 className="font-display text-3xl font-black tracking-tight text-cream">Game Over!</h1>
        <p className="text-xl text-accent font-bold mt-1">{winnerName} wins!</p>
      </div>

      {/* Winning card if available */}
      {roundResult?.submission && (
        <div className="card-white inline-block !p-4 border-2 border-accent shadow-[0_0_16px_rgba(240,194,127,0.15)] animate-fade-in-up">
          {roundResult.submission.map((card, i) => (
            <span key={card.id} className="text-card-white-text">
              {i > 0 && <span className="text-muted mx-1">&</span>}
              {card.text}
            </span>
          ))}
        </div>
      )}

      {/* Final Scores */}
      <div className="w-full max-w-sm">
        <h2 className="text-xs text-muted uppercase tracking-[0.15em] font-semibold mb-3 text-center">Final Scores</h2>
        <div className="flex flex-col gap-2">
          {ranked.map((p, i) => {
            const playerScore = scores[p.id] ?? p.score;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-xl px-4 py-3.5 transition-all animate-fade-in-up ${
                  i === 0
                    ? 'border-2'
                    : 'border'
                }`}
                style={{
                  background: i === 0 ? 'rgba(240,194,127,.1)' : i === 1 ? 'rgba(26,82,118,.3)' : 'rgba(13,27,62,.4)',
                  borderColor: i === 0 ? 'var(--pearl)' : i === 1 ? 'rgba(245,230,202,.1)' : 'rgba(245,230,202,.06)',
                  animationDelay: `${i * 100}ms`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-black text-lg w-7 text-center ${
                    i === 0 ? '' : 'text-muted'
                  }`} style={i === 0 ? { color: 'var(--pearl)' } : undefined}>
                    {i === 0 ? (
                      <svg className="w-6 h-6 mx-auto" style={{ color: 'var(--pearl)' }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                        <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
                      </svg>
                    ) : (
                      `#${i + 1}`
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className={`font-semibold text-sm truncate block max-w-[140px] ${
                      i === 0 ? 'text-cream' : 'text-muted'
                    }`}>
                      {p.name}
                    </span>
                    {p.isBot && <span className="text-[10px] text-muted">(Bot)</span>}
                  </div>
                </div>
                <span className={`text-2xl font-black tabular-nums ${
                  i === 0 ? '' : 'text-cream'
                }`} style={i === 0 ? { color: 'var(--pearl)' } : undefined}>
                  {playerScore}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {isOwner && (
          <button
            onClick={onPlayAgain}
            className="btn-primary w-full text-lg"
          >
            Play Again
          </button>
        )}
        <button
          onClick={onLeave}
          disabled={leaving}
          className="btn-danger w-full"
        >
          {leaving ? 'Leaving...' : 'Leave Game'}
        </button>
      </div>
    </div>
  );
}

/**
 * Format black card text: replace underscores with styled blank spans.
 */
function formatBlackCard(text: string): string {
  return text.replace(/_+/g, '<span class="blank">&nbsp;</span>');
}
