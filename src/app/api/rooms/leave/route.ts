import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, deleteRoom, deleteSession, deleteHeartbeat } from '@/lib/redis';
import { getPusherServer, roomChannel } from '@/lib/pusher';
import { createBotForSeat } from '@/lib/utils';
import { roomNotFound, unauthorized, apiError } from '@/lib/errors';
import { BOT_SUBMIT_DELAY_RANGE_MS, BOT_JUDGE_DELAY_MS } from '@/lib/constants';
import { getBotActionTimestamp } from '@/lib/bots';

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

  const playerIndex = room.players.findIndex((p) => p.id === playerId && !p.isBot);
  if (playerIndex === -1) return unauthorized();

  // Check if any other humans will remain
  const remainingHumans = room.players.filter(
    (p) => !p.isBot && p.id !== playerId
  );

  if (remainingHumans.length === 0) {
    // No humans left — destroy room
    await deleteRoom(roomCode);
    await deleteSession(playerId);
    await deleteHeartbeat(roomCode, playerId);

    try {
      await getPusherServer().trigger(roomChannel(roomCode), 'room-destroyed', {});
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ success: true });
  }

  // Replace player with bot and potentially transfer ownership
  const replacementBot = createBotForSeat(
    room.players.filter((p) => p.id !== playerId)
  );

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    const idx = current.players.findIndex((p) => p.id === playerId && !p.isBot);
    if (idx === -1) return null;

    const departingPlayer = current.players[idx];
    const updatedPlayers = [...current.players];

    // Bot inherits score and seat position
    const bot = {
      ...replacementBot,
      score: departingPlayer.score,
    };
    updatedPlayers[idx] = bot;

    let newOwnerId = current.ownerId;
    if (current.ownerId === playerId) {
      // Transfer to next human by join order
      const nextHuman = updatedPlayers.find((p) => !p.isBot);
      if (nextHuman) {
        newOwnerId = nextHuman.id;
      }
    }

    // Handle game-in-progress bot takeover
    let game = current.game;
    if (game && current.status === 'playing') {
      const hands = { ...game.hands };
      const submissions = { ...game.submissions };

      // Bot inherits the departing player's hand
      if (hands[playerId]) {
        hands[bot.id] = hands[playerId];
        delete hands[playerId];
      }

      // Transfer any existing submission
      if (submissions[playerId]) {
        submissions[bot.id] = submissions[playerId];
        delete submissions[playerId];
      }

      let botActionAt = game.botActionAt;

      // If player hadn't submitted and we're in submitting phase, set bot action
      if (game.phase === 'submitting' && !submissions[bot.id] && idx !== game.czarIndex) {
        botActionAt = getBotActionTimestamp(BOT_SUBMIT_DELAY_RANGE_MS);
      }

      // If departing player was Czar during judging, set bot action to judge
      if (game.phase === 'judging' && idx === game.czarIndex && game.roundWinnerId === null) {
        botActionAt = Date.now() + BOT_JUDGE_DELAY_MS;
      }

      // Update revealOrder to use bot id
      const revealOrder = game.revealOrder.map((id) =>
        id === playerId ? bot.id : id
      );

      game = { ...game, hands, submissions, botActionAt, revealOrder };
    }

    return { ...current, players: updatedPlayers, ownerId: newOwnerId, game };
  });

  await deleteSession(playerId);
  await deleteHeartbeat(roomCode, playerId);

  if (!updated) {
    // Fallback: room may have changed, but player is gone
    return NextResponse.json({ success: true });
  }

  // Determine if ownership transferred
  const newOwnerId = updated.ownerId !== playerId ? updated.ownerId : undefined;

  try {
    await getPusherServer().trigger(roomChannel(roomCode), 'player-left', {
      playerId,
      newOwnerId,
      replacementBot,
    });
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ success: true });
}
