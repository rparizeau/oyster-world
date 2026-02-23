import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, refreshRoomTTL } from '@/lib/redis';
import { getPusherServer, roomChannel } from '@/lib/pusher';
import { judgeWinner } from '@/lib/games/terrible-people';
import { roomNotFound, unauthorized, apiError, invalidPhase, alreadySubmitted, invalidSubmission } from '@/lib/errors';
import type { GameState } from '@/lib/types';

export async function POST(request: Request) {
  let body: { roomCode?: string; playerId?: string; winnerId?: string };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400);
  }

  const roomCode = body.roomCode?.trim().toUpperCase();
  const playerId = body.playerId?.trim();
  const winnerId = body.winnerId?.trim();

  if (!roomCode || !playerId || !winnerId) {
    return apiError('Room code, player ID, and winner ID are required', 'INVALID_REQUEST', 400);
  }

  const room = await getRoom(roomCode);
  if (!room) return roomNotFound();

  // Validate player is in room
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return unauthorized();

  if (!room.game) return invalidPhase();

  const game = room.game as GameState;

  // Use pure function
  const result = judgeWinner(game, playerId, winnerId, room.players);

  if (!result.ok) {
    switch (result.code) {
      case 'INVALID_PHASE': return invalidPhase();
      case 'UNAUTHORIZED': return unauthorized();
      case 'ALREADY_SUBMITTED': return alreadySubmitted();
      case 'INVALID_SUBMISSION': return invalidSubmission();
      default: return apiError(result.error, result.code, 400);
    }
  }

  const newGameState = result.state;

  // Build a score lookup from the pure function result
  const scoreMap: Record<string, number> = {};
  for (const p of result.updatedPlayers) {
    scoreMap[p.id] = p.score;
  }

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    if (!current.game) return null;

    const currentGame = current.game as GameState;

    // Idempotent: if winner already selected, return current
    if (currentGame.roundWinnerId !== null) return current;

    // Re-validate phase
    if (currentGame.phase !== 'judging') return null;

    // Apply score updates to full Player objects
    const updatedPlayers = current.players.map((p) => ({
      ...p,
      score: scoreMap[p.id] ?? p.score,
    }));

    return {
      ...current,
      players: updatedPlayers,
      game: newGameState,
    };
  });

  if (!updated) {
    return apiError('Failed to judge', 'RACE_CONDITION', 409);
  }

  await refreshRoomTTL(roomCode);

  const pusher = getPusherServer();
  const winnerPlayer = room.players.find((p) => p.id === winnerId)!;

  try {
    await pusher.trigger(roomChannel(roomCode), 'round-result', {
      winnerId,
      winnerName: winnerPlayer.name,
      submission: newGameState.submissions[winnerId],
      scores: scoreMap,
      isGameOver: newGameState.phase === 'game_over',
    });

    if (newGameState.phase === 'game_over') {
      await pusher.trigger(roomChannel(roomCode), 'game-over', {
        finalScores: scoreMap,
        winnerId,
        winnerName: winnerPlayer.name,
      });
    }
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ success: true });
}
