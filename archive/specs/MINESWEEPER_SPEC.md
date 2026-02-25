# Minesweeper — Game Module Technical Specification v1.0

## 1. Overview

**Minesweeper** is a single-player classic minesweeper game module for the Oyster World platform. Standard rules — reveal cells, flag mines, clear the board. The grid adapts to the player's screen size (always portrait) and difficulty controls mine density rather than grid dimensions.

This spec builds on SPEC.md, OYSTER-SPEC.md, ARCHITECTURE.md, and DESIGN_SYSTEM.md. All existing platform architecture applies (GameModule interface, generic action route, Redis state, room lifecycle). Minesweeper is the first single-player pearl — it still lives inside the room system but with `maxPlayers: 1` and no bot seat-filling. The lobby serves as the settings screen (difficulty selection) and future home for spectator/viewing room links.

---

## 2. Game Registry Entry

```typescript
// Update GAME_REGISTRY in /lib/games/registry.ts
export const GAME_REGISTRY: GameConfig[] = [
  // ...existing entries...
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    description: 'Classic Minesweeper. Find the mines. Clear the board.',
    minPlayers: 1,
    maxPlayers: 1,
    icon: '💣',
  },
];
```

### Single-Player Room Behavior

Since `maxPlayers: 1`:
- No bots fill empty seats on room creation
- Lobby shows only the owner with difficulty settings (see Section 5)
- Room still exists in Redis with standard TTL (2h) for the session
- No Pusher game events needed during gameplay (no other players to broadcast to)
- Room channel still exists for future spectator/viewing room features
- "Leave Game" returns to home as normal

---

## 3. Minesweeper Rules Reference

### 3.1 The Grid
- Rectangular grid of cells, sized dynamically to fit the player's screen in portrait orientation
- Each cell is either a mine or safe
- Safe cells have a number (0–8) indicating adjacent mines (including diagonals)
- Zero-cells (no adjacent mines) are blank when revealed

### 3.2 Adaptive Grid Sizing

The grid dimensions are calculated at mount time based on available viewport space. The grid always fits the screen in portrait — no scrolling required.

**Algorithm:**
1. Measure available space: viewport width minus `GRID_PADDING * 2`, viewport height minus DeepBar + header + difficulty controls + bottom padding
2. Divide each dimension by `MIN_CELL_SIZE` (36px) to get max columns and rows
3. Clamp to reasonable bounds: min 8 columns, max 20 columns; min 10 rows, max 24 rows
4. Cell size = `Math.floor(availableWidth / cols)` — recalculated to fill the space evenly
5. Mine count derived from difficulty density applied to total cell count

**Recalculation:** Grid dimensions are calculated once on game start and on difficulty change via "Play Again". Window resizes mid-game do NOT recalculate (the board is locked once play begins). A new game after resize will pick up the new dimensions.

### 3.3 Difficulty (Mine Density)

Difficulty controls what percentage of the grid contains mines. The grid size stays the same across difficulties — only the mine count changes.

| Difficulty | Mine Density | Example: 9×13 grid (117 cells) | Example: 14×20 grid (280 cells) |
|---|---|---|---|
| Easy | ~12% | 14 mines | 34 mines |
| Medium | ~16% | 19 mines | 45 mines |
| Hard | ~20% | 23 mines | 56 mines |

Mine count = `Math.round(rows * cols * density)`, clamped so that at least 1 mine exists and at least 9 cells remain safe (to guarantee first-click safety zone).

### 3.4 Core Mechanics

**Reveal (tap / left click):**
- Revealing a mine → game over (loss)
- Revealing a numbered cell → shows the number
- Revealing a zero-cell → flood-fill reveals all connected zero-cells and their numbered borders

**Flag (long press / right click):**
- Toggles a flag marker on an unrevealed cell
- Flagged cells cannot be revealed until unflagged
- Flags are a player aid only — no mechanical effect on win condition

**Chord (tap/click on revealed number):**
- If a revealed number cell has exactly that many adjacent flags, clicking it reveals all adjacent unflagged cells
- If flags are placed incorrectly, this can trigger a mine → game over
- Quality-of-life feature, not required for MVP but strongly recommended

### 3.5 First Click Safety
- The first reveal MUST NOT be a mine
- Mine placement is deferred until the first click: generate the board such that the first-clicked cell and its 8 neighbours are all safe
- This guarantees the first click always opens a region

### 3.6 Win Condition
- All non-mine cells are revealed
- Flagging is NOT required — the player does not need to flag every mine
- Game ends immediately when the last safe cell is revealed

### 3.7 Loss Condition
- Player reveals a cell containing a mine
- On loss: all mines are revealed, incorrectly placed flags are marked with ❌
- The triggered mine is highlighted (`--star` / danger red) to distinguish it from other mines

### 3.8 Timer
- Starts on first click (not on game load)
- Stops on win or loss
- Counts up in seconds
- Displayed as `MM:SS`
- Final time displayed on game over screen

---

## 4. Data Models

### 4.1 Game State

```typescript
interface MinesweeperGameState {
  // Grid configuration (calculated from viewport on game start)
  rows: number;
  cols: number;
  cellSize: number;           // Pixel size of each cell
  mineCount: number;
  difficulty: Difficulty;

  // Board — flat array, row-major order (index = row * cols + col)
  cells: Cell[];

  // Game phase
  phase: 'ready' | 'playing' | 'won' | 'lost';

  // Mine positions (generated on first click)
  minePositions: number[] | null;  // Cell indices, null before first click

  // Stats
  revealedCount: number;
  flagCount: number;
  startedAt: number | null;   // Timestamp of first click
  endedAt: number | null;     // Timestamp of win/loss
  elapsed: number | null;     // Final time in seconds (set on win/loss)

  // The cell that killed you (for red highlight on loss)
  triggeredMineIndex: number | null;
}

interface Cell {
  index: number;          // Position in flat array
  mine: boolean;          // Is this cell a mine?
  revealed: boolean;      // Has this cell been revealed?
  flagged: boolean;       // Is this cell flagged?
  adjacentMines: number;  // Count of adjacent mines (0–8)
}

type Difficulty = 'easy' | 'medium' | 'hard';
```

### 4.2 Lobby Settings

```typescript
interface MinesweeperSettings {
  difficulty: Difficulty;
}
```

Settings are stored in the Room's `settings` field when the game starts, same pattern as Who's Deal's `targetScore`.

---

## 5. Lobby

### 5.1 Single-Player Lobby Layout

When `gameId === 'minesweeper'`, the lobby renders a simplified view:

```
┌──────────────────────────────────┐
│ DeepBar: 🔮→home | Minesweeper  │
├──────────────────────────────────┤
│                                  │
│         💣 Minesweeper           │  ← Fredoka, text-pearl
│                                  │
│   [PlayerCard — owner]           │  ← Single player card
│                                  │
│   ┌─ Difficulty ──────────────┐  │
│   │  [Easy]  [Medium]  [Hard] │  │  ← Segmented control, owner only
│   └───────────────────────────┘  │
│                                  │
│   [ Start Game ]                 │  ← .btn-primary
│                                  │
│   (future: viewing room link)    │
│                                  │
└──────────────────────────────────┘
```

- **Difficulty selector**: Three buttons in a segmented control style. Default: Easy. Selected button highlighted with pearl gold accent (`bg-accent/10 border-accent text-pearl`). Unselected: `border-border bg-surface text-cream`.
- **Start Game**: `.btn-primary` — always available (solo player, no waiting).
- **No team assignment, no bot slots, no player count waiting.**

### 5.2 Lobby API

Difficulty selection stored in room settings:

```
POST /api/game/action { type: 'set-difficulty', payload: { difficulty } }
  → Validate: requester is owner, room status is 'waiting'
  → Validate: difficulty is 'easy' | 'medium' | 'hard'
  → Update room.settings.difficulty
```

On "Start Game":
```
POST /api/game/start
  → Reads room.settings.difficulty (default 'easy' if unset)
  → Initializes MinesweeperGameState with phase='ready'
  → Grid dimensions NOT calculated server-side (client calculates from viewport)
  → Server stores difficulty + phase only; client owns full game state
```

---

## 6. Game Flow

### 6.1 Game Start (Client-Side)

```
Server sets phase='ready' with difficulty from lobby settings
  → Client receives game start signal
  → Client measures viewport:
      1. availableWidth = viewport width - (GRID_PADDING * 2)
      2. availableHeight = viewport height - DEEPBAR_HEIGHT - HEADER_HEIGHT - BOTTOM_PADDING
      3. cols = clamp(Math.floor(availableWidth / MIN_CELL_SIZE), MIN_COLS, MAX_COLS)
      4. rows = clamp(Math.floor(availableHeight / MIN_CELL_SIZE), MIN_ROWS, MAX_ROWS)
      5. cellSize = Math.floor(availableWidth / cols)
      6. mineCount = clamp(Math.round(rows * cols * MINE_DENSITY[difficulty]), 1, totalCells - 9)
  → Initialize client-side game state (useReducer)
  → Render empty grid, phase='ready'
```

### 6.2 First Click

```
Player reveals a cell (first action):
  → Generate mine positions:
      1. Build exclusion set: clicked cell + all 8 neighbours (clamped to grid bounds)
      2. Collect all cell indices NOT in exclusion set
      3. Shuffle and pick first `mineCount` indices
      4. Mark those cells as mine=true
      5. Calculate adjacentMines for every cell
  → Set phase = 'playing'
  → Set startedAt = Date.now()
  → Process the reveal (flood-fill if zero-cell)
```

### 6.3 Reveal Action

```
Player taps/clicks an unrevealed, unflagged cell:
  → Validate:
      ✓ phase is 'ready' or 'playing'
      ✓ index is valid (0 ≤ index < rows * cols)
      ✓ cell is not revealed
      ✓ cell is not flagged
  → If phase is 'ready': generate board (first click safety), transition to 'playing'
  → If cell is a mine:
      → phase = 'lost'
      → endedAt = Date.now()
      → elapsed = Math.floor((endedAt - startedAt) / 1000)
      → triggeredMineIndex = index
      → Reveal all mines
      → Mark incorrectly flagged cells (flagged but not a mine)
  → If cell is safe:
      → Reveal cell
      → If adjacentMines === 0: flood-fill reveal (BFS)
      → Update revealedCount (add all newly revealed cells)
      → Check win: if revealedCount === (rows * cols) - mineCount:
          → phase = 'won'
          → endedAt = Date.now()
          → elapsed = Math.floor((endedAt - startedAt) / 1000)
```

### 6.4 Flag Action

```
Player long-presses (mobile) or right-clicks (desktop) an unrevealed cell:
  → Validate:
      ✓ phase is 'playing' (cannot flag before first click)
      ✓ index is valid
      ✓ cell is not revealed
  → Toggle cell.flagged
  → Update flagCount (+1 or -1)
```

### 6.5 Chord Action

```
Player taps/clicks a revealed numbered cell:
  → Validate:
      ✓ phase is 'playing'
      ✓ cell is revealed
      ✓ cell.adjacentMines > 0
      ✓ count of adjacent flagged cells === cell.adjacentMines
  → Reveal all adjacent unflagged, unrevealed cells
  → If any revealed cell is a mine:
      → phase = 'lost' (same loss flow as 6.3)
      → triggeredMineIndex = first mine hit
  → Otherwise: update revealedCount, check win condition
```

### 6.6 Game Over

```
Phase: phase = 'won' or phase = 'lost'

Board remains visible in its final state:
  → Won: all safe cells revealed, mines stay hidden (player cleared the board)
  → Lost: triggered mine highlighted (star/danger), all other mines revealed,
          incorrectly flagged cells marked with ❌

Game over overlay appears (matches existing game over pattern):
  → Won: "Cleared!" in text-glass (success), final time displayed
  → Lost: "Boom!" in text-star (danger), final time displayed
  → Difficulty shown as context
  → "Play Again" button: emerald rounded-full (resets board, same difficulty)
  → "Change Difficulty" button: gray rounded-full (returns to lobby)
  → "Leave Game" button: .btn-danger style (returns to home)

"Play Again":
  → Recalculates grid from current viewport (picks up any resize)
  → Resets MinesweeperGameState to phase='ready' with same difficulty
  → No server round-trip needed (client-side reset)

"Change Difficulty":
  → Returns to lobby where player can pick new difficulty and start again

"Leave Game":
  → POST /api/rooms/leave → room cleanup → redirect home
```

---

## 7. Core Logic Helpers

### 7.1 Grid Sizing

```typescript
/**
 * Calculate grid dimensions from available viewport space.
 * Called on game start and on Play Again (to pick up viewport changes).
 */
function calculateGrid(
  viewportWidth: number,
  viewportHeight: number,
  difficulty: Difficulty
): { rows: number; cols: number; cellSize: number; mineCount: number } {
  const availW = viewportWidth - GRID_PADDING * 2;
  const availH = viewportHeight - DEEPBAR_HEIGHT - HEADER_HEIGHT - BOTTOM_PADDING;

  let cols = Math.floor(availW / MIN_CELL_SIZE);
  cols = Math.max(MIN_COLS, Math.min(MAX_COLS, cols));

  let rows = Math.floor(availH / MIN_CELL_SIZE);
  rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, rows));

  const cellSize = Math.floor(availW / cols);
  const totalCells = rows * cols;
  const mineCount = Math.max(1, Math.min(
    totalCells - 9,
    Math.round(totalCells * MINE_DENSITY[difficulty])
  ));

  return { rows, cols, cellSize, mineCount };
}
```

### 7.2 Coordinate Helpers

```typescript
function toRowCol(index: number, cols: number): [number, number] {
  return [Math.floor(index / cols), index % cols];
}

function toIndex(row: number, col: number, cols: number): number {
  return row * cols + col;
}

function getNeighbours(index: number, rows: number, cols: number): number[] {
  const [r, c] = toRowCol(index, cols);
  const neighbours: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        neighbours.push(toIndex(nr, nc, cols));
      }
    }
  }
  return neighbours;
}
```

### 7.3 Mine Placement

```typescript
/**
 * Generate mine positions, excluding the first-clicked cell and its neighbours.
 * Uses Fisher-Yates shuffle on eligible indices.
 */
function generateMines(
  totalCells: number,
  mineCount: number,
  excludeIndices: Set<number>,
  rows: number,
  cols: number
): { minePositions: number[]; cells: Cell[] } {
  const eligible: number[] = [];
  for (let i = 0; i < totalCells; i++) {
    if (!excludeIndices.has(i)) eligible.push(i);
  }

  // Fisher-Yates shuffle
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  const minePositions = eligible.slice(0, mineCount);
  const mineSet = new Set(minePositions);

  const cells: Cell[] = Array.from({ length: totalCells }, (_, i) => ({
    index: i,
    mine: mineSet.has(i),
    revealed: false,
    flagged: false,
    adjacentMines: 0,
  }));

  for (const pos of minePositions) {
    for (const n of getNeighbours(pos, rows, cols)) {
      cells[n].adjacentMines++;
    }
  }

  return { minePositions, cells };
}
```

### 7.4 Flood Fill

```typescript
/**
 * BFS flood-fill from a zero-cell. Reveals all connected zero-cells
 * and their numbered border cells.
 * Returns array of newly revealed cell indices.
 */
function floodFill(
  startIndex: number,
  cells: Cell[],
  rows: number,
  cols: number
): number[] {
  const revealed: number[] = [];
  const queue: number[] = [startIndex];

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const cell = cells[idx];

    if (cell.revealed || cell.flagged) continue;

    cell.revealed = true;
    revealed.push(idx);

    if (cell.adjacentMines === 0) {
      for (const n of getNeighbours(idx, rows, cols)) {
        if (!cells[n].revealed && !cells[n].flagged) {
          queue.push(n);
        }
      }
    }
  }

  return revealed;
}
```

---

## 8. GameModule Interface Implementation

Even though minesweeper runs client-side, it implements the GameModule interface for platform compatibility:

```typescript
// /lib/games/minesweeper/engine.ts

const minesweeperModule: GameModule<MinesweeperGameState> = {
  initialize(players, settings?) {
    // Server-side initialization is minimal — client owns game state
    return {
      difficulty: settings?.difficulty || 'easy',
      phase: 'ready',
      rows: 0,        // Calculated client-side from viewport
      cols: 0,
      cellSize: 0,
      mineCount: 0,
      cells: [],
      minePositions: null,
      revealedCount: 0,
      flagCount: 0,
      startedAt: null,
      endedAt: null,
      elapsed: null,
      triggeredMineIndex: null,
    };
  },

  processAction(state, playerId, action) {
    // All game actions processed client-side — server is pass-through
    return state;
  },

  getBotAction(state, botId) {
    // No bots in single-player minesweeper
    return { type: 'noop' };
  },

  checkGameOver(state) {
    return {
      isOver: state.phase === 'won' || state.phase === 'lost',
      winnerId: state.phase === 'won' ? undefined : undefined,
      isDraw: false,
    };
  },

  sanitizeForPlayer(state, playerId) {
    // Client has full state — no hidden information to strip
    return state;
  },

  processAdvancement(state, players, now) {
    // No server-side timing needed
    return null;
  },

  processPlayerReplacement(state, departingId, botId, index, players) {
    // Single player — if they leave, room is deleted
    return state;
  },
};
```

---

## 9. Constants

```typescript
// /lib/games/minesweeper/constants.ts

// Grid sizing
export const MIN_CELL_SIZE = 36;       // Minimum px per cell (finger-friendly)
export const MIN_COLS = 8;
export const MAX_COLS = 20;
export const MIN_ROWS = 10;
export const MAX_ROWS = 24;
export const GRID_PADDING = 16;        // Horizontal padding around grid (px)
export const DEEPBAR_HEIGHT = 48;      // DeepBar height (px) — adjust to match actual
export const HEADER_HEIGHT = 52;       // Mine counter + timer row height (px)
export const BOTTOM_PADDING = 16;      // Bottom breathing room (px)

// Mine density per difficulty
export const MINE_DENSITY: Record<Difficulty, number> = {
  easy: 0.12,
  medium: 0.16,
  hard: 0.20,
};

export const DEFAULT_DIFFICULTY: Difficulty = 'easy';

// Interaction
export const FLAG_LONG_PRESS_MS = 400;
export const LONG_PRESS_MOVE_THRESHOLD = 10;  // px — cancel long press if finger moves

// Number colors (classic minesweeper palette)
export const NUMBER_COLORS: Record<number, string> = {
  1: '#4A90D9',  // blue (softened for dark bg)
  2: '#6BBF7A',  // green
  3: '#E85B5B',  // red
  4: '#7B68C4',  // dark blue/purple
  5: '#C45B5B',  // maroon
  6: '#5BB8B0',  // teal
  7: '#D4D4D4',  // light gray (instead of black — dark bg)
  8: '#8B8B8B',  // gray
};
```

Note: Number colors are adjusted from classic minesweeper to be readable on Oyster World's dark (`--depth-abyss`) background. Classic minesweeper assumes a light gray cell background — these values maintain the recognizable color associations while ensuring contrast.

---

## 10. UI Components

### 10.1 Game View Layout

```
┌──────────────────────────────────┐
│ DeepBar: 🔮→home | Minesweeper  │
├──────────────────────────────────┤
│  💣 12       🕐 01:23           │  ← Header: mine counter + timer
├──────────────────────────────────┤
│                                  │
│   ┌──┬──┬──┬──┬──┬──┬──┬──┬──┐  │
│   │  │  │  │  │  │  │  │  │  │  │
│   ├──┼──┼──┼──┼──┼──┼──┼──┼──┤  │
│   │  │  │1 │1 │  │  │  │  │  │  │
│   ├──┼──┼──┼──┼──┼──┼──┼──┼──┤  │
│   │  │1 │🚩│2 │1 │  │  │  │  │  │
│   ├──┼──┼──┼──┼──┼──┼──┼──┼──┤  │  ← Adaptive grid
│   │  │1 │2 │██│██│1 │  │  │  │  │     (fills available space)
│   ├──┼──┼──┼──┼──┼──┼──┼──┼──┤  │
│   │  │  │1 │██│██│██│1 │1 │  │  │
│   ├──┼──┼──┼──┼──┼──┼──┼──┼──┤  │
│   │  │  │  │1 │2 │██│██│██│  │  │
│   └──┴──┴──┴──┴──┴──┴──┴──┴──┘  │
│                                  │
└──────────────────────────────────┘
```

Container: `flex flex-col max-w-lg mx-auto w-full overflow-x-hidden` (matches existing game view pattern).

### 10.2 Component Breakdown

**File structure:**
```
src/lib/games/minesweeper/
├── index.ts                    # Module export
├── engine.ts                   # GameModule implementation (thin — server pass-through)
├── helpers.ts                  # calculateGrid, toRowCol, toIndex, getNeighbours,
│                               #   generateMines, floodFill
├── types.ts                    # MinesweeperGameState, Cell, Difficulty
├── constants.ts                # Grid sizing, density, colors
└── components/
    └── MinesweeperGameView.tsx # Full game view (header, grid, game over)
```

**Hook:**
```
src/app/room/[roomCode]/hooks/
└── useMinesweeper.ts           # Client game state (useReducer), timer, viewport calc
```

**Header** (inside MinesweeperGameView)
- Single row: `flex items-center justify-between px-4 py-2.5`
- Background: `rgba(13,27,62,.5)` with `border-bottom: 1px solid rgba(240,194,127,.06)` (matches ScoreBar pattern)
- **Mine counter** (left): 💣 + `mineCount - flagCount` in `text-cream font-bold text-sm`
- **Timer** (right): 🕐 + `MM:SS` in `text-cream font-bold text-sm`
- Timer starts on first click, stops on win/loss
- Mine counter can go negative if over-flagged

**Grid** (inside MinesweeperGameView)
- CSS Grid: `grid-template-columns: repeat(cols, ${cellSize}px)`
- Centered: `mx-auto`
- Background: `rgba(13,27,62,.3)` with `border: 1px solid rgba(245,230,202,.06)` and `rounded-lg`
- `gap: 1px` between cells for subtle grid lines
- Disable touch callouts and context menus:
  - `touch-action: manipulation`
  - `onContextMenu={e => e.preventDefault()}`
  - `-webkit-touch-callout: none` / `user-select: none`

**Cell** (inside MinesweeperGameView or extracted component)

Visual states:
- **Unrevealed**: `bg-surface-light` (`rgba(26,82,118,.4)`) — slightly raised look via `border-t border-l border-white/10 border-b border-r border-black/20`
- **Revealed zero**: `bg-background/50` — flat, empty
- **Revealed number**: `bg-background/50` — number displayed in `NUMBER_COLORS`, `font-bold text-sm` (scale font to cell size)
- **Flagged**: 🚩 emoji centered on unrevealed background
- **Mine (on loss)**: 💣 on `bg-background/50`
- **Triggered mine (on loss)**: 💣 on `bg-star/30` (`rgba(201,101,138,.3)`) — the mine that killed you
- **Wrong flag (on loss)**: 🚩 with ❌ overlay on unrevealed background — cells flagged but not mines

Interactions:
- **Desktop**: Left click = reveal. Right click = flag toggle. Left click on revealed number = chord.
- **Mobile**: Tap = reveal. Long press (`FLAG_LONG_PRESS_MS`) = flag toggle. Tap on revealed number = chord.
- **Long press feedback**: Cell background shifts to `rgba(240,194,127,.15)` (pearl tint) during hold to indicate flag action incoming. If finger moves beyond `LONG_PRESS_MOVE_THRESHOLD`, cancel the long press.
- **Flagged cell tap**: No-op. Must long press to unflag first, then tap to reveal.
- **Game over**: All cells become non-interactive.

**Game Over Overlay** (inside MinesweeperGameView)

Matches existing game over pattern (Who's Deal / Take 4):
- Overlay on top of the grid: `bg-background/80 backdrop-blur-sm` with `animate-fade-in`
- Centered content:

```
┌────────────────────────────┐
│                            │
│      Cleared! ✨            │  ← or "Boom! 💥"
│      01:23                 │  ← Final time, text-2xl font-display
│      Easy · 9×13 · 14 💣   │  ← Context line, text-muted text-sm
│                            │
│   [ Play Again ]           │  ← emerald rounded-full
│   [ Change Difficulty ]    │  ← gray rounded-full → lobby
│   [ Leave Game ]           │  ← .btn-danger style
│                            │
└────────────────────────────┘
```

- **Won**: Title in `text-glass font-display text-3xl font-bold`
- **Lost**: Title in `text-star font-display text-3xl font-bold`
- **Time**: `text-cream text-2xl font-bold`
- **Context**: `text-muted text-sm` — difficulty, grid dimensions, mine count
- **Play Again**: `bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-full px-6 py-2 min-h-[44px]`
- **Change Difficulty**: `bg-gray-700 hover:bg-gray-600 text-white rounded-full px-6 min-h-[44px]`
- **Leave Game**: `.btn-danger` pattern

### 10.3 Mobile Considerations
- Cells always ≥ `MIN_CELL_SIZE` (36px) — finger-friendly on all devices
- Grid fits portrait viewport without scroll
- Long press must not trigger browser context menu or text selection
- Long press has movement cancellation to prevent accidental flags
- No landscape mode needed — grid is designed for portrait
- Header elements must have sufficient spacing (display-only, no tap targets needed in header)
- All buttons in game over overlay: `min-h-[44px]` tap targets

---

## 11. State Management

### 11.1 Client-Side Game Logic (MVP)

Minesweeper is single-player with no competitive integrity concerns in MVP. All game logic runs client-side for instant interactions — zero latency on reveal/flag.

```typescript
// useMinesweeper.ts

const [game, dispatch] = useReducer(minesweeperReducer, initialState);

type MinesweeperAction =
  | { type: 'init'; viewport: { w: number; h: number }; difficulty: Difficulty }
  | { type: 'reveal'; index: number }
  | { type: 'flag'; index: number }
  | { type: 'chord'; index: number }
  | { type: 'new-game' }
  | { type: 'tick' };
```

All state mutations go through the reducer. The `init` action calculates grid dimensions from the viewport. Timer ticks via `setInterval` during 'playing' phase, final elapsed time computed from timestamps.

### 11.2 Server Interaction

Minimal server involvement:
- **Room creation**: Standard room lifecycle (Redis, TTL)
- **Game start**: Server stores difficulty in room state, client takes over
- **Play Again**: Client-side reset, no server call
- **Change Difficulty**: Navigates back to lobby, standard room state
- **Leave Game**: Standard `POST /api/rooms/leave`

### 11.3 Future Server-Side Migration

Game logic lives in shared `/lib/games/minesweeper/helpers.ts` that works in both client and server contexts. When leaderboards or competitive minesweeper land, wrap the same logic in server-side `processAction()` with Redis state — mine positions hidden from client until revealed. No core logic rewrite needed.

---

## 12. Action Types Summary

Client-side actions processed by the reducer:

| Action Type | Payload | Phase | Description |
|---|---|---|---|
| `init` | `{ viewport, difficulty }` | — | Calculate grid, initialize empty board |
| `reveal` | `{ index }` | ready / playing | Reveal a cell (first click generates board) |
| `flag` | `{ index }` | playing | Toggle flag on unrevealed cell |
| `chord` | `{ index }` | playing | Chord-reveal around a numbered cell |
| `new-game` | — | any | Reset board with same difficulty, recalculate grid |
| `tick` | — | playing | Timer display update |

Server-side actions (lobby only):

| Action Type | Payload | Phase | Who |
|---|---|---|---|
| `set-difficulty` | `{ difficulty }` | waiting (lobby) | Owner |
| `start` | `{ difficulty }` | waiting | Owner |

---

## 13. Implementation Phases

### Phase 1: Classic Minesweeper
**Goal**: Fully playable single-player minesweeper with adaptive grid and three density-based difficulties, integrated into the Oyster World platform.

1. Create `/lib/games/minesweeper/types.ts` with type definitions
2. Create `/lib/games/minesweeper/constants.ts` with grid sizing, density, number colors
3. Create `/lib/games/minesweeper/helpers.ts` with core logic:
   - `calculateGrid()` — viewport to grid dimensions + mine count
   - `toRowCol()`, `toIndex()` — coordinate conversion
   - `getNeighbours()` — adjacent cell lookup
   - `generateMines()` — mine placement with first-click safety
   - `floodFill()` — BFS zero-cell expansion
4. Create `/lib/games/minesweeper/engine.ts` — GameModule implementation (thin pass-through)
5. Create `/lib/games/minesweeper/index.ts` — module export
6. Register "Minesweeper" in GAME_REGISTRY
7. Update `getGameModule()` in loader.ts to map `minesweeper` → module
8. Create `useMinesweeper.ts` hook:
   - `useReducer` with all game actions
   - Viewport measurement on mount
   - Timer via `setInterval` (start/stop tied to phase)
   - Long press detection for mobile flagging
9. Build lobby view for single-player:
   - Difficulty selector (Easy / Medium / Hard segmented control)
   - Start Game button
   - Handle `maxPlayers: 1` — no bot slots, no team assignment
10. Build MinesweeperGameView component:
    - Header (mine counter, timer)
    - Grid (CSS Grid, adaptive cell sizing, centered)
    - Cell rendering (all visual states)
    - Game over overlay (win/loss, time, play again, change difficulty, leave)
11. Implement reveal action:
    - First-click board generation with 9-cell safety zone
    - Mine hit → loss (set triggeredMineIndex, reveal all mines, mark wrong flags)
    - Zero-cell → flood fill
    - Win condition check after every reveal
12. Implement flag toggle:
    - Long press detection (`FLAG_LONG_PRESS_MS` threshold)
    - Movement cancellation (`LONG_PRESS_MOVE_THRESHOLD`)
    - Right click for desktop
    - Visual feedback during long press hold
    - Prevent `contextmenu` default on grid
13. Implement chord action:
    - Validate adjacent flag count matches cell number
    - Reveal all adjacent unflagged cells
    - Handle mine hit during chord → loss
14. Implement game over flow:
    - Board final state (mines revealed, wrong flags marked, triggered mine highlighted)
    - Game over overlay with play again / change difficulty / leave
    - Play Again: client-side reset with viewport recalculation
    - Change Difficulty: return to lobby
    - Leave Game: standard room leave flow
15. Wire up room page to render MinesweeperGameView when `gameId === 'minesweeper'`

**Acceptance Criteria**:
- [ ] Minesweeper appears in pearl carousel with 💣 icon and "1 player" badge
- [ ] Creating a minesweeper world shows single-player lobby with difficulty selector
- [ ] No bots fill empty seats (maxPlayers: 1)
- [ ] Lobby difficulty selector works (Easy / Medium / Hard)
- [ ] Start Game initializes the game view
- [ ] Grid sizes to fit viewport in portrait — no scrolling needed
- [ ] Cell size is always ≥ 36px (comfortable tap target)
- [ ] Grid looks correct on phone, tablet, and desktop
- [ ] Difficulty changes mine count, not grid size
- [ ] First click never hits a mine and always opens a region (flood fill)
- [ ] Numbered cells display correct adjacent mine counts in readable colors
- [ ] Zero-cells flood-fill correctly (no under/over-reveal)
- [ ] Flags toggle on long press (mobile) and right click (desktop)
- [ ] Long press provides visual feedback (pearl tint) before flag places
- [ ] Long press cancels if finger moves beyond threshold
- [ ] Right click does not open browser context menu on grid
- [ ] Flagged cells cannot be revealed until unflagged
- [ ] Mine counter shows `mineCount - flagCount`
- [ ] Chord works: reveals adjacent cells when flag count matches number
- [ ] Chord triggers loss if flags are incorrect and a mine is revealed
- [ ] Hitting a mine ends the game, reveals all mines
- [ ] Triggered mine has star/danger background — distinct from other revealed mines
- [ ] Incorrectly flagged cells marked with ❌ on loss
- [ ] Game won when all safe cells revealed (flags not required)
- [ ] Timer starts on first click, displays MM:SS, stops on win/loss
- [ ] Game over overlay matches platform pattern (Who's Deal / Take 4 style)
- [ ] Game over shows final time, difficulty, grid size, mine count
- [ ] "Play Again" resets board client-side with same difficulty
- [ ] "Change Difficulty" returns to lobby
- [ ] "Leave Game" exits room properly
- [ ] DeepBar shows "Minesweeper" as game name with pearl home button
- [ ] No text selection, context menus, or touch callouts on grid
- [ ] Design tokens used correctly (depth-abyss bg, pearl accents, cream text, glass success, star danger)
- [ ] All existing games still work (regression check)

---

## 14. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Reveal flagged cell | No-op — must unflag first |
| Reveal already revealed cell (non-numbered) | No-op |
| Reveal revealed numbered cell | Process as chord if adjacent flags match, otherwise no-op |
| Flag before first click | No-op — phase must be 'playing' |
| Flag revealed cell | No-op |
| Chord with wrong flag count | No-op — adjacent flag count must exactly match cell number |
| Rapid taps on same cell | Idempotent — second reveal is no-op (cell already revealed) |
| Long press on revealed cell | No-op |
| Long press with finger movement | Cancel — do not place flag |
| Over-flagging (more flags than mines) | Allowed — mine counter goes negative |
| Very small viewport | Grid clamps to MIN_COLS × MIN_ROWS, cells stay at MIN_CELL_SIZE |
| Very large viewport (desktop) | Grid clamps to MAX_COLS × MAX_ROWS, cells grow to fill space |
| Action dispatched after game over | No-op — reducer ignores reveal/flag/chord when phase is 'won' or 'lost' |
| Window resize mid-game | Ignored — grid locked until new game / play again |
| Player leaves mid-game | Standard room leave — room deleted (single player, no humans remain) |

---

## 15. Future Considerations

- **Leaderboards**: Server-side state for validated times, per-difficulty rankings
- **Daily challenge**: Seeded board shared by all players, drops at 4:15 (ties into Oyster World 415 lore)
- **Competitive mode**: Two players race the same seeded board in real-time (uses existing Pusher infrastructure)
- **Viewing room**: Spectators can watch a game in progress (room channel already exists)
- **Statistics**: Track games played, win rate, best times per difficulty, streaks
- **Animations**: Cell reveal cascade, mine explosion on loss, celebration on win
- **Haptic feedback**: Vibrate on flag place and mine hit (mobile)
- **415 achievement**: Something special at 415 total wins, or a perfect game completed in exactly 4:15
- **Surfacing screen**: When the platform-wide surfacing screen is built, minesweeper feeds into it with time + difficulty + win/loss data
