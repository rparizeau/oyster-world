# Oyster World — Platform Architecture

> **Loading pattern**: Always load the 3 platform docs (`docs/platform/ARCHITECTURE.md`, `docs/platform/DESIGN_SYSTEM.md`, `docs/platform/GAME_DEVELOPER_GUIDE.md`). When working on a specific game, also load its doc from `docs/games/{game-id}.md`.

---

## 1. What Is Oyster World?

A real-time multiplayer party game platform at **myoysterworld.com**. Players create or join rooms, pick a game, and play in-browser. No accounts — identity is cookie-based and ephemeral.

**Brand metaphor**: The platform is an oyster, games are pearls. UI says "Game" not "World" everywhere (brand name "My Oyster World" stays).

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16 (App Router, Turbopack) | React 19, TypeScript, Strict mode |
| Styling | Tailwind CSS v4 | `@import "tailwindcss"` in globals.css |
| Real-time | Pusher Channels | Presence + private channels |
| Data store | Upstash Redis | REST-based, no persistent DB |
| Deployment | Vercel | Serverless functions |

**No other deps.** No ORM, no database, no auth library, no state management library.

---

## 3. Architecture Overview

```
Browser (React + Pusher JS) ←→ Next.js API Routes (Serverless) ←→ Upstash Redis
                ↕                           ↕
           Pusher Events              Pusher Trigger
                ↕                           ↕
              Pusher Channels:
              presence-room-{code}    (room-wide events)
              private-player-{id}     (private hands)
```

### Key Architectural Decisions

1. **Serverless game loop** — All game logic runs server-side in API routes. Client is a dumb terminal. No cheating possible.
2. **Redis is the single source of truth** — Full room + game state lives under `room:{roomCode}`. Every mutation uses a Lua CAS (compare-and-swap) script via `atomicRoomUpdate()`.
3. **Serverless-safe timing** — No `setTimeout` or `sleep` in API routes. Bot actions and phase transitions use timestamp fields (`botActionAt`, `phaseEndsAt`) stored in Redis. The heartbeat endpoint evaluates and advances state idempotently.
4. **Idempotent actions** — Every game action endpoint rejects duplicates via `actionId` UUID stored in Redis.
5. **Game-agnostic room system** — Room/lobby layer knows nothing about specific games. Game logic injected via `GameModule` interface.
6. **Connection authority** — Redis heartbeat tracking is source of truth for connection status. Pusher presence is UI-only.

---

## 4. Project Structure

```
src/
├── app/
│   ├── page.tsx                            # Home — pearl carousel, name entry, create/join
│   ├── layout.tsx                          # Root layout (fonts, metadata)
│   ├── globals.css                         # Design system (tokens, animations, components)
│   ├── join/[roomCode]/page.tsx            # Guest join flow
│   ├── room/[roomCode]/
│   │   ├── page.tsx                        # Room page — lobby + game routing
│   │   ├── types.ts                        # SanitizedGameState, Toast, GAME_DISPLAY_NAMES
│   │   ├── components/
│   │   │   ├── LobbyView.tsx               # Pre-game lobby (teams, settings, player list)
│   │   │   ├── ScoreBar.tsx                # Who's Deal team scores (inline header)
│   │   │   ├── PlayerCard.tsx              # Player display card
│   │   │   ├── WhosDealTeamAssignment.tsx  # Team drag/swap UI
│   │   │   ├── ConnectionBanner.tsx        # "Reconnecting..." banner
│   │   │   └── ToastContainer.tsx          # Toast notifications
│   │   └── hooks/
│   │       ├── useRoomConnection.ts        # Pusher + room state + heartbeat
│   │       ├── useFourKate.ts              # See docs/games/4-kate.md
│   │       ├── useTerriblePeople.ts        # See docs/games/terrible-people.md
│   │       ├── useWhosDeal.ts              # See docs/games/whos-deal.md
│   │       ├── useMinesweeper.ts           # See docs/games/minesweeper.md
│   │       └── useToasts.ts                # Toast queue
│   └── api/
│       ├── rooms/
│       │   ├── create/route.ts             # POST — create room
│       │   ├── join/route.ts               # POST — join room
│       │   ├── leave/route.ts              # POST — leave room
│       │   ├── [roomCode]/route.ts         # GET — fetch room state
│       │   └── heartbeat/route.ts          # POST — heartbeat + advancement
│       ├── game/
│       │   ├── start/route.ts              # POST — initialize game
│       │   ├── action/route.ts             # POST — generic game action dispatch
│       │   ├── submit/route.ts             # POST — Terrible People card submit (legacy)
│       │   ├── judge/route.ts              # POST — Terrible People judging (legacy)
│       │   └── play-again/route.ts         # POST — restart game
│       └── pusher/auth/route.ts            # POST — Pusher channel auth
├── components/
│   ├── PearlGlobe.tsx                      # SVG pearl icon (sizes: 96/64/56/48/30/18)
│   └── DeepBar.tsx                         # Persistent top bar
└── lib/
    ├── types.ts                            # Room, Player, GameState, ApiError
    ├── constants.ts                        # Timing constants
    ├── redis.ts                            # Upstash client + atomic CAS
    ├── pusher.ts                           # Server + client Pusher instances
    ├── errors.ts                           # Standardized API error helpers
    ├── utils.ts                            # Room codes, player IDs, bots, shuffle
    └── games/
        ├── registry.ts                     # GAME_REGISTRY — game configs
        ├── types.ts                        # GameModule interface
        ├── loader.ts                       # getGameModule() — maps gameId → module
        ├── terrible-people/                # See docs/games/terrible-people.md
        ├── 4-kate/                         # See docs/games/4-kate.md
        ├── whos-deal/                      # See docs/games/whos-deal.md
        └── minesweeper/                    # See docs/games/minesweeper.md
```

---

## 5. Platform TypeScript Interfaces

### Room & Player (`src/lib/types.ts`)

```typescript
interface Room {
  roomCode: string;          // 6-char uppercase (e.g., "X7KQ2M")
  createdAt: number;         // Unix timestamp
  status: 'waiting' | 'playing' | 'finished';
  ownerId: string;           // Transfers on leave
  gameId: string;            // From GAME_REGISTRY
  players: Player[];         // Ordered by join time
  settings?: Record<string, any>; // Game-specific lobby settings
  game: GameState | Record<string, any> | null; // Polymorphic
}

interface Player {
  id: string;                // UUID
  name: string;              // Max 30 chars
  isBot: boolean;
  isConnected: boolean;
  joinedAt: number;
  score: number;
}

interface PlayerSession {
  playerId: string;
  playerName: string;
  roomCode: string;
  joinedAt: number;
  // TTL: 2 hours
}
```

### API Error

```typescript
interface ApiError {
  error: string;    // Human-readable
  code: string;     // Machine-readable
}

// Platform error codes: ROOM_NOT_FOUND, ROOM_FULL, GAME_IN_PROGRESS, NOT_OWNER,
// INVALID_PHASE, ALREADY_SUBMITTED, INVALID_SUBMISSION, UNAUTHORIZED,
// RACE_CONDITION, INVALID_REQUEST, INVALID_NAME, INVALID_GAME,
// INVALID_SETTING, INVALID_SWAP, INTERNAL_ERROR
// Game-specific error codes: see per-game docs
```

### GameModule Interface (`src/lib/games/types.ts`)

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

interface GameAction {
  type: string;
  payload?: unknown;
  actionId?: string; // For idempotency
}

interface AdvancementResult {
  newState: unknown;
  canApply: (currentState: unknown) => boolean; // Idempotency check
  roomEvents: { event: string; data: unknown }[];
  playerEvents: { playerId: string; event: string; data: unknown }[];
  recurse: boolean; // Process again if true
  updatedPlayers?: Player[]; // For score updates
}
```

### Game Registry (`src/lib/games/registry.ts`)

```typescript
interface GameConfig {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  icon?: string;
}
```

### Game Registry Summary

| Game ID | Display Name | Players | Icon | Key Files | Phases | Doc |
|---------|-------------|---------|------|-----------|--------|-----|
| `4-kate` | Take 4 | 2 | ❤️ | `src/lib/games/4-kate/` | playing → game_over | `docs/games/4-kate.md` |
| `terrible-people` | Terrible People | 4 | 😈 | `src/lib/games/terrible-people/` + `src/lib/types.ts` | czar_reveal → submitting → judging → round_result → game_over | `docs/games/terrible-people.md` |
| `whos-deal` | Who's Deal? | 4 | 🃏 | `src/lib/games/whos-deal/` | round1 → round2 → dealer_discard → playing → round_over → game_over | `docs/games/whos-deal.md` |
| `minesweeper` | Minesweeper | 1 | 💣 | `src/lib/games/minesweeper/` | ready → playing → won/lost (client-side) | `docs/games/minesweeper.md` |

---

## 6. API Routes — Platform Contracts

### `POST /api/rooms/create`
```
Body:    { name: string (max 30), gameId: string }
Returns: { roomCode: string, playerId: string, playerName: string }
Side effects:
  - Creates Room in Redis (fills empty seats with bots based on game's maxPlayers)
  - Creates PlayerSession in Redis
  - Sets heartbeat
  - Sets playerId httpOnly cookie (2h)
  - Game-specific default settings applied (see per-game docs)
  - Pusher: 'room-created' on presence-room-{code}
Errors: INVALID_NAME (400), INVALID_GAME (400), INTERNAL_ERROR (500)
```

### `POST /api/rooms/join`
```
Body:    { roomCode: string (6 char), name: string (max 30) }
Returns: { roomCode: string, playerId: string, playerName: string }
Side effects:
  - Atomic CAS: replaces first bot with new player
  - Game-specific team/settings updates (see per-game docs)
  - Pusher: 'player-joined' + game-specific events
Errors: ROOM_NOT_FOUND (404), GAME_IN_PROGRESS (403), ROOM_FULL (410),
        INVALID_NAME (400), RACE_CONDITION (409)
```

### `POST /api/rooms/leave`
```
Body:    { roomCode: string, playerId: string }
Returns: { success: true }
Side effects:
  - If last human: deletes room, triggers 'room-destroyed'
  - Otherwise: replaces player with bot (inherits score + seat)
  - Transfers owner to next human if owner leaves
  - Game-specific bot takeover logic (see per-game docs)
  - Pusher: 'player-left' { playerId, newOwnerId, replacementBot }
Errors: ROOM_NOT_FOUND (404), UNAUTHORIZED (401)
```

### `GET /api/rooms/[roomCode]?playerId={playerId}`
```
Returns: Room object with game state sanitized for the requesting player
Errors: ROOM_NOT_FOUND (404)
```

### `POST /api/rooms/heartbeat`
```
Body:    { roomCode: string, playerId: string }
Returns: { success: true }
Side effects:
  - Updates heartbeat timestamp
  - Refreshes room TTL
  - Runs processGameAdvancement() (bot actions + phase transitions via GameModule)
  - Checks all human heartbeats:
    - >30s no heartbeat → mark disconnected, Pusher: 'player-disconnected'
    - >60s no heartbeat → replace with bot, Pusher: 'player-left'
  - If requesting player was marked disconnected → reconnect, Pusher: 'player-reconnected'
```

### `POST /api/game/start`
```
Body:    { roomCode: string, playerId: string (owner only), settings?: Record<string, unknown> }
Returns: { success: true }
Side effects:
  - Validates owner, validates room is 'waiting'
  - Game-specific validation (see per-game docs)
  - Calls gameModule.initialize(players, mergedSettings)
  - Sets room.status = 'playing'
  - Game-specific Pusher events (see per-game docs)
Errors: NOT_OWNER (403), INVALID_PHASE (409), INVALID_GAME (400), INVALID_SETTING (400)
```

### `POST /api/game/action`
```
Body:    { roomCode: string, playerId: string, actionId?: string, type: string, payload?: unknown }
Returns: { success: true }
Side effects:
  - Dispatches to gameModule.processAction()
  - Game-specific Pusher events (see per-game docs)
Errors: ROOM_NOT_FOUND (404), UNAUTHORIZED (401), INVALID_PHASE (409),
        NOT_OWNER (403), RACE_CONDITION (409), INVALID_GAME (400),
        + game-specific errors (see per-game docs)
```

### `POST /api/game/submit` (Terrible People legacy)
```
Body:    { roomCode: string, playerId: string, cardIds: string[] }
See docs/games/terrible-people.md for details.
```

### `POST /api/game/judge` (Terrible People legacy)
```
Body:    { roomCode: string, playerId: string, winnerId: string }
See docs/games/terrible-people.md for details.
```

### `POST /api/game/play-again`
```
Body:    { roomCode: string, playerId: string (owner only) }
Returns: { success: true }
Side effects: Game-specific (see per-game docs)
Errors: NOT_OWNER (403), INVALID_PHASE (409), RACE_CONDITION (409)
```

### `POST /api/pusher/auth`
```
Body:    Form data: socket_id, channel_name
Returns: Pusher auth JSON
Auth:    Cookie playerId verified against Redis session
```

---

## 7. Pusher Events — Platform Events

### Room Channel (`presence-room-{roomCode}`)

| Event | Data Shape | Triggered By |
|-------|-----------|--------------|
| `room-created` | `{ room }` | `/api/rooms/create` |
| `player-joined` | `{ player: Player }` | `/api/rooms/join` |
| `player-left` | `{ playerId, newOwnerId?, replacementBot: Player }` | `/api/rooms/leave`, heartbeat replacement |
| `player-disconnected` | `{ playerId }` | Heartbeat timeout (30s) |
| `player-reconnected` | `{ playerId }` | Heartbeat received |
| `room-destroyed` | `{}` | All humans left |
| `room-updated` | `{ room: Room }` | Minesweeper play-again (returns to lobby) |
| `game-started` | Game-specific (see per-game docs) | `/api/game/start`, `/api/game/play-again` |
| `game-over` | Game-specific (see per-game docs) | End of game |

### Player Channel (`private-player-{playerId}`)

| Event | Data Shape | Triggered By |
|-------|-----------|--------------|
| `hand-updated` | `{ hand: WhiteCard[] }` or `{ hand: Card[] }` | Terrible People / Who's Deal |

**Disambiguation**: Hooks check `'suit' in hand[0]` — if true it's Who's Deal, otherwise Terrible People.

Game-specific events: see `docs/games/{game-id}.md` for each game's complete event reference.

---

## 8. Redis Data Model

| Key Pattern | Value | TTL | Purpose |
|-------------|-------|-----|---------|
| `room:{roomCode}` | JSON Room object | 2h | Complete room + game state |
| `session:{playerId}` | JSON PlayerSession | 2h | Session tracking for auth |
| `heartbeat:{roomCode}:{playerId}` | Unix timestamp string | 2h | Last player heartbeat |
| `actionId:{roomCode}:{playerId}` | actionId string | 1h | Idempotency dedup |

**Atomic Mutations**: `atomicRoomUpdate(roomCode, updater)` — reads current state, applies updater function, writes back with Lua CAS script. Returns `null` on race condition (caller should retry or return error).

---

## 9. Client Hook — useRoomConnection

```typescript
{
  room: Room | null;
  setRoom: Dispatch<SetStateAction<Room | null>>;
  playerId: string | null;
  loading: boolean;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  roomChannel: Channel | null;
  playerChannel: Channel | null;
}
```
Handles: fetch room, subscribe Pusher, heartbeat (10s), player-joined/left/disconnected/reconnected, room-destroyed, game-started (sets status to 'playing').

Game-specific hooks: see per-game docs.

---

## 10. Platform Constants (`src/lib/constants.ts`)

```
HEARTBEAT_INTERVAL_MS = 10000    # Client sends every 10s
DISCONNECT_TIMEOUT_MS = 30000    # Mark disconnected after 30s
BOT_REPLACEMENT_TIMEOUT_MS = 60000  # Replace with bot after 60s
ROOM_TTL_SECONDS = 7200         # 2 hours
MAX_PLAYERS = 4                 # Platform max (games define their own)
```

Game-specific constants: see per-game docs.

---

## 11. Bot Timing Pattern

Bots never use `setTimeout`. Instead:
1. When a bot needs to act, set `botActionAt = Date.now() + delay` in Redis
2. On next heartbeat (every 10s from any player), `processAdvancement()` checks `botActionAt`
3. If timestamp passed, execute bot action idempotently via `GameModule.processAdvancement()`

**Bot replacement flow** (player gone 60s):
1. `handlePlayerReplacement()` replaces human with bot
2. Bot inherits departing player's score and seat position
3. `GameModule.processPlayerReplacement()` updates game state (hands, teams, etc.)
4. Owner transfers to next human by join order
5. If no humans remain → delete room

**Bot names**: "Bot Alice", "Bot Bob", "Bot Charlie" (rendered without "Bot " prefix in some UI).

Game-specific bot strategies: see per-game docs.

---

## 12. Authentication

- **Cookie**: `playerId` as httpOnly cookie (2h maxAge, sameSite: lax)
- **SessionStorage**: Also stores `playerId` & `playerName` for client-side reference
- **No playerId in sessionStorage** → redirect to `/join/{roomCode}`
- **Pusher auth**: Cookie playerId verified against Redis session
  - Presence channels: all authenticated players can join
  - Private channels: only owner can auth their own channel

---

## 13. Room Page Routing Logic

The room page (`src/app/room/[roomCode]/page.tsx`) renders different views based on state:

```
if (loading) → Loading skeleton
if (error) → Error screen with "Return Home"
if (room.status === 'playing' && room.gameId === 'whos-deal') → WhosDealGameView (with ScoreBar)
if (room.status === 'playing' && room.gameId === 'minesweeper') → MinesweeperGameView
if (room.status === 'playing' && room.gameId === '4-kate') → FourKateGameView
if (room.status === 'playing' && gameState exists) → TerriblePeopleGameView
else → LobbyView
```

All game views are wrapped in: `DeepBar` + `ToastContainer` + `ConnectionBanner` + game component.

---

## 14. Design System Summary

See `docs/platform/DESIGN_SYSTEM.md` for the full reference.

- **Fonts**: Fredoka One (display), Baloo 2 (sub), Quicksand (body)
- **Colors**: Pearl gold `#f0c27f` (accent), cream `#f5e6ca` (text), abyss `#080c1a` (bg)
- **No purple anywhere** — old `#8b5cf6` fully replaced with pearl gold
- **Depth backgrounds**: `.bg-depth-surface` → `.bg-depth-deep` gradient classes
- **Buttons**: `.btn-primary` (gold), `.btn-secondary` (outline), `.btn-danger` (starfish)
- **Inputs**: `.input-ocean`, `.input-ocean-code`
- **Team colors**: Team A = `--shallow-water` (#7eb8d4), Team B = `--coral` (#e8a87c)

---

## 15. Current State (Feb 2026)

### What's Built & Working
- Full platform: home, pearl carousel, create/join flow, lobby, gameplay
- All 4 games playable end-to-end with bots and humans
- Real-time multiplayer via Pusher
- Ocean depth design system (dive model, pearl globe, depth gradients)
- DeepBar persistent navigation
- Who's Deal visual overhaul (scoreboard, seats, trick area, cards, trump calling, game over, mobile)
- "The Crown" rename in Terrible People (Czar → The Crown in UI, code still uses `czar`)

### Deferred / Not Yet Built
- Persistent lobby (step-out/rejoin with bot covering)
- Surfacing (post-game) screen
- Player customization (avatars, colors)
- Spectator mode, chat/emotes, sound effects
- Bot personality system, advanced bot AI
- Custom card packs, turn timers
