import { useEffect, useState, useCallback } from 'react';
import type { Room, Player } from '@/lib/types';
import type { FourKateState, CellColor } from '@/lib/games/4-kate';
import type Channel from 'pusher-js/types/src/core/channels/channel';

export interface FourKateResult {
  fourKateState: FourKateState | null;
  setFourKateState: React.Dispatch<React.SetStateAction<FourKateState | null>>;
  handleDropPiece: (column: number) => void;
}

export function useFourKate(
  roomCode: string,
  playerId: string | null,
  room: Room | null,
  roomCh: Channel | null,
  setRoom: React.Dispatch<React.SetStateAction<Room | null>>,
): FourKateResult {
  const [fourKateState, setFourKateState] = useState<FourKateState | null>(null);

  // Hydrate from initial room fetch
  useEffect(() => {
    if (!room?.game || room.gameId !== '4-kate' || fourKateState) return;
    setFourKateState(room.game as FourKateState);
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pusher bindings
  useEffect(() => {
    if (!roomCh || !room) return;

    const onGameStarted = (data: {
      gameState?: FourKateState;
      teams?: unknown;
      seats?: string[];
    }) => {
      if (room.gameId !== '4-kate' && !(data.gameState && 'board' in data.gameState)) return;
      if ('teams' in data && data.teams && data.seats) return; // Who's Deal? event
      if (data.gameState && 'board' in data.gameState) {
        setFourKateState(data.gameState as FourKateState);
      }
    };

    const onMoveMade = (data: {
      column: number;
      row: number;
      color: 'red' | 'yellow';
      currentTurn: 'red' | 'yellow';
      board: CellColor[][];
    }) => {
      setFourKateState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          board: data.board,
          currentTurn: data.currentTurn,
          moves: [...prev.moves, { col: data.column, row: data.row, color: data.color }],
          turnStartedAt: Date.now(),
        };
      });
    };

    const onGameOver = (data: {
      winner?: string | null;
      winningCells?: [number, number][] | null;
      finalBoard?: CellColor[][];
      isDraw?: boolean;
      finalScores?: unknown;
      winningTeam?: string;
    }) => {
      if (!('finalBoard' in data)) return;
      setFourKateState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'game_over',
          winner: data.winner ?? null,
          winningCells: data.winningCells ?? null,
          board: data.finalBoard ?? prev.board,
          isDraw: data.isDraw ?? false,
        };
      });
    };

    const onPlayerLeft = (data: { playerId: string; replacementBot: Player }) => {
      setFourKateState((prev) => {
        if (!prev) return prev;
        const players = { ...prev.players };
        if (players.red === data.playerId) players.red = data.replacementBot.id;
        if (players.yellow === data.playerId) players.yellow = data.replacementBot.id;
        return { ...prev, players };
      });
    };

    roomCh.bind('game-started', onGameStarted);
    roomCh.bind('move-made', onMoveMade);
    roomCh.bind('game-over', onGameOver);
    roomCh.bind('player-left', onPlayerLeft);

    return () => {
      roomCh.unbind('game-started', onGameStarted);
      roomCh.unbind('move-made', onMoveMade);
      roomCh.unbind('game-over', onGameOver);
      roomCh.unbind('player-left', onPlayerLeft);
    };
  }, [roomCh, room?.gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDropPiece = useCallback(async (column: number) => {
    if (!playerId) return;
    try {
      const actionId = `${playerId}-${Date.now()}`;
      await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          playerId,
          actionId,
          type: 'drop',
          payload: { column },
        }),
      });
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId]);

  return { fourKateState, setFourKateState, handleDropPiece };
}
