import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, deleteRoom, deleteSession, deleteHeartbeat } from '@/lib/redis';
import { getPusherServer, roomChannel } from '@/lib/pusher';
import { createBotForSeat } from '@/lib/utils';
import { roomNotFound, unauthorized, apiError } from '@/lib/errors';
import { BOT_SUBMIT_DELAY_RANGE_MS, BOT_JUDGE_DELAY_MS } from '@/lib/constants';
import { getBotActionTimestamp } from '@/lib/games/terrible-people/bots';
import { BOT_MOVE_DELAY_MS } from '@/lib/games/4-kate/constants';
import type { FourKateState } from '@/lib/games/4-kate';
import type { WhosDealGameState } from '@/lib/games/whos-deal';
import { getBotActionTimestamp as getWDBotTimestamp } from '@/lib/games/whos-deal';
import type { GameState } from '@/lib/types';

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
      if (current.gameId === 'terrible-people') {
        const tpGame = game as GameState;
        const hands = { ...tpGame.hands };
        const submissions = { ...tpGame.submissions };

        if (hands[playerId]) {
          hands[bot.id] = hands[playerId];
          delete hands[playerId];
        }

        if (submissions[playerId]) {
          submissions[bot.id] = submissions[playerId];
          delete submissions[playerId];
        }

        let botActionAt = tpGame.botActionAt;

        if (tpGame.phase === 'submitting' && !submissions[bot.id] && idx !== tpGame.czarIndex) {
          botActionAt = getBotActionTimestamp(BOT_SUBMIT_DELAY_RANGE_MS);
        }

        if (tpGame.phase === 'judging' && idx === tpGame.czarIndex && tpGame.roundWinnerId === null) {
          botActionAt = Date.now() + BOT_JUDGE_DELAY_MS;
        }

        const revealOrder = tpGame.revealOrder.map((id) =>
          id === playerId ? bot.id : id
        );

        game = { ...tpGame, hands, submissions, botActionAt, revealOrder };
      } else if (current.gameId === '4-kate') {
        const fkGame = game as FourKateState;
        const players = { ...fkGame.players };

        // Transfer the departing player's color to the bot
        if (players.red === playerId) {
          players.red = bot.id;
        } else if (players.yellow === playerId) {
          players.yellow = bot.id;
        }

        let botActionAt = fkGame.botActionAt;
        // If it's now the bot's turn, set botActionAt
        const currentTurnPlayerId = fkGame.currentTurn === 'red' ? players.red : players.yellow;
        if (fkGame.phase === 'playing' && currentTurnPlayerId === bot.id) {
          botActionAt = Date.now() + BOT_MOVE_DELAY_MS;
        }

        game = { ...fkGame, players, botActionAt };
      } else if (current.gameId === 'whos-deal') {
        const wdGame = game as WhosDealGameState;

        // Update seats
        const seats = wdGame.seats.map(id => id === playerId ? bot.id : id);

        // Update teams
        const teams = {
          a: {
            ...wdGame.teams.a,
            playerIds: wdGame.teams.a.playerIds.map(id =>
              id === playerId ? bot.id : id
            ) as [string, string],
          },
          b: {
            ...wdGame.teams.b,
            playerIds: wdGame.teams.b.playerIds.map(id =>
              id === playerId ? bot.id : id
            ) as [string, string],
          },
        };

        // Update round
        let round = wdGame.round;
        if (round) {
          const hands = { ...round.hands };
          if (hands[playerId]) {
            hands[bot.id] = hands[playerId];
            delete hands[playerId];
          }

          const passedPlayers = round.passedPlayers.map(id =>
            id === playerId ? bot.id : id
          );
          const currentTrick = round.currentTrick.map(tc =>
            tc.playerId === playerId ? { ...tc, playerId: bot.id } : tc
          );
          const callingPlayerId = round.callingPlayerId === playerId ? bot.id : round.callingPlayerId;
          const alonePlayerId = round.alonePlayerId === playerId ? bot.id : round.alonePlayerId;

          round = {
            ...round,
            hands,
            passedPlayers,
            currentTrick,
            callingPlayerId,
            alonePlayerId,
          };
        }

        // If it was the departing player's turn, set botActionAt
        let botActionAt = wdGame.botActionAt;
        if (round && round.trumpPhase !== 'round_over' && wdGame.phase !== 'game_over') {
          const currentTurnId = seats[round.currentTurnSeatIndex];
          if (currentTurnId === bot.id) {
            botActionAt = getWDBotTimestamp();
          }
        }

        game = { ...wdGame, seats, teams, round, botActionAt };
      }
    }

    // Update Who's Deal? team settings: replace departing player with bot
    let updatedSettings = current.settings;
    if (current.gameId === 'whos-deal' && current.settings?.teams && current.status === 'waiting') {
      const teams = current.settings.teams as { a: string[]; b: string[] };
      updatedSettings = {
        ...current.settings,
        teams: {
          a: teams.a.map((id: string) => id === playerId ? bot.id : id),
          b: teams.b.map((id: string) => id === playerId ? bot.id : id),
        },
      };
    }

    return { ...current, players: updatedPlayers, ownerId: newOwnerId, game, settings: updatedSettings };
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
    const pusher = getPusherServer();
    await pusher.trigger(roomChannel(roomCode), 'player-left', {
      playerId,
      newOwnerId,
      replacementBot,
    });

    // For Who's Deal?: also push updated teams
    if (updated.gameId === 'whos-deal' && updated.settings?.teams && updated.status === 'waiting') {
      await pusher.trigger(roomChannel(roomCode), 'teams-updated', {
        teams: updated.settings.teams,
      });
    }
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ success: true });
}
