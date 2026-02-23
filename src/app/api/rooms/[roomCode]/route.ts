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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sanitizedGame: any = null;
  if (room.game) {
    // For Terrible People, strip hands/decks
    if (room.gameId === 'terrible-people') {
      const g = room.game as import('@/lib/types').GameState;
      sanitizedGame = {
        currentRound: g.currentRound,
        targetScore: g.targetScore,
        czarIndex: g.czarIndex,
        phase: g.phase,
        phaseEndsAt: g.phaseEndsAt,
        blackCard: g.blackCard,
        submissions: g.submissions,
        revealOrder: g.revealOrder,
        roundWinnerId: g.roundWinnerId,
      };
    } else {
      // For other games, return game state as-is (full info games like Connect 4)
      sanitizedGame = room.game;
    }
  }

  const sanitized = {
    roomCode: room.roomCode,
    createdAt: room.createdAt,
    status: room.status,
    ownerId: room.ownerId,
    gameId: room.gameId,
    players: room.players,
    game: sanitizedGame,
  };

  return NextResponse.json(sanitized);
}
