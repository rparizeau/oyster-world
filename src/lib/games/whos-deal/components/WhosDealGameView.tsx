'use client';

import { useState, useEffect } from 'react';
import type { Room, Player } from '@/lib/types';
import type { Card, Suit, TrickCard } from '../types';
import { getEffectiveSuit, getPlayableCards } from '../helpers';

// ==================== TYPES ====================

export interface ClientWhosDealState {
  teams: {
    a: { playerIds: [string, string]; score: number };
    b: { playerIds: [string, string]; score: number };
  };
  seats: string[];
  targetScore: number;
  dealerSeatIndex: number;
  roundsPlayed: number;
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

const SUIT_NAME: Record<Suit, string> = {
  spades: 'Spades',
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clubs',
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

function displayName(player: Player | null | undefined): string {
  if (!player) return 'Player';
  return player.name.replace(/^Bot\s+/i, '');
}

// ==================== MAIN COMPONENT ====================

export default function WhosDealGameView({
  room,
  gameState,
  playerId,
  isOwner,
  trickWinner,
  roundSummary,
  onCallTrump,
  onPassTrump,
  onDiscard,
  onPlayCard,
  onPlayAgain,
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
        myTeam={myTeam}
        isOwner={isOwner}
        onPlayAgain={onPlayAgain}
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

  // Caller name for trump badge
  const callerName = displayName(room.players.find(p => p.id === round.callingPlayerId));

  return (
    <div className="flex flex-col max-w-lg mx-auto w-full overflow-x-hidden" style={{ minHeight: 0, flex: 1 }}>
      {/* Scoreboard */}
      <Scoreboard
        teams={gameState.teams}
        targetScore={gameState.targetScore}
        tricksWon={round.tricksWon}
        tricksPlayed={round.tricksPlayed}
        trumpPhase={round.trumpPhase}
        trumpSuit={round.trumpSuit}
        callerName={callerName}
        roundsPlayed={gameState.roundsPlayed}
      />

      {/* Table Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-3 my-2">
        {/* Round Summary Overlay */}
        {roundSummary && round.trumpPhase === 'round_over' && (
          <RoundSummaryOverlay summary={roundSummary} />
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
              const isMe = seatIndex === mySeatIndex;
              const wonTrick = round.trumpPhase === 'playing' && trickWinner?.seatIndex === seatIndex;

              return (
                <OpponentSeat
                  key={seatIndex}
                  player={player ?? null}
                  position={position}
                  isActive={isActive}
                  isDealer={isDealer}
                  isInactive={isInactive}
                  hasPassed={hasPassed}
                  cardCount={cardCount}
                  trickCard={trickCard ?? null}
                  isWinner={isWinner}
                  team={getTeamForSeat(seatIndex)}
                  isMe={isMe}
                  wonTrick={wonTrick}
                  trumpPhase={round.trumpPhase}
                />
              );
            })}

          {/* Center area */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              {/* Trump calling: face-up card (shown in center during Round 1 & 2) */}
              {(round.trumpPhase === 'round1' || round.trumpPhase === 'round2') && (
                <FaceUpCardDisplay
                  card={round.faceUpCard}
                  dimmed={round.trumpPhase === 'round2'}
                />
              )}

              {/* Trick area - felt circle */}
              {round.trumpPhase === 'playing' && (
                <TrickArea
                  trick={round.currentTrick}
                  mySeatIndex={mySeatIndex}
                  trickWinner={trickWinner}
                />
              )}

              {/* Trump indicator when trick area empty */}
              {round.trumpSuit && round.trumpPhase === 'playing' && round.currentTrick.length === 0 && !trickWinner && (
                <TrumpIndicator
                  trumpSuit={round.trumpSuit}
                  callerName={callerName}
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

        {/* Trump Calling UI — fixed-height center content area */}
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

        {/* Dealer Discard: non-dealer sees waiting message */}
        {round.trumpPhase === 'dealer_discard' && !isMyTurn && (
          <div className="h-8 flex items-center justify-center">
            <span className="text-sm" style={{ color: 'rgba(232,230,240,.35)' }}>Dealer is discarding...</span>
          </div>
        )}

        {/* Status Text Area — fixed h-8 */}
        <StatusText
          round={round}
          isMyTurn={isMyTurn}
          isInactivePartner={isInactivePartner}
          currentTurnPlayer={currentTurnPlayer ?? null}
          ledSuit={ledSuit}
          trickWinner={trickWinner}
          mySeatIndex={mySeatIndex}
        />

        {/* Trump badge (persistent during play/discard) */}
        {round.trumpSuit && (round.trumpPhase === 'playing' || round.trumpPhase === 'dealer_discard') && (
          <div className="mt-2">
            <TrumpBadge
              trumpSuit={round.trumpSuit}
              callerName={callerName}
              goingAlone={round.goingAlone}
            />
          </div>
        )}
      </div>

      {/* Bottom Seat Info (dealer chip, name tag, badge) */}
      {round && mySeatIndex >= 0 && !isInactivePartner && (
        <div className="flex flex-col items-center">
          {/* Name tag with dealer chip */}
          <div className="relative mb-1">
            {mySeatIndex === gameState.dealerSeatIndex ? (
              <div className="absolute -top-1 -left-1 z-10 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--pearl)', border: '2px solid var(--accent-hover)', boxShadow: '0 0 8px rgba(240,194,127,0.4)' }}>
                <span className="text-xs font-bold" style={{ color: 'var(--depth-deep)' }}>D</span>
              </div>
            ) : (
              <div className="absolute -top-1 -left-1 w-6 h-6 opacity-0" />
            )}
            <div className={`h-7 rounded-full px-3 flex items-center gap-1.5 text-sm truncate font-semibold text-cream ${isMyTurn ? 'ring-1 ring-glass/40' : ''}`} style={{ background: isMyTurn ? 'rgba(107,191,163,.15)' : 'rgba(26,82,118,.4)', border: '1px solid rgba(245,230,202,.08)' }}>
              <span className="truncate max-w-[80px]">{displayName(room.players.find(p => p.id === playerId))}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-1 flex-shrink-0" style={{ background: 'rgba(240,194,127,.15)', color: 'var(--pearl)' }}>YOU</span>
            </div>
          </div>
          {/* Badge row */}
          <div className="h-6 flex items-center justify-center">
            {trickWinner?.seatIndex === mySeatIndex && round.trumpPhase === 'playing' && (
              <span className="text-glass text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(107,191,163,.15)' }}>✓ WON</span>
            )}
          </div>
        </div>
      )}

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
          <p className="text-sm" style={{ color: 'rgba(232,230,240,.35)' }}>Your partner is going alone this round</p>
        </div>
      )}

    </div>
  );
}

// ==================== SCOREBOARD (Two-Row Header) ====================

function Scoreboard({
  teams,
  targetScore,
  tricksWon,
  tricksPlayed,
  trumpPhase,
  trumpSuit,
  callerName,
  roundsPlayed,
}: {
  teams: ClientWhosDealState['teams'];
  targetScore: number;
  tricksWon: { a: number; b: number };
  tricksPlayed: number;
  trumpPhase: string;
  trumpSuit: Suit | null;
  callerName: string;
  roundsPlayed: number;
}) {
  const showTricks = trumpPhase === 'playing' || trumpPhase === 'round_over';

  return (
    <div>
      {/* Row 1 — Scores & Trump */}
      <div className="h-14 px-4 flex items-center justify-between" style={{ background: 'rgba(13,27,62,.5)' }}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--shallow-water)' }} />
          <span className="text-sm truncate" style={{ color: 'var(--shallow-water)' }}>Team A</span>
          <span className="text-2xl font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--shallow-water)' }}>{teams.a.score}</span>
          <span className="text-sm flex-shrink-0" style={{ color: 'rgba(232,230,240,.2)' }}>vs</span>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--coral)' }} />
          <span className="text-sm truncate" style={{ color: 'var(--coral)' }}>Team B</span>
          <span className="text-2xl font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--coral)' }}>{teams.b.score}</span>
        </div>
        {trumpSuit && (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            <span className={`text-2xl ring-1 rounded px-1 ${SUIT_COLOR[trumpSuit] === 'red' ? 'text-red-500 ring-red-500/30' : 'ring-cream/20'}`} style={SUIT_COLOR[trumpSuit] === 'black' ? { color: 'var(--cream)' } : undefined}>
              {SUIT_SYMBOL[trumpSuit]}
            </span>
            <span className="text-sm truncate max-w-[60px]" style={{ color: 'rgba(245,230,202,.45)' }}>{callerName}</span>
          </div>
        )}
      </div>
      {/* Row 2 — Trick Count & Info */}
      <div className="h-7 px-4 flex items-center justify-between text-xs" style={{ background: 'rgba(13,27,62,.5)', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
        <div className="flex items-center gap-1.5">
          {showTricks && (
            <>
              <span style={{ color: 'rgba(232,230,240,.3)' }}>Tricks</span>
              <span className="font-bold" style={{ color: 'var(--shallow-water)' }}>{tricksWon.a}</span>
              <span style={{ color: 'rgba(232,230,240,.2)' }}>-</span>
              <span className="font-bold" style={{ color: 'var(--coral)' }}>{tricksWon.b}</span>
              <span className="ml-1" style={{ color: 'rgba(232,230,240,.3)' }}>Trick {tricksPlayed + 1} of 5</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5" style={{ color: 'rgba(232,230,240,.25)' }}>
          <span>Playing to {targetScore}</span>
          <span>&bull;</span>
          <span>Rd {roundsPlayed}</span>
        </div>
      </div>
    </div>
  );
}

// ==================== OPPONENT SEAT ====================

function OpponentSeat({
  player,
  position,
  isActive,
  isDealer,
  isInactive,
  hasPassed,
  cardCount,
  trickCard,
  isWinner,
  team,
  isMe,
  wonTrick,
  trumpPhase,
}: {
  player: Player | null;
  position: Position;
  isActive: boolean;
  isDealer: boolean;
  isInactive: boolean;
  hasPassed: boolean;
  cardCount: number;
  trickCard: TrickCard | null;
  isWinner: boolean;
  team: 'a' | 'b';
  isMe: boolean;
  wonTrick: boolean;
  trumpPhase: string;
}) {
  const positionStyles: Record<Position, string> = {
    top: 'top-0 left-1/2 -translate-x-1/2 flex-col items-center',
    left: 'left-0 top-1/2 -translate-y-1/2 flex-col items-center',
    right: 'right-0 top-1/2 -translate-y-1/2 flex-col items-center',
    bottom: '',
  };

  const isHuman = player && !player.isBot;

  return (
    <div className={`absolute flex ${positionStyles[position]} ${isInactive ? 'opacity-30' : ''}`}>
      {/* Name tag with dealer chip */}
      <div className="relative mb-1">
        {isDealer ? (
          <div className="absolute -top-1 -left-1 z-10 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--pearl)', border: '2px solid var(--accent-hover)', boxShadow: '0 0 8px rgba(240,194,127,0.4)' }}>
            <span className="text-xs font-bold" style={{ color: 'var(--depth-deep)' }}>D</span>
          </div>
        ) : (
          <div className="absolute -top-1 -left-1 w-6 h-6 opacity-0" />
        )}
        <div
          className={`h-7 rounded-full px-3 flex items-center gap-1.5 text-sm truncate ${isActive ? 'ring-1 ring-glass/40' : ''}`}
          style={{
            background: isActive ? 'rgba(107,191,163,.15)' : isHuman ? 'rgba(26,82,118,.4)' : 'rgba(13,27,62,.3)',
            border: '1px solid rgba(245,230,202,.06)',
            color: isHuman ? 'var(--cream)' : 'rgba(232,230,240,.35)',
            fontWeight: isHuman ? 600 : 400,
          }}
        >
          <span className="truncate max-w-[80px]">{displayName(player)}</span>
          {isMe && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-1 flex-shrink-0" style={{ background: 'rgba(240,194,127,.15)', color: 'var(--pearl)' }}>YOU</span>
          )}
        </div>
      </div>

      {/* Badge row — h-6, WON / ALONE or invisible placeholder */}
      <div className="h-6 flex items-center justify-center">
        {wonTrick && (
          <span className="text-glass text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(107,191,163,.15)' }}>&#10003; WON</span>
        )}
        {isInactive && trumpPhase === 'playing' && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,101,138,.15)', color: 'var(--star)' }}>ALONE</span>
        )}
      </div>

      {/* Cards row — h-14 */}
      <div className="h-14 flex items-center justify-center gap-0.5">
        {isInactive ? (
          <span className="text-xs italic" style={{ color: 'rgba(232,230,240,.2)' }}>Sitting out</span>
        ) : (
          Array.from({ length: Math.min(cardCount, 5) }).map((_, i) => (
            <div key={i} className={`w-7 h-10 rounded-lg shadow-md relative flex-shrink-0 ${i > 0 ? '-ml-2' : ''}`} style={{ background: 'linear-gradient(to bottom right, #1a5276, #0d1b3e)', border: '2px solid rgba(126,184,212,.3)' }}>
              <div className="absolute inset-[3px] rounded flex items-center justify-center text-[8px]" style={{ border: '1px solid rgba(126,184,212,.15)', color: 'rgba(126,184,212,.25)' }}>✦</div>
            </div>
          ))
        )}
      </div>

      {/* Status row — h-5 */}
      <div className="h-5 flex items-center justify-center">
        {isActive && trumpPhase === 'playing' && (
          <span className="text-xs flex items-center gap-1" style={{ color: 'rgba(232,230,240,.35)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'rgba(232,230,240,.35)' }} />
            Thinking...
          </span>
        )}
        {hasPassed && !isActive && (
          <span className="text-xs italic" style={{ color: 'rgba(232,230,240,.2)' }}>Pass</span>
        )}
      </div>

      {/* Trick card */}
      {trickCard && (
        <div className="mt-1">
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
  const isRed = color === 'red';

  if (size === 'trick') {
    return (
      <div className={`w-12 h-[68px] sm:w-14 sm:h-20 bg-white rounded-lg border-2 border-gray-200 shadow-lg flex flex-col items-center justify-center animate-scale-in ${winning ? 'ring-2 ring-glass shadow-[0_0_12px_rgba(107,191,163,0.3)]' : ''}`}>
        <span className={`text-base font-bold ${isRed ? 'text-red-600' : 'text-gray-900'}`}>{card.rank}</span>
        <span className={`text-sm ${isRed ? 'text-red-500' : 'text-gray-700'}`}>{symbol}</span>
      </div>
    );
  }

  if (size === 'large') {
    return (
      <div className="w-16 h-24 bg-white rounded-lg border-2 border-gray-200 shadow-lg flex flex-col items-center justify-center">
        <span className={`text-lg font-bold ${isRed ? 'text-red-600' : 'text-gray-900'}`}>{card.rank}</span>
        <span className={`text-xl ${isRed ? 'text-red-500' : 'text-gray-700'}`}>{symbol}</span>
      </div>
    );
  }

  return (
    <div className="w-12 h-[68px] bg-white rounded-lg border-2 border-gray-200 shadow-lg flex flex-col items-center justify-center">
      <span className={`text-sm font-bold ${isRed ? 'text-red-600' : 'text-gray-900'}`}>{card.rank}</span>
      <span className={`text-base ${isRed ? 'text-red-500' : 'text-gray-700'}`}>{symbol}</span>
    </div>
  );
}

// ==================== FACE-UP CARD (center, for trump calling) ====================

function FaceUpCardDisplay({ card, dimmed }: { card: Card; dimmed: boolean }) {
  const isRed = SUIT_COLOR[card.suit] === 'red';
  const symbol = SUIT_SYMBOL[card.suit];

  return (
    <div className={`w-16 h-24 bg-white rounded-lg border-2 border-gray-200 shadow-lg flex flex-col items-center justify-center animate-bounce-in ${dimmed ? 'opacity-40' : ''}`}>
      <span className={`text-lg font-bold ${isRed ? 'text-red-600' : 'text-gray-900'}`}>{card.rank}</span>
      <span className={`text-xl ${isRed ? 'text-red-500' : 'text-gray-700'}`}>{symbol}</span>
    </div>
  );
}

// ==================== TRICK AREA (Felt Circle) ====================

function TrickArea({
  trick,
  mySeatIndex,
  trickWinner,
}: {
  trick: TrickCard[];
  mySeatIndex: number;
  trickWinner: { seatIndex: number; team: 'a' | 'b' } | null;
}) {
  return (
    <div className="w-36 h-36 sm:w-48 sm:h-48 rounded-full relative" style={{ background: 'rgba(13,27,62,.4)', border: '1px solid rgba(107,191,163,.12)' }}>
      {(['top', 'left', 'right', 'bottom'] as const).map(pos => {
        const trickCard = trick.find(tc => {
          const p = getPositionForSeat(tc.seatIndex, mySeatIndex);
          return p === pos;
        });
        const isWinner = trickCard ? trickWinner?.seatIndex === trickCard.seatIndex : false;

        const posStyle: Record<Position, string> = {
          top: 'absolute top-2 left-1/2 -translate-x-1/2',
          bottom: 'absolute bottom-2 left-1/2 -translate-x-1/2',
          left: 'absolute left-2 top-1/2 -translate-y-1/2',
          right: 'absolute right-2 top-1/2 -translate-y-1/2',
        };

        return (
          <div key={pos} className={posStyle[pos]}>
            {trickCard ? (
              <PlayingCard card={trickCard.card} size="trick" winning={isWinner} />
            ) : (
              <div className="w-12 h-[68px] sm:w-14 sm:h-20" />
            )}
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
    return (
      <div className="min-h-[120px] flex items-center justify-center">
        <p className="text-sm" style={{ color: 'rgba(232,230,240,.35)' }}>
          {displayName(currentTurnPlayer)} is deciding...
        </p>
      </div>
    );
  }

  // Round 1
  if (round.trumpPhase === 'round1') {
    return (
      <div className="min-h-[120px] flex flex-col items-center justify-center gap-3 animate-fade-in">
        <div className="flex gap-3">
          <button
            onClick={() => onCallTrump({ pickUp: true, goAlone })}
            className="text-white font-semibold min-h-[44px] rounded-full px-6 transition"
            style={{ background: 'var(--glass)' }}
          >
            Order it up
          </button>
          <button
            onClick={onPassTrump}
            className="text-cream font-semibold min-h-[44px] rounded-full px-6 transition"
            style={{ background: 'rgba(26,82,118,.5)' }}
          >
            Pass
          </button>
        </div>
        <GoAloneToggle checked={goAlone} onToggle={onGoAloneToggle} />
      </div>
    );
  }

  // Round 2
  const isStuck = mySeatIndex === dealerSeatIndex && round.passedPlayers.length >= 3;
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

  return (
    <div className="min-h-[120px] flex flex-col items-center justify-center gap-3 animate-fade-in">
      <div className="grid grid-cols-2 gap-2">
        {suits.map(suit => {
          const disabled = suit === round.faceUpCard.suit;
          const isSelected = selectedSuit === suit;
          const sColor = SUIT_COLOR[suit];

          return (
            <button
              key={suit}
              onClick={() => {
                if (disabled) return;
                if (isSelected) {
                  onCallTrump({ suit, goAlone });
                  setSelectedSuit(null);
                } else {
                  setSelectedSuit(suit);
                }
              }}
              disabled={disabled}
              className={`min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center gap-1.5 px-3 py-2 transition ${
                disabled
                  ? 'opacity-30 cursor-not-allowed pointer-events-none'
                  : isSelected
                    ? 'text-white font-semibold'
                    : 'text-cream'
              }`}
              style={
                disabled
                  ? { background: 'rgba(13,27,62,.4)', color: 'rgba(232,230,240,.25)' }
                  : isSelected
                    ? { background: 'var(--glass)' }
                    : { background: 'rgba(26,82,118,.5)' }
              }
            >
              <span className={`text-lg ${!disabled && !isSelected && sColor === 'red' ? 'text-red-400' : ''}`}>
                {SUIT_SYMBOL[suit]}
              </span>
              <span className="text-sm">{SUIT_NAME[suit]}</span>
            </button>
          );
        })}
      </div>

      <div className="h-[44px] flex items-center justify-center">
        {!isStuck ? (
          <button
            onClick={onPassTrump}
            className="text-cream font-semibold min-h-[44px] rounded-full px-6 transition"
            style={{ background: 'rgba(26,82,118,.5)' }}
          >
            Pass
          </button>
        ) : (
          <p className="text-sm font-semibold" style={{ color: 'var(--pearl)' }}>You must call trump</p>
        )}
      </div>

      <GoAloneToggle checked={goAlone} onToggle={onGoAloneToggle} />
    </div>
  );
}

function GoAloneToggle({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all ${
        checked ? 'text-glass' : ''
      }`}
      style={!checked ? { color: 'rgba(245,230,202,.4)' } : undefined}
    >
      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
        checked ? 'border-glass bg-glass' : ''
      }`} style={!checked ? { borderColor: 'rgba(232,230,240,.3)' } : undefined}>
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

// ==================== STATUS TEXT (fixed h-8) ====================

function StatusText({
  round,
  isMyTurn,
  isInactivePartner,
  currentTurnPlayer,
  ledSuit,
  trickWinner,
  mySeatIndex,
}: {
  round: ClientEuchreRound;
  isMyTurn: boolean;
  isInactivePartner: boolean;
  currentTurnPlayer: Player | null;
  ledSuit: Suit | null;
  trickWinner: { seatIndex: number; team: 'a' | 'b' } | null;
  mySeatIndex: number;
}) {
  if (round.trumpPhase !== 'playing') return <div className="h-8" />;

  if (trickWinner) {
    const isMyWin = trickWinner.seatIndex === mySeatIndex;
    return (
      <div className="h-8 flex items-center justify-center">
        <span className="text-glass text-sm font-medium">
          {isMyWin ? '✓ You won the trick!' : ''}
        </span>
      </div>
    );
  }

  if (isInactivePartner) {
    return (
      <div className="h-8 flex items-center justify-center">
        <span className="text-sm" style={{ color: 'rgba(232,230,240,.35)' }}>Your partner is going alone</span>
      </div>
    );
  }

  if (isMyTurn) {
    return (
      <div className="h-8 flex items-center justify-center">
        <span className="text-glass text-sm font-medium">
          {ledSuit
            ? `Your turn — follow suit ${SUIT_SYMBOL[ledSuit]}`
            : 'Your turn — lead any card'}
        </span>
      </div>
    );
  }

  return (
    <div className="h-8 flex items-center justify-center">
      <span className="text-sm" style={{ color: 'rgba(232,230,240,.35)' }}>
        {currentTurnPlayer?.isBot
          ? `${displayName(currentTurnPlayer)} is thinking...`
          : `Waiting for ${displayName(currentTurnPlayer)}...`}
      </span>
    </div>
  );
}

// ==================== TRUMP INDICATOR ====================

function TrumpIndicator({ trumpSuit, callerName, goingAlone }: {
  trumpSuit: Suit;
  callerName: string;
  goingAlone: boolean;
}) {
  const isRed = SUIT_COLOR[trumpSuit] === 'red';

  return (
    <div className="flex flex-col items-center gap-0.5 animate-fade-in">
      <span className={`text-3xl ${isRed ? 'text-red-400' : ''}`} style={!isRed ? { color: 'var(--cream)' } : undefined}>
        {SUIT_SYMBOL[trumpSuit]}
      </span>
      <span className="text-[10px]" style={{ color: 'rgba(232,230,240,.3)' }}>{callerName} called trump</span>
      {goingAlone && <span className="text-[10px] text-glass font-semibold">Going Alone</span>}
    </div>
  );
}

function TrumpBadge({ trumpSuit, callerName, goingAlone }: {
  trumpSuit: Suit;
  callerName: string;
  goingAlone: boolean;
}) {
  const isRed = SUIT_COLOR[trumpSuit] === 'red';

  return (
    <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs" style={{ background: 'rgba(13,27,62,.5)', border: '1px solid rgba(255,255,255,.04)' }}>
      <span className={`text-base ${isRed ? 'text-red-400' : ''}`} style={!isRed ? { color: 'var(--cream)' } : undefined}>
        {SUIT_SYMBOL[trumpSuit]}
      </span>
      <span className="truncate max-w-[60px]" style={{ color: 'rgba(245,230,202,.45)' }}>{callerName}</span>
      {goingAlone && <span className="text-glass font-semibold">Alone</span>}
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
    <div className="flex flex-col items-center gap-2 px-3">
      <div className="flex justify-center gap-1.5 overflow-x-auto flex-nowrap pb-1 px-1 w-full">
        {hand.map((card) => {
          const isPlayable = isDiscard || playableIds.has(card.id);
          const isSelected = selectedCard === card.id;
          const isDimmed = canInteract && !isDiscard && !isPlayable;
          const isNew = dealerPickedUp?.id === card.id;
          const isRed = SUIT_COLOR[card.suit] === 'red';
          const symbol = SUIT_SYMBOL[card.suit];

          return (
            <button
              key={card.id}
              onClick={() => {
                if (!canInteract) return;
                if (!isDiscard && !isPlayable) return;
                onSelect(isSelected ? null : card.id);
              }}
              disabled={!canInteract || isDimmed}
              className={`w-16 h-24 bg-white rounded-lg border-2 shadow-lg flex flex-col items-center justify-center flex-shrink-0 relative transition ${
                isSelected
                  ? '-translate-y-2 shadow-[0_0_8px_rgba(240,194,127,0.4)]'
                  : isDimmed
                    ? 'opacity-40 cursor-not-allowed border-gray-200'
                    : canInteract
                      ? 'border-gray-200 cursor-pointer hover:-translate-y-1'
                      : 'border-gray-200'
              }`}
              style={isSelected ? { borderColor: 'var(--pearl)' } : undefined}
            >
              <span className={`text-lg font-bold leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>{card.rank}</span>
              <span className={`text-base leading-none ${isRed ? 'text-red-500' : 'text-gray-700'}`}>{symbol}</span>
              {isNew && (
                <span className="absolute -top-1 -right-1 text-[8px] text-white rounded px-0.5 font-bold" style={{ background: 'var(--glass)' }}>
                  NEW
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="h-12 flex items-center justify-center">
        {selectedCard && canInteract ? (
          <button
            onClick={onConfirm}
            className="text-white font-semibold px-6 py-2 rounded-full transition"
            style={{ background: 'var(--glass)' }}
          >
            {isDiscard ? 'Discard' : 'Play Card'}
          </button>
        ) : canInteract ? (
          <span className="text-sm" style={{ color: 'rgba(232,230,240,.2)' }}>Tap a card to {isDiscard ? 'discard' : 'select'}</span>
        ) : null}
      </div>
    </div>
  );
}

// ==================== ROUND SUMMARY OVERLAY ====================

function RoundSummaryOverlay({
  summary,
}: {
  summary: {
    callingTeam: 'a' | 'b';
    tricksWon: { a: number; b: number };
    pointsAwarded: { a: number; b: number };
    scores: { a: number; b: number };
    isGameOver: boolean;
  };
}) {
  const aPoints = summary.pointsAwarded.a;
  const bPoints = summary.pointsAwarded.b;
  const winningTeam = aPoints > 0 ? 'a' : 'b';
  const points = aPoints > 0 ? aPoints : bPoints;
  const isEuchre = winningTeam !== summary.callingTeam;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm rounded-xl animate-fade-in" style={{ background: 'rgba(8,12,26,.8)' }}>
      <div className="rounded-2xl p-5 text-center max-w-xs w-full animate-scale-in" style={{ background: 'rgba(13,27,62,.8)', border: '1px solid rgba(255,255,255,.06)' }}>
        <p className="text-lg font-black text-cream mb-1">
          {isEuchre ? 'Euchre!' : points >= 4 ? 'Alone Sweep!' : points >= 2 ? 'March!' : 'Round Over'}
        </p>
        <p className="text-sm mb-3" style={{ color: winningTeam === 'a' ? 'var(--shallow-water)' : 'var(--coral)' }}>
          Team {winningTeam.toUpperCase()} +{points} point{points > 1 ? 's' : ''}
        </p>
        <div className="flex justify-center gap-4 text-sm">
          <div>
            <span className="font-bold" style={{ color: 'var(--shallow-water)' }}>Team A</span>
            <span className="font-black ml-1" style={{ color: 'var(--shallow-water)' }}>{summary.scores.a}</span>
          </div>
          <div>
            <span className="font-bold" style={{ color: 'var(--coral)' }}>Team B</span>
            <span className="font-black ml-1" style={{ color: 'var(--coral)' }}>{summary.scores.b}</span>
          </div>
        </div>
        <p className="text-xs mt-2" style={{ color: 'rgba(232,230,240,.3)' }}>
          Tricks: A {summary.tricksWon.a} - B {summary.tricksWon.b}
        </p>
      </div>
    </div>
  );
}

// ==================== GAME OVER SCREEN ====================

function GameOverScreen({
  gameState,
  myTeam,
  isOwner,
  onPlayAgain,
}: {
  gameState: ClientWhosDealState;
  myTeam: 'a' | 'b' | null;
  isOwner: boolean;
  onPlayAgain: () => void;
}) {
  const winner = gameState.winningTeam;
  const teamAScore = gameState.teams.a.score;
  const teamBScore = gameState.teams.b.score;

  return (
    <div className="flex flex-col items-center justify-center p-6 overflow-x-hidden" style={{ minHeight: 0, flex: 1 }}>
      <h1 className="text-3xl font-bold" style={{ color: winner === 'a' ? 'var(--shallow-water)' : 'var(--coral)' }}>
        Team {winner?.toUpperCase()}
      </h1>
      <p className="text-xl mt-1" style={{ color: 'rgba(245,230,202,.45)' }}>wins!</p>

      <div className="flex gap-8 mt-6">
        <div className="text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--shallow-water)' }}>Team A</p>
          <p className="text-3xl font-black tabular-nums" style={{ color: 'var(--shallow-water)' }}>{teamAScore}</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--coral)' }}>Team B</p>
          <p className="text-3xl font-black tabular-nums" style={{ color: 'var(--coral)' }}>{teamBScore}</p>
        </div>
      </div>

      <p className="text-sm mt-4" style={{ color: 'rgba(232,230,240,.3)' }}>
        After {gameState.roundsPlayed} round{gameState.roundsPlayed !== 1 ? 's' : ''}
      </p>

      {isOwner && (
        <div className="flex gap-3 mt-8 min-h-[52px]">
          <button
            onClick={onPlayAgain}
            className="btn-primary px-8 py-3 rounded-full"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
