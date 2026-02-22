import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, refreshRoomTTL } from '@/lib/redis';
import { getPusherServer, roomChannel } from '@/lib/pusher';
import { submitCards } from '@/lib/game-engine';
import { roomNotFound, unauthorized, apiError, invalidPhase, alreadySubmitted, invalidSubmission } from '@/lib/errors';

export async function POST(request: Request) {
  let body: { roomCode?: string; playerId?: string; cardIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400);
  }

  const roomCode = body.roomCode?.trim().toUpperCase();
  const playerId = body.playerId?.trim();
  const cardIds = body.cardIds;

  if (!roomCode || !playerId || !Array.isArray(cardIds)) {
    return apiError('Room code, player ID, and card IDs are required', 'INVALID_REQUEST', 400);
  }

  const room = await getRoom(roomCode);
  if (!room) return roomNotFound();

  // Validate player is in room
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return unauthorized();

  if (!room.game) return invalidPhase();

  // Use pure function to calculate new state
  const result = submitCards(room.game, playerId, cardIds, room.players);

  if (!result.ok) {
    switch (result.code) {
      case 'INVALID_PHASE': return invalidPhase();
      case 'ALREADY_SUBMITTED': return alreadySubmitted();
      case 'INVALID_SUBMISSION': return invalidSubmission();
      default: return apiError(result.error, result.code, 400);
    }
  }

  const newGameState = result.data;

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    if (!current.game) return null;

    // Idempotent check
    if (current.game.submissions[playerId]) return current;

    // Re-validate phase in case it changed
    if (current.game.phase !== 'submitting') return null;

    return {
      ...current,
      game: newGameState,
    };
  });

  if (!updated) {
    return apiError('Failed to submit', 'RACE_CONDITION', 409);
  }

  await refreshRoomTTL(roomCode);

  const pusher = getPusherServer();

  // Notify room that a player submitted (no card data)
  try {
    await pusher.trigger(roomChannel(roomCode), 'player-submitted', {
      playerId,
    });
  } catch {
    // Non-fatal
  }

  // If phase transitioned to judging, reveal submissions
  if (newGameState.phase === 'judging') {
    const anonymousSubmissions = newGameState.revealOrder.map((id) => ({
      id,
      cards: newGameState.submissions[id],
    }));

    try {
      await pusher.trigger(roomChannel(roomCode), 'phase-changed', {
        phase: 'judging',
        blackCard: newGameState.blackCard,
        czarId: room.players[newGameState.czarIndex]?.id,
      });

      await pusher.trigger(roomChannel(roomCode), 'submissions-revealed', {
        submissions: anonymousSubmissions,
      });
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({ success: true });
}
