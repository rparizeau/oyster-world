import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, setHeartbeat, getHeartbeat, refreshRoomTTL, deleteHeartbeat } from '@/lib/redis';
import { getPusherServer, roomChannel } from '@/lib/pusher';
import { createBotForSeat } from '@/lib/utils';
import { DISCONNECT_TIMEOUT_MS, BOT_REPLACEMENT_TIMEOUT_MS } from '@/lib/constants';
import { roomNotFound, apiError } from '@/lib/errors';
import { getGameModule } from '@/lib/games/loader';
import { processGameAdvancement } from '@/lib/gameAdvancement';

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

  const player = room.players.find((p) => p.id === playerId && !p.isBot);
  if (!player) {
    return apiError('Player not in room', 'UNAUTHORIZED', 401);
  }

  // Update this player's heartbeat
  await setHeartbeat(roomCode, playerId);
  await refreshRoomTTL(roomCode);

  // === GAME STATE ADVANCEMENT ===
  if (room.game && room.status === 'playing') {
    await processGameAdvancement(roomCode);
  }

  // === DISCONNECT / REPLACEMENT CHECKS ===
  const now = Date.now();
  const disconnectedIds: string[] = [];
  const replacedIds: string[] = [];

  const currentRoom = await getRoom(roomCode);
  if (!currentRoom) return roomNotFound();

  const humanPlayers = currentRoom.players.filter(p => !p.isBot);
  const heartbeats = await Promise.all(
    humanPlayers.map(p => getHeartbeat(roomCode, p.id))
  );

  for (let i = 0; i < humanPlayers.length; i++) {
    const p = humanPlayers[i];
    const lastSeen = heartbeats[i];
    if (!lastSeen) continue;

    const elapsed = now - lastSeen;

    if (elapsed > BOT_REPLACEMENT_TIMEOUT_MS) {
      replacedIds.push(p.id);
    } else if (elapsed > DISCONNECT_TIMEOUT_MS && p.isConnected) {
      disconnectedIds.push(p.id);
    }
  }

  if (disconnectedIds.length > 0) {
    await atomicRoomUpdate(roomCode, (current) => {
      const updatedPlayers = current.players.map((p) => {
        if (disconnectedIds.includes(p.id)) {
          return { ...p, isConnected: false };
        }
        return p;
      });
      return { ...current, players: updatedPlayers };
    });

    const pusher = getPusherServer();
    for (const id of disconnectedIds) {
      try {
        await pusher.trigger(roomChannel(roomCode), 'player-disconnected', {
          playerId: id,
        });
      } catch {
        // Non-fatal
      }
    }
  }

  if (replacedIds.length > 0) {
    for (const id of replacedIds) {
      await handlePlayerReplacement(roomCode, id);
    }
  }

  const latestRoom = await getRoom(roomCode);
  const latestPlayer = latestRoom?.players.find((p) => p.id === playerId);
  if (latestPlayer && !latestPlayer.isConnected && !latestPlayer.isBot) {
    await atomicRoomUpdate(roomCode, (current) => {
      const updatedPlayers = current.players.map((p) => {
        if (p.id === playerId) return { ...p, isConnected: true };
        return p;
      });
      return { ...current, players: updatedPlayers };
    });

    try {
      await getPusherServer().trigger(roomChannel(roomCode), 'player-reconnected', {
        playerId,
      });
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({ success: true });
}

async function handlePlayerReplacement(roomCode: string, departingPlayerId: string): Promise<void> {
  const currentRoom = await getRoom(roomCode);
  if (!currentRoom) return;

  const replacementBot = createBotForSeat(
    currentRoom.players.filter((p) => p.id !== departingPlayerId)
  );

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    const idx = current.players.findIndex((p) => p.id === departingPlayerId && !p.isBot);
    if (idx === -1) return current;

    const departingPlayer = current.players[idx];
    const updatedPlayers = [...current.players];

    const bot = {
      ...replacementBot,
      score: departingPlayer.score,
    };
    updatedPlayers[idx] = bot;

    let newOwnerId = current.ownerId;
    if (current.ownerId === departingPlayerId) {
      const nextHuman = updatedPlayers.find((p) => !p.isBot);
      if (nextHuman) {
        newOwnerId = nextHuman.id;
      }
    }

    const hasHumans = updatedPlayers.some((p) => !p.isBot);
    if (!hasHumans) return null;

    // Delegate game-specific replacement to the module
    let game = current.game;
    if (game && current.status === 'playing') {
      const module = getGameModule(current.gameId);
      if (module) {
        game = module.processPlayerReplacement(game, departingPlayerId, bot.id, idx, updatedPlayers) as typeof game;
      }
    }

    return { ...current, players: updatedPlayers, ownerId: newOwnerId, game };
  });

  await deleteHeartbeat(roomCode, departingPlayerId);

  if (updated) {
    const pusher = getPusherServer();
    try {
      await pusher.trigger(roomChannel(roomCode), 'player-left', {
        playerId: departingPlayerId,
        newOwnerId: updated.ownerId,
        replacementBot,
      });
    } catch {
      // Non-fatal
    }
  }
}
