# Oyster World — Game Developer Guide

> How to build a new game (pearl) for the Oyster World platform. Read this alongside `docs/platform/ARCHITECTURE.md` for full platform contracts.

---

## 1. What the Platform Provides

Your game gets these for free — don't reimplement:

| Capability | Where |
|-----------|-------|
| Room creation, join, leave | `/api/rooms/*` |
| Pusher real-time channels | `presence-room-{code}`, `private-player-{id}` |
| Redis state storage | `room:{roomCode}` with atomic CAS |
| Heartbeat + disconnect detection | `/api/rooms/heartbeat` (10s interval, 30s disconnect, 60s bot replacement) |
| DeepBar persistent navigation | `src/components/DeepBar.tsx` |
| Toast notifications | `ToastContainer` + `useToasts` |
| Connection status banner | `ConnectionBanner` |
| Bot seat-filling on room creation | Based on `maxPlayers` in registry |
| Bot replacement on player departure | `processPlayerReplacement()` |
| Bot timing infrastructure | `botActionAt` / `phaseEndsAt` → heartbeat evaluates |
| Pearl carousel entry | Automatic from `GAME_REGISTRY` |
| Play-again flow | `/api/game/play-again` |

---

## 2. What Your Game Provides

| Artifact | Location | Purpose |
|----------|----------|---------|
| `GameModule` implementation | `src/lib/games/{id}/engine.ts` | Server-side game logic |
| State types | `src/lib/games/{id}/types.ts` | TypeScript interfaces |
| Bot AI | `src/lib/games/{id}/bots.ts` | Bot strategy |
| Constants | `src/lib/games/{id}/constants.ts` | Game-specific values |
| Module export | `src/lib/games/{id}/index.ts` | Re-exports GameModule |
| Game view component | `src/lib/games/{id}/components/{Name}GameView.tsx` | UI |
| Client hook | `src/app/room/[roomCode]/hooks/use{Name}.ts` | Client state + handlers |

---

## 3. GameModule Interface — Method by Method

```typescript
interface GameModule<TState = unknown> {
  initialize(players: Player[], settings?: Record<string, any>): TState;
  processAction(state: TState, playerId: string, action: GameAction): TState;
  getBotAction(state: TState, botId: string): GameAction;
  checkGameOver(state: TState): { isOver: boolean; winnerId?: string; isDraw?: boolean };
  sanitizeForPlayer(state: TState, playerId: string): unknown;
  processAdvancement(state: TState, players: Player[], now: number): AdvancementResult | null;
  processPlayerReplacement(state: TState, departingPlayerId: string, replacementBotId: string,
    playerIndex: number, players: Player[]): TState;
}
```

### `initialize(players, settings?)`
Called when owner clicks "Start Game". Create your initial game state.
- `players` — ordered array with bots already filling empty seats
- `settings` — from `room.settings` (lobby configuration like target score, difficulty, teams)
- Return your full game state object

### `processAction(state, playerId, action)`
Called for every player action via `POST /api/game/action`.
- **MUST validate current phase** before mutating. Invalid phase → return state unchanged or throw.
- **MUST be idempotent** — duplicate `actionId` already filtered by platform, but guard against duplicate game-level actions too.
- Return updated state.

### `getBotAction(state, botId)`
Return the action a bot should take given current state. Called by `processAdvancement()` when `botActionAt` has elapsed.

### `checkGameOver(state)`
Called after each action to determine if the game has ended.
- Return `{ isOver: true, winnerId }` for a win, `{ isOver: true, isDraw: true }` for a draw.

### `sanitizeForPlayer(state, playerId)`
Strip private information before sending state to a specific player.
- Hide other players' hands, decks, mine positions, etc.
- The client only sees what this method returns.

### `processAdvancement(state, players, now)`
Called on every heartbeat (10s). This is where bot actions and timed phase transitions happen.
- Check `botActionAt` — if `now >= botActionAt`, execute bot action
- Check `phaseEndsAt` — if `now >= phaseEndsAt`, advance phase
- Return `null` if nothing to do.
- Return `AdvancementResult` if state changed (see §4).

### `processPlayerReplacement(state, departingId, botId, playerIndex, players)`
Called when a human is replaced by a bot (60s disconnect or leave).
- Transfer hands, seats, teams, trick state to the bot.
- Set `botActionAt` if it's now the bot's turn.

---

## 4. AdvancementResult Contract

When `processAdvancement()` returns a result:

```typescript
interface AdvancementResult {
  newState: unknown;          // Updated game state
  canApply: (currentState: unknown) => boolean;  // Idempotency: check state hasn't changed
  roomEvents: { event: string; data: unknown }[];     // Broadcast to room channel
  playerEvents: { playerId: string; event: string; data: unknown }[];  // Send to private channels
  recurse: boolean;           // If true, processAdvancement runs again (chain multiple advances)
  updatedPlayers?: Player[];  // If scores changed
}
```

**`canApply`**: Before writing to Redis, the platform calls `canApply(currentStateFromRedis)`. If false (state changed between read and write), the advancement is skipped. This prevents double-execution.

**`recurse`**: Set to `true` when one advancement triggers another (e.g., bot action completes trick → round over → new round dealt). The platform will call `processAdvancement()` again with the new state.

---

## 5. Registration Checklist

Files to touch when adding a new game (11 total):

| # | File | What to do |
|---|------|------------|
| 1 | `src/lib/games/{id}/index.ts` | Export your GameModule |
| 2 | `src/lib/games/{id}/engine.ts` | Implement all 7 GameModule methods |
| 3 | `src/lib/games/{id}/types.ts` | Define your game state interfaces |
| 4 | `src/lib/games/{id}/bots.ts` | Bot strategy (can be simple random) |
| 5 | `src/lib/games/{id}/constants.ts` | Game-specific constants |
| 6 | `src/lib/games/{id}/components/{Name}GameView.tsx` | Game UI component |
| 7 | `src/lib/games/registry.ts` | Add `GameConfig` to `GAME_REGISTRY` |
| 8 | `src/lib/games/loader.ts` | Add `import` + entry to `modules` map in `getGameModule()` |
| 9 | `src/app/room/[roomCode]/types.ts` | Add display name to `GAME_DISPLAY_NAMES` |
| 10 | `src/app/room/[roomCode]/hooks/use{Name}.ts` | Client hook (Pusher subscriptions, state, handlers) |
| 11 | `src/app/room/[roomCode]/page.tsx` | Add rendering branch for your `gameId` |

### Conditional files (may need changes):

| File | When |
|------|------|
| `src/app/api/game/play-again/route.ts` | If play-again behavior differs from default |
| `src/app/api/rooms/create/route.ts` | If game needs default `settings` on room creation |
| `src/app/room/[roomCode]/components/LobbyView.tsx` | If game has lobby settings UI (teams, difficulty, etc.) |

**Note**: New games should use the generic `/api/game/action` route for all actions. Do NOT create dedicated API routes like Terrible People's legacy `/api/game/submit` and `/api/game/judge`.

---

## 6. Client Hook Pattern

Your hook subscribes to Pusher events and exposes state + handlers to the game view.

```typescript
// src/app/room/[roomCode]/hooks/useYourGame.ts

export function useYourGame(
  room: Room | null,
  playerId: string | null,
  roomChannel: Channel | null,
  playerChannel: Channel | null,
) {
  const [gameState, setGameState] = useState<YourGameState | null>(null);

  // Subscribe to room channel events
  useEffect(() => {
    if (!roomChannel) return;

    roomChannel.bind('game-started', (data: { gameState: YourGameState }) => {
      setGameState(data.gameState);
    });

    roomChannel.bind('your-custom-event', (data: YourEventData) => {
      setGameState(prev => /* merge update */);
    });

    return () => {
      roomChannel.unbind('game-started');
      roomChannel.unbind('your-custom-event');
    };
  }, [roomChannel]);

  // Subscribe to private channel events (if game has hidden info)
  useEffect(() => {
    if (!playerChannel) return;
    playerChannel.bind('hand-updated', (data: { hand: Card[] }) => {
      // Update local hand state
    });
    return () => playerChannel.unbind('hand-updated');
  }, [playerChannel]);

  // Action handler
  const handleAction = async (type: string, payload?: unknown) => {
    await fetch('/api/game/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomCode: room!.roomCode,
        playerId,
        type,
        payload,
        actionId: crypto.randomUUID(),
      }),
    });
  };

  return { gameState, handleAction };
}
```

---

## 7. Game View Component Props

All game views receive these common props from the room page:

```typescript
interface GameViewProps {
  room: Room;
  playerId: string;
  isOwner: boolean;
  leaving: boolean;       // True while leave request in flight
  onLeave: () => void;    // Triggers leave flow
  onPlayAgain: () => void; // Triggers play-again flow
}
```

Your view component also receives the hook return values. Example wiring in `page.tsx`:

```tsx
if (room.status === 'playing' && room.gameId === 'your-game') {
  return (
    <>
      <DeepBar gameName="Your Game" actionLabel="Leave" onAction={onLeave} />
      <ToastContainer toasts={toasts} />
      <ConnectionBanner status={connectionStatus} />
      <YourGameView
        room={room}
        playerId={playerId}
        isOwner={isOwner}
        gameState={yourGameState}
        /* ...hook handlers */
      />
    </>
  );
}
```

---

## 8. Lobby Settings Integration

If your game has lobby settings (target score, difficulty, teams, etc.):

1. **Set defaults on room creation** in `/api/rooms/create`:
   ```typescript
   if (gameId === 'your-game') {
     room.settings = { yourSetting: defaultValue };
   }
   ```

2. **Add lobby UI** in `LobbyView.tsx` (conditionally rendered when `room.gameId === 'your-game'`).

3. **Handle setting changes** via `POST /api/game/action` with lobby-level action types:
   ```typescript
   // In your engine's processAction or in the action route
   if (room.status === 'waiting' && action.type === 'set-your-setting') {
     // Validate owner, validate value
     // Update room.settings
     // Pusher: 'settings-updated'
   }
   ```

4. **Pass settings to initialize()** — the platform merges `room.settings` into the `settings` parameter.

---

## 9. Pusher Event Conventions

- **Room channel** (`presence-room-{roomCode}`): Events visible to all players.
  - `game-started` — always emitted with initial game state
  - `game-over` — always emitted with final state
  - Custom game events (e.g., `move-made`, `card-played`)

- **Private channel** (`private-player-{playerId}`): Hidden information (hands, etc.).
  - Use `hand-updated` for card/hand distribution (existing convention)
  - **Disambiguation note**: If your game sends `hand-updated`, hooks must distinguish from Terrible People / Who's Deal. Check a type-specific field (e.g., `'suit' in hand[0]`).

- **Event naming**: Use kebab-case (e.g., `move-made`, `trump-action`, `round-over`).

---

## 10. Bot Timing Pattern

Bots don't use `setTimeout`. The serverless-safe pattern:

1. **Set timestamp**: When a bot needs to act, set `botActionAt = Date.now() + delayMs` in your game state.
2. **Heartbeat triggers**: Every 10s, a player's heartbeat calls `processAdvancement()`.
3. **Check & execute**: In `processAdvancement()`, check `if (now >= state.botActionAt)`, then execute the bot action.
4. **Idempotent**: Use `canApply()` to prevent double-execution if multiple heartbeats hit simultaneously.

```typescript
processAdvancement(state, players, now) {
  if (state.botActionAt && now >= state.botActionAt) {
    const bot = players.find(p => p.id === getCurrentPlayer(state) && p.isBot);
    if (!bot) return null;

    const action = this.getBotAction(state, bot.id);
    const newState = this.processAction(state, bot.id, action);

    return {
      newState,
      canApply: (current) => current.botActionAt === state.botActionAt, // Idempotency
      roomEvents: [/* your events */],
      playerEvents: [],
      recurse: true, // Check if another bot needs to act
    };
  }
  return null;
}
```

**Phase transitions** work the same way using `phaseEndsAt` instead of `botActionAt`.

---

## 11. Testing Checklist

Before shipping a new game, verify:

- [ ] **Bot fallback**: All bots → every bot action fires correctly via heartbeat
- [ ] **Human + bot mix**: 1 human + N bots plays correctly
- [ ] **Full human game**: All humans, no bot actions triggered
- [ ] **Reconnection**: Disconnect a player (close tab), reconnect within 30s → state intact
- [ ] **Bot replacement**: Disconnect > 60s → bot takes over, game continues
- [ ] **Play-again**: Game over → play again → new game starts cleanly
- [ ] **Leave mid-game**: Player leaves → bot inherits position, game continues
- [ ] **Owner transfer**: Owner leaves → next human becomes owner
- [ ] **Last human leaves**: Room destroyed
- [ ] **Duplicate actions**: Rapid clicks don't corrupt state (actionId idempotency)
- [ ] **Invalid phase actions**: Wrong-phase actions rejected, state unchanged
- [ ] **Mobile**: All UI fits 375px+, tap targets ≥ 44px, no horizontal scroll

---

## 12. Tech Debt Notes

Known patterns to be aware of (not to replicate in new games):

1. **Terrible People types in platform file**: `GameState`, `BlackCard`, `WhiteCard` live in `src/lib/types.ts` instead of `src/lib/games/terrible-people/types.ts`. New games should define their types in their own `types.ts`.

2. **Terrible People constants in platform file**: Timing constants like `HAND_SIZE`, `BOT_SUBMIT_DELAY_RANGE_MS` live in `src/lib/constants.ts`. New games should define their constants in their own `constants.ts`.

3. **Legacy dedicated routes**: Terrible People uses `/api/game/submit` and `/api/game/judge` instead of the generic `/api/game/action`. New games must use `/api/game/action` exclusively.

4. **Shared `hand-updated` event**: Both Terrible People and Who's Deal send `hand-updated` on the same private channel. Hooks disambiguate via `'suit' in hand[0]`. If your game sends hand data, ensure it's distinguishable or use a different event name.

5. **Minesweeper client-side pattern**: Minesweeper runs entirely client-side (no server game logic). This works for single-player but should not be replicated for multiplayer games where competitive integrity matters.
