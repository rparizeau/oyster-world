# Take 4 (4 Kate) — Per-Game Reference

## 1. Overview

| Field        | Value                                      |
|--------------|--------------------------------------------|
| Game ID      | `4-kate`                                   |
| Display Name | Take 4 (internally "4 Kate")               |
| Players      | 2 (min 2, max 2)                           |
| Icon         | ❤️                                          |
| Description  | Classic Connect 4. Drop pieces. Get four in a row. |

## 2. Game Rules

- 7 columns x 6 rows vertical grid.
- 2 players, each assigned a color: Red or Yellow.
- Players alternate turns dropping a piece into a column.
- Piece falls to the lowest available row in that column.
- First player to get 4 pieces in a row (horizontal, vertical, or diagonal) wins.
- If the board fills up with no winner, it is a draw.
- Room creator (Player 1) is Red and goes first.
- **Play Again**: Colors stay fixed (creator is always Red). First turn alternates each game. Board resets, scores preserved.

## 3. State Types

```typescript
interface FourKateState {
  board: CellColor[][];      // board[col][row], row 0 = bottom
  players: { red: string; yellow: string }; // playerIds
  currentTurn: 'red' | 'yellow';
  firstTurn: 'red' | 'yellow';
  phase: 'playing' | 'game_over';
  turnStartedAt: number;
  botActionAt: number | null;
  winner: string | null;     // playerId
  winningCells: [number, number][] | null; // [col, row][]
  moves: { col: number; row: number; color: 'red' | 'yellow' }[];
  gamesPlayed: number;
  isDraw: boolean;
}

type CellColor = 'red' | 'yellow' | null;
```

## 4. Phase State Machine

```
waiting --> game-started --> playing
                              |
                              v
                        Player drops piece
                              |
                              v
                    Check: 4 in a row? Board full?
                       /                \
                     Yes                 No
                      |                   |
                      v                   v
                  game_over        switch turn,
                                   continue playing
```

`game_over` transitions back to `playing` via `POST /api/game/play-again` (owner only).

## 5. Action Types & Payloads

All actions go through `POST /api/game/action`.

| Action | Payload              | Phase     | Who                 |
|--------|----------------------|-----------|---------------------|
| `drop` | `{ column: number }` | `playing` | Current turn player |

Play-again is handled via `POST /api/game/play-again` (owner only). Resets board, alternates first turn, keeps colors and scores.

## 6. Pusher Events

Channel: `presence-room-{roomCode}` (room channel). No private channel events for this game.

| Event          | Data Shape                                              | Triggered By                            |
|----------------|---------------------------------------------------------|-----------------------------------------|
| `game-started` | `{ gameState: sanitized }`                              | `/api/game/start`, `/api/game/play-again` |
| `move-made`    | `{ column, row, color, currentTurn, board }`            | `drop` action                           |
| `game-over`    | `{ winner, winningCells, finalBoard, isDraw }`          | Win or draw detected                    |

## 7. Client Hook

**File**: `src/app/room/[roomCode]/hooks/useFourKate.ts`

```typescript
{
  fourKateState: FourKateState | null;
  handleDropPiece: (column: number) => void;  // POST /api/game/action { type: 'drop' }
}
```

Subscribes to: `game-started`, `move-made`, `game-over`, `player-left`.

## 8. Bot Behavior

Priority-based strategy (evaluated top to bottom, first match wins):

1. **WIN** — Can I win this move? Take it.
2. **BLOCK** — Can opponent win next move? Block it.
3. **DOUBLE THREAT** — Can I create two ways to win? Do it.
4. **CENTER PREFERENCE** — Prefer center column (3), then 2/4, then 1/5, then 0/6.
5. **AVOID GIVING WIN** — Do not play in a column if it sets up opponent's win directly above.
6. **RANDOM** — Pick randomly from remaining valid columns.

Bot timing: `botActionAt = Date.now() + BOT_MOVE_DELAY_MS` (1500ms). Executed on next heartbeat dispatch cycle.

## 9. Constants

**File**: `src/lib/games/4-kate/constants.ts`

```
BOARD_COLS        = 7
BOARD_ROWS        = 6
WIN_LENGTH        = 4
BOT_MOVE_DELAY_MS = 1500
```

## 10. Component Architecture

| File | Purpose |
|------|---------|
| `src/lib/games/4-kate/index.ts` | Module export |
| `src/lib/games/4-kate/engine.ts` | Connect 4 logic (implements `GameModule`) |
| `src/lib/games/4-kate/bots.ts` | Priority AI |
| `src/lib/games/4-kate/constants.ts` | Game constants |
| `src/lib/games/4-kate/components/FourKateBoard.tsx` | Board grid component |
| `src/lib/games/4-kate/components/FourKateGameView.tsx` | Full game view |

## 11. Visual Design

### CSS Classes (defined in `globals.css` — DO NOT MODIFY)

| Class | Styles |
|-------|--------|
| `.c4-board` | 7-col grid, `bg #1e40af`, `border-radius 12px`, `padding 8px`, `max-width 420px` |
| `.c4-cell` | `aspect-ratio 1`, `rounded-full`, `min-height 44px`, `bg var(--background)` |
| `.c4-cell.red` | `bg #ef4444` + red glow shadow |
| `.c4-cell.yellow` | `bg #facc15` + yellow glow shadow |
| `.c4-cell.winning` | scale pulse animation `1 -> 1.08` |
| `.c4-cell.dropping` | bounce drop animation using `--drop-rows` CSS variable |
| `.c4-ghost` | 30% opacity preview piece |

### Player Colors (hardcoded hex, NOT CSS variables)

| Player | Tailwind Usage | Hex |
|--------|---------------|-----|
| Red | `bg-[#ef4444]` / `text-[#ef4444]` | `#ef4444` |
| Yellow | `bg-[#facc15]` / `text-[#facc15]` | `#facc15` |

### In-Component Patterns

Player indicators use `rounded-xl` with a piece dot (`w-4 h-4 rounded-full`):

| State | Container | Piece Dot |
|-------|-----------|-----------|
| Active turn | `border-[color]/50 bg-surface-light` | `animate-pulse-soft` |
| Winner | `border-accent bg-accent/10 shadow-[0_0_12px_rgba(240,194,127,0.3)]` | static |
| Inactive | `border-border bg-surface` | static |

## 12. Platform Integration Points

| File | Integration |
|------|-------------|
| `src/lib/games/registry.ts` | `GAME_REGISTRY` entry |
| `src/lib/games/loader.ts` | `getGameModule()` mapping |
| `src/app/room/[roomCode]/types.ts` | `GAME_DISPLAY_NAMES` entry (`"Take 4"`) |
| `src/app/room/[roomCode]/page.tsx` | Rendering branch for `gameId === '4-kate'` |
| `src/app/api/game/play-again/route.ts` | `processPlayAgain()` resets scores, alternates first turn |
| `src/app/api/game/action/route.ts` | Dispatches `drop` action to engine |
