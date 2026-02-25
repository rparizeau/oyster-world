# Minesweeper — Per-Game Reference

## 1. Overview

| Field        | Value                                              |
|--------------|----------------------------------------------------|
| Game ID      | `minesweeper`                                      |
| Display Name | Minesweeper                                        |
| Players      | 1 (min 1, max 1) — single-player                  |
| Icon         | 💣                                                  |
| Description  | Classic Minesweeper. Find the mines. Clear the board. |

**Key architectural note**: Minesweeper runs CLIENT-SIDE only. No server `GameModule` logic for actual gameplay — just a thin pass-through for room management. The server stores difficulty; the client owns all game state via `useReducer`.

## 2. Game Rules

- Rectangular grid, sized dynamically to fit viewport in portrait.
- Difficulty controls mine density (not grid size): easy ~12%, medium ~16%, hard ~20%.
- **Reveal** (tap / left click): mine → loss, number → show count, zero → flood-fill.
- **Flag** (long press / right click): toggle flag marker on unrevealed cell.
- **Chord** (tap revealed number): if adjacent flags match number, reveal all adjacent unflagged cells.
- **First click safety**: mines placed AFTER first click, guaranteeing first click + 8 neighbors are safe.
- **Win**: all non-mine cells revealed (flagging not required).
- **Loss**: reveal a mine → all mines shown, wrong flags marked ❌, triggered mine highlighted.
- **Timer**: starts on first click, `MM:SS` format.

## 3. State Types

**File**: `src/lib/games/minesweeper/types.ts`

```typescript
interface MinesweeperGameState {
  rows: number;
  cols: number;
  cellSize: number;
  mineCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  cells: Cell[];
  phase: 'ready' | 'playing' | 'won' | 'lost';
  minePositions: number[] | null;  // null before first click
  revealedCount: number;
  flagCount: number;
  startedAt: number | null;
  endedAt: number | null;
  elapsed: number | null;
  triggeredMineIndex: number | null;
}

interface Cell {
  index: number;
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number;
}

type MinesweeperAction =
  | { type: 'init'; containerWidth: number; viewportHeight: number; difficulty: Difficulty }
  | { type: 'reveal'; index: number }
  | { type: 'flag'; index: number }
  | { type: 'chord'; index: number }
  | { type: 'new-game'; containerWidth: number; viewportHeight: number }
  | { type: 'tick' };
```

## 4. Phase State Machine

```
waiting ──► game-started ──► ready
                               │
                               ▼
                         First click
                      (mines placed)
                               │
                               ▼
                           playing
                          /       \
                         ▼         ▼
        reveal/flag/chord cells   tick (timer)
                          \       /
                           ▼   ▼
                    ┌──────────────────┐
                    │  Check outcome   │
                    └──────────────────┘
                       /            \
                      ▼              ▼
          All non-mine        Mine revealed
          cells revealed             │
              │                      ▼
              ▼                    lost
             won

play-again ──► returns to lobby (status: 'waiting')
```

## 5. Action Types & Payloads

### Client-side actions (useReducer, no server calls)

| Action     | Payload                                         | Phase              |
|------------|------------------------------------------------|--------------------|
| `init`     | `{ containerWidth, viewportHeight, difficulty }` | —                  |
| `reveal`   | `{ index }`                                     | `ready` / `playing` |
| `flag`     | `{ index }`                                     | `playing`          |
| `chord`    | `{ index }`                                     | `playing`          |
| `new-game` | `{ containerWidth, viewportHeight }`             | any                |
| `tick`     | —                                                | `playing`          |

### Server actions (lobby only)

| Route                        | Body                         | Phase                        |
|------------------------------|------------------------------|------------------------------|
| `POST /api/game/start`       | `{ roomCode, playerId }`     | `waiting`                    |
| `POST /api/game/play-again`  | `{ roomCode, playerId }`     | finished → returns to lobby  |

## 6. Pusher Events

Minimal — single player means almost no Pusher events needed.

Channel: `presence-room-{roomCode}` (room channel). No private channel events.

| Event          | Data Shape         | Triggered By          |
|----------------|--------------------|-----------------------|
| `game-started` | `{ gameState }`    | `/api/game/start`     |
| `room-updated` | `{ room: Room }`   | Play-again (returns to lobby) |

No gameplay events broadcast — all game logic is client-side.

## 7. Client Hook

**File**: `src/app/room/[roomCode]/hooks/useMinesweeper.ts`

```typescript
{
  game: MinesweeperGameState;
  dispatch: Dispatch<MinesweeperAction>;
  displayTime: string;
  minesRemaining: number;
  pressingIndex: number | null;
  initGrid: (containerWidth: number, viewportHeight: number) => void;
  resetGrid: (containerWidth: number, viewportHeight: number) => void;
  getLongPressHandlers: (index: number) => { onTouchStart, onTouchEnd, onTouchCancel };
  handleCellClick: (index: number) => void;
  handleRightClick: (e: React.MouseEvent, index: number) => void;
}
```

Client-side only — no Pusher event subscriptions for gameplay.

## 8. Bot Behavior

No bots. Single-player game with `maxPlayers: 1`.

## 9. Constants

Constants are defined in the spec but live in the hook/component rather than a separate constants file since the game is client-side.

```
// Grid sizing
MIN_CELL_SIZE         = 36        // px, finger-friendly
MIN_COLS              = 8
MAX_COLS              = 20
MIN_ROWS              = 10
MAX_ROWS              = 24
GRID_PADDING          = 16        // px horizontal padding
DEEPBAR_HEIGHT        = 48        // px
HEADER_HEIGHT         = 52        // px (mine counter + timer row)
BOTTOM_PADDING        = 16        // px

// Mine density per difficulty
MINE_DENSITY          = { easy: 0.12, medium: 0.16, hard: 0.20 }

DEFAULT_DIFFICULTY     = 'easy'

// Interaction
FLAG_LONG_PRESS_MS         = 400
LONG_PRESS_MOVE_THRESHOLD  = 10   // px — cancel if finger moves

// Number colors (adjusted for dark bg)
NUMBER_COLORS = {
  1: '#4A90D9',   // blue
  2: '#6BBF7A',   // green
  3: '#E85B5B',   // red
  4: '#7B68C4',   // dark blue/purple
  5: '#C45B5B',   // maroon
  6: '#5BB8B0',   // teal
  7: '#D4D4D4',   // light gray
  8: '#8B8B8B',   // gray
}
```

## 10. Component Architecture

| File | Purpose |
|------|---------|
| `src/lib/games/minesweeper/index.ts` | Module export |
| `src/lib/games/minesweeper/engine.ts` | Thin `GameModule` pass-through (server stores difficulty only) |
| `src/lib/games/minesweeper/types.ts` | `MinesweeperGameState`, `Cell`, `Difficulty` |
| `src/lib/games/minesweeper/components/MinesweeperGameView.tsx` | Full game view (header, grid, game over) |
| `src/app/room/[roomCode]/hooks/useMinesweeper.ts` | Client game state (`useReducer`), timer, viewport calc, long press |

## 11. Visual Design

Minimal custom styling — no `globals.css` game-specific classes for minesweeper.

### Header

`flex items-center justify-between px-4 py-2.5`, `bg rgba(13,27,62,.5)`, `border-bottom: 1px solid rgba(240,194,127,.06)` (matches ScoreBar pattern). Mine counter 💣 left, timer 🕐 right, both `text-cream font-bold text-sm`.

### Grid

CSS Grid `grid-template-columns: repeat(cols, ${cellSize}px)`, centered `mx-auto`, `bg rgba(13,27,62,.3)`, `border: 1px solid rgba(245,230,202,.06)`, `rounded-lg`, `gap: 1px`. Touch settings: `touch-action: manipulation`, `user-select: none`, context menu prevented.

### Cell Visual States

| State | Background | Content | Extra |
|-------|-----------|---------|-------|
| Unrevealed | `bg-surface-light` (`rgba(26,82,118,.4)`) | — | Raised: `border-t border-l border-white/10 border-b border-r border-black/20` |
| Revealed zero | `bg-background/50` | — | Flat empty |
| Revealed number | `bg-background/50` | Number in `NUMBER_COLORS` | `font-bold text-sm` |
| Flagged | Unrevealed bg | 🚩 | — |
| Mine (on loss) | `bg-background/50` | 💣 | — |
| Triggered mine | `bg-star/30` (`rgba(201,101,138,.3)`) | 💣 | Highlighted |
| Wrong flag | Unrevealed bg | 🚩 with ❌ overlay | — |

### Long Press Feedback

Cell bg shifts to `rgba(240,194,127,.15)` (pearl tint) during hold.

### Game Over Overlay

`bg-background/80 backdrop-blur-sm animate-fade-in`

| Element | Style |
|---------|-------|
| Won title | `"Cleared!"` — `text-glass font-display text-3xl font-bold` |
| Lost title | `"Boom!"` — `text-star font-display text-3xl font-bold` |
| Time | `text-cream text-2xl font-bold` |
| Context | `text-muted text-sm` — difficulty, grid, mine count |
| Play Again button | `bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-full px-6 py-2 min-h-[44px]` |
| Change Difficulty button | `bg-gray-700 hover:bg-gray-600 text-white rounded-full px-6 min-h-[44px]` |
| Leave Game button | `.btn-danger` style |

## 12. Platform Integration Points

| File | Integration |
|------|-------------|
| `src/lib/games/registry.ts` | `GAME_REGISTRY` entry (`maxPlayers: 1`, no bot filling) |
| `src/lib/games/loader.ts` | `getGameModule()` mapping |
| `src/app/room/[roomCode]/types.ts` | `GAME_DISPLAY_NAMES` entry |
| `src/app/room/[roomCode]/page.tsx` | Rendering branch for `gameId === 'minesweeper'` |
| `src/app/api/game/play-again/route.ts` | Returns to lobby (`status → 'waiting'`, `game → null`), Pusher `room-updated` |
| `src/app/api/rooms/create/route.ts` | Default settings: `{ difficulty: 'easy' }`, no bot filling for `maxPlayers: 1` |
| `src/app/room/[roomCode]/components/LobbyView.tsx` | Difficulty selector UI for minesweeper |
