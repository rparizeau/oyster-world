import { NextResponse } from 'next/server';
import { getRoom } from '@/lib/redis';
import { roomNotFound } from '@/lib/errors';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;
  const room = await getRoom(roomCode.toUpperCase());

  if (!room) return roomNotFound();

  // Sanitize: remove game hands (private) and deck info
  const sanitized = {
    roomCode: room.roomCode,
    createdAt: room.createdAt,
    status: room.status,
    ownerId: room.ownerId,
    players: room.players,
    game: room.game
      ? {
          currentRound: room.game.currentRound,
          targetScore: room.game.targetScore,
          czarIndex: room.game.czarIndex,
          phase: room.game.phase,
          phaseEndsAt: room.game.phaseEndsAt,
          blackCard: room.game.blackCard,
          submissions: room.game.submissions,
          revealOrder: room.game.revealOrder,
          roundWinnerId: room.game.roundWinnerId,
        }
      : null,
  };

  return NextResponse.json(sanitized);
}
