import PusherServer from 'pusher';
import PusherClient from 'pusher-js';

// --- Env-var validation helpers ---

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// --- Server-side Pusher client (for API routes) ---

let pusherServerInstance: PusherServer | null = null;

export function getPusherServer(): PusherServer {
  if (!pusherServerInstance) {
    pusherServerInstance = new PusherServer({
      appId: requireEnv('PUSHER_APP_ID'),
      key: requireEnv('PUSHER_KEY'),
      secret: requireEnv('PUSHER_SECRET'),
      cluster: requireEnv('PUSHER_CLUSTER'),
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
    requireEnv('NEXT_PUBLIC_PUSHER_KEY'),
    {
      cluster: requireEnv('NEXT_PUBLIC_PUSHER_CLUSTER'),
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
