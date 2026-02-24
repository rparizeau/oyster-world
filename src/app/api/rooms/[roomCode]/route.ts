import { NextResponse } from 'next/server';
import { getRoom } from '@/lib/redis';
import { roomNotFound } from '@/lib/errors';
import type { WhosDealGameState } from '@/lib/games/whos-deal';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;
  const room = await getRoom(roomCode.toUpperCase());

  if (!room) return roomNotFound();

  // Get playerId from query for per-player sanitization
  const url = new URL(request.url);
  const requestingPlayerId = url.searchParams.get('playerId') || '';

  // Sanitize: remove game hands (private) and deck info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sanitizedGame: any = null;
  if (room.game) {
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
    } else if (room.gameId === 'whos-deal') {
      const g = room.game as WhosDealGameState;
      const handCounts: Record<string, number> = {};
      if (g.round) {
        for (const [pid, hand] of Object.entries(g.round.hands)) {
          handCounts[pid] = hand.length;
        }
      }
      sanitizedGame = {
        ...g,
        round: g.round ? {
          ...g.round,
          hands: undefined,
          kitty: undefined,
          myHand: g.round.hands[requestingPlayerId] || [],
          handCounts,
        } : null,
      };
    } else {
      // For other games (4 Kate), return game state as-is
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
    settings: room.settings,
    game: sanitizedGame,
  };

  return NextResponse.json(sanitized);
}
