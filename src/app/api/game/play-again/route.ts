import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, refreshRoomTTL } from '@/lib/redis';
import { getPusherServer, roomChannel, playerChannel } from '@/lib/pusher';
import { reinitializeGame } from '@/lib/game-engine';
import { loadCards } from '@/lib/cards';
import { roomNotFound, notOwner, apiError, invalidPhase } from '@/lib/errors';

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

  // Idempotent: if already restarted, return success
  if (room.game && room.game.phase === 'czar_reveal' && room.game.currentRound === 1) {
    return NextResponse.json({ success: true });
  }

  if (!room.game || room.game.phase !== 'game_over') {
    return invalidPhase();
  }

  const cards = loadCards();
  const now = Date.now();

  // Reset player scores
  const resetPlayers = room.players.map((p) => ({ ...p, score: 0 }));

  const gameState = reinitializeGame({ ...room, players: resetPlayers }, cards, now);

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    if (!current.game) return null;

    // Idempotent: if we're already back in czar_reveal round 1, it was already restarted
    if (current.game.phase === 'czar_reveal' && current.game.currentRound === 1) {
      return current;
    }

    // Must be game_over to restart
    if (current.game.phase !== 'game_over') return null;

    return {
      ...current,
      players: resetPlayers,
      game: gameState,
    };
  });

  if (!updated) {
    return apiError('Failed to restart game', 'RACE_CONDITION', 409);
  }

  await refreshRoomTTL(roomCode);

  const pusher = getPusherServer();

  // Send game-started event with new state
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

  // Send each player their new hand
  for (const player of updated.players) {
    const hand = gameState.hands[player.id];
    if (hand) {
      try {
        await pusher.trigger(playerChannel(player.id), 'hand-updated', {
          hand,
        });
      } catch {
        // Non-fatal
      }
    }
  }

  return NextResponse.json({ success: true });
}
