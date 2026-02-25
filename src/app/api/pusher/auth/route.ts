import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/redis';
import { getPusherServer } from '@/lib/pusher';
import { apiError } from '@/lib/errors';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const playerId = cookieStore.get('playerId')?.value;

  if (!playerId) {
    return apiError('Not authenticated', 'UNAUTHORIZED', 403);
  }

  const session = await getSession(playerId);
  if (!session) {
    return apiError('Session not found', 'UNAUTHORIZED', 403);
  }

  const body = await request.text();
  const params = new URLSearchParams(body);
  const socketId = params.get('socket_id');
  const channel = params.get('channel_name');

  if (!socketId || !channel) {
    return apiError('Missing parameters', 'INVALID_REQUEST', 400);
  }

  const pusher = getPusherServer();

  // Presence channel auth
  if (channel.startsWith('presence-')) {
    const authResponse = pusher.authorizeChannel(socketId, channel, {
      user_id: playerId,
      user_info: {
        name: session.playerName,
      },
    });
    return NextResponse.json(authResponse);
  }

  // Private channel auth — only allow player to auth their own channel
  if (channel.startsWith('private-player-')) {
    const channelPlayerId = channel.replace('private-player-', '');
    if (channelPlayerId !== playerId) {
      return apiError('Forbidden', 'UNAUTHORIZED', 403);
    }
    const authResponse = pusher.authorizeChannel(socketId, channel);
    return NextResponse.json(authResponse);
  }

  return apiError('Unknown channel type', 'UNAUTHORIZED', 403);
}
