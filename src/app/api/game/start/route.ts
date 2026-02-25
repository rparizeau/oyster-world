import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, refreshRoomTTL } from '@/lib/redis';
import { getPusherServer, roomChannel, playerChannel } from '@/lib/pusher';
import { getGameModule } from '@/lib/games/loader';
import { roomNotFound, notOwner, apiError, invalidPhase } from '@/lib/errors';
import type { Room, GameState } from '@/lib/types';
import { VALID_TARGET_SCORES } from '@/lib/games/whos-deal/constants';
import type { WhosDealGameState } from '@/lib/games/whos-deal';

export async function POST(request: Request) {
  let body: { roomCode?: string; playerId?: string; settings?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400);
  }

  const roomCode = body.roomCode?.trim().toUpperCase();
  const playerId = body.playerId?.trim();
  const clientSettings = body.settings;

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

  // Who's Deal? specific validation
  if (room.gameId === 'whos-deal') {
    const settings = room.settings as { targetScore?: number; teams?: { a: string[]; b: string[] } } | undefined;
    if (!settings?.teams) {
      return apiError('Team configuration required', 'INVALID_SETTING', 400);
    }
    if (settings.teams.a.length !== 2 || settings.teams.b.length !== 2) {
      return apiError('Each team must have exactly 2 players', 'INVALID_SETTING', 400);
    }
    const targetScore = settings.targetScore || 10;
    if (!(VALID_TARGET_SCORES as readonly number[]).includes(targetScore)) {
      return apiError('Invalid target score', 'INVALID_SETTING', 400);
    }
  }

  // Merge client-provided settings with room settings (client wins)
  const mergedSettings = { ...room.settings, ...clientSettings };

  // Use the GameModule interface for all games
  const gameState = gameModule.initialize(room.players, mergedSettings) as Room['game'];

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
  } else if (room.gameId === 'whos-deal') {
    // Who's Deal?: send game info + private hands
    const wdState = gameState as WhosDealGameState;
    try {
      await pusher.trigger(roomChannel(roomCode), 'game-started', {
        teams: wdState.teams,
        seats: wdState.seats,
        dealer: wdState.dealerSeatIndex,
        faceUpCard: wdState.round!.faceUpCard,
        targetScore: wdState.targetScore,
      });
    } catch {
      // Non-fatal
    }

    for (const pid of wdState.seats) {
      const hand = wdState.round!.hands[pid];
      if (hand) {
        try {
          await pusher.trigger(playerChannel(pid), 'hand-updated', { hand });
        } catch {
          // Non-fatal
        }
      }
    }
  } else if (room.gameId === 'minesweeper') {
    // Minesweeper: single-player, client owns game state — just signal start
    try {
      await pusher.trigger(roomChannel(roomCode), 'game-started', {
        gameState: gameState,
      });
    } catch {
      // Non-fatal
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
