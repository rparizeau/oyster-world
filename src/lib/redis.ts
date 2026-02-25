import { Redis } from '@upstash/redis';
import { Room, PlayerSession } from './types';
import { ROOM_TTL_SECONDS } from './constants';

// --- Env-var validation ---

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// --- Client ---

export const redis = new Redis({
  url: requireEnv('KV_REST_API_URL'),
  token: requireEnv('KV_REST_API_TOKEN'),
});

// --- Key helpers ---

function roomKey(roomCode: string): string {
  return `room:${roomCode}`;
}

function sessionKey(playerId: string): string {
  return `session:${playerId}`;
}

function heartbeatKey(roomCode: string, playerId: string): string {
  return `heartbeat:${roomCode}:${playerId}`;
}

// --- Room CRUD ---

export async function createRoom(room: Room): Promise<void> {
  await redis.set(roomKey(room.roomCode), JSON.stringify(room), {
    ex: ROOM_TTL_SECONDS,
  });
}

export async function getRoom(roomCode: string): Promise<Room | null> {
  const data = await redis.get<string>(roomKey(roomCode));
  if (!data) return null;
  // Upstash auto-parses JSON, so data may already be an object
  if (typeof data === 'object') return data as unknown as Room;
  return JSON.parse(data) as Room;
}

export async function deleteRoom(roomCode: string): Promise<void> {
  await redis.del(roomKey(roomCode));
}

export async function refreshRoomTTL(roomCode: string): Promise<void> {
  await redis.expire(roomKey(roomCode), ROOM_TTL_SECONDS);
}

/**
 * Atomically update a room using a Lua script.
 * The `updater` function receives the current room and returns the new room.
 * If the room doesn't exist, returns null.
 * Uses a Lua script for true atomicity in the serverless environment.
 */
export async function atomicRoomUpdate(
  roomCode: string,
  updater: (room: Room) => Room | null
): Promise<Room | null> {
  // For atomic updates, we use a read-then-conditional-write with Upstash.
  // Upstash REST API doesn't support WATCH/MULTI, so we use a Lua script.
  // The Lua script reads the current value, we apply the update client-side,
  // then we use a Lua script that checks the value hasn't changed before writing.

  const key = roomKey(roomCode);
  const current = await redis.get<string>(key);
  if (!current) return null;

  const currentRoom: Room = typeof current === 'object'
    ? current as unknown as Room
    : JSON.parse(current);

  const updated = updater(currentRoom);
  if (!updated) return null;

  // Lua script: only set if current value matches what we read (CAS)
  const currentSerialized = JSON.stringify(currentRoom);
  const updatedSerialized = JSON.stringify(updated);

  const script = `
    local current = redis.call('GET', KEYS[1])
    if current == ARGV[1] then
      redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
      return 1
    else
      return 0
    end
  `;

  const result = await redis.eval(
    script,
    [key],
    [currentSerialized, updatedSerialized, ROOM_TTL_SECONDS.toString()]
  );

  if (result === 1) {
    return updated;
  }

  // CAS failed — another request mutated the room between our read and write
  return null;
}

/**
 * Check if a room code already exists in Redis.
 */
export async function roomExists(roomCode: string): Promise<boolean> {
  const exists = await redis.exists(roomKey(roomCode));
  return exists === 1;
}

// --- Player Session CRUD ---

export async function createSession(session: PlayerSession): Promise<void> {
  await redis.set(sessionKey(session.playerId), JSON.stringify(session), {
    ex: ROOM_TTL_SECONDS,
  });
}

export async function getSession(playerId: string): Promise<PlayerSession | null> {
  const data = await redis.get<string>(sessionKey(playerId));
  if (!data) return null;
  if (typeof data === 'object') return data as unknown as PlayerSession;
  return JSON.parse(data) as PlayerSession;
}

export async function deleteSession(playerId: string): Promise<void> {
  await redis.del(sessionKey(playerId));
}

// --- Heartbeat ---

export async function setHeartbeat(roomCode: string, playerId: string): Promise<void> {
  await redis.set(
    heartbeatKey(roomCode, playerId),
    Date.now().toString(),
    { ex: ROOM_TTL_SECONDS }
  );
}

export async function getHeartbeat(roomCode: string, playerId: string): Promise<number | null> {
  const data = await redis.get<string>(heartbeatKey(roomCode, playerId));
  if (!data) return null;
  return parseInt(data as string, 10);
}

export async function deleteHeartbeat(roomCode: string, playerId: string): Promise<void> {
  await redis.del(heartbeatKey(roomCode, playerId));
}
