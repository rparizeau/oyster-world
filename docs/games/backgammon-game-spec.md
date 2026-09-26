# Backgammon — Game Design Document

> Platform context: read alongside `docs/platform/ARCHITECTURE.md` and `docs/platform/GAME_DEVELOPER_GUIDE.md`.

---

## 1. Overview

| Property | Value |
|----------|-------|
| Game ID | `backgammon` |
| Display name | Backgammon |
| Icon | 🎲 |
| Min players | 2 |
| Max players | 2 |
| Bot support | Yes (1 human + 1 bot) |

Classic two-player race game. Each player has 15 checkers on a 24-point board and races to bear them all off before their opponent. Blocked points, hitting blots, and bearing off create the core tension. Dice introduce variance; cube and match play add strategic depth.

---

## 2. Rules Summary

### Board & Movement
- 24 points numbered 1–24. White moves **24 → 1** (bearing off past point 1). Black moves **1 → 24** (bearing off past point 24).
- Starting position: each player has 2 on the far point, 5 on the mid-point, 3 on the bar-point, 5 on the six-point.
- A point with 2+ same-color checkers is **made** — the opponent cannot land there.
- A point with exactly 1 checker is a **blot** — opponent can hit it, sending it to the bar.
- Checkers on the bar must re-enter the opponent's home board before any other move.

### Dice & Move Rules
- On your turn, roll two dice. Each die value is a separate move (moving one checker by that many points, or two different checkers).
- **Doubles**: rolling the same value on both dice gives four moves of that value instead of two.
- **Forced use**: you must use both dice if legally possible. If only one die can be used, you must use the **higher** value. If neither can be used, you lose your turn.
- **Bar priority**: if any checker is on the bar, all moves must be bar re-entries until all are cleared.

### Bearing Off
- Once all 15 of your checkers are in your home board (points 1–6 for white, 19–24 for black), you may bear off.
- To bear off: a die value exactly matching a point removes that checker. A die value higher than the highest occupied point also removes from that highest point (but only if no lower occupied points remain for a lower die).
- If a checker is hit during bearing off, it must re-enter and return to the home board before bearing off resumes.

### Winning & Scoring
- First to bear off all 15 checkers wins.
- **Normal win (1 point)**: opponent has borne off at least 1 checker.
- **Gammon (2 points)**: opponent has borne off 0 checkers and has no checkers on the bar or in your home board.
- **Backgammon (3 points)**: opponent has borne off 0 checkers AND has a checker on the bar or in your home board.
- With the doubling cube active, points won = cube value × win multiplier.

### Doubling Cube (optional, lobby toggle)
- A physical cube with values 2, 4, 8, 16, 32, 64. Starts centered (value effectively 1).
- Before rolling on your turn, you may offer to double. The opponent must accept (cube value doubles, they now own it — only they can redouble) or decline (forfeit the game at the current value).
- A player may only offer a double if they don't own the cube (i.e., it's centered or they own it — actually standard: you can double if the cube is centered OR you hold it). Wait — standard rule: you can offer a double only when the cube is centered or you hold it.
- Max cube value: 64.

### Match Play (lobby toggle)
- Players accumulate points across multiple games. First to reach the target score wins the match.
- **Crawford Rule**: when one player reaches target − 1 (one point from winning), the very next game is played without the doubling cube. Games after that resume cube play.
- Target score options: 3, 5, 7, 9, 11 (lobby setting, default 5).

---

## 3. Lobby Settings

| Setting | Type | Default | Options | Notes |
|---------|------|---------|---------|-------|
| `matchEnabled` | boolean | `false` | true/false | Enables match play mode |
| `matchTarget` | number | `5` | 3, 5, 7, 9, 11 | Only relevant if matchEnabled |
| `cubeEnabled` | boolean | `false` | true/false | Enables doubling cube |

---

## 4. TypeScript Interfaces

### `src/lib/games/backgammon/types.ts`

```typescript
export type CheckerColor = 'white' | 'black';

export interface BoardPoint {
  color: CheckerColor | null;
  count: number;
}

export interface DiceState {
  values: number[];     // e.g. [3, 5] or [4, 4, 4, 4] for doubles
  remaining: number[];  // dice not yet used (same values, consumed as moves are made)
}

export interface CubeState {
  value: number;                  // 1 | 2 | 4 | 8 | 16 | 32 | 64
  owner: CheckerColor | null;     // null = centered
  offeredBy: CheckerColor | null; // non-null while offer is pending
}

export interface MatchState {
  target: number;
  scores: { white: number; black: number };
  crawfordGame: boolean;     // doubling suspended this game (Crawford rule)
  postCrawford: boolean;     // Crawford game has been played; cube resumes
}

export type BackgammonPhase =
  | 'rolling'          // Current player must click Roll
  | 'moving'           // Current player has dice, must move
  | 'double_offered'   // Cube offer pending; other player must accept/decline
  | 'match_over'       // Match complete (only used in match mode)
  | 'game_over';       // Game complete

export interface BackgammonState {
  // Board
  points: BoardPoint[];             // [0] = point 1 ... [23] = point 24
  bar: { white: number; black: number };
  borneOff: { white: number; black: number };

  // Turn
  currentTurn: CheckerColor;
  phase: BackgammonPhase;

  // Dice
  dice: DiceState | null;           // null during 'rolling' and 'double_offered'

  // Doubling cube
  cube: CubeState;
  cubeEnabled: boolean;

  // Match
  match: MatchState | null;         // null if single-game mode

  // Player color assignment
  colorMap: Record<string, CheckerColor>; // playerId → color

  // Pending move sequence (partial turn tracking)
  // Each entry stores the move AND a pre-move board snapshot for safe undo
  pendingMoves: PendingMoveEntry[];

  // Bot move queue — full planned sequence computed once, executed move-by-move
  botMoveQueue?: CheckerMove[];

  // Result
  winner: CheckerColor | null;
  winType: 'normal' | 'gammon' | 'backgammon' | null;
  pointsScored: number | null;      // Cube value × win multiplier

  // Bot timing
  botActionAt: number | null;
}

export interface CheckerMove {
  from: number | 'bar';   // point 1–24, or 'bar'
  to: number | 'off';     // point 1–24, or 'off' (borne off)
  dieUsed: number;        // which die value was consumed
}

// Snapshot of board used for undo safety
export interface BoardSnapshot {
  points: BoardPoint[];
  bar: { white: number; black: number };
  borneOff: { white: number; black: number };
}

// Pending move entry — includes pre-move snapshot for safe undo
export interface PendingMoveEntry {
  move: CheckerMove;
  boardBefore: BoardSnapshot;
}

// Sanitized state (same struct; no hidden information in backgammon)
export type SanitizedBackgammonState = BackgammonState;
```

---

## 5. Phase Machine

```
initialize()
     │
     ▼
  rolling  ◄───────────────────────────────────────────────┐
     │                                                      │
     │  [cubeEnabled & eligible] → action: OFFER_DOUBLE     │
     │           │                                          │
     │           ▼                                          │
     │     double_offered                                   │
     │           │                                          │
     │    ACCEPT ─┤─ DECLINE → game_over (forfeit)          │
     │           │                                          │
     │           ▼                                          │
     │        rolling (cube value × 2, opponent's turn)    │
     │                                                      │
     │  [action: ROLL] → dice assigned                      │
     ▼                                                      │
  moving                                                    │
     │  [action: MOVE_CHECKER] × N (until dice exhausted)   │
     │  [action: UNDO_MOVE] (rewind last pending move)      │
     │  [action: CONFIRM_MOVES] (commit all pending)        │
     │           │                                          │
     │    [game over?] ──► game_over                        │
     │           │          (match: tally score → match_over│
     │           │           if match won, else new game)   │
     └───────────┴──────── switch turn ───────────────────►─┘
```

### Phase Rules

| Phase | Who acts | Legal actions |
|-------|----------|---------------|
| `rolling` | `currentTurn` player | `ROLL` (and `OFFER_DOUBLE` if cube enabled & eligible) |
| `moving` | `currentTurn` player | `MOVE_CHECKER`, `UNDO_MOVE`, `CONFIRM_MOVES` |
| `double_offered` | the *other* player | `ACCEPT_DOUBLE`, `DECLINE_DOUBLE` |
| `game_over` | owner | `PLAY_AGAIN` (via platform) |
| `match_over` | owner | `PLAY_AGAIN` |

**Forced pass**: if dice are rolled but no legal move exists, automatically transition to the opponent's `rolling` phase. Emit a `turn-passed` room event with reason `'no_legal_moves'`.

---

## 6. Action Contracts (`/api/game/action`)

All actions route through the platform's generic `/api/game/action` endpoint.

### `SET_MATCH_ENABLED`
```typescript
{ type: 'SET_MATCH_ENABLED', payload: { value: boolean } }
```
- Valid when `room.status === 'waiting'`, for owner only.
- Updates `room.settings.matchEnabled`.
- Emit `settings-updated` room event with updated settings.

### `SET_MATCH_TARGET`
```typescript
{ type: 'SET_MATCH_TARGET', payload: { value: number } }
```
- Valid when `room.status === 'waiting'`, for owner only.
- `value` must be one of `MATCH_TARGET_OPTIONS` (3, 5, 7, 9, 11). Error: `INVALID_SETTING`.
- Updates `room.settings.matchTarget`.
- Emit `settings-updated` room event with updated settings.

### `SET_CUBE_ENABLED`
```typescript
{ type: 'SET_CUBE_ENABLED', payload: { value: boolean } }
```
- Valid when `room.status === 'waiting'`, for owner only.
- Updates `room.settings.cubeEnabled`.
- Emit `settings-updated` room event with updated settings.

### `ROLL`
```typescript
{ type: 'ROLL' }
```
- Valid in phase: `rolling`, for `currentTurn` player only.
- Server generates two random dice (1–6 each).
- If doubles: expand to four dice of the same value.
- Compute legal moves. If none exist: emit `turn-passed`, switch turn, transition opponent to `rolling`.
- Transition to `moving`.

### `MOVE_CHECKER`
```typescript
{
  type: 'MOVE_CHECKER',
  payload: { from: number | 'bar'; to: number | 'off'; dieUsed: number }
}
```
- Valid in phase: `moving`, for `currentTurn` player only.
- Server validates the move is legal given current board and remaining dice.
- Appends to `pendingMoves`. Updates board immediately (optimistic pending state).
- If opponent's blot is on `to`: hit it, send to bar.
- Remove `dieUsed` from `dice.remaining`.
- If `dice.remaining` is empty: auto-call `CONFIRM_MOVES` (no need for explicit confirm).
- Does NOT transition phase until confirmed.
- Errors: `INVALID_MOVE` (400) if illegal.

### `UNDO_MOVE`
```typescript
{ type: 'UNDO_MOVE' }
```
- Valid in phase: `moving`, for `currentTurn` player only.
- Reverts the last entry in `pendingMoves`. Restores board state and dice.
- Cannot undo past an empty `pendingMoves`.

### `CONFIRM_MOVES`
```typescript
{ type: 'CONFIRM_MOVES' }
```
- Valid in phase: `moving`, for `currentTurn` player only.
- Only valid if at least one move has been made AND the player has used as many dice as legally required.
  - If both dice *could* be used, player must use both before confirming.
  - If only one die could legally be used, player must have used it (and used the higher one if applicable).
- Commits pending moves. Checks game over. Switches turn. Transitions to `rolling`.

### `OFFER_DOUBLE`
```typescript
{ type: 'OFFER_DOUBLE' }
```
- Valid in phase: `rolling`, for `currentTurn` player only.
- Valid only when cube is enabled, cube value < 64, and `cube.owner === null || cube.owner === currentTurn`.
- Not valid during Crawford game.
- Sets `cube.offeredBy = currentTurn`. Transitions to `double_offered`.

### `ACCEPT_DOUBLE`
```typescript
{ type: 'ACCEPT_DOUBLE' }
```
- Valid in phase: `double_offered`, for the *non-offering* player only.
- Doubles `cube.value`. Sets `cube.owner` to the accepting player. Clears `cube.offeredBy`.
- Transitions back to `rolling` for the offering player (they roll next).

### `DECLINE_DOUBLE`
```typescript
{ type: 'DECLINE_DOUBLE' }
```
- Valid in phase: `double_offered`, for the *non-offering* player only.
- Offering player wins `cube.value × 1` point (decline = forfeit at current value, no win type multiplier).
- Transitions to `game_over`.

---

## 7. GameModule Implementation Notes

### `initialize(players, settings)`
- Randomly assign colors (white/black) to players. Bots can be either color.
- Set up starting position in `points[0..23]`:
  ```
  Point  1 (index  0): 2 black
  Point  6 (index  5): 5 white
  Point  8 (index  7): 3 white
  Point 12 (index 11): 5 black
  Point 13 (index 12): 5 white
  Point 17 (index 16): 3 black
  Point 19 (index 18): 5 black
  Point 24 (index 23): 2 white
  ```
- Randomly determine `currentTurn` (white or black).
- Set phase to `rolling`.
- Apply lobby settings: `cubeEnabled`, `match` (if `matchEnabled`, init scores to 0-0, `crawfordGame: false`).
- Set `botActionAt = Date.now() + BOT_ROLL_DELAY_MS` if it's the bot's turn.

### `processAction(state, playerId, action)`
- Resolve `playerId` to `CheckerColor` via `colorMap`. Reject if wrong color for the action.
- Validate phase. Validate action-specific rules.
- For `MOVE_CHECKER`: call `isLegalMove(state, move)` (see §8).
- For `CONFIRM_MOVES`: call `hasUsedRequiredDice(state)` before committing.
- After commit: call `checkGameOver()`, then update match scores if in match mode.
- In match mode after a win: check if match is won → `match_over`; else reset board for next game (preserve scores, apply Crawford rule if applicable, re-initialize board).

### `getBotAction(state, botId)`
Bot acts based on phase:
- Phase `rolling` → return `{ type: 'ROLL' }` (bots never offer double — simplification).
- Phase `moving` → compute best legal move sequence (see §9), return first `MOVE_CHECKER` action in sequence. After all moves made, return `CONFIRM_MOVES`.
- Phase `double_offered` → return `ACCEPT_DOUBLE` (bots always accept — simplification).

### `sanitizeForPlayer(state, playerId)`
Backgammon has no hidden information — full state is visible to both players. Return state as-is. (Still implement the method; just return a deep copy.)

### `processAdvancement(state, players, now)`
- If `state.botActionAt !== null && now >= state.botActionAt`:
  - Find the bot player.
  - Call `getBotAction()` and apply it via `processAction()`.
  - Clear `botActionAt` (or set new one if another bot action will follow).
  - `recurse: true` so the heartbeat checks for further bot actions in the same tick.
- Else return `null`.

### `processPlayerReplacement(state, departingId, botId, playerIndex, players)`
- Transfer the departing player's color in `colorMap` to the new bot.
- Set `botActionAt = Date.now() + BOT_ROLL_DELAY_MS` if it's now the bot's turn.

---

## 8. Legal Move Validation

The server must compute all legal moves for a given board + remaining dice. This is the most complex engine logic.

### `generateSequences(board, diceRemaining): CheckerMove[][]`

The foundation of all legality checks. Generate complete move sequences recursively:

```
generateSequences(board, diceRemaining):
  if diceRemaining is empty:
    return [[]]   // one complete sequence: no moves remaining

  sequences = []
  for each die in diceRemaining (deduplicated to avoid identical branches):
    legalMovesForDie = getMovesForDie(board, die)
    for each move in legalMovesForDie:
      board2 = applyMove(board, move)
      subSequences = generateSequences(board2, diceRemaining minus one die)
      sequences += [[move, ...sub] for sub in subSequences]
    if sequences.length >= MAX_SEQUENCE_SEARCH:
      break   // explosion guard

  return sequences
```

**Sequence filtering rules** (apply after generation):
1. If any sequence uses **all dice**, discard shorter sequences.
2. If only one die can be used, the player **must use the higher die** — discard sequences using only the lower die.
3. For doubles, all four dice must be used if any sequence can.

### `getLegalMoves(state): CheckerMove[]`

**Do not evaluate individual moves in isolation.** Instead:
1. Call `generateSequences(board, dice.remaining)` to get all valid sequences.
2. Extract the first move of each sequence.
3. Return the deduplicated set.

```typescript
const seqs = generateSequences(board, state.dice.remaining);
return deduplicate(seqs.map(seq => seq[0]));
```

This ensures the UI only highlights moves that lead to a legal turn completion — no highlighting a move that strands the player with a die they can't use.

### `hasUsedRequiredDice(state): boolean`

Before allowing `CONFIRM_MOVES`, verify the player has used as many dice as required:
1. If `dice.remaining` is empty → true.
2. Re-run `generateSequences` from the current post-pending board with remaining dice.
3. If no sequence exists that uses another die → true (player is stuck).
4. If only one die remains usable and the player used the lower one → false (must use higher).

### Undo Safety

Each `PendingMoveEntry` stores a `boardBefore` snapshot (`points`, `bar`, `borneOff`). Undo process:
1. Pop the last `PendingMoveEntry`.
2. Restore `boardBefore` to the live board state.
3. Return `entry.move.dieUsed` to `dice.remaining`.

This correctly reverses hits (checker back off bar), bear-offs, and bar re-entries without error-prone reverse logic.

---

## 9. Bot AI Strategy

A reasonable intermediate bot for Oyster World. Not exhaustive — improves over a pure random bot while keeping implementation manageable.

### Move Evaluation Heuristic
Score each full legal move sequence with a weighted evaluation of the resulting board state:

| Feature | Weight | Notes |
|---------|--------|-------|
| Pip count delta | +5 per pip saved vs current | Primary race metric |
| Made points in home board | +3 per made point | Building a prime |
| Blots in opponent's home board | −4 per blot | High-risk position |
| Blots elsewhere | −2 per blot | Lower-risk exposure |
| Hitting opponent's blot | +3 | Sends them to bar |
| Checkers on bar (own) | −5 per checker | Being on bar is costly |
| Anchoring in opponent's home | +2 per anchor point | Defensive structure |
| Checker advancement | +0.1 per pip advanced | Tiebreaker |

### Move Selection
1. Enumerate all complete legal move sequences (can be large for doubles — cap at 200 sequences to avoid timeout).
2. Score each resulting board state.
3. Select the highest-scoring sequence.
4. Execute moves one at a time via `getBotAction()` calls (each returns the next `MOVE_CHECKER` in the sequence, with the sequence stored in state as `botMoveQueue`).

### Bot Timing
```
BOT_ROLL_DELAY_MS = 1200       // Pause before rolling (feels natural)
BOT_MOVE_DELAY_MS = 800        // Pause between checker moves
BOT_CONFIRM_DELAY_MS = 400     // Pause before confirming
```

---

## 10. Pusher Events

### Room Channel (`presence-room-{roomCode}`)

| Event | Data | Trigger |
|-------|------|---------|
| `game-started` | `{ gameState: SanitizedBackgammonState }` | `/api/game/start` |
| `dice-rolled` | `{ color: CheckerColor, dice: number[], legalMoves: CheckerMove[] }` | `ROLL` action |
| `checker-moved` | `{ move: CheckerMove, pendingMoves: CheckerMove[], remainingDice: number[], hit: boolean }` | `MOVE_CHECKER` action |
| `move-undone` | `{ pendingMoves: CheckerMove[], remainingDice: number[] }` | `UNDO_MOVE` action || `turn-confirmed` | `{ gameState: SanitizedBackgammonState }` | `CONFIRM_MOVES` action |
| `turn-passed` | `{ color: CheckerColor, reason: 'no_legal_moves' }` | Auto-pass in `ROLL` |
| `double-offered` | `{ offeredBy: CheckerColor, cubeValue: number }` | `OFFER_DOUBLE` action |
| `double-accepted` | `{ acceptedBy: CheckerColor, newCubeValue: number }` | `ACCEPT_DOUBLE` action |
| `double-declined` | `{ declinedBy: CheckerColor }` | `DECLINE_DOUBLE` action |
| `game-over` | `{ winner: CheckerColor, winType: 'normal'\|'gammon'\|'backgammon', pointsScored: number, match: MatchState \| null }` | `CONFIRM_MOVES` when win detected |
| `match-over` | `{ winner: CheckerColor, finalScores: { white: number, black: number } }` | When match target reached |
| `new-game-started` | `{ gameState: SanitizedBackgammonState }` | Between match games |

---

## 11. UI Notes

### Board Layout
- Render a vertical board on mobile (standard for mobile backgammon).
- Points 13–24 along the top row, points 12–1 along the bottom row, with the bar in the center.
- White checkers move bottom-right → top-right → top-left → bottom-left (visual direction for white moving 24→1).
- Use the platform's pearl gold (`--pearl` / `#f0c27f`) for white checkers and `--shallow-water` (`#7eb8d4`) for black checkers (consistent with team color system).
- Highlight valid destination points when a checker is selected.

### Dice Display
- Show dice prominently in the center bar area.
- Used dice: reduced opacity (0.35).
- Remaining dice: full opacity.
- Roll button: `.btn-primary` styled, shown during `rolling` phase for current player.

### Offer Double Button
- Shown as a secondary action during `rolling` phase when cube offer is legal.
- Use `.btn-secondary` styling. Label: "Offer Double".

### Pending Move Indicators
- Checkers that have been moved but not yet confirmed should show in their new position with a subtle dotted border or reduced opacity to indicate uncommitted state.

### Undo / Confirm Controls
- "Undo" (`.btn-secondary`): visible whenever `pendingMoves.length > 0`.
- "Confirm" (`.btn-primary`): visible when at least one pending move exists and `hasUsedRequiredDice` is satisfied. Label: "Confirm Moves".

### Game Over Screen
- Display winner, win type (Normal / Gammon / Backgammon), and points scored.
- In match mode: show updated scores and "Match Over" if applicable.
- Play Again button (owner only).

### DeepBar
```
[Pearl] [Backgammon] [Leave]
```

---

## 12. Constants (`src/lib/games/backgammon/constants.ts`)

```typescript
export const BOT_ROLL_DELAY_MS = 1200;
export const BOT_MOVE_DELAY_MS = 800;
export const BOT_CONFIRM_DELAY_MS = 400;
export const BOT_ACCEPT_DOUBLE_DELAY_MS = 1000;

export const MAX_CHECKERS = 15;
export const BOARD_POINTS = 24;
export const HOME_BOARD_SIZE = 6;

export const DEFAULT_MATCH_TARGET = 5;
export const MATCH_TARGET_OPTIONS = [3, 5, 7, 9, 11];

export const MAX_CUBE_VALUE = 64;
export const CUBE_SEQUENCE = [1, 2, 4, 8, 16, 32, 64] as const;

export const BOT_MOVE_SEQUENCE_CAP = 200; // Max sequences evaluated by bot AI
export const MAX_SEQUENCE_SEARCH = 200;   // Also caps general sequence generation (prevents worst-case doubles explosion ~160k)

export const WHITE_ENTRY_OFFSET = 25;     // White bar entry: point = WHITE_ENTRY_OFFSET - die
                                          // Black bar entry: point = die

// Starting position: [pointIndex]: { color, count }
export const STARTING_POSITION: Array<{ color: CheckerColor; count: number } | null> = [
  { color: 'black', count: 2 }, // point 1
  null, null, null, null,
  { color: 'white', count: 5 }, // point 6
  null,
  { color: 'white', count: 3 }, // point 8
  null, null, null,
  { color: 'black', count: 5 }, // point 12
  { color: 'white', count: 5 }, // point 13
  null, null, null,
  { color: 'black', count: 3 }, // point 17
  null,
  { color: 'black', count: 5 }, // point 19
  null, null, null,
  { color: 'white', count: 2 }, // point 24
];
```

---

## 13. Registration Checklist

Files to create or modify:

| # | File | Action |
|---|------|--------|
| 1 | `src/lib/games/backgammon/types.ts` | Create — all interfaces above |
| 2 | `src/lib/games/backgammon/constants.ts` | Create — §12 values |
| 3 | `src/lib/games/backgammon/engine.ts` | Create — full GameModule implementation |
| 4 | `src/lib/games/backgammon/bots.ts` | Create — move evaluation heuristic (§9) |
| 5 | `src/lib/games/backgammon/index.ts` | Create — re-export GameModule |
| 6 | `src/lib/games/backgammon/components/BackgammonGameView.tsx` | Create — game UI |
| 7 | `src/lib/games/registry.ts` | Add `backgammon` GameConfig entry |
| 8 | `src/lib/games/loader.ts` | Add import + entry in `getGameModule()` |
| 9 | `src/app/room/[roomCode]/types.ts` | Add `'backgammon': 'Backgammon'` to GAME_DISPLAY_NAMES |
| 10 | `src/app/room/[roomCode]/hooks/useBackgammon.ts` | Create — client hook |
| 11 | `src/app/room/[roomCode]/page.tsx` | Add rendering branch for `backgammon` |
| 12 | `src/app/api/rooms/create/route.ts` | Add default settings block for `backgammon` |
| 13 | `src/app/room/[roomCode]/components/LobbyView.tsx` | Add backgammon lobby settings UI |

---

## 14. Claude Code Prompt

```
Load these docs before starting:
- docs/platform/ARCHITECTURE.md
- docs/platform/DESIGN_SYSTEM.md
- docs/platform/GAME_DEVELOPER_GUIDE.md
- docs/games/backgammon.md

Implement the Backgammon game for Oyster World. Work through the
registration checklist (§13 of the game doc) in order. Do not create
any new API routes — all actions go through /api/game/action.

## Files to create

### 1. src/lib/games/backgammon/types.ts
Define all interfaces from §4 of the game doc verbatim:
CheckerColor, BoardPoint, DiceState, CubeState, MatchState,
BackgammonPhase, BackgammonState, CheckerMove,
SanitizedBackgammonState.

### 2. src/lib/games/backgammon/constants.ts
Define all constants from §12, including STARTING_POSITION.

### 3. src/lib/games/backgammon/bots.ts
Export getBestMoveSequence(state, botColor): CheckerMove[].
- Call generateSequences() (imported from engine helpers) capped at MAX_SEQUENCE_SEARCH.
- Score each resulting board state with the weighted heuristic from §9.
- Return the highest-scoring sequence.

Also export getBotAction(state, botId) that:
- If state.botMoveQueue is non-empty: pop the next move and return MOVE_CHECKER.
- If state.botMoveQueue is empty and phase is 'moving': compute a new sequence, store it in state.botMoveQueue, return first MOVE_CHECKER.
- If phase is 'rolling': return { type: 'ROLL' }.
- If phase is 'double_offered': return { type: 'ACCEPT_DOUBLE' }.

### 4. src/lib/games/backgammon/engine.ts
Implement the full GameModule<BackgammonState> with all 7 methods.

Key helpers to implement inside this file (not exported):
- generateSequences(board, diceRemaining): CheckerMove[][] — recursive sequence
  generator per §8, capped at MAX_SEQUENCE_SEARCH, with filtering rules applied
- getLegalMoves(state): CheckerMove[] — derived from first moves of generateSequences()
- hasUsedRequiredDice(state): boolean — re-runs generateSequences on remaining dice
- applyMove(board, move): BoardSnapshot — returns new snapshot without mutating
- checkWin(state): { winner, winType, pointsScored } | null
- detectGammon(state, loser): 'gammon' | 'backgammon' | 'normal'
- resetBoardForNextGame(state): BackgammonState — keep match scores,
  re-init board, apply Crawford rule if applicable

Phase validation: every processAction() call must verify the current
phase and the acting player's color before mutating state. Return state
unchanged (or throw with a platform error code) on invalid phase.

Auto-pass: in processAction for ROLL, after computing legalMoves, if the array
is empty: switch turn, set phase to 'rolling', set botActionAt if next player is
a bot, emit 'turn-passed' room event. Do not transition to 'moving'.

Undo: pop last PendingMoveEntry, restore entry.boardBefore to live board state,
return entry.move.dieUsed to dice.remaining. Do NOT attempt to reverse-compute
the move — always restore from snapshot.

### 5. src/lib/games/backgammon/index.ts
Re-export the GameModule instance as the default export.

### 6. src/lib/games/backgammon/components/BackgammonGameView.tsx
Build the game UI per §11.
- Vertical board layout, mobile-first, max-w-lg centered.
- Points 13–24 across the top row, points 12–1 across the bottom row,
  bar in the center vertical strip.
- White checkers: pearl gold (#f0c27f). Black checkers: shallow-water (#7eb8d4).
- On selecting a checker, highlight valid destination points (from
  legalMoves in game state). A second tap on highlighted point sends
  MOVE_CHECKER action.
- Dice in the center bar. Used dice at opacity 0.35.
- Roll button (.btn-primary) shown for current player in 'rolling' phase.
- Offer Double button (.btn-secondary) shown when cube offer is legal.
- Pending moves shown with dotted ring on checker.
- Undo (.btn-secondary) and Confirm Moves (.btn-primary) shown during 'moving'.
- game_over / match_over overlay with win details and Play Again (owner only).
- DeepBar: gameName="Backgammon" actionLabel="Leave" onAction={onLeave}

Props interface:
  room, playerId, isOwner, leaving, onLeave, onPlayAgain (from GameViewProps)
  plus all returns from useBackgammon hook.

### 7. src/app/room/[roomCode]/hooks/useBackgammon.ts
Client hook per GAME_DEVELOPER_GUIDE §6. Subscribe to all room events
from §10. Maintain local gameState. Expose:
- gameState: BackgammonState | null
- legalMoves: CheckerMove[] (derived from latest dice-rolled event)
- selectedChecker: number | 'bar' | null
- setSelectedChecker
- handleRoll, handleMove, handleUndoMove, handleConfirmMoves
- handleOfferDouble, handleAcceptDouble, handleDeclineDouble

### 8. Platform wiring (modify existing files)
- src/lib/games/registry.ts: add { id: 'backgammon', name: 'Backgammon',
  description: 'Classic race and strategy for two players', minPlayers: 2,
  maxPlayers: 2, icon: '🎲' }
- src/lib/games/loader.ts: add import and entry in getGameModule()
- src/app/room/[roomCode]/types.ts: add 'backgammon': 'Backgammon'
- src/app/api/rooms/create/route.ts: add default settings block:
  if (gameId === 'backgammon') room.settings = { matchEnabled: false,
  matchTarget: 5, cubeEnabled: false }
- src/app/room/[roomCode]/components/LobbyView.tsx: add settings UI
  when room.gameId === 'backgammon' — toggle for match play, match
  target selector (shown when matchEnabled), toggle for doubling cube.
  Each change dispatches a settings update via /api/game/action with
  the appropriate SET_SETTING_* action type. Only owner can change.
- src/app/room/[roomCode]/page.tsx: add rendering branch for backgammon

## Constraints
- No new API routes. All game actions via /api/game/action.
- No setTimeout or setInterval in server code. Bot timing via botActionAt.
- Keep BackgammonGameView mobile-first (375px min). All tap targets ≥ 44px.
- Do not touch PearlGlobe, DeepBar (use as-is), CSS color tokens, or globals.css.
- Types must be in src/lib/games/backgammon/types.ts — not in src/lib/types.ts.
- Constants must be in src/lib/games/backgammon/constants.ts — not in src/lib/constants.ts.
```
