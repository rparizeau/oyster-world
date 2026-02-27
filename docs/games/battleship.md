# Battleship — Game Documentation

> **Loading pattern**: Load platform docs first (`docs/platform/ARCHITECTURE.md`, `docs/platform/DESIGN_SYSTEM.md`, `docs/platform/GAME_DEVELOPER_GUIDE.md`), then this file.

---

## 1. Overview

| Field | Value |
|-------|-------|
| Game ID | `battleship` |
| Display Name | Battleship |
| Players | 2 |
| Icon | 🚢 |
| Grid | 10×10 |
| Ships | 5 (sizes 5, 4, 3, 3, 2) |
| Firing | One shot per turn (classic) |

Classic two-player hidden-information game. Each player places ships on a secret grid, then takes turns firing shots to locate and sink all opponent ships.

---

## 2. Phases

```
setup → playing → game_over
```

| Phase | Description | Transitions |
|-------|-------------|-------------|
| `setup` | Both players place ships on their grids | → `playing` when both players confirm placement |
| `playing` | Alternating turns, one shot per turn | → `game_over` when all of one player's ships are sunk |
| `game_over` | Winner declared, both boards revealed | → lobby via play-again |

---

## 3. Ship Roster

| Ship | Size | ID |
|------|------|----|
| Carrier | 5 | `carrier` |
| Battleship | 4 | `battleship` |
| Cruiser | 3 | `cruiser` |
| Submarine | 3 | `submarine` |
| Destroyer | 2 | `destroyer` |

**Placement rules**:
- Ships placed horizontally or vertically (no diagonal)
- Ships cannot overlap
- Ships must be fully within the 10×10 grid
- All 5 ships must be placed before confirming

---

## 4. Game State (`BattleshipState`)

```typescript
interface BattleshipState {
  phase: 'setup' | 'playing' | 'game_over';
  gridSize: number;          // from settings (7, 8, or 10)
  shipSet: string;           // 'classic' | 'quick' | 'blitz'
  boards: Record<string, PlayerBoard>; // keyed by playerId
  turnOrder: [string, string];
  currentTurn: string; // playerId
  winner: string | null;
  setupReady: string[]; // playerIds who confirmed placement
  lastShot: ShotResult | null;
  shotHistory: ShotResult[]; // full history for replay/display
  botActionAt: number | null;
}

interface PlayerBoard {
  ships: Ship[];
  shotsReceived: ShotRecord[]; // shots opponent fired at this board
}

interface Ship {
  id: string; // 'carrier', 'battleship', etc.
  name: string;
  size: number;
  positions: Coordinate[]; // occupied cells
  hits: Coordinate[]; // cells that have been hit
  sunk: boolean;
}

interface Coordinate {
  row: number; // 0-9
  col: number; // 0-9
}

interface ShotRecord {
  row: number;
  col: number;
  result: 'hit' | 'miss';
  shipId?: string; // which ship was hit
}

interface ShotResult {
  attackerId: string;
  defenderId: string;
  row: number;
  col: number;
  result: 'hit' | 'miss' | 'sunk';
  shipName?: string; // included when sunk
  shipPositions?: Coordinate[]; // revealed when sunk
}
```

---

## 5. Actions

### `place-ships` (setup phase)
```typescript
{
  type: 'place-ships',
  payload: {
    placements: Array<{
      shipId: string;
      start: Coordinate;
      orientation: 'horizontal' | 'vertical';
    }>
  }
}
```
**Validation**: All 5 ships present, no overlaps, within bounds.
**Effect**: Stores ships on player's board, adds player to `setupReady`. If both ready, transitions to `playing` and sets first turn.

### `fire` (playing phase)
```typescript
{
  type: 'fire',
  payload: { row: number; col: number }
}
```
**Validation**: Must be current player's turn, cell not already fired upon.
**Effect**: Records shot on opponent's board. Checks for hit/miss/sunk. Switches turn. If all ships sunk → `game_over`.

---

## 6. Sanitization (`sanitizeForPlayer`)

Each player sees:
- **Own board**: Full view — ship positions + incoming shots (hits/misses)
- **Opponent board**: Only outgoing shots (hits/misses). Ship positions hidden EXCEPT sunk ships (positions revealed on sunk).
- **On `game_over`**: Both boards fully revealed.

```typescript
interface SanitizedBattleshipState {
  phase: string;
  myBoard: {
    ships: Ship[]; // full positions visible
    shotsReceived: ShotRecord[];
  };
  opponentBoard: {
    shotsReceived: ShotRecord[]; // shots I fired at them
    sunkShips: Ship[]; // only sunk ships revealed
    shipsRemaining: number; // count of unsunk ships
  };
  currentTurn: string;
  isMyTurn: boolean;
  lastShot: ShotResult | null;
  winner: string | null;
  turnOrder: [string, string];
  setupReady: string[];
  // game_over only:
  opponentShips?: Ship[]; // all ships revealed
}
```

---

## 7. Pusher Events

### Room Channel (`presence-room-{roomCode}`)

| Event | Data | When |
|-------|------|------|
| `game-started` | `{ gameState: SanitizedBattleshipState }` | Both setup → playing transition |
| `setup-ready` | `{ playerId: string }` | A player confirms ship placement |
| `shot-fired` | `{ shot: ShotResult }` | After each shot |
| `ship-sunk` | `{ shot: ShotResult, shipName: string }` | When a ship is fully sunk |
| `game-over` | `{ winner: string, boards: Record<string, PlayerBoard> }` | All ships sunk |

### Private Channel (`private-player-{playerId}`)

| Event | Data | When |
|-------|------|------|
| `board-updated` | `{ board: SanitizedBattleshipState }` | After each shot (personalized view) |

---

## 8. Bot Strategy

### Setup Phase — Random Valid Placement

Bots place all 5 ships at once via random valid placement:

```
for each ship in SHIPS (largest first):
  loop until valid:
    orientation = random('horizontal', 'vertical')
    if horizontal:
      row = randomInt(0, 9)
      col = randomInt(0, 10 - ship.size)
      positions = [{row, col}, {row, col+1}, ..., {row, col+size-1}]
    if vertical:
      row = randomInt(0, 10 - ship.size)
      col = randomInt(0, 9)
      positions = [{row, col}, {row+1, col}, ..., {row+size-1, col}]
    if no overlap with already-placed ships:
      place ship with these positions
      break
```

**Timing**: `botActionAt = Date.now() + randomBetween(1000, 2000)`

### Playing Phase — Hunt-and-Target Algorithm

Bot maintains implicit state derived from the opponent board's `shotsReceived`:

```
derive from state:
  fired = set of all cells already shot at
  hits  = list of hit cells where ship NOT yet sunk
  
if hits is not empty → TARGET MODE
else → HUNT MODE
```

**Hunt Mode** (no outstanding unsunk hits):
```
candidates = all cells NOT in fired
apply checkerboard parity filter:
  keep cells where (row + col) % 2 === 0
  (this guarantees finding size-2+ ships with ~50% fewer shots)
if parity candidates empty:
  fall back to all unfired candidates
pick random from candidates
```

**Target Mode** (outstanding unsunk hits exist):
```
group consecutive hits by row (horizontal run) or column (vertical run)

if hits form a line (2+ in same row or same col):
  direction = detected axis (horizontal or vertical)
  try extending in the forward direction (next cell along axis)
  if forward cell already fired or out of bounds:
    try extending in the reverse direction
  if both blocked:
    fall back to adjacent cells of any single hit

if only 1 isolated hit:
  try all 4 adjacent cells (up/down/left/right)
  filter out already-fired and out-of-bounds
  pick random from remaining

if no valid target candidates (shouldn't happen):
  fall back to hunt mode
```

**Sunk ship cleanup**: When a ship sinks, its hits are no longer "outstanding" — they're accounted for. Target mode only considers hits on unsunk ships. This prevents the bot from chasing already-sunk ship hits.

**Timing**: `botActionAt = Date.now() + randomBetween(1500, 3000)`

---

## 9. Constants (`src/lib/games/battleship/constants.ts`)

```typescript
DEFAULT_GRID_SIZE = 10

SHIP_SETS = {
  classic: [
    { id: 'carrier', name: 'Carrier', size: 5 },
    { id: 'battleship', name: 'Battleship', size: 4 },
    { id: 'cruiser', name: 'Cruiser', size: 3 },
    { id: 'submarine', name: 'Submarine', size: 3 },
    { id: 'destroyer', name: 'Destroyer', size: 2 },
  ],
  quick: [
    { id: 'battleship', name: 'Battleship', size: 4 },
    { id: 'cruiser', name: 'Cruiser', size: 3 },
    { id: 'submarine', name: 'Submarine', size: 3 },
    { id: 'destroyer', name: 'Destroyer', size: 2 },
  ],
  blitz: [
    { id: 'cruiser', name: 'Cruiser', size: 3 },
    { id: 'submarine', name: 'Submarine', size: 2 },
    { id: 'destroyer', name: 'Destroyer', size: 2 },
  ],
}

// Valid combos: classic requires gridSize >= 8
VALID_COMBOS: Record<number, string[]> = {
  10: ['classic', 'quick', 'blitz'],
  8:  ['classic', 'quick', 'blitz'],
  7:  ['quick', 'blitz'],
}

BOT_SETUP_DELAY_MS = [1000, 2000]    // random range
BOT_SHOT_DELAY_MS = [1500, 3000]     // random range
```

---

## 10. Registration Files

| # | File | Change |
|---|------|--------|
| 1 | `src/lib/games/battleship/types.ts` | Game state interfaces |
| 2 | `src/lib/games/battleship/constants.ts` | Grid size, ships, timing |
| 3 | `src/lib/games/battleship/bots.ts` | Hunt-and-target AI |
| 4 | `src/lib/games/battleship/engine.ts` | GameModule implementation |
| 5 | `src/lib/games/battleship/index.ts` | Re-export |
| 6 | `src/lib/games/battleship/components/BattleshipGameView.tsx` | Game UI |
| 7 | `src/app/room/[roomCode]/hooks/useBattleship.ts` | Client hook |
| 8 | `src/lib/games/registry.ts` | Add to GAME_REGISTRY |
| 9 | `src/lib/games/loader.ts` | Add to loader |
| 10 | `src/app/room/[roomCode]/types.ts` | Add display name |
| 11 | `src/app/room/[roomCode]/page.tsx` | Add render branch |

---

## 11. UI Design

### Setup Phase — Ship Placement UX

**Layout** (mobile-first, stacked):
```
┌─────────────────────────────┐
│  "Place Your Fleet"  title  │
│                             │
│  ┌───────────────────────┐  │
│  │                       │  │
│  │   10×10 grid          │  │
│  │   (tap to place)      │  │
│  │                       │  │
│  └───────────────────────┘  │
│                             │
│  Ship Roster (horizontal    │
│  scroll, cards)             │
│  [Carrier·5] [Battleship·4]│
│  [Cruiser·3] [Sub·3] [D·2] │
│                             │
│  [Rotate 🔄]  [Confirm ✓]  │
└─────────────────────────────┘
```

**Interaction flow — Tap-to-Place**:
1. Player taps a ship card in the roster → ship becomes "selected" (highlighted border, pearl gold glow)
2. Player taps a grid cell → ship anchors at that cell, extending right (horizontal) or down (vertical) from the anchor
3. Default orientation: horizontal. Player taps **Rotate** button (or taps the already-placed ship on grid) to toggle orientation.
4. If placement is invalid (out of bounds or overlap), show the ship in red/error state and don't commit. Player must tap a valid cell.
5. Once placed, the ship appears on the grid as filled cells. The roster card gets a checkmark and dims.
6. Player can tap an already-placed ship on the grid to pick it back up (returns to roster as selected), then re-place it.
7. Once all 5 ships are placed, **"Confirm Fleet"** button enables (`.btn-primary`).
8. After confirming, grid becomes read-only. Show "Waiting for opponent..." with `animate-pulse-soft`.
9. If opponent confirms first, show "Opponent is ready" toast (success).

**Ship roster cards**:
- Horizontal scrollable row below the grid
- Each card: ship name + dot indicators for size (e.g., `●●●●●` for Carrier)
- Unplaced: `border-border-light bg-white/04`
- Selected: `border-pearl/40 bg-pearl/08` with subtle glow
- Placed: `opacity-50` with `✓` overlay
- Card height: `44px` min tap target

**Grid during setup**:
- Empty cells: standard ocean style
- Ship cells (placed): `rgba(126,184,212,.25)` fill with `border: 1px solid rgba(126,184,212,.3)`
- Invalid preview (hover/tap): `rgba(201,101,138,.2)` fill (star/danger tint)
- Valid preview: `rgba(107,191,163,.15)` fill (glass/success tint)

**Rotate button**: Positioned next to Confirm, secondary style. Shows current orientation as icon (horizontal bars / vertical bars). Disabled when no ship selected.

**Random placement shortcut** (optional, nice-to-have): "Randomize" button that auto-places all ships (uses same algorithm as bot). Good for impatient players.

### Playing Phase — Split View
- **Top**: Opponent's grid (attack board) — tap to fire
  - Unknown cells: dark/ocean colored
  - Miss: muted dot or × mark
  - Hit: red/coral marker
  - Sunk: ship outline revealed
- **Bottom**: Own grid (defense board) — read-only
  - Ships visible as colored blocks
  - Incoming hits marked in red
  - Incoming misses marked subtly
- Turn indicator: "Your Turn" / "Opponent's Turn"
- Last shot result toast/animation

### Game Over
- Both boards revealed
- Winner announcement
- Play Again button (owner only)

### Visual Style
- Grid cells: `~36px` on mobile (360px / 10), borders `1px solid rgba(245,230,202,.08)`
- Ocean cells: `rgba(126,184,212,.06)` (shallow-water tint)
- Hit markers: `var(--coral)` or `var(--star)`
- Miss markers: `rgba(245,230,202,.15)` dot
- Ship cells (own board): `rgba(126,184,212,.2)` with subtle border
- Sunk ships (opponent board): `rgba(201,101,138,.15)` with outline
- Current turn glow: `ring-2 ring-glass/30` on active grid
- Grid labels: A-J (columns), 1-10 (rows), `text-[0.5em]` muted

### Mobile Layout
- Grids stack vertically (attack on top, defense below)
- Attack grid larger (~70% of width), defense grid smaller (~55%)
- Or: tab toggle between "Attack" and "Defense" views
- Ship placement: drag or tap-to-place with rotate button

---

## 12. Lobby Settings

Settings configurable by the room owner in the lobby before starting.

### Default Settings (set in `/api/rooms/create`)
```typescript
room.settings = {
  gridSize: 10,        // 7, 8, or 10
  shipSet: 'classic',  // 'classic' | 'quick' | 'blitz'
};
```

### Setting: Grid Size
| Option | Value | Label |
|--------|-------|-------|
| Classic | `10` | "10×10 — Classic" |
| Compact | `8` | "8×8 — Compact" |
| Small | `7` | "7×7 — Quick" |

**Lobby UI**: Segmented toggle, 3 options. Owner-only control.

Changing grid size does NOT change the ship set automatically (player picks both independently).

### Setting: Ship Set
| Option | Ships | Total Cells |
|--------|-------|-------------|
| `classic` | 5,4,3,3,2 (17 cells) | Default. Requires grid ≥ 8. |
| `quick` | 4,3,3,2 (12 cells) | Good for 8×8. |
| `blitz` | 3,2,2 (7 cells) | Good for 7×7. Fastest games. |

**Validation on game start**: If `shipSet === 'classic'` and `gridSize === 7`, reject with `INVALID_SETTING` — not enough room. Valid combinations:

| Grid | classic | quick | blitz |
|------|---------|-------|-------|
| 10×10 | ✅ | ✅ | ✅ |
| 8×8 | ✅ | ✅ | ✅ |
| 7×7 | ❌ | ✅ | ✅ |

**Lobby UI**: Dropdown or segmented toggle below grid size. Show ship names and dot-sizes. Disable invalid combos reactively.

### Pusher Event
```
'settings-updated' on room channel
{ settings: { gridSize: number, shipSet: string } }
```

### Lobby Settings Component
Render inside `LobbyView.tsx` when `room.gameId === 'battleship'`:
```
┌──────────────────────────────┐
│  Grid Size                   │
│  [10×10] [8×8] [7×7]        │
│                              │
│  Ships                       │
│  [Classic·5] [Quick·4] [Blitz·3] │
│                              │
│  Ship preview row:           │
│  ●●●●● ●●●● ●●● ●●● ●●     │
└──────────────────────────────┘
```
- Segmented controls use `btn-secondary` style for unselected, `bg-pearl/15 border-pearl/30 text-pearl` for selected.
- Ship preview dots: `w-2 h-2 rounded-full bg-shallow-water/40`
- Non-owner sees settings as read-only text.
