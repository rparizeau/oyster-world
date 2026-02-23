import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, refreshRoomTTL, redis } from '@/lib/redis';
import { getGameModule } from '@/lib/games/loader';
import { getPusherServer, roomChannel } from '@/lib/pusher';
import { roomNotFound, unauthorized, apiError } from '@/lib/errors';
import type { Room } from '@/lib/types';
import type { FourKateState } from '@/lib/games/4-kate';
import { BOT_MOVE_DELAY_MS } from '@/lib/games/4-kate/constants';

function actionIdKey(roomCode: string, playerId: string): string {
  return `actionId:${roomCode}:${playerId}`;
}

export async function POST(request: Request) {
  let body: { roomCode?: string; playerId?: string; actionId?: string; type?: string; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400);
  }

  const roomCode = body.roomCode?.trim().toUpperCase();
  const playerId = body.playerId?.trim();
  const actionId = body.actionId?.trim();
  const type = body.type?.trim();
  const payload = body.payload;

  if (!roomCode || !playerId || !type) {
    return apiError('Room code, player ID, and action type are required', 'INVALID_REQUEST', 400);
  }

  const room = await getRoom(roomCode);
  if (!room) return roomNotFound();

  // Validate player is in room
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return unauthorized();

  if (!room.game) {
    return apiError('Game has not started', 'INVALID_PHASE', 409);
  }

  // Look up game module
  const gameModule = getGameModule(room.gameId);
  if (!gameModule) {
    return apiError('Unknown game module', 'INVALID_GAME', 400);
  }

  // actionId idempotency check
  if (actionId) {
    const lastActionId = await redis.get<string>(actionIdKey(roomCode, playerId));
    if (lastActionId === actionId) {
      // Duplicate — return success (no-op)
      return NextResponse.json({ success: true });
    }
  }

  // Dispatch to game module
  const newState = gameModule.processAction(room.game, playerId, { type, payload, actionId });

  // If state didn't change (no-op from module), return success
  if (newState === room.game) {
    return NextResponse.json({ success: true });
  }

  // For 4 Kate: set botActionAt if it's now a bot's turn
  let stateToSave = newState;
  if (room.gameId === '4-kate') {
    const fkState = newState as FourKateState;
    if (fkState.phase === 'playing') {
      const nextPlayerId = fkState.currentTurn === 'red' ? fkState.players.red : fkState.players.yellow;
      const nextPlayer = room.players.find((p) => p.id === nextPlayerId);
      if (nextPlayer?.isBot && !fkState.botActionAt) {
        stateToSave = { ...fkState, botActionAt: Date.now() + BOT_MOVE_DELAY_MS } as unknown as typeof newState;
      }
    }
  }

  // Atomically update
  const updated = await atomicRoomUpdate(roomCode, (current) => {
    if (!current.game) return null;
    return { ...current, game: stateToSave as Room['game'] };
  });

  if (!updated) {
    return apiError('Failed to process action', 'RACE_CONDITION', 409);
  }

  // Track actionId
  if (actionId) {
    await redis.set(actionIdKey(roomCode, playerId), actionId, { ex: 3600 });
  }

  await refreshRoomTTL(roomCode);

  // Trigger Pusher events for 4 Kate
  if (room.gameId === '4-kate') {
    const fkState = stateToSave as FourKateState;
    const pusher = getPusherServer();
    const lastMove = fkState.moves[fkState.moves.length - 1];

    if (lastMove) {
      try {
        await pusher.trigger(roomChannel(roomCode), 'move-made', {
          column: lastMove.col,
          row: lastMove.row,
          color: lastMove.color,
          currentTurn: fkState.currentTurn,
          board: fkState.board,
        });
      } catch {
        // Non-fatal
      }
    }

    if (fkState.phase === 'game_over') {
      try {
        await pusher.trigger(roomChannel(roomCode), 'game-over', {
          winner: fkState.winner,
          winningCells: fkState.winningCells,
          finalBoard: fkState.board,
          isDraw: fkState.isDraw,
        });
      } catch {
        // Non-fatal
      }
    }
  }

  return NextResponse.json({ success: true });
}
