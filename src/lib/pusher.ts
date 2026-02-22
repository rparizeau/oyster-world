import PusherServer from 'pusher';
import PusherClient from 'pusher-js';

// --- Server-side Pusher client (for API routes) ---

let pusherServerInstance: PusherServer | null = null;

export function getPusherServer(): PusherServer {
  if (!pusherServerInstance) {
    pusherServerInstance = new PusherServer({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return pusherServerInstance;
}

// --- Client-side Pusher config ---

let pusherClientInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (pusherClientInstance) return pusherClientInstance;

  pusherClientInstance = new PusherClient(
    process.env.NEXT_PUBLIC_PUSHER_KEY!,
    {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: '/api/pusher/auth',
    }
  );

  return pusherClientInstance;
}

// --- Channel name helpers ---

export function roomChannel(roomCode: string): string {
  return `presence-room-${roomCode}`;
}

export function playerChannel(playerId: string): string {
  return `private-player-${playerId}`;
}
