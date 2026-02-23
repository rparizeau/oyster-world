import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, refreshRoomTTL } from '@/lib/redis';
import { getPusherServer, roomChannel, playerChannel } from '@/lib/pusher';
import { getGameModule } from '@/lib/games/loader';
import { initializeGame, startSubmittingPhase } from '@/lib/games/terrible-people';
import { loadCards } from '@/lib/games/terrible-people';
import { roomNotFound, notOwner, apiError, invalidPhase } from '@/lib/errors';
import type { Room, GameState } from '@/lib/types';

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

  // Look up game module
  const gameModule = getGameModule(room.gameId);
  if (!gameModule) {
    return apiError('Unknown game module', 'INVALID_GAME', 400);
  }

  // Use the GameModule interface for all games
  const gameState = gameModule.initialize(room.players) as Room['game'];

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

  if (room.gameId === 'terrible-people') {
    // Terrible People: send sanitized state + private hands
    const tpState = gameState as GameState;
    try {
      await pusher.trigger(roomChannel(roomCode), 'game-started', {
        gameState: {
          currentRound: tpState.currentRound,
          targetScore: tpState.targetScore,
          czarIndex: tpState.czarIndex,
          phase: tpState.phase,
          phaseEndsAt: tpState.phaseEndsAt,
          blackCard: tpState.blackCard,
          submissions: {},
          revealOrder: [],
          roundWinnerId: null,
        },
      });
    } catch {
      // Non-fatal
    }

    for (const player of updated.players) {
      const hand = tpState.hands[player.id];
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
  } else {
    // Generic: send full sanitized state (e.g., 4 Kate is full information)
    const sanitized = gameModule.sanitizeForPlayer(gameState, '');
    try {
      await pusher.trigger(roomChannel(roomCode), 'game-started', {
        gameState: sanitized,
      });
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({ success: true });
}
