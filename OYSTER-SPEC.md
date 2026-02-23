# Oyster World — Platform Upgrade & 4 Kate Technical Specification v1.0 (FINAL)

## 1. Overview

**Oyster World** is a real-time multiplayer web game platform. Players create or join worlds and play party games together. This spec covers two changes:

1. **Platform rebrand**: Rebrand from "Terrible People" (single game) to "Oyster World" (multi-game platform) with a game selection framework
2. **4 Kate**: A new 2-player Connect 4 game module

This spec builds on top of the existing codebase and SPEC.md. All existing architecture decisions (serverless-safe timing, atomic Redis, idempotent actions, Pusher real-time) remain in effect.

---

## 2. Platform Changes

### 2.1 Branding

- App title: **Oyster World**
- Tagline: Something short — "Pick a game. Start some trouble." or similar
- Individual games keep their own names: **Terrible People**, **4 Kate**
- Update all page titles, meta tags, and any hardcoded references to "Terrible People"

### 2.2 Terminology

All user-facing references use "World" instead of "Room":
- "Create a World" / "Join a World"
- "World Code" instead of "Room Code"
- "Leave World" instead of "Leave Room"
- Internal code can still use `room` in variable names and Redis keys for simplicity — this is a UI-only rename

### 2.3 Game Registry

A new config file defines available games and their properties.

```typescript
// /lib/games/registry.ts

interface GameConfig {
  id: string;              // Unique identifier (e.g., 'terrible-people', '4-kate')
  name: string;            // Display name
  description: string;     // Short description for selection screen
  minPlayers: number;      // Minimum humans + bots
  maxPlayers: number;      // Maximum room size
  icon?: string;           // Emoji or icon identifier
}

export const GAME_REGISTRY: GameConfig[] = [
  {
    id: 'terrible-people',
    name: 'Terrible People',
    description: 'Fill in the blanks. Be terrible.',
    minPlayers: 4,
    maxPlayers: 4,
    icon: '🃏',
  },
  {
    id: '4-kate',
    name: '4 Kate',
    description: 'Classic Connect 4. Drop pieces. Get four in a row.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🔴',
  },
];
```

### 2.4 Room Model Changes

The Room interface gains a `gameId` field and dynamic player count:

```typescript
interface Room {
  // Existing fields...
  roomCode: string;
  createdAt: number;
  status: 'waiting' | 'playing' | 'finished';
  ownerId: string;
  players: Player[];       // Length now varies by game (2 for 4 Kate, 4 for Terrible People)
  
  // NEW
  gameId: string;          // From GAME_REGISTRY (e.g., 'terrible-people', '4-kate')
  
  // Game state (polymorphic — shape depends on gameId)
  game: TerriblePeopleGameState | FourKateGameState | null;
}
```

### 2.5 Home Page (`/`)

- **Oyster World** title and tagline
- Two buttons: **"Create a World"** / **"Join a World"**
- Clean, branded landing page

### 2.6 Create Flow

```
[Home Page] → User clicks "Create a World"
  → Step 1: Enter display name
  → Step 2: Game selection — horizontal swipeable carousel of game cards
      Each card shows: game icon, game name, short description, player count
      User swipes/scrolls to browse, taps a card to select
      Selected card gets highlighted state
      "Create" button below carousel (disabled until game selected)
  → POST /api/rooms/create { name, gameId }
  → Server validates gameId against GAME_REGISTRY
      ✗ If unknown gameId → 400 { error: "Invalid game", code: "INVALID_GAME" }
  → Server looks up GameConfig for gameId
  → Server creates room with correct player count (maxPlayers bots, creator replaces first bot)
  → Redirect to /room/{roomCode}
```

### 2.7 Join Flow

```
[Home Page] → User clicks "Join a World"
  → Step 1: Enter display name AND world code (same screen)
  → POST /api/rooms/join { name, roomCode }
  → Server validates (same as before — exists, not full, still waiting)
  → Redirect to /room/{roomCode}
```

- Join page shows which game the world is playing after joining
- Room capacity is dynamic (checked against the game's maxPlayers)

### 2.8 Updated Lobby View

- Shows which game is selected (name + icon from the game card)
- Displays "World Code" with copy button
- Shareable link with copy button
- Player slot count matches the game's maxPlayers
- "Start Game" button loads the correct game module (owner only)
- "Leave World" button
- All UI labels use "World" terminology

### 2.9 Game Module Interface

Each game module must implement a standard interface so the platform can load any game generically.

```typescript
// /lib/games/types.ts

interface GameAction {
  type: string;            // Action type (e.g., 'drop', 'submit', 'judge')
  payload?: unknown;       // Action-specific data
  actionId?: string;       // Optional UUID for idempotency (recommended)
}

interface GameModule {
  // Initialize game state when owner clicks "Start"
  initialize(players: Player[]): GameState;
  
  // Process a player action — MUST validate current phase before mutating
  // Invalid phase actions MUST return an error or be a no-op — never mutate on invalid phase
  processAction(state: GameState, playerId: string, action: GameAction): GameState;
  
  // Get bot action for a given game state
  getBotAction(state: GameState, botId: string): GameAction;
  
  // Check if game is over
  checkGameOver(state: GameState): { isOver: boolean; winnerId?: string; isDraw?: boolean };
  
  // Get sanitized state for a specific player (hide opponent's private info)
  sanitizeForPlayer(state: GameState, playerId: string): any;
}
```

> **Phase validation requirement**: Every GameModule MUST validate that the incoming action is legal for the current game phase before mutating state. Invalid actions must return an error or be a no-op. State must NEVER mutate on invalid phase actions.

### 2.10 Generic Action Route

A single generic action route dispatches to the correct game module:

```
POST /api/game/action
{
  roomCode: string,
  playerId: string,
  actionId?: string,       // Optional UUID for idempotency
  type: string,            // Action type (dispatched to game module)
  payload?: unknown        // Action-specific data
}
```

Server flow:
1. Load room from Redis
2. Validate playerId belongs to room
3. Look up game module by `room.gameId`
4. If `actionId` provided, check against last processed actionId for this player — if duplicate, return success (no-op)
5. Dispatch `{ type, payload, actionId }` to `gameModule.processAction()`
6. Store updated state atomically in Redis
7. Track `actionId` as last processed for this player
8. Trigger appropriate Pusher events

Existing Terrible People routes (`/api/game/submit`, `/api/game/judge`) can be kept as aliases that internally call the generic action route, or migrated fully. Either approach works.

### 2.11 Updated Project Structure

```
/lib/games/
  /registry.ts             → Game registry (config for all games)
  /types.ts                → GameModule interface, GameAction type
  /terrible-people/
    /engine.ts             → Existing game-engine.ts, refactored to implement GameModule
    /bots.ts               → Existing bots.ts
    /components/           → Game-specific UI components (moved from /components)
  /4-kate/
    /engine.ts             → Connect 4 game logic (implements GameModule)
    /bots.ts               → Connect 4 bot AI
    /constants.ts          → 4 Kate specific constants
    /components/           → Connect 4 UI components
```

---

## 3. 4 Kate — Game Specification

### 3.1 Rules (Standard Connect 4)

- 7 columns × 6 rows vertical grid
- 2 players, each assigned a color (Red / Yellow)
- Players alternate turns dropping a piece into a column
- Piece falls to the lowest available row in that column
- First player to get 4 pieces in a row (horizontal, vertical, or diagonal) wins
- If the board fills up with no winner, it's a draw
- Room creator (Player 1) is Red and goes first

### 3.2 Play Again Rules

- Colors stay fixed (creator is always Red, opponent is always Yellow)
- First turn alternates each game (if Red went first last game, Yellow goes first next game)
- Board resets, scores preserved across games in a session

### 3.3 Game State

```typescript
interface FourKateGameState {
  // Board: 7 columns × 6 rows
  // Represented as columns for easy "drop" logic
  // Each column is bottom-to-top: index 0 = bottom row
  board: (null | 'red' | 'yellow')[][];  // board[col][row]
  
  // Player mapping (fixed — does not change on Play Again)
  players: {
    red: string;     // playerId
    yellow: string;  // playerId
  };
  
  // Turn tracking
  currentTurn: 'red' | 'yellow';
  
  // Tracks who went first this game (alternates on Play Again)
  firstTurn: 'red' | 'yellow';
  
  // Phase
  phase: 'playing' | 'game_over';
  
  // Timing (serverless-safe)
  turnStartedAt: number;        // Unix timestamp
  botActionAt: number | null;   // When bot should act
  
  // Result
  winner: 'red' | 'yellow' | 'draw' | null;
  winningCells: [number, number][] | null;  // [col, row] coordinates of winning 4
  
  // Move history (for replay / undo future feature)
  moves: { playerId: string; column: number }[];
  
  // Games played (for alternating first turn)
  gamesPlayed: number;
}
```

### 3.4 Constants

```typescript
// /lib/games/4-kate/constants.ts
export const BOARD_COLS = 7;
export const BOARD_ROWS = 6;
export const WIN_LENGTH = 4;
export const BOT_MOVE_DELAY_MS = 1500;
```

### 3.5 Game Flow

```
Game Start:
  → Initialize empty 7×6 board
  → Assign Red to Player 1 (room creator), Yellow to Player 2
  → Set currentTurn = 'red' (first game) or alternate based on gamesPlayed
  → Set phase = 'playing'
  → If current turn player is a bot, set botActionAt = now + BOT_MOVE_DELAY_MS
  → Pusher event: 'game-started' { board, players, currentTurn }

Player Turn:
  → POST /api/game/action { roomCode, playerId, actionId?, type: 'drop', payload: { column } }
  → Server validates:
      ✓ Phase is 'playing'
      ✓ It's this player's turn
      ✓ Column is valid (0-6)
      ✓ Column is not full
      ✓ If actionId provided, check not already processed (idempotency)
      ✗ Reject with appropriate error
  → Turn-level idempotency: if move history already has a move for this turn number, reject as no-op
  → Drop piece into column (lowest available row)
  → Add to move history
  → Check win condition (4 in a row: horizontal, vertical, diagonal)
  → Check draw condition (board full)
  → If win or draw:
      → Set phase = 'game_over', record winner/draw and winning cells
      → Pusher event: 'game-over' { winner, winningCells, finalBoard, isDraw }
  → Else:
      → Switch currentTurn to other player
      → If next player is bot, set botActionAt = now + BOT_MOVE_DELAY_MS
      → Pusher event: 'move-made' { column, row, color, currentTurn, board }

Bot Turn:
  → Triggered via heartbeat when botActionAt has passed (same pattern as Terrible People)
  → Bot selects column using AI logic (see 3.6)
  → Executes same drop logic as human turn
  → Idempotent: if move already recorded for this turn, skip

Play Again:
  → POST /api/game/action { roomCode, playerId, type: 'play-again' }
  → Validate: requester is owner, phase is 'game_over'
  → Reset board to empty
  → Increment gamesPlayed
  → Alternate firstTurn (if last game Red went first, now Yellow goes first)
  → Colors stay fixed (Red/Yellow assignment unchanged)
  → Set phase = 'playing'
  → If current turn player is bot, set botActionAt
```

### 3.6 Bot AI (Connect 4)

The bot uses a priority-based strategy — simple but effective:

```
Priority order (check each, take the first that applies):
1. WIN: Can I win this move? → Take it
2. BLOCK: Can opponent win next move? → Block it
3. DOUBLE THREAT: Can I create two ways to win? → Do it
4. CENTER PREFERENCE: Prefer center column (column 3), then columns 2/4, then 1/5, then 0/6
5. AVOID GIVING WIN: Don't play in a column if it sets up opponent's win directly above
6. RANDOM: Pick randomly from remaining valid columns
```

This produces a bot that's challenging for casual players without needing minimax or deep search.

### 3.7 Win Detection Algorithm

Check all four directions from the last placed piece:

```typescript
function checkWin(board, col, row, color): [number, number][] | null {
  const directions = [
    [1, 0],   // horizontal
    [0, 1],   // vertical
    [1, 1],   // diagonal up-right
    [1, -1],  // diagonal down-right
  ];
  
  for (const [dc, dr] of directions) {
    const cells: [number, number][] = [[col, row]];
    
    // Check positive direction
    for (let i = 1; i < 4; i++) {
      const c = col + dc * i, r = row + dr * i;
      if (inBounds(c, r) && board[c][r] === color) cells.push([c, r]);
      else break;
    }
    
    // Check negative direction
    for (let i = 1; i < 4; i++) {
      const c = col - dc * i, r = row - dr * i;
      if (inBounds(c, r) && board[c][r] === color) cells.push([c, r]);
      else break;
    }
    
    if (cells.length >= 4) return cells.slice(0, 4);
  }
  
  return null;
}
```

### 3.8 Pusher Events (4 Kate)

| Event | Payload | Triggered When |
|---|---|---|
| `game-started` | `{ board, players, currentTurn }` | Game begins |
| `move-made` | `{ column, row, color, currentTurn, board }` | Piece dropped |
| `game-over` | `{ winner, winningCells, finalBoard, isDraw }` | Win or draw |

These use the same room channel as Terrible People (`presence-room-{roomCode}`).

### 3.9 UI Components

#### Game Board (`/lib/games/4-kate/components/Board.tsx`)
- 7×6 grid rendered as CSS grid or table
- Each cell: empty, red piece, or yellow piece
- Column hover effect: shows where piece will drop (ghost piece at top of column)
- Click/tap on column to drop piece
- Only clickable when it's the player's turn
- Winning cells highlighted (glow or animation) when game ends

#### Game View
- **Top**: Player indicators — Red (name) vs Yellow (name), highlight whose turn it is
- **Center**: Game board (responsive, works on mobile)
- **Bottom**: Turn indicator ("Your turn" / "Waiting for opponent..." / "Bot is thinking...")
- **Game Over**: Winner announcement (or draw), winning line highlighted, "Play Again" (owner) + "Leave World"

#### Mobile Considerations
- Board must fit on mobile screen without horizontal scrolling
- Columns should be easy to tap (minimum 44px touch targets)
- Piece drop animation (piece falls from top to its resting position)

---

## 4. Implementation Phases

### Phase 1: Platform Refactor
**Goal**: Rebrand to Oyster World, add game selection, make room system game-aware.

1. Rebrand all UI references: "Terrible People" → "Oyster World", "Room" → "World" in all user-facing text
2. Create `/lib/games/registry.ts` with game configs
3. Create `/lib/games/types.ts` with GameModule interface and GameAction type
4. Update Room interface to include `gameId` and dynamic player count
5. Update room creation API to accept `gameId`, validate against GAME_REGISTRY (reject unknown gameId with INVALID_GAME error), set correct player count
6. Update room creation UI flow: name entry → horizontal swipeable game carousel → create
7. Game carousel: each card shows icon, name, description, player count. Tap to select, highlighted state, "Create" button disabled until selected.
8. Update lobby UI to show selected game, correct number of player slots, "World" terminology
9. Update join flow: name + world code on same screen, join page shows which game the world is playing
10. Move Terrible People game logic into `/lib/games/terrible-people/` directory
11. Refactor Terrible People engine to implement GameModule interface (with explicit phase validation)
12. Create generic `/api/game/action` route that dispatches to correct game module, supports optional actionId for idempotency
13. Keep existing Terrible People routes working as aliases or migrate to `/api/game/action`
14. Verify Terrible People still works exactly as before after refactor

**Acceptance Criteria**:
- [ ] Home page shows "Oyster World" with "Create a World" / "Join a World"
- [ ] Create flow: name entry → horizontal swipeable game carousel → create
- [ ] Join flow: name + world code on same screen
- [ ] Game cards in carousel show icon, name, description, player count
- [ ] Unknown gameId rejected with INVALID_GAME error
- [ ] Selecting "Terrible People" creates a 4-player world (same as before)
- [ ] Lobby shows selected game, world code, uses "World" terminology throughout
- [ ] Terrible People gameplay is unchanged
- [ ] Join page shows which game the world is playing
- [ ] Generic action route dispatches correctly to Terrible People module
- [ ] All existing Terrible People functionality passes

### Phase 2: 4 Kate Game Module
**Goal**: Fully playable Connect 4 as the second game on the platform.

1. Create `/lib/games/4-kate/engine.ts` implementing GameModule interface (with explicit phase validation on every action)
2. Create `/lib/games/4-kate/bots.ts` with priority-based AI (win → block → double threat → center → avoid giving win → random)
3. Create `/lib/games/4-kate/constants.ts`
4. Register 4 Kate in the game registry
5. Wire up the generic action route to handle 4 Kate actions (`type: 'drop'`, `type: 'play-again'`)
6. Implement turn-level idempotency: if move history already has a move for the current turn number, reject as no-op
7. Support optional actionId on all actions for additional idempotency
8. Implement bot turn via heartbeat-driven timestamps (same serverless-safe pattern)
9. Build game board UI component (responsive 7×6 grid, piece colors, column hover/ghost piece, drop animation)
10. Build game view (player indicators with turn highlighting, board, turn status text, game over screen)
11. Wire up Pusher events (game-started, move-made, game-over)
12. Implement win detection (horizontal, vertical, both diagonals)
13. Implement draw detection (board full)
14. Implement "Play Again" (reset board, alternate first turn, keep colors fixed)
15. Handle mid-game player departure (bot takes over position and color)

**Acceptance Criteria**:
- [ ] Can select "4 Kate" when creating a world
- [ ] World is 2 players (1 human + 1 bot, or 2 humans)
- [ ] Board renders correctly (7×6 grid) on desktop and mobile
- [ ] Can drop pieces by clicking/tapping columns
- [ ] Ghost piece shows on column hover
- [ ] Pieces fall to lowest available row (with animation)
- [ ] Turn alternates between players
- [ ] Turn indicator shows whose turn it is ("Your turn" / "Waiting..." / "Bot is thinking...")
- [ ] Bot plays after 1.5s delay with smart strategy (blocks wins, takes wins)
- [ ] Win detected correctly (horizontal, vertical, both diagonals)
- [ ] Winning cells highlighted
- [ ] Draw detected when board is full
- [ ] "Play Again" resets board, alternates who goes first, colors stay fixed
- [ ] Works on mobile (board fits screen, columns tappable with 44px+ touch targets)
- [ ] If human leaves, bot takes over their position and color
- [ ] No state corruption from duplicate/rapid moves (turn-level + actionId idempotency)
- [ ] Invalid actions on wrong phase rejected as no-op

---

## 5. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Unknown gameId on room creation | 400 → `{ error: "Invalid game", code: "INVALID_GAME" }` |
| Drop in full column | 400 → `{ error: "Column is full", code: "COLUMN_FULL" }` |
| Move when not your turn | 403 → `{ error: "Not your turn", code: "NOT_YOUR_TURN" }` |
| Move after game over | 409 → `{ error: "Game is over", code: "GAME_OVER" }` |
| Invalid column (< 0 or > 6) | 400 → `{ error: "Invalid column", code: "INVALID_COLUMN" }` |
| Duplicate actionId | 200 → Success (no-op, idempotent) |
| Duplicate move for same turn | 200 → Success (no-op, turn-level idempotency) |
| Player leaves mid-game | Bot inherits position and color, plays on next turn |
| Both players leave | Room destroyed |
| Rapid double-click on column | Idempotent — second request sees move already recorded, no-op |
| Action on wrong phase | No-op or error, state never mutates |

---

## 6. Future Considerations

- **Turn timer**: 30s per turn, auto-forfeit or auto-random-move if exceeded
- **Spectator mode**: Extra players can watch without playing
- **Color selection**: Let players choose their piece color
- **Board themes**: Different visual themes for the board
- **Match series**: Best of 3/5 with score tracking across games
- **Undo**: Allow undo of last move (both players must agree)
- **Game history**: Replay past games move by move
- **Event namespacing**: Prefix events with `game:{gameId}:` if cross-game event collisions occur at scale
- **More games**: Platform is now structured to accept any game module via the registry
