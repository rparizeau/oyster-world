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

  return (
    <div className="flex flex-col max-w-lg mx-auto w-full overflow-x-hidden" style={{ minHeight: 0, flex: 1 }}>
      {/* Scoreboard */}
      <Scoreboard
        teams={gameState.teams}
        targetScore={gameState.targetScore}
        tricksWon={round.tricksWon}
        trumpPhase={round.trumpPhase}
        roundsPlayed={gameState.roundsPlayed}
      />

      {/* Table Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-3 my-2">
        {/* Round Summary Overlay */}
        {roundSummary && round.trumpPhase === 'round_over' && (
          <RoundSummaryOverlay summary={roundSummary} />
        )}

        {/* Opponent positions (top, left, right) */}
        <div className="w-full max-w-sm relative" style={{ minHeight: '320px' }}>
          {seatMappings
            .filter(s => s.position !== 'bottom')
            .map(({ position, seatIndex }) => {
              const player = room.players.find(p => p.id === gameState.seats[seatIndex]);
              const isActive = seatIndex === round.currentTurnSeatIndex;
              const isDealer = seatIndex === gameState.dealerSeatIndex;
              const isInactive = round.goingAlone && seatIndex === round.inactivePartnerSeatIndex;
              const hasPassed = round.passedPlayers.includes(gameState.seats[seatIndex]);
              const cardCount = round.handCounts[gameState.seats[seatIndex]] ?? 0;
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
                  team={getTeamForSeat(seatIndex)}
                  isMe={isMe}
                  wonTrick={wonTrick}
                  trumpPhase={round.trumpPhase}
                />
              );
            })}

          {/* Center area */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 mt-5">
              {/* Trick area - felt circle (always present), with face-up card overlaid during trump calling */}
              <div className="relative">
                <TrickArea
                  trick={round.trumpPhase === 'playing' ? round.currentTrick : []}
                  mySeatIndex={mySeatIndex}
                  trickWinner={trickWinner}
                />
                {(round.trumpPhase === 'round1' || round.trumpPhase === 'round2') && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FaceUpCardDisplay
                      card={round.faceUpCard}
                      dimmed={round.trumpPhase === 'round2'}
                    />
                  </div>
                )}
              </div>

              {/* Trump & Led suit badges (always present, unset state when no trump) */}
              <div className="flex items-center gap-4 mt-1">
                <TableBadge
                  suit={round.trumpSuit}
                  label="TRUMP"
                  teamColor={round.callingTeam === 'a' ? 'a' : round.callingTeam === 'b' ? 'b' : null}
                />
                <TableBadge suit={ledSuit} label="LED" />
              </div>
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

        {/* Playing to target */}
        {(round.trumpPhase === 'playing' || round.trumpPhase === 'dealer_discard') && (
          <div className="mt-1 text-center">
            <span className="text-xs" style={{ color: 'rgba(232,230,240,.2)' }}>Playing to {gameState.targetScore}</span>
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
            <div className={`h-7 rounded-full px-3 flex items-center gap-1.5 text-sm truncate font-semibold text-cream`} style={{ background: isMyTurn ? 'rgba(107,191,163,.15)' : 'rgba(26,82,118,.4)', border: `2px solid ${isMyTurn ? 'rgba(107,191,163,.6)' : myTeam === 'a' ? 'var(--shallow-water)' : myTeam === 'b' ? 'var(--coral)' : 'transparent'}` }}>
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
  trumpPhase,
  roundsPlayed,
}: {
  teams: ClientWhosDealState['teams'];
  targetScore: number;
  tricksWon: { a: number; b: number };
  trumpPhase: string;
  roundsPlayed: number;
}) {
  const showTricks = trumpPhase === 'playing' || trumpPhase === 'round_over';

  return (
    <div className="px-4 py-2.5 mb-7 flex items-start justify-between" style={{ background: 'rgba(13,27,62,.5)', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
      <div className="flex items-start gap-2 min-w-0 flex-1">
        {/* Team A */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--shallow-water)' }} />
            <span className="text-sm truncate mr-1" style={{ color: 'var(--shallow-water)' }}>Team A</span>
            <span className="text-2xl font-bold tabular-nums flex-shrink-0 leading-none" style={{ color: 'var(--shallow-water)' }}>{teams.a.score}</span>
            {teams.a.score === targetScore - 1 && (
              <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(126,184,212,.15)', color: 'var(--shallow-water)' }}>GP</span>
            )}
          </div>
          {showTricks && (
            <div className="flex items-center gap-1 ml-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i < tricksWon.a ? 'var(--shallow-water)' : 'rgba(126,184,212,.2)' }} />
              ))}
            </div>
          )}
        </div>

        <span className="text-sm flex-shrink-0 mt-0.5" style={{ color: 'rgba(232,230,240,.2)' }}>vs</span>

        {/* Team B */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--coral)' }} />
            <span className="text-sm truncate mr-1" style={{ color: 'var(--coral)' }}>Team B</span>
            <span className="text-2xl font-bold tabular-nums flex-shrink-0 leading-none" style={{ color: 'var(--coral)' }}>{teams.b.score}</span>
            {teams.b.score === targetScore - 1 && (
              <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(232,168,124,.15)', color: 'var(--coral)' }}>GP</span>
            )}
          </div>
          {showTricks && (
            <div className="flex items-center gap-1 ml-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i < tricksWon.b ? 'var(--coral)' : 'rgba(232,168,124,.2)' }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col items-end text-xs flex-shrink-0 mt-0.5" style={{ color: 'rgba(232,230,240,.25)' }}>
        <span>to {targetScore}</span>
        <span>Rd {roundsPlayed}</span>
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
  const teamColor = team === 'a' ? 'var(--shallow-water)' : 'var(--coral)';

  return (
    <div className={`absolute flex ${positionStyles[position]} ${isInactive ? 'opacity-30' : ''}`}>
      {/* Name tag with dealer chip */}
      <div className="relative">
        {isDealer ? (
          <div className="absolute -top-1 -left-1 z-10 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--pearl)', border: '2px solid var(--accent-hover)', boxShadow: '0 0 8px rgba(240,194,127,0.4)' }}>
            <span className="text-[10px] font-bold" style={{ color: 'var(--depth-deep)' }}>D</span>
          </div>
        ) : (
          <div className="absolute -top-1 -left-1 w-5 h-5 opacity-0" />
        )}
        <div
          className={`h-7 rounded-full px-3 flex items-center gap-1.5 text-sm truncate ${wonTrick ? 'ring-1 ring-glass' : isActive ? 'ring-1 ring-glass/40' : ''}`}
          style={{
            background: wonTrick ? 'rgba(107,191,163,.15)' : isActive ? 'rgba(107,191,163,.1)' : isHuman ? 'rgba(26,82,118,.4)' : 'rgba(13,27,62,.3)',
            border: `2px solid ${isActive ? 'rgba(107,191,163,.6)' : teamColor}`,
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

      {/* Cards */}
      <div className="h-8 flex items-center justify-center gap-0.5 mt-0.5">
        {isInactive ? (
          <span className="text-[10px] italic" style={{ color: 'rgba(232,230,240,.2)' }}>Sitting out</span>
        ) : (
          Array.from({ length: Math.min(cardCount, 5) }).map((_, i) => (
            <div key={i} className={`w-4 h-6 rounded flex-shrink-0 ${i > 0 ? '-ml-1.5' : ''}`} style={{ background: 'linear-gradient(to bottom right, #1a5276, #0d1b3e)', border: '1.5px solid rgba(126,184,212,.25)' }} />
          ))
        )}
      </div>

      {/* Status line */}
      <div className="h-4 flex items-center justify-center">
        {wonTrick && (
          <span className="text-glass text-[10px] font-semibold">&#10003; WON</span>
        )}
        {isInactive && trumpPhase === 'playing' && (
          <span className="text-[10px] font-semibold" style={{ color: 'var(--star)' }}>ALONE</span>
        )}
        {hasPassed && !isActive && !wonTrick && trumpPhase !== 'playing' && (
          <span className="text-[10px] italic" style={{ color: 'rgba(232,230,240,.2)' }}>Pass</span>
        )}
      </div>
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

// ==================== TABLE BADGE (Trump / Led) ====================

function TableBadge({ suit, label, teamColor }: {
  suit: Suit | null;
  label: string;
  teamColor?: 'a' | 'b' | null;
}) {
  const isRed = suit ? SUIT_COLOR[suit] === 'red' : false;
  const border = teamColor === 'a'
    ? '1.5px solid var(--shallow-water)'
    : teamColor === 'b'
      ? '1.5px solid var(--coral)'
      : '1px solid rgba(255,255,255,.08)';
  const bg = teamColor === 'a'
    ? 'rgba(126,184,212,.1)'
    : teamColor === 'b'
      ? 'rgba(232,168,124,.1)'
      : 'rgba(13,27,62,.5)';

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${!suit ? 'opacity-25' : ''}`}
      style={{ border, background: bg }}
    >
      <span className={`text-base ${isRed ? 'text-red-400' : ''}`} style={!isRed ? { color: 'var(--cream)' } : undefined}>
        {suit ? SUIT_SYMBOL[suit] : '\u2022'}
      </span>
      <span className="text-[10px] font-semibold uppercase" style={{ color: 'rgba(232,230,240,.35)' }}>{label}</span>
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

  const winColor = winningTeam === 'a' ? 'var(--shallow-water)' : 'var(--coral)';
  const headline = isEuchre ? 'Euchre!' : points >= 4 ? 'Alone Sweep!' : points >= 2 ? 'March!' : 'Round Over';

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm rounded-xl animate-fade-in" style={{ background: 'rgba(8,12,26,.8)' }}>
      <div className="rounded-2xl p-6 text-center max-w-xs w-full animate-scale-in" style={{ background: 'rgba(13,27,62,.8)', border: '1px solid rgba(255,255,255,.06)' }}>
        <p className="text-lg font-black text-cream">
          {headline}
        </p>
        <p className="text-2xl font-black mt-1" style={{ color: winColor }}>
          Team {winningTeam.toUpperCase()}
        </p>
        <p className="text-sm font-bold mt-0.5" style={{ color: winColor }}>
          +{points} point{points > 1 ? 's' : ''}
        </p>
        <div className="flex justify-center gap-6 text-sm mt-4">
          <div className="flex flex-col items-center">
            <span className="text-2xl font-black tabular-nums" style={{ color: 'var(--shallow-water)' }}>{summary.scores.a}</span>
            <span className="text-xs font-bold" style={{ color: 'var(--shallow-water)' }}>Team A</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-2xl font-black tabular-nums" style={{ color: 'var(--coral)' }}>{summary.scores.b}</span>
            <span className="text-xs font-bold" style={{ color: 'var(--coral)' }}>Team B</span>
          </div>
        </div>
        <p className="text-xs mt-3" style={{ color: 'rgba(232,230,240,.3)' }}>
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
