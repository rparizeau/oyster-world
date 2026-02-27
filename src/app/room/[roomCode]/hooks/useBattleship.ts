import { useEffect, useState, useCallback } from 'react';
import type { Room, Player } from '@/lib/types';
import type { SanitizedBattleshipState, ShotResult, ShipPlacement } from '@/lib/games/battleship';
import type Channel from 'pusher-js/types/src/core/channels/channel';

export interface BattleshipResult {
  battleshipState: SanitizedBattleshipState | null;
  handlePlaceShips: (placements: ShipPlacement[]) => void;
  handleFire: (row: number, col: number) => void;
}

export function useBattleship(
  roomCode: string,
  playerId: string | null,
  room: Room | null,
  roomCh: Channel | null,
  playerCh: Channel | null,
  setRoom: React.Dispatch<React.SetStateAction<Room | null>>,
  addToast: (message: string, type: 'info' | 'success' | 'warning') => void,
): BattleshipResult {
  const [battleshipState, setBattleshipState] = useState<SanitizedBattleshipState | null>(null);

  // Hydrate from initial room fetch — sanitize the server state for this player
  useEffect(() => {
    if (!room?.game || room.gameId !== 'battleship' || battleshipState) return;
    // The game state from room fetch is the raw server state; we need to treat it
    // as a sanitized state if it comes from the fetch (the room page fetches
    // sanitized state from the API)
    const g = room.game as unknown as SanitizedBattleshipState;
    if (g.phase) {
      setBattleshipState(g);
    }
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Room channel bindings
  useEffect(() => {
    if (!roomCh || room?.gameId !== 'battleship') return;

    const onGameStarted = (data: {
      phase?: string;
      gridSize?: number;
      setupReady?: string[];
      turnOrder?: [string, string];
      // Exclude other game types
      teams?: unknown;
      seats?: string[];
      gameState?: { board?: unknown };
    }) => {
      // Skip non-battleship events
      if (data.teams && data.seats) return;
      if (data.gameState && 'board' in data.gameState) return;
      if (!data.phase) return;

      // Basic state will be populated via board-updated private channel
      setBattleshipState((prev) => {
        if (prev) return prev; // Don't overwrite existing state
        return null; // Wait for board-updated
      });
    };

    const onSetupReady = (data: { playerId: string }) => {
      setBattleshipState((prev) => {
        if (!prev) return prev;
        if (prev.setupReady.includes(data.playerId)) return prev;
        return { ...prev, setupReady: [...prev.setupReady, data.playerId] };
      });
      if (data.playerId !== playerId) {
        addToast('Opponent is ready!', 'success');
      }
    };

    const onShotFired = (data: { shot: ShotResult }) => {
      setBattleshipState((prev) => {
        if (!prev) return prev;
        return { ...prev, lastShot: data.shot };
      });
    };

    const onShipSunk = (data: { shot: ShotResult; shipName: string }) => {
      if (data.shot.attackerId === playerId) {
        addToast(`You sunk their ${data.shipName}!`, 'success');
      } else {
        addToast(`Your ${data.shipName} was sunk!`, 'warning');
      }
    };

    const onGameOver = (data: {
      winner?: string;
      boards?: unknown;
      // Exclude other game types
      finalBoard?: unknown;
      winningTeam?: string;
      finalScores?: unknown;
    }) => {
      // Skip non-battleship events
      if ('finalBoard' in data) return;
      if ('winningTeam' in data && data.winningTeam) return;
      if (data.finalScores && !data.boards) return;

      setBattleshipState((prev) => {
        if (!prev) return prev;
        return { ...prev, phase: 'game_over', winner: data.winner ?? null };
      });
    };

    const onPlayerLeft = (data: { playerId: string; replacementBot: Player }) => {
      setBattleshipState((prev) => {
        if (!prev) return prev;
        const swapId = (id: string) => id === data.playerId ? data.replacementBot.id : id;
        return {
          ...prev,
          currentTurn: swapId(prev.currentTurn),
          turnOrder: [swapId(prev.turnOrder[0]), swapId(prev.turnOrder[1])] as [string, string],
          setupReady: prev.setupReady.map(swapId),
          winner: prev.winner ? swapId(prev.winner) : null,
        };
      });
    };

    roomCh.bind('game-started', onGameStarted);
    roomCh.bind('setup-ready', onSetupReady);
    roomCh.bind('shot-fired', onShotFired);
    roomCh.bind('ship-sunk', onShipSunk);
    roomCh.bind('game-over', onGameOver);
    roomCh.bind('player-left', onPlayerLeft);

    return () => {
      roomCh.unbind('game-started', onGameStarted);
      roomCh.unbind('setup-ready', onSetupReady);
      roomCh.unbind('shot-fired', onShotFired);
      roomCh.unbind('ship-sunk', onShipSunk);
      roomCh.unbind('game-over', onGameOver);
      roomCh.unbind('player-left', onPlayerLeft);
    };
  }, [roomCh, room?.gameId, playerId, addToast]);

  // Private channel: personalized board updates
  useEffect(() => {
    if (!playerCh || room?.gameId !== 'battleship') return;

    const onBoardUpdated = (data: { board: SanitizedBattleshipState }) => {
      // Ensure this is a battleship board (has gridSize)
      if (!data.board || !('gridSize' in data.board)) return;
      setBattleshipState(data.board);
    };

    playerCh.bind('board-updated', onBoardUpdated);
    return () => {
      playerCh.unbind('board-updated', onBoardUpdated);
    };
  }, [playerCh, room?.gameId]);

  // --- Actions ---

  const handlePlaceShips = useCallback(async (placements: ShipPlacement[]) => {
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
          type: 'place-ships',
          payload: { placements },
        }),
      });
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId]);

  const handleFire = useCallback(async (row: number, col: number) => {
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
          type: 'fire',
          payload: { row, col },
        }),
      });
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId]);

  return { battleshipState, handlePlaceShips, handleFire };
}
