'use client';

import { useState, useMemo } from 'react';
import type { Room } from '@/lib/types';
import type { SanitizedBackgammonState, CheckerColor, CheckerMove } from '../types';

interface Props {
  room: Room;
  backgammonState: SanitizedBackgammonState;
  playerId: string | null;
  isOwner: boolean;
  legalMoves: CheckerMove[];
  onRoll: () => void;
  onMove: (from: number | 'bar', to: number | 'off', dieUsed: number) => void;
  onUndoMove: () => void;
  onUndoTo: (keepMoves: number) => void;
  onConfirmMoves: () => void;
  onOfferDouble: () => void;
  onAcceptDouble: () => void;
  onDeclineDouble: () => void;
  onPlayAgain: () => void;
}

const CHECKER_COLORS: Record<CheckerColor, string> = {
  white: '#f0c27f', // pearl gold
  black: '#7eb8d4', // shallow-water
};

const CHECKER_BORDER: Record<CheckerColor, string> = {
  white: 'rgba(240,194,127,.6)',
  black: 'rgba(126,184,212,.6)',
};

export default function BackgammonGameView({
  room, backgammonState: state, playerId, isOwner,
  legalMoves, onRoll, onMove, onUndoMove, onUndoTo, onConfirmMoves,
  onOfferDouble, onAcceptDouble, onDeclineDouble, onPlayAgain,
}: Props) {
  const [selectedFrom, setSelectedFrom] = useState<number | 'bar' | null>(null);

  const myColor = playerId ? state.colorMap[playerId] ?? null : null;
  const isMyTurn = myColor === state.currentTurn;
  const oppColor = myColor ? (myColor === 'white' ? 'black' : 'white') : null;

  // Get player names
  const myName = playerId ? room.players.find(p => p.id === playerId)?.name ?? 'You' : 'You';
  const oppId = Object.entries(state.colorMap).find(([id]) => id !== playerId)?.[0];
  const oppName = oppId ? room.players.find(p => p.id === oppId)?.name ?? 'Opponent' : 'Opponent';

  // Legal destinations from the selected source
  const legalDestinations = useMemo(() => {
    if (selectedFrom === null) return [];
    return legalMoves
      .filter(m => m.from === selectedFrom)
      .map(m => ({ to: m.to, dieUsed: m.dieUsed }));
  }, [selectedFrom, legalMoves]);

  // Points with selectable sources
  const selectableSources = useMemo(() => {
    if (!isMyTurn || state.phase !== 'moving') return new Set<number | 'bar'>();
    return new Set(legalMoves.map(m => m.from));
  }, [isMyTurn, state.phase, legalMoves]);

  function handlePointClick(pointNum: number) {
    if (!isMyTurn || state.phase !== 'moving') return;

    // If clicking a legal destination for current selection
    if (selectedFrom !== null) {
      const dest = legalDestinations.find(d => d.to === pointNum);
      if (dest) {
        onMove(selectedFrom, pointNum, dest.dieUsed);
        setSelectedFrom(null);
        return;
      }
    }

    // Select this point as source if it has our checkers and is legal
    if (selectableSources.has(pointNum)) {
      setSelectedFrom(pointNum === selectedFrom ? null : pointNum);
    } else {
      setSelectedFrom(null);
    }
  }

  function handleBarClick() {
    if (!isMyTurn || state.phase !== 'moving') return;
    if (selectableSources.has('bar')) {
      setSelectedFrom(selectedFrom === 'bar' ? null : 'bar');
    }
  }

  function handleBearOffClick() {
    if (!isMyTurn || state.phase !== 'moving' || selectedFrom === null) return;
    const dest = legalDestinations.find(d => d.to === 'off');
    if (dest) {
      onMove(selectedFrom, 'off', dest.dieUsed);
      setSelectedFrom(null);
    }
  }

  // Orient board: my home board at bottom-right
  // Top row: points 13-24 (or 12-1 reversed based on color)
  // Bottom row: points 12-1 (or 13-24 reversed)
  const topPoints = myColor === 'black'
    ? [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]   // Black's home at top-right
    : [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]; // White sees 13-24 on top
  const bottomPoints = myColor === 'black'
    ? [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
    : [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

  const isDestination = (pointNum: number) =>
    legalDestinations.some(d => d.to === pointNum);

  const canBearOff = legalDestinations.some(d => d.to === 'off');

  // Cube can be offered
  const canOfferDouble = isMyTurn && state.phase === 'rolling' && state.cubeEnabled
    && (state.cube.value < 64)
    && (state.cube.owner === null || state.cube.owner === myColor)
    && !state.match?.crawfordGame;

  // Double offered to me
  const doubleOfferedToMe = state.phase === 'double_offered' && state.cube.offeredBy !== myColor;

  return (
    <div className="flex flex-col items-center gap-3 p-3 pt-6 pb-6 animate-fade-in max-w-lg mx-auto w-full">
      {/* Opponent info */}
      <div className="w-full flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full" style={{ background: oppColor ? CHECKER_COLORS[oppColor] : '#666' }} />
          <span className="text-sm font-semibold" style={{ color: 'rgba(245,230,202,.6)' }}>{oppName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'rgba(232,230,240,.55)' }}>
            Borne off: {oppColor ? state.borneOff[oppColor] : 0}/15
          </span>
          {state.match && oppColor && (
            <span className="text-xs font-bold" style={{ color: 'var(--pearl)' }}>
              {state.match.scores[oppColor]} pts
            </span>
          )}
        </div>
      </div>

      {/* Board */}
      <div
        className="w-full rounded-xl overflow-hidden"
        style={{
          background: 'rgba(20,40,60,.6)',
          border: isMyTurn ? '2px solid rgba(126,212,126,.5)' : '2px solid rgba(240,194,127,.15)',
        }}
      >
        {/* Top row */}
        <div className="flex">
          <div className="flex flex-1">
            {topPoints.slice(0, 6).map(pn => (
              <PointColumn
                key={pn}
                pointNum={pn}
                point={state.points[pn - 1]}
                isTop={true}
                isSelected={selectedFrom === pn}
                isDestination={isDestination(pn)}
                isSelectable={selectableSources.has(pn)}
                onClick={() => handlePointClick(pn)}
              />
            ))}
          </div>
          {/* Bar (top half) */}
          <div
            className="w-10 flex flex-col items-center justify-start pt-1 gap-0.5"
            style={{ background: 'rgba(0,0,0,.3)' }}
            onClick={handleBarClick}
          >
            {oppColor && state.bar[oppColor] > 0 && (
              <div className="relative">
                <Checker color={oppColor} />
                {state.bar[oppColor] > 1 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[0.6rem] font-bold"
                    style={{ color: oppColor === 'white' ? '#080c1a' : '#080c1a' }}>
                    {state.bar[oppColor]}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-1">
            {topPoints.slice(6, 12).map(pn => (
              <PointColumn
                key={pn}
                pointNum={pn}
                point={state.points[pn - 1]}
                isTop={true}
                isSelected={selectedFrom === pn}
                isDestination={isDestination(pn)}
                isSelectable={selectableSources.has(pn)}
                onClick={() => handlePointClick(pn)}
              />
            ))}
          </div>
        </div>

        {/* Center: dice + controls */}
        <div className="flex items-center justify-center gap-3 py-3.5 px-3" style={{ height: '56px' }}>
          {state.dice && state.dice.values && state.dice.remaining && (() => {
            // Show all dice: 2 for normal, 4 for doubles
            const allDice = state.dice!.values;
            const remaining = state.dice!.remaining;

            // Track which dice are used (left to right)
            const remainingCopy = [...remaining];
            const diceStatus = allDice.map(val => {
              const idx = remainingCopy.indexOf(val);
              if (idx !== -1) {
                remainingCopy.splice(idx, 1);
                return false; // not used
              }
              return true; // used
            });

            const hasPendingMoves = isMyTurn && state.pendingMoves.length > 0;

            // Map each die to which pending move index it corresponds to
            // Used die 0 = move 0, used die 1 = move 1, etc.
            let usedCount = 0;
            const dieToMoveIndex = diceStatus.map(used => used ? usedCount++ : -1);

            return (
              <div className="flex gap-2">
                {allDice.map((val, i) => {
                  const isUsed = diceStatus[i];
                  const moveIndex = dieToMoveIndex[i];

                  function handleDieClick() {
                    if (!isUsed || !hasPendingMoves) return;
                    // Undo all moves from this die onward (keep moves before it)
                    onUndoTo(moveIndex);
                  }

                  return (
                    <div
                      key={i}
                      onClick={handleDieClick}
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold transition-all duration-200"
                      style={{
                        background: isUsed ? 'rgba(240,194,127,.08)' : 'rgba(240,194,127,.18)',
                        color: isUsed ? 'rgba(232,230,240,.35)' : 'var(--cream)',
                        opacity: isUsed ? 0.7 : 1,
                        border: isUsed ? '1px solid rgba(240,194,127,.1)' : '1px solid rgba(240,194,127,.3)',
                        cursor: isUsed && hasPendingMoves ? 'pointer' : 'default',
                        transform: isUsed ? 'scale(0.9)' : 'scale(1)',
                      }}
                    >
                      {val}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Roll button — same height as dice */}
          {isMyTurn && state.phase === 'rolling' && (
            <button onClick={onRoll} className="btn-primary text-sm font-bold h-10 px-5 rounded-lg">
              🎲 Roll
            </button>
          )}

          {/* Offer Double */}
          {canOfferDouble && (
            <button onClick={onOfferDouble} className="btn-secondary text-xs px-3 h-10 rounded-lg">
              Double
            </button>
          )}
        </div>

        {/* Bottom row */}
        <div className="flex">
          <div className="flex flex-1">
            {bottomPoints.slice(0, 6).map(pn => (
              <PointColumn
                key={pn}
                pointNum={pn}
                point={state.points[pn - 1]}
                isTop={false}
                isSelected={selectedFrom === pn}
                isDestination={isDestination(pn)}
                isSelectable={selectableSources.has(pn)}
                onClick={() => handlePointClick(pn)}
              />
            ))}
          </div>
          {/* Bar (bottom half) */}
          <div
            className="w-10 flex flex-col items-center justify-end pb-1 gap-0.5"
            style={{ background: 'rgba(0,0,0,.3)', cursor: selectableSources.has('bar') ? 'pointer' : 'default' }}
            onClick={handleBarClick}
          >
            {myColor && state.bar[myColor] > 0 && (
              <div className="relative">
                <Checker
                  color={myColor}
                  selected={selectedFrom === 'bar'}
                  selectable={selectableSources.has('bar')}
                />
                {state.bar[myColor] > 1 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[0.6rem] font-bold"
                    style={{ color: '#080c1a' }}>
                    {state.bar[myColor]}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-1">
            {bottomPoints.slice(6, 12).map(pn => (
              <PointColumn
                key={pn}
                pointNum={pn}
                point={state.points[pn - 1]}
                isTop={false}
                isSelected={selectedFrom === pn}
                isDestination={isDestination(pn)}
                isSelectable={selectableSources.has(pn)}
                onClick={() => handlePointClick(pn)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bear off tray */}
      {canBearOff && (
        <button
          onClick={handleBearOffClick}
          className="btn-primary text-sm px-5 py-2"
        >
          Bear Off
        </button>
      )}

      {/* Double offered to me */}
      {doubleOfferedToMe && (
        <div className="w-full rounded-xl p-4 text-center"
          style={{ background: 'rgba(240,194,127,.08)', border: '1px solid rgba(240,194,127,.2)' }}>
          <p className="text-sm font-semibold text-pearl mb-3">
            {oppName} offers to double (cube → {state.cube.value * 2})
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={onAcceptDouble} className="btn-primary text-sm px-5 py-2">
              Accept
            </button>
            <button onClick={onDeclineDouble} className="btn-danger text-sm px-5 py-2">
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Doubling cube display */}
      {state.cubeEnabled && state.cube.value > 1 && (
        <div className="flex items-center gap-1.5">
          <div
            className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
            style={{ background: 'rgba(240,194,127,.15)', color: 'var(--pearl)', border: '1px solid rgba(240,194,127,.3)' }}
          >
            {state.cube.value}
          </div>
          {state.cube.owner && (
            <span className="text-xs" style={{ color: 'rgba(232,230,240,.35)' }}>
              {state.cube.owner === myColor ? myName : oppName} owns
            </span>
          )}
        </div>
      )}

      {/* My info */}
      <div className="w-full flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full" style={{ background: myColor ? CHECKER_COLORS[myColor] : '#666' }} />
          <span className="text-sm font-semibold text-cream">{myName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'rgba(232,230,240,.55)' }}>
            Borne off: {myColor ? state.borneOff[myColor] : 0}/15
          </span>
          {state.match && myColor && (
            <span className="text-xs font-bold" style={{ color: 'var(--pearl)' }}>
              {state.match.scores[myColor]} pts
            </span>
          )}
        </div>
      </div>

      {/* Turn indicator — below board */}
      {state.phase !== 'game_over' && state.phase !== 'match_over' && (
        <div
          className="w-full text-center py-2 rounded-lg text-sm font-semibold"
          style={{
            background: isMyTurn ? 'rgba(126,212,126,.1)' : 'rgba(126,184,212,.06)',
            color: isMyTurn ? '#7ed47e' : 'rgba(232,230,240,.4)',
            border: isMyTurn ? '1px solid rgba(126,212,126,.3)' : '1px solid rgba(232,230,240,.08)',
          }}
        >
          {isMyTurn
            ? state.phase === 'rolling'
              ? 'Your turn — Roll the dice'
              : state.phase === 'moving'
                ? 'Your turn — Move your checkers'
                : 'Your turn'
            : state.phase === 'double_offered' && doubleOfferedToMe
              ? `${oppName} offers a double`
              : `${oppName}'s turn`}
        </div>
      )}

      {/* Game Over / Match Over */}
      {(state.phase === 'game_over' || state.phase === 'match_over') && (
        <div className="w-full rounded-xl p-5 text-center animate-fade-in"
          style={{ background: 'rgba(240,194,127,.08)', border: '1px solid rgba(240,194,127,.25)' }}>
          <p className="font-display text-xl text-pearl mb-1">
            {state.winner === myColor ? 'You Win!' : `${oppName} Wins!`}
          </p>
          {state.winType && state.winType !== 'normal' && (
            <p className="text-sm font-bold mb-1" style={{ color: 'var(--pearl)' }}>
              {state.winType === 'gammon' ? 'Gammon!' : 'Backgammon!'}
            </p>
          )}
          {state.pointsScored && (
            <p className="text-xs mb-3" style={{ color: 'rgba(232,230,240,.4)' }}>
              {state.pointsScored} point{state.pointsScored > 1 ? 's' : ''} scored
            </p>
          )}
          {state.phase === 'match_over' && state.match && (
            <p className="text-sm font-bold mb-3 text-pearl">
              Match Over — {state.match.scores.white} to {state.match.scores.black}
            </p>
          )}
          {isOwner && (
            <button onClick={onPlayAgain} className="btn-primary text-sm px-6 py-2">
              Play Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function Checker({ color, selected, selectable, pending }: {
  color: CheckerColor;
  selected?: boolean;
  selectable?: boolean;
  pending?: boolean;
}) {
  return (
    <div
      className="w-7 h-7 rounded-full flex-shrink-0"
      style={{
        background: CHECKER_COLORS[color],
        border: selected
          ? '2px solid #fff'
          : pending
            ? '2px dashed rgba(255,255,255,.5)'
            : `1px solid ${CHECKER_BORDER[color]}`,
        cursor: selectable ? 'pointer' : 'default',
        boxShadow: selected ? '0 0 8px rgba(255,255,255,.3)' : 'none',
      }}
    />
  );
}

function PointColumn({ pointNum, point, isTop, isSelected, isDestination, isSelectable, onClick }: {
  pointNum: number;
  point: { color: CheckerColor | null; count: number };
  isTop: boolean;
  isSelected: boolean;
  isDestination: boolean;
  isSelectable: boolean;
  onClick: () => void;
}) {
  const isEven = pointNum % 2 === 0;
  const triColor = isEven ? 'rgba(240,194,127,.25)' : 'rgba(126,184,212,.25)';
  const maxShow = 5;
  const checkers = point.count > 0 ? Math.min(point.count, maxShow) : 0;
  const overflow = point.count > maxShow ? point.count - maxShow : 0;

  return (
    <div
      className="flex-1 flex flex-col items-center min-h-[160px] relative"
      style={{
        cursor: isSelectable || isDestination ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      {/* Triangle pointing toward center */}
      <svg
        className="absolute inset-x-0"
        style={{ [isTop ? 'top' : 'bottom']: 0 }}
        viewBox="0 0 40 110"
        preserveAspectRatio="none"
        width="100%"
        height="85%"
      >
        <polygon
          points={isTop ? '0,0 40,0 20,110' : '0,110 40,110 20,0'}
          fill={triColor}
        />
      </svg>

      {/* Destination highlight */}
      {isDestination && (
        <div className="absolute inset-0" style={{ background: 'rgba(126,212,126,.12)' }} />
      )}

      {/* Checkers — stacked from edge toward center */}
      <div
        className="relative z-10 flex items-center gap-0.5 w-full"
        style={{
          paddingTop: isTop ? '3px' : 0,
          paddingBottom: isTop ? 0 : '3px',
          height: '100%',
          flexDirection: isTop ? 'column' : 'column-reverse',
          justifyContent: 'flex-start',
          alignItems: 'center',
        }}
      >
        {Array.from({ length: checkers }).map((_, i) => (
          <Checker
            key={i}
            color={point.color!}
            selected={isSelected && i === (isTop ? checkers - 1 : 0)}
            selectable={isSelectable}
            pending={false}
          />
        ))}
        {overflow > 0 && (
          <span className="text-[0.55rem] font-bold" style={{ color: 'rgba(232,230,240,.5)' }}>
            +{overflow}
          </span>
        )}
      </div>

      {/* Destination dot */}
      {isDestination && (
        <div className="absolute inset-x-0 flex justify-center z-20"
          style={{ [isTop ? 'bottom' : 'top']: '6px' }}>
          <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'rgba(126,212,126,.6)', border: '1px solid rgba(126,212,126,.8)' }} />
        </div>
      )}
    </div>
  );
}
