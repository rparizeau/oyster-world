import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, refreshRoomTTL } from '@/lib/redis';
import { getPusherServer, roomChannel, playerChannel } from '@/lib/pusher';
import { getGameModule } from '@/lib/games/loader';
import { reinitializeGame } from '@/lib/games/terrible-people';
import { loadCards } from '@/lib/games/terrible-people';
import { processPlayAgain } from '@/lib/games/4-kate';
import type { FourKateState } from '@/lib/games/4-kate';
import { roomNotFound, notOwner, apiError, invalidPhase } from '@/lib/errors';
import type { GameState } from '@/lib/games/terrible-people';

export async function POST(request: Request) {
  let body: { roomCode?: string; playerId?: string };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400);
  }

  const roomCode = body.roomCode?.trim().toUpperCase();
  const playerId = body.playerId?.trim();

  if (!roomCode || !playerId) {
    return apiError('Room code and player ID are required', 'INVALID_REQUEST', 400);
  }

  const room = await getRoom(roomCode);
  if (!room) return roomNotFound();

  // Validate requester is owner
  if (room.ownerId !== playerId) return notOwner();

  if (!room.game) {
    return invalidPhase();
  }

  const pusher = getPusherServer();

  // --- Terrible People ---
  if (room.gameId === 'terrible-people') {
    const game = room.game as GameState;

    // Idempotent: if already restarted, return success
    if (game.phase === 'czar_reveal' && game.currentRound === 1) {
      return NextResponse.json({ success: true });
    }

    if (game.phase !== 'game_over') {
      return invalidPhase();
    }

    const cards = loadCards();
    const now = Date.now();
    const resetPlayers = room.players.map((p) => ({ ...p, score: 0 }));
    const gameState = reinitializeGame(resetPlayers, cards, now);

    const updated = await atomicRoomUpdate(roomCode, (current) => {
      if (!current.game) return null;
      const currentGame = current.game as GameState;
      if (currentGame.phase === 'czar_reveal' && currentGame.currentRound === 1) return current;
      if (currentGame.phase !== 'game_over') return null;
      return { ...current, players: resetPlayers, game: gameState };
    });

    if (!updated) {
      return apiError('Failed to restart game', 'RACE_CONDITION', 409);
    }

    await refreshRoomTTL(roomCode);

    try {
      await pusher.trigger(roomChannel(roomCode), 'game-started', {
        gameState: {
          currentRound: gameState.currentRound,
          targetScore: gameState.targetScore,
          czarIndex: gameState.czarIndex,
          phase: gameState.phase,
          phaseEndsAt: gameState.phaseEndsAt,
          blackCard: gameState.blackCard,
          submissions: {},
          revealOrder: [],
          roundWinnerId: null,
        },
      });
    } catch {
      // Non-fatal
    }

    for (const player of updated.players) {
      const hand = gameState.hands[player.id];
      if (hand) {
        try {
          await pusher.trigger(playerChannel(player.id), 'hand-updated', { hand });
        } catch {
          // Non-fatal
        }
      }
    }

    return NextResponse.json({ success: true });
  }

  // --- 4 Kate ---
  if (room.gameId === '4-kate') {
    const game = room.game as FourKateState;

    // Idempotent: if already restarted
    if (game.phase === 'playing' && game.moves.length === 0) {
      return NextResponse.json({ success: true });
    }

    if (game.phase !== 'game_over') {
      return invalidPhase();
    }

    const newState = processPlayAgain(game, room.players);

    const updated = await atomicRoomUpdate(roomCode, (current) => {
      if (!current.game) return null;
      const currentGame = current.game as FourKateState;
      if (currentGame.phase === 'playing' && currentGame.moves.length === 0) return current;
      if (currentGame.phase !== 'game_over') return null;
      // Reset scores for 4 Kate play-again
      const resetPlayers = current.players.map((p) => ({ ...p, score: 0 }));
      return { ...current, players: resetPlayers, game: newState };
    });

    if (!updated) {
      return apiError('Failed to restart game', 'RACE_CONDITION', 409);
    }

    await refreshRoomTTL(roomCode);

    const gameModule = getGameModule('4-kate')!;
    const sanitized = gameModule.sanitizeForPlayer(newState, '');

    try {
      await pusher.trigger(roomChannel(roomCode), 'game-started', {
        gameState: sanitized,
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ success: true });
  }

  // --- Daily Pearl (Wordle) ---
  if (room.gameId === 'wordle') {
    // Return to lobby (same as Minesweeper)
    const updated = await atomicRoomUpdate(roomCode, (current) => {
      return { ...current, status: 'waiting' as const, game: null };
    });

    if (!updated) {
      return apiError('Failed to return to lobby', 'RACE_CONDITION', 409);
    }

    await refreshRoomTTL(roomCode);

    try {
      await pusher.trigger(roomChannel(roomCode), 'room-updated', { room: updated });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ success: true });
  }

  // --- Minesweeper ---
  if (room.gameId === 'minesweeper') {
    // "Change Difficulty" — return to lobby with room reset to 'waiting'
    const updated = await atomicRoomUpdate(roomCode, (current) => {
      return { ...current, status: 'waiting' as const, game: null };
    });

    if (!updated) {
      return apiError('Failed to return to lobby', 'RACE_CONDITION', 409);
    }

    await refreshRoomTTL(roomCode);

    try {
      await pusher.trigger(roomChannel(roomCode), 'room-updated', { room: updated });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ success: true });
  }

  return apiError('Unknown game module', 'INVALID_GAME', 400);
}
