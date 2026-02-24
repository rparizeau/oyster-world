import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRoom, createSession, roomExists, setHeartbeat } from '@/lib/redis';
import { getPusherServer, roomChannel } from '@/lib/pusher';
import { generateRoomCode, generatePlayerId, fillWithBots } from '@/lib/utils';
import { apiError } from '@/lib/errors';
import { getGameConfig } from '@/lib/games/registry';
import type { Room, Player, PlayerSession } from '@/lib/types';

export async function POST(request: Request) {
  let body: { name?: string; gameId?: string };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400);
  }

  const name = body.name?.trim();
  if (!name || name.length === 0 || name.length > 30) {
    return apiError('Name is required (max 30 characters)', 'INVALID_NAME', 400);
  }

  const gameId = body.gameId?.trim();
  if (!gameId) {
    return apiError('Game selection is required', 'INVALID_GAME', 400);
  }

  const gameConfig = getGameConfig(gameId);
  if (!gameConfig) {
    return apiError('Invalid game', 'INVALID_GAME', 400);
  }

  // Generate collision-checked room code
  let roomCode = generateRoomCode();
  let attempts = 0;
  while (await roomExists(roomCode)) {
    roomCode = generateRoomCode();
    attempts++;
    if (attempts > 10) {
      return apiError('Could not generate room code', 'INTERNAL_ERROR', 500);
    }
  }

  const playerId = generatePlayerId();
  const now = Date.now();

  const creator: Player = {
    id: playerId,
    name,
    isBot: false,
    isConnected: true,
    joinedAt: now,
    score: 0,
  };

  const players = fillWithBots([creator], gameConfig.maxPlayers);

  const room: Room = {
    roomCode,
    createdAt: now,
    status: 'waiting',
    ownerId: playerId,
    gameId,
    players,
    game: null,
  };

  // Initialize default settings for Who's Deal? (team assignment + target score)
  if (gameId === 'whos-deal') {
    room.settings = {
      targetScore: 10,
      teams: {
        a: [players[0].id, players[2].id], // Seats 0 & 2
        b: [players[1].id, players[3].id], // Seats 1 & 3
      },
    };
  }

  await createRoom(room);

  const session: PlayerSession = {
    playerId,
    playerName: name,
    roomCode,
    joinedAt: now,
  };
  await createSession(session);
  await setHeartbeat(roomCode, playerId);

  // Set playerId cookie
  const cookieStore = await cookies();
  cookieStore.set('playerId', playerId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7200, // 2 hours
  });

  // Trigger Pusher event (room created — mainly for future use)
  try {
    await getPusherServer().trigger(roomChannel(roomCode), 'room-created', {
      room: { ...room, game: null },
    });
  } catch {
    // Pusher failure is non-fatal for room creation
  }

  return NextResponse.json({ roomCode, playerId, playerName: name });
}
