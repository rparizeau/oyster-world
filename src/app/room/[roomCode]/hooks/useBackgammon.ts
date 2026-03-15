import { useState, useEffect, useCallback } from 'react';
import type { Channel } from 'pusher-js';
import type { Room } from '@/lib/types';
import type { SanitizedBackgammonState, CheckerMove } from '@/lib/games/backgammon';

export interface BackgammonResult {
  backgammonState: SanitizedBackgammonState | null;
  legalMoves: CheckerMove[];
  handleRoll: () => void;
  handleMove: (from: number | 'bar', to: number | 'off', dieUsed: number) => void;
  handleUndoMove: () => void;
  handleConfirmMoves: () => void;
  handleOfferDouble: () => void;
  handleAcceptDouble: () => void;
  handleDeclineDouble: () => void;
}

export function useBackgammon(
  roomCode: string,
  playerId: string | null,
  room: Room | null,
  roomCh: Channel | null,
  _playerCh: Channel | null,
  setRoom: React.Dispatch<React.SetStateAction<Room | null>>,
  addToast: (msg: string, type: 'info' | 'success' | 'warning', position?: 'left' | 'right' | 'center') => void,
): BackgammonResult {
  const [backgammonState, setBackgammonState] = useState<SanitizedBackgammonState | null>(null);
  const [legalMoves, setLegalMoves] = useState<CheckerMove[]>([]);

  // Hydrate from initial room fetch
  useEffect(() => {
    if (!room?.game || room.gameId !== 'backgammon' || backgammonState) return;
    const g = room.game as unknown as SanitizedBackgammonState;
    if (g.phase) setBackgammonState(g);
  }, [room, backgammonState]);

  // Room channel events
  useEffect(() => {
    if (!roomCh || room?.gameId !== 'backgammon') return;

    const onGameStarted = (data: { gameState: SanitizedBackgammonState }) => {
      setBackgammonState(data.gameState);
      setLegalMoves([]);
    };

    const onDiceRolled = (data: { color: string; dice: number[]; legalMoves: CheckerMove[] }) => {
      setBackgammonState(prev => {
        if (!prev) return prev;
        const isDoubles = data.dice.length === 2 && data.dice[0] === data.dice[1];
        const values = isDoubles ? [data.dice[0], data.dice[0], data.dice[0], data.dice[0]] : data.dice;
        return {
          ...prev,
          dice: { values, remaining: [...values] },
          phase: 'moving' as const,
          pendingMoves: [],
        };
      });
      setLegalMoves(data.legalMoves || []);
    };

    const onCheckerMoved = (data: {
      move: CheckerMove;
      pendingMoves: CheckerMove[];
      remainingDice: number[];
      hit: boolean;
      legalMoves?: CheckerMove[];
    }) => {
      if (data.legalMoves) setLegalMoves(data.legalMoves);
      setBackgammonState(prev => {
        if (!prev) return prev;
        // We need to apply the move to the board
        const newPoints = prev.points.map(p => ({ ...p }));
        const newBar = { ...prev.bar };
        const newBorneOff = { ...prev.borneOff };
        const color = prev.currentTurn;
        const opp = color === 'white' ? 'black' : 'white';

        // Remove from source
        if (data.move.from === 'bar') {
          newBar[color]--;
        } else {
          const srcIdx = (data.move.from as number) - 1;
          newPoints[srcIdx] = { ...newPoints[srcIdx], count: newPoints[srcIdx].count - 1 };
          if (newPoints[srcIdx].count === 0) newPoints[srcIdx] = { color: null, count: 0 };
        }

        // Place at destination
        if (data.move.to === 'off') {
          newBorneOff[color]++;
        } else {
          const destIdx = (data.move.to as number) - 1;
          if (data.hit) {
            newBar[opp]++;
            newPoints[destIdx] = { color, count: 1 };
          } else {
            newPoints[destIdx] = { color, count: newPoints[destIdx].count + 1 };
          }
        }

        return {
          ...prev,
          points: newPoints,
          bar: newBar,
          borneOff: newBorneOff,
          dice: prev.dice ? { ...prev.dice, remaining: data.remainingDice } : null,
          pendingMoves: data.pendingMoves.map(m => ({ move: m, boardBefore: { points: [], bar: { white: 0, black: 0 }, borneOff: { white: 0, black: 0 } } })),
        };
      });
    };

    const onMoveUndone = (data: { pendingMoves: CheckerMove[]; remainingDice: number[] }) => {
      // Re-fetch state since undo requires board restoration
      setBackgammonState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          dice: prev.dice ? { ...prev.dice, remaining: data.remainingDice } : null,
        };
      });
    };

    const onTurnConfirmed = (data: { gameState: SanitizedBackgammonState }) => {
      setBackgammonState(data.gameState);
      setLegalMoves([]);
    };

    const onTurnPassed = (data: { color: string; reason: string }) => {
      addToast(`${data.color === 'white' ? 'White' : 'Black'} has no legal moves`, 'info');
      setBackgammonState(prev => {
        if (!prev) return prev;
        const nextColor = prev.currentTurn === 'white' ? 'black' : 'white';
        return { ...prev, currentTurn: nextColor, phase: 'rolling' as const, dice: null, pendingMoves: [] };
      });
      setLegalMoves([]);
    };

    const onDoubleOffered = (data: { offeredBy: string; cubeValue: number }) => {
      setBackgammonState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'double_offered' as const,
          cube: { ...prev.cube, offeredBy: data.offeredBy as 'white' | 'black' },
        };
      });
    };

    const onDoubleAccepted = (data: { acceptedBy: string; newCubeValue: number }) => {
      setBackgammonState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'rolling' as const,
          cube: { value: data.newCubeValue, owner: data.acceptedBy as 'white' | 'black', offeredBy: null },
        };
      });
    };

    const onDoubleDeclined = (data: { declinedBy: string }) => {
      // Game over will follow
      setBackgammonState(prev => prev);
    };

    const onGameOver = (data: {
      winner: string;
      winType: string;
      pointsScored: number;
      match: unknown;
    }) => {
      setBackgammonState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: (data.match && (prev.match?.scores?.white ?? 0) + (prev.match?.scores?.black ?? 0) + data.pointsScored >= (prev.match?.target ?? 999)
            ? 'match_over' : 'game_over') as SanitizedBackgammonState['phase'],
          winner: data.winner as 'white' | 'black',
          winType: data.winType as 'normal' | 'gammon' | 'backgammon',
          pointsScored: data.pointsScored,
        };
      });
      setLegalMoves([]);
    };

    const onPlayerLeft = () => {
      // Handled by room connection
    };

    roomCh.bind('game-started', onGameStarted);
    roomCh.bind('dice-rolled', onDiceRolled);
    roomCh.bind('checker-moved', onCheckerMoved);
    roomCh.bind('move-undone', onMoveUndone);
    roomCh.bind('turn-confirmed', onTurnConfirmed);
    roomCh.bind('turn-passed', onTurnPassed);
    roomCh.bind('double-offered', onDoubleOffered);
    roomCh.bind('double-accepted', onDoubleAccepted);
    roomCh.bind('double-declined', onDoubleDeclined);
    roomCh.bind('game-over', onGameOver);
    roomCh.bind('player-left', onPlayerLeft);

    return () => {
      roomCh.unbind('game-started', onGameStarted);
      roomCh.unbind('dice-rolled', onDiceRolled);
      roomCh.unbind('checker-moved', onCheckerMoved);
      roomCh.unbind('move-undone', onMoveUndone);
      roomCh.unbind('turn-confirmed', onTurnConfirmed);
      roomCh.unbind('turn-passed', onTurnPassed);
      roomCh.unbind('double-offered', onDoubleOffered);
      roomCh.unbind('double-accepted', onDoubleAccepted);
      roomCh.unbind('double-declined', onDoubleDeclined);
      roomCh.unbind('game-over', onGameOver);
      roomCh.unbind('player-left', onPlayerLeft);
    };
  }, [roomCh, room?.gameId, addToast]);

  // Action handlers
  const sendAction = useCallback(async (type: string, payload?: unknown) => {
    if (!playerId) return;
    const actionId = `${playerId}-${Date.now()}`;
    try {
      const res = await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId, actionId, type, payload }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.error) addToast(data.error, 'warning');
      }
    } catch {
      addToast('Network error', 'warning');
    }
  }, [roomCode, playerId, addToast]);

  const handleRoll = useCallback(() => sendAction('ROLL'), [sendAction]);

  const handleMove = useCallback((from: number | 'bar', to: number | 'off', dieUsed: number) => {
    sendAction('MOVE_CHECKER', { from, to, dieUsed });
  }, [sendAction]);

  const handleUndoMove = useCallback(() => sendAction('UNDO_MOVE'), [sendAction]);
  const handleConfirmMoves = useCallback(() => sendAction('CONFIRM_MOVES'), [sendAction]);
  const handleOfferDouble = useCallback(() => sendAction('OFFER_DOUBLE'), [sendAction]);
  const handleAcceptDouble = useCallback(() => sendAction('ACCEPT_DOUBLE'), [sendAction]);
  const handleDeclineDouble = useCallback(() => sendAction('DECLINE_DOUBLE'), [sendAction]);

  return {
    backgammonState,
    legalMoves,
    handleRoll,
    handleMove,
    handleUndoMove,
    handleConfirmMoves,
    handleOfferDouble,
    handleAcceptDouble,
    handleDeclineDouble,
  };
}
