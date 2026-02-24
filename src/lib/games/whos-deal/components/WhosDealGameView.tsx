'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Room, Player } from '@/lib/types';
import type { Card, Suit, TrickCard } from '../types';
import { getEffectiveSuit, getPlayableCards } from '../helpers';
import { TRICK_RESULT_DISPLAY_MS } from '../constants';

// ==================== TYPES ====================

export interface ClientWhosDealState {
  teams: {
    a: { playerIds: [string, string]; score: number };
    b: { playerIds: [string, string]; score: number };
  };
  seats: string[];
  targetScore: number;
  dealerSeatIndex: number;
  phase: 'playing' | 'game_over';
  winningTeam: 'a' | 'b' | null;
  round: ClientEuchreRound | null;
}

export interface ClientEuchreRound {
  trumpPhase: 'round1' | 'round2' | 'dealer_discard' | 'playing' | 'round_over';
  trumpSuit: Suit | null;
  callingPlayerId: string | null;
  callingTeam: 'a' | 'b' | null;
  goingAlone: boolean;
  alonePlayerId: string | null;
  inactivePartnerSeatIndex: number | null;
  faceUpCard: Card;
  dealerDiscarded: boolean;
  currentTurnSeatIndex: number;
  passedPlayers: string[];
  currentTrick: TrickCard[];
  trickLeadSeatIndex: number;
  tricksWon: { a: number; b: number };
  tricksPlayed: number;
  dealerPickedUp: Card | null;
  myHand: Card[];
  handCounts: Record<string, number>;
}

interface WhosDealGameViewProps {
  room: Room;
  gameState: ClientWhosDealState;
  playerId: string | null;
  isOwner: boolean;
  leaving: boolean;
  trickWinner: { seatIndex: number; team: 'a' | 'b' } | null;
  roundSummary: {
    callingTeam: 'a' | 'b';
    tricksWon: { a: number; b: number };
    pointsAwarded: { a: number; b: number };
    scores: { a: number; b: number };
    isGameOver: boolean;
  } | null;
  onCallTrump: (payload: { pickUp?: boolean; suit?: Suit; goAlone?: boolean }) => void;
  onPassTrump: () => void;
  onDiscard: (cardId: string) => void;
  onPlayCard: (cardId: string) => void;
  onPlayAgain: () => void;
  onLeave: () => void;
}

// ==================== HELPERS ====================

const SUIT_SYMBOL: Record<Suit, string> = {
  spades: '\u2660',
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
};

const SUIT_COLOR: Record<Suit, 'red' | 'black'> = {
  spades: 'black',
  hearts: 'red',
  diamonds: 'red',
  clubs: 'black',
};

type Position = 'bottom' | 'left' | 'top' | 'right';

interface SeatMapping {
  position: Position;
  seatIndex: number;
}

function getSeatMappings(mySeatIndex: number): SeatMapping[] {
  return [
    { position: 'bottom', seatIndex: mySeatIndex },
    { position: 'left', seatIndex: (mySeatIndex + 1) % 4 },
    { position: 'top', seatIndex: (mySeatIndex + 2) % 4 },
    { position: 'right', seatIndex: (mySeatIndex + 3) % 4 },
  ];
}

function getTeamForSeat(seatIndex: number): 'a' | 'b' {
  return seatIndex === 0 || seatIndex === 2 ? 'a' : 'b';
}

function getPositionForSeat(seatIndex: number, mySeatIndex: number): Position {
  const diff = ((seatIndex - mySeatIndex) + 4) % 4;
  return (['bottom', 'left', 'top', 'right'] as const)[diff];
}

// ==================== MAIN COMPONENT ====================

export default function WhosDealGameView({
  room,
  gameState,
  playerId,
  isOwner,
  leaving,
  trickWinner,
  roundSummary,
  onCallTrump,
  onPassTrump,
  onDiscard,
  onPlayCard,
  onPlayAgain,
  onLeave,
}: WhosDealGameViewProps) {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [goAlone, setGoAlone] = useState(false);

  const round = gameState.round;
  const mySeatIndex = playerId ? gameState.seats.indexOf(playerId) : -1;
  const myTeam = mySeatIndex >= 0 ? getTeamForSeat(mySeatIndex) : null;
  const isGameOver = gameState.phase === 'game_over';

  // Reset selection on phase changes
  useEffect(() => {
    setSelectedCard(null);
    setGoAlone(false);
  }, [round?.trumpPhase, round?.tricksPlayed]);

  // Game Over Screen
  if (isGameOver) {
    return (
      <GameOverScreen
        gameState={gameState}
        room={room}
        myTeam={myTeam}
        isOwner={isOwner}
        leaving={leaving}
        onPlayAgain={onPlayAgain}
        onLeave={onLeave}
      />
    );
  }

  if (!round) return null;

  const isMyTurn = mySeatIndex === round.currentTurnSeatIndex;
  const isInactivePartner = round.goingAlone && mySeatIndex === round.inactivePartnerSeatIndex;
  const seatMappings = mySeatIndex >= 0 ? getSeatMappings(mySeatIndex) : [];

  // Get playable cards for follow-suit enforcement
  const ledSuit = round.currentTrick.length > 0 && round.trumpSuit
    ? getEffectiveSuit(round.currentTrick[0].card, round.trumpSuit)
    : null;
  const playableCards = round.trumpPhase === 'playing' && round.trumpSuit
    ? getPlayableCards(round.myHand, ledSuit, round.trumpSuit)
    : round.myHand;
  const playableIds = new Set(playableCards.map(c => c.id));

  // Determine what the current player is doing (for waiting messages)
  const currentTurnPlayer = room.players.find(
    p => p.id === gameState.seats[round.currentTurnSeatIndex]
  );

  return (
    <div className="flex min-h-dvh flex-col p-3 pb-4 max-w-lg mx-auto w-full">
      {/* Scoreboard */}
      <Scoreboard
        teams={gameState.teams}
        targetScore={gameState.targetScore}
        tricksWon={round.tricksWon}
        myTeam={myTeam}
        trumpPhase={round.trumpPhase}
      />

      {/* Table Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-2">
        {/* Round Summary Overlay */}
        {roundSummary && round.trumpPhase === 'round_over' && (
          <RoundSummaryOverlay
            summary={roundSummary}
            teams={gameState.teams}
            room={room}
            seats={gameState.seats}
          />
        )}

        {/* Opponent positions (top, left, right) */}
        <div className="w-full max-w-sm relative" style={{ minHeight: '280px' }}>
          {seatMappings
            .filter(s => s.position !== 'bottom')
            .map(({ position, seatIndex }) => {
              const player = room.players.find(p => p.id === gameState.seats[seatIndex]);
              const isActive = seatIndex === round.currentTurnSeatIndex;
              const isDealer = seatIndex === gameState.dealerSeatIndex;
              const isInactive = round.goingAlone && seatIndex === round.inactivePartnerSeatIndex;
              const hasPassed = round.passedPlayers.includes(gameState.seats[seatIndex]);
              const cardCount = round.handCounts[gameState.seats[seatIndex]] ?? 0;
              const trickCard = round.currentTrick.find(tc => tc.seatIndex === seatIndex);
              const isWinner = trickWinner?.seatIndex === seatIndex;

              return (
                <OpponentSeat
                  key={seatIndex}
                  player={player ?? null}
                  position={position}
                  seatIndex={seatIndex}
                  isActive={isActive}
                  isDealer={isDealer}
                  isInactive={isInactive}
                  hasPassed={hasPassed}
                  cardCount={cardCount}
                  trickCard={trickCard ?? null}
                  isWinner={isWinner}
                  team={getTeamForSeat(seatIndex)}
                />
              );
            })}

          {/* Center area: trick cards for bottom player + face-up card + trump indicator */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              {/* Trump calling: face-up card */}
              {(round.trumpPhase === 'round1' || round.trumpPhase === 'round2') && (
                <FaceUpCardDisplay
                  card={round.faceUpCard}
                  dimmed={round.trumpPhase === 'round2'}
                />
              )}

              {/* Trick area */}
              {round.trumpPhase === 'playing' && round.currentTrick.length > 0 && (
                <TrickArea
                  trick={round.currentTrick}
                  mySeatIndex={mySeatIndex}
                  trickWinner={trickWinner}
                />
              )}

              {/* Trump indicator */}
              {round.trumpSuit && round.trumpPhase === 'playing' && round.currentTrick.length === 0 && !trickWinner && (
                <TrumpIndicator
                  trumpSuit={round.trumpSuit}
                  callerName={room.players.find(p => p.id === round.callingPlayerId)?.name ?? ''}
                  goingAlone={round.goingAlone}
                />
              )}

              {/* Bottom player's trick card */}
              {round.trumpPhase === 'playing' && (() => {
                const myTrickCard = round.currentTrick.find(tc => tc.seatIndex === mySeatIndex);
                if (!myTrickCard) return null;
                return (
                  <div className="mt-1">
                    <PlayingCard card={myTrickCard.card} size="trick" winning={trickWinner?.seatIndex === mySeatIndex} />
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Trump Calling UI */}
        {(round.trumpPhase === 'round1' || round.trumpPhase === 'round2') && (
          <TrumpCallingUI
            round={round}
            isMyTurn={isMyTurn}
            mySeatIndex={mySeatIndex}
            dealerSeatIndex={gameState.dealerSeatIndex}
            currentTurnPlayer={currentTurnPlayer ?? null}
            goAlone={goAlone}
            onGoAloneToggle={() => setGoAlone(v => !v)}
            onCallTrump={onCallTrump}
            onPassTrump={onPassTrump}
          />
        )}

        {/* Dealer Discard UI */}
        {round.trumpPhase === 'dealer_discard' && !isMyTurn && (
          <p className="text-sm text-muted animate-pulse-soft mt-2">
            {currentTurnPlayer?.name ?? 'Dealer'} is discarding...
          </p>
        )}

        {/* Playing status */}
        {round.trumpPhase === 'playing' && !isMyTurn && !isInactivePartner && (
          <p className="text-sm text-muted animate-pulse-soft mt-2">
            {currentTurnPlayer?.isBot
              ? `${currentTurnPlayer.name} is thinking...`
              : `Waiting for ${currentTurnPlayer?.name ?? '...'}...`}
          </p>
        )}

        {/* Inactive partner message */}
        {isInactivePartner && round.trumpPhase === 'playing' && (
          <p className="text-sm text-accent font-semibold mt-2">
            Your partner is going alone
          </p>
        )}

        {/* Trump indicator (persistent during play) */}
        {round.trumpSuit && (round.trumpPhase === 'playing' || round.trumpPhase === 'dealer_discard') && (
          <div className="mt-2">
            <TrumpBadge
              trumpSuit={round.trumpSuit}
              callerName={room.players.find(p => p.id === round.callingPlayerId)?.name ?? ''}
              goingAlone={round.goingAlone}
            />
          </div>
        )}
      </div>

      {/* Player Hand */}
      {!isInactivePartner ? (
        <PlayerHand
          hand={round.myHand}
          playableIds={playableIds}
          selectedCard={selectedCard}
          isMyTurn={isMyTurn}
          phase={round.trumpPhase}
          dealerPickedUp={round.dealerPickedUp}
          onSelect={setSelectedCard}
          onConfirm={() => {
            if (!selectedCard) return;
            if (round.trumpPhase === 'dealer_discard') {
              onDiscard(selectedCard);
            } else if (round.trumpPhase === 'playing') {
              onPlayCard(selectedCard);
            }
            setSelectedCard(null);
          }}
        />
      ) : (
        <div className="text-center py-4">
          <p className="text-muted text-sm">Your partner is going alone this round</p>
        </div>
      )}

      {/* Leave button */}
      <button
        onClick={onLeave}
        disabled={leaving}
        className="w-full text-xs text-muted hover:text-danger transition-colors py-2 mt-1"
      >
        {leaving ? 'Leaving...' : 'Leave World'}
      </button>
    </div>
  );
}

// ==================== SCOREBOARD ====================

function Scoreboard({
  teams,
  targetScore,
  tricksWon,
  myTeam,
  trumpPhase,
}: {
  teams: ClientWhosDealState['teams'];
  targetScore: number;
  tricksWon: { a: number; b: number };
  myTeam: 'a' | 'b' | null;
  trumpPhase: string;
}) {
  const showTricks = trumpPhase === 'playing' || trumpPhase === 'round_over';

  return (
    <div className="flex items-center justify-between rounded-xl bg-surface border border-border px-3 py-2 mb-2 animate-fade-in">
      <div className="flex items-center gap-3">
        <TeamScore
          label="A"
          score={teams.a.score}
          color="blue"
          isMyTeam={myTeam === 'a'}
        />
        <span className="text-muted text-xs font-bold">vs</span>
        <TeamScore
          label="B"
          score={teams.b.score}
          color="orange"
          isMyTeam={myTeam === 'b'}
        />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        {showTricks && (
          <span>
            Tricks {tricksWon.a}-{tricksWon.b}
          </span>
        )}
        <span>to {targetScore}</span>
      </div>
    </div>
  );
}

function TeamScore({ label, score, color, isMyTeam }: {
  label: string;
  score: number;
  color: 'blue' | 'orange';
  isMyTeam: boolean;
}) {
  const colorClasses = color === 'blue'
    ? 'text-blue-400 border-blue-500/30'
    : 'text-orange-400 border-orange-500/30';

  return (
    <div className={`flex items-center gap-1.5 ${isMyTeam ? 'font-black' : ''}`}>
      <div className={`w-2.5 h-2.5 rounded-full ${color === 'blue' ? 'bg-blue-500' : 'bg-orange-500'}`} />
      <span className={`text-sm font-bold ${colorClasses}`}>{label}</span>
      <span className="text-lg font-black tabular-nums text-foreground">{score}</span>
      {isMyTeam && <span className="text-[9px] text-accent font-semibold">YOU</span>}
    </div>
  );
}

// ==================== OPPONENT SEAT ====================

function OpponentSeat({
  player,
  position,
  seatIndex,
  isActive,
  isDealer,
  isInactive,
  hasPassed,
  cardCount,
  trickCard,
  isWinner,
  team,
}: {
  player: Player | null;
  position: Position;
  seatIndex: number;
  isActive: boolean;
  isDealer: boolean;
  isInactive: boolean;
  hasPassed: boolean;
  cardCount: number;
  trickCard: TrickCard | null;
  isWinner: boolean;
  team: 'a' | 'b';
}) {
  const positionStyles: Record<Position, string> = {
    top: 'top-0 left-1/2 -translate-x-1/2 flex-col items-center',
    left: 'left-0 top-1/2 -translate-y-1/2 flex-col items-center',
    right: 'right-0 top-1/2 -translate-y-1/2 flex-col items-center',
    bottom: '',
  };

  const teamColor = team === 'a' ? 'text-blue-400' : 'text-orange-400';
  const teamBorder = team === 'a' ? 'border-blue-500/30' : 'border-orange-500/30';

  return (
    <div className={`absolute flex ${positionStyles[position]} ${isInactive ? 'opacity-30' : ''}`}>
      {/* Player name + indicators */}
      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${teamBorder} bg-surface/80 backdrop-blur-sm mb-1 ${isActive ? 'ring-1 ring-accent shadow-[0_0_8px_rgba(139,92,246,0.3)]' : ''}`}>
        {isDealer && (
          <span className="text-[10px] bg-warning/20 text-warning rounded px-1 font-bold">D</span>
        )}
        <span className={`text-xs font-semibold truncate max-w-[70px] ${teamColor}`}>
          {player?.name ?? 'Player'}
        </span>
        {player?.isBot && <span className="text-[9px] text-muted">(Bot)</span>}
        {hasPassed && (
          <span className="text-[9px] text-muted italic">Pass</span>
        )}
      </div>

      {/* Card backs or inactive message */}
      {isInactive ? (
        <span className="text-[10px] text-muted italic">Sitting out</span>
      ) : (
        <div className={`flex ${position === 'top' ? 'flex-row' : 'flex-row'} gap-0.5`}>
          {Array.from({ length: Math.min(cardCount, 5) }).map((_, i) => (
            <div key={i} className="wd-card wd-card-back" style={{ width: 28, height: 40, marginLeft: i > 0 ? -8 : 0 }} />
          ))}
        </div>
      )}

      {/* Trick card */}
      {trickCard && (
        <div className={`mt-1 ${isWinner ? '' : ''}`}>
          <PlayingCard card={trickCard.card} size="trick" winning={isWinner} />
        </div>
      )}
    </div>
  );
}

// ==================== PLAYING CARD ====================

function PlayingCard({
  card,
  size = 'normal',
  winning = false,
}: {
  card: Card;
  size?: 'normal' | 'trick' | 'hand' | 'large';
  winning?: boolean;
}) {
  const color = SUIT_COLOR[card.suit];
  const symbol = SUIT_SYMBOL[card.suit];

  const sizeClass = size === 'trick' ? 'wd-card-trick' : size === 'large' ? '' : '';

  return (
    <div className={`wd-card wd-card-face ${color} ${sizeClass} ${winning ? 'wd-card-trick winning' : ''} ${size === 'trick' ? 'wd-card-played' : ''}`}>
      <span className="text-xs font-black leading-none">{card.rank}</span>
      <span className="text-sm leading-none">{symbol}</span>
    </div>
  );
}

// ==================== FACE-UP CARD (center, for trump calling) ====================

function FaceUpCardDisplay({ card, dimmed }: { card: Card; dimmed: boolean }) {
  const color = SUIT_COLOR[card.suit];
  const symbol = SUIT_SYMBOL[card.suit];

  return (
    <div className={`wd-card wd-card-face ${color} animate-bounce-in ${dimmed ? 'opacity-40' : ''}`}
      style={{ width: 60, height: 84 }}
    >
      <span className="text-base font-black leading-none">{card.rank}</span>
      <span className="text-xl leading-none">{symbol}</span>
    </div>
  );
}

// ==================== TRICK AREA ====================

function TrickArea({
  trick,
  mySeatIndex,
  trickWinner,
}: {
  trick: TrickCard[];
  mySeatIndex: number;
  trickWinner: { seatIndex: number; team: 'a' | 'b' } | null;
}) {
  // Position trick cards based on seat positions relative to player
  return (
    <div className="relative" style={{ width: 120, height: 90 }}>
      {trick.filter(tc => tc.seatIndex !== mySeatIndex).map((tc) => {
        const pos = getPositionForSeat(tc.seatIndex, mySeatIndex);
        const isWinner = trickWinner?.seatIndex === tc.seatIndex;

        const posStyle: Record<Position, React.CSSProperties> = {
          top: { position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' },
          left: { position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' },
          right: { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' },
          bottom: { position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)' },
        };

        return (
          <div key={tc.card.id} style={posStyle[pos]}>
            <PlayingCard card={tc.card} size="trick" winning={isWinner} />
          </div>
        );
      })}
    </div>
  );
}

// ==================== TRUMP CALLING UI ====================

function TrumpCallingUI({
  round,
  isMyTurn,
  mySeatIndex,
  dealerSeatIndex,
  currentTurnPlayer,
  goAlone,
  onGoAloneToggle,
  onCallTrump,
  onPassTrump,
}: {
  round: ClientEuchreRound;
  isMyTurn: boolean;
  mySeatIndex: number;
  dealerSeatIndex: number;
  currentTurnPlayer: Player | null;
  goAlone: boolean;
  onGoAloneToggle: () => void;
  onCallTrump: (payload: { pickUp?: boolean; suit?: Suit; goAlone?: boolean }) => void;
  onPassTrump: () => void;
}) {
  const [selectedSuit, setSelectedSuit] = useState<Suit | null>(null);

  if (!isMyTurn) {
    // Waiting message
    const isStickTheDealer =
      round.trumpPhase === 'round2' &&
      round.currentTurnSeatIndex === dealerSeatIndex &&
      round.passedPlayers.length >= 3;

    return (
      <div className="text-center mt-3 animate-fade-in">
        <p className="text-sm text-muted">
          {isStickTheDealer
            ? `${currentTurnPlayer?.name ?? 'Dealer'} must call trump`
            : `Waiting for ${currentTurnPlayer?.name ?? '...'}...`}
        </p>
      </div>
    );
  }

  if (round.trumpPhase === 'round1') {
    return (
      <div className="flex flex-col items-center gap-3 mt-3 animate-fade-in-up">
        <p className="text-xs text-muted">
          Trump would be <span className={`font-bold ${SUIT_COLOR[round.faceUpCard.suit] === 'red' ? 'text-red-400' : 'text-foreground'}`}>
            {SUIT_SYMBOL[round.faceUpCard.suit]} {round.faceUpCard.suit}
          </span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onCallTrump({ pickUp: true, goAlone })}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white hover:bg-accent-hover active:scale-[0.97] transition-all"
          >
            Order it up
          </button>
          <button
            onClick={onPassTrump}
            className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-muted hover:bg-surface-light active:scale-[0.97] transition-all"
          >
            Pass
          </button>
        </div>
        <GoAloneToggle checked={goAlone} onToggle={onGoAloneToggle} />
      </div>
    );
  }

  // Round 2
  const isStuck =
    mySeatIndex === dealerSeatIndex && round.passedPlayers.length >= 3;
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

  return (
    <div className="flex flex-col items-center gap-3 mt-3 animate-fade-in-up">
      <p className="text-xs text-muted">
        Name trump (cannot pick{' '}
        <span className={`font-bold ${SUIT_COLOR[round.faceUpCard.suit] === 'red' ? 'text-red-400' : 'text-foreground'}`}>
          {SUIT_SYMBOL[round.faceUpCard.suit]}
        </span>
        )
      </p>
      <div className="flex gap-2">
        {suits.map(suit => {
          const disabled = suit === round.faceUpCard.suit;
          const isSelected = selectedSuit === suit;
          const sColor = SUIT_COLOR[suit];

          return (
            <button
              key={suit}
              onClick={() => !disabled && setSelectedSuit(isSelected ? null : suit)}
              disabled={disabled}
              className={`w-14 h-14 rounded-xl text-2xl font-bold transition-all ${
                disabled
                  ? 'bg-surface border border-border text-muted/30 cursor-not-allowed'
                  : isSelected
                    ? 'bg-accent/20 border-2 border-accent shadow-[0_0_10px_rgba(139,92,246,0.3)]'
                    : `bg-surface-light border border-border hover:border-border-light ${sColor === 'red' ? 'text-red-400' : 'text-foreground'}`
              }`}
            >
              {SUIT_SYMBOL[suit]}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        {selectedSuit && (
          <button
            onClick={() => {
              onCallTrump({ suit: selectedSuit, goAlone });
              setSelectedSuit(null);
            }}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white hover:bg-accent-hover active:scale-[0.97] transition-all"
          >
            Call {SUIT_SYMBOL[selectedSuit]}
          </button>
        )}
        {!isStuck && (
          <button
            onClick={onPassTrump}
            className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-muted hover:bg-surface-light active:scale-[0.97] transition-all"
          >
            Pass
          </button>
        )}
      </div>
      {isStuck && !selectedSuit && (
        <p className="text-xs text-warning font-semibold">You must call trump (Stick the Dealer)</p>
      )}
      <GoAloneToggle checked={goAlone} onToggle={onGoAloneToggle} />
    </div>
  );
}

function GoAloneToggle({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-all ${
        checked
          ? 'bg-accent/20 text-accent border border-accent/40'
          : 'text-muted hover:text-foreground border border-transparent'
      }`}
    >
      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
        checked ? 'border-accent bg-accent' : 'border-muted'
      }`}>
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      Go Alone
    </button>
  );
}

// ==================== TRUMP INDICATOR ====================

function TrumpIndicator({ trumpSuit, callerName, goingAlone }: {
  trumpSuit: Suit;
  callerName: string;
  goingAlone: boolean;
}) {
  const color = SUIT_COLOR[trumpSuit];

  return (
    <div className="flex flex-col items-center gap-0.5 animate-fade-in">
      <span className={`text-3xl ${color === 'red' ? 'text-red-400' : 'text-foreground'}`}>
        {SUIT_SYMBOL[trumpSuit]}
      </span>
      <span className="text-[10px] text-muted">{callerName} called trump</span>
      {goingAlone && <span className="text-[10px] text-accent font-semibold">Going Alone</span>}
    </div>
  );
}

function TrumpBadge({ trumpSuit, callerName, goingAlone }: {
  trumpSuit: Suit;
  callerName: string;
  goingAlone: boolean;
}) {
  const color = SUIT_COLOR[trumpSuit];

  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-surface border border-border px-2.5 py-1 text-xs">
      <span className={`text-base ${color === 'red' ? 'text-red-400' : 'text-foreground'}`}>
        {SUIT_SYMBOL[trumpSuit]}
      </span>
      <span className="text-muted">Trump</span>
      {goingAlone && <span className="text-accent font-semibold">Alone</span>}
    </div>
  );
}

// ==================== PLAYER HAND ====================

function PlayerHand({
  hand,
  playableIds,
  selectedCard,
  isMyTurn,
  phase,
  dealerPickedUp,
  onSelect,
  onConfirm,
}: {
  hand: Card[];
  playableIds: Set<string>;
  selectedCard: string | null;
  isMyTurn: boolean;
  phase: string;
  dealerPickedUp: Card | null;
  onSelect: (cardId: string | null) => void;
  onConfirm: () => void;
}) {
  const canInteract = isMyTurn && (phase === 'playing' || phase === 'dealer_discard');
  const isDiscard = phase === 'dealer_discard';

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Instruction */}
      {canInteract && (
        <p className="text-xs text-muted animate-fade-in">
          {isDiscard ? 'Choose a card to discard' : 'Select a card to play'}
        </p>
      )}

      {/* Cards */}
      <div className="flex justify-center gap-1.5 overflow-x-auto pb-1 px-1 w-full" style={{ scrollSnapType: 'x mandatory' }}>
        {hand.map((card) => {
          const isPlayable = isDiscard || playableIds.has(card.id);
          const isSelected = selectedCard === card.id;
          const isDimmed = canInteract && !isDiscard && !isPlayable;
          const isNew = dealerPickedUp?.id === card.id;
          const color = SUIT_COLOR[card.suit];

          return (
            <button
              key={card.id}
              onClick={() => {
                if (!canInteract) return;
                if (!isDiscard && !isPlayable) return;
                onSelect(isSelected ? null : card.id);
              }}
              disabled={!canInteract || isDimmed}
              className={`wd-card wd-card-face wd-card-hand ${color} ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''} ${isNew ? 'ring-2 ring-accent' : ''}`}
              style={{ scrollSnapAlign: 'start' }}
            >
              <span className="text-sm font-black leading-none">{card.rank}</span>
              <span className="text-lg leading-none">{SUIT_SYMBOL[card.suit]}</span>
              {isNew && (
                <span className="absolute -top-1 -right-1 text-[8px] bg-accent text-white rounded px-0.5 font-bold">
                  NEW
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Confirm button */}
      {selectedCard && canInteract && (
        <button
          onClick={onConfirm}
          className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white hover:bg-accent-hover active:scale-[0.97] transition-all animate-fade-in-up"
        >
          {isDiscard ? 'Discard' : 'Play'}
        </button>
      )}
    </div>
  );
}

// ==================== ROUND SUMMARY OVERLAY ====================

function RoundSummaryOverlay({
  summary,
  teams,
  room,
  seats,
}: {
  summary: {
    callingTeam: 'a' | 'b';
    tricksWon: { a: number; b: number };
    pointsAwarded: { a: number; b: number };
    scores: { a: number; b: number };
    isGameOver: boolean;
  };
  teams: ClientWhosDealState['teams'];
  room: Room;
  seats: string[];
}) {
  const aPoints = summary.pointsAwarded.a;
  const bPoints = summary.pointsAwarded.b;
  const winningTeam = aPoints > 0 ? 'a' : 'b';
  const points = aPoints > 0 ? aPoints : bPoints;
  const isEuchre = winningTeam !== summary.callingTeam;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl animate-fade-in">
      <div className="bg-surface border border-border rounded-2xl p-5 text-center max-w-xs w-full animate-scale-in">
        <p className="text-lg font-black text-foreground mb-1">
          {isEuchre ? 'Euchre!' : points >= 4 ? 'Alone Sweep!' : points >= 2 ? 'March!' : 'Round Over'}
        </p>
        <p className="text-sm text-muted mb-3">
          Team {winningTeam.toUpperCase()} +{points} point{points > 1 ? 's' : ''}
        </p>
        <div className="flex justify-center gap-4 text-sm">
          <div>
            <span className="text-blue-400 font-bold">Team A</span>
            <span className="text-foreground font-black ml-1">{summary.scores.a}</span>
          </div>
          <div>
            <span className="text-orange-400 font-bold">Team B</span>
            <span className="text-foreground font-black ml-1">{summary.scores.b}</span>
          </div>
        </div>
        <p className="text-xs text-muted mt-2">
          Tricks: A {summary.tricksWon.a} - B {summary.tricksWon.b}
        </p>
      </div>
    </div>
  );
}

// ==================== GAME OVER SCREEN ====================

function GameOverScreen({
  gameState,
  room,
  myTeam,
  isOwner,
  leaving,
  onPlayAgain,
  onLeave,
}: {
  gameState: ClientWhosDealState;
  room: Room;
  myTeam: 'a' | 'b' | null;
  isOwner: boolean;
  leaving: boolean;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
  const winner = gameState.winningTeam;
  const didWin = winner === myTeam;
  const teamAScore = gameState.teams.a.score;
  const teamBScore = gameState.teams.b.score;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 animate-fade-in">
      <div className="rounded-2xl bg-surface border border-border p-8 text-center max-w-sm w-full animate-scale-in">
        <div className={`text-5xl mb-3 ${didWin ? 'animate-bounce-in' : ''}`}>
          {didWin ? '🎉' : '😔'}
        </div>
        <h2 className="text-2xl font-black text-foreground mb-1">
          {didWin ? 'You Win!' : 'You Lose'}
        </h2>
        <p className={`text-lg font-bold mb-4 ${winner === 'a' ? 'text-blue-400' : 'text-orange-400'}`}>
          Team {winner?.toUpperCase()} Wins!
        </p>

        <div className="flex justify-center gap-6 mb-6">
          <div className="text-center">
            <p className="text-xs text-blue-400 font-bold mb-0.5">Team A</p>
            <p className="text-3xl font-black tabular-nums">{teamAScore}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-orange-400 font-bold mb-0.5">Team B</p>
            <p className="text-3xl font-black tabular-nums">{teamBScore}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {isOwner && (
            <button
              onClick={onPlayAgain}
              className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-bold text-white hover:bg-accent-hover active:scale-[0.98] transition-all"
            >
              Play Again
            </button>
          )}
          <button
            onClick={onLeave}
            disabled={leaving}
            className="w-full rounded-xl border border-danger/30 px-6 py-3 font-semibold text-danger hover:bg-danger/10 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {leaving ? 'Leaving...' : 'Leave World'}
          </button>
        </div>
      </div>
    </div>
  );
}
