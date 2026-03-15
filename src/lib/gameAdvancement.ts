import { getRoom, atomicRoomUpdate } from '@/lib/redis';
import { getPusherServer, roomChannel, playerChannel } from '@/lib/pusher';
import { getGameModule } from '@/lib/games/loader';

/**
 * Process game state advancement: phase transitions and bot actions.
 * Generic dispatcher — all game-specific logic lives in each GameModule.
 * Shared between heartbeat and action routes.
 */
export async function processGameAdvancement(roomCode: string): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room || !room.game || room.status !== 'playing') return;

  const module = getGameModule(room.gameId);
  if (!module) return;

  const now = Date.now();
  const result = module.processAdvancement(room.game, room.players, now);
  if (!result) return;

  // Atomic update with idempotency guard
  const updateFn = (current: typeof room) => {
    if (!current.game || current.status !== 'playing') return current;
    if (!result.canApply(current.game)) return current;

    const update: typeof current = { ...current, game: result.newState as typeof current.game };

    // If the module returned updated players (e.g. score changes), apply them
    if (result.updatedPlayers) {
      const scores: Record<string, number> = {};
      for (const p of result.updatedPlayers) {
        scores[p.id] = p.score;
      }
      update.players = current.players.map((p) => ({
        ...p,
        score: scores[p.id] ?? p.score,
      }));
    }

    return update;
  };

  const updated = await atomicRoomUpdate(roomCode, updateFn);
  if (!updated) return;

  // Fire Pusher events
  const pusher = getPusherServer();

  for (const { event, data } of result.roomEvents) {
    try {
      await pusher.trigger(roomChannel(roomCode), event, data);
    } catch {
      // Non-fatal
    }
  }

  for (const { playerId, event, data } of result.playerEvents) {
    try {
      await pusher.trigger(playerChannel(playerId), event, data);
    } catch {
      // Non-fatal
    }
  }

  // Recurse if the module indicated more processing is needed
  if (result.recurse) {
    await processGameAdvancement(roomCode);
  }
}
