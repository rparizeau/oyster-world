import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, refreshRoomTTL } from '@/lib/redis';
import { getPusherServer, roomChannel, playerChannel } from '@/lib/pusher';
import { initializeGame, startSubmittingPhase } from '@/lib/game-engine';
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

  // Idempotent: if already playing, return success
  if (room.status === 'playing') {
    return NextResponse.json({ success: true });
  }

  if (room.status !== 'waiting') {
    return invalidPhase();
  }

  const cards = loadCards();
  const now = Date.now();
  const gameState = initializeGame(room, cards, now);

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    // Double-check status (idempotent)
    if (current.status === 'playing') return current;
    if (current.status !== 'waiting') return null;

    return {
      ...current,
      status: 'playing' as const,
      game: gameState,
    };
  });

  if (!updated) {
    return apiError('Failed to start game', 'RACE_CONDITION', 409);
  }

  await refreshRoomTTL(roomCode);

  const pusher = getPusherServer();

  // Send sanitized game state to the room (no hands, no decks)
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

  // Send each player their private hand
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
