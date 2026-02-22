import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getRoom, atomicRoomUpdate, createSession, setHeartbeat } from '@/lib/redis';
import { getPusherServer, roomChannel } from '@/lib/pusher';
import { generatePlayerId } from '@/lib/utils';
import { roomNotFound, roomFull, gameInProgress, raceCondition, apiError } from '@/lib/errors';
import type { Player, PlayerSession } from '@/lib/types';

export async function POST(request: Request) {
  let body: { roomCode?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400);
  }

  const roomCode = body.roomCode?.trim().toUpperCase();
  const name = body.name?.trim();

  if (!roomCode) {
    return apiError('Room code is required', 'INVALID_REQUEST', 400);
  }
  if (!name || name.length === 0 || name.length > 30) {
    return apiError('Name is required (max 30 characters)', 'INVALID_NAME', 400);
  }

  // Check room exists and is joinable
  const room = await getRoom(roomCode);
  if (!room) return roomNotFound();
  if (room.status !== 'waiting') return gameInProgress();

  const hasBotSeat = room.players.some((p) => p.isBot);
  if (!hasBotSeat) return roomFull();

  const playerId = generatePlayerId();
  const now = Date.now();

  const newPlayer: Player = {
    id: playerId,
    name,
    isBot: false,
    isConnected: true,
    joinedAt: now,
    score: 0,
  };

  // Atomic seat claim: replace first bot with new player
  const tryJoin = async (): Promise<boolean> => {
    const updated = await atomicRoomUpdate(roomCode, (current) => {
      // Re-validate inside transaction
      if (current.status !== 'waiting') return null;

      const botIndex = current.players.findIndex((p) => p.isBot);
      if (botIndex === -1) return null;

      const updatedPlayers = [...current.players];
      updatedPlayers[botIndex] = newPlayer;

      return { ...current, players: updatedPlayers };
    });
    return updated !== null;
  };

  // Try once, retry once on race condition
  let success = await tryJoin();
  if (!success) {
    // Retry once — the room may have been modified by another concurrent join
    success = await tryJoin();
    if (!success) {
      // Check if it's because no seats or room gone
      const recheck = await getRoom(roomCode);
      if (!recheck) return roomNotFound();
      if (recheck.status !== 'waiting') return gameInProgress();
      if (!recheck.players.some((p) => p.isBot)) return roomFull();
      return raceCondition();
    }
  }

  // Store session and heartbeat
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
    maxAge: 7200,
  });

  // Trigger Pusher event
  try {
    await getPusherServer().trigger(roomChannel(roomCode), 'player-joined', {
      player: newPlayer,
    });
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ roomCode, playerId, playerName: name });
}
