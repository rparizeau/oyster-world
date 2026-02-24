Read SPEC.md for original architecture context, then read OYSTER-SPEC.md for the full Oyster World specification. Phase 1 (platform refactor) is complete — the app is now "Oyster World" with a game registry, generic action route, and Terrible People refactored as a game module.

Implement Phase 2: 4 Kate Game Module. This is a 2-player Connect 4 game.

**1. Game Engine (`/lib/games/4-kate/engine.ts`)**
Implement the GameModule interface. All functions must be pure — no Redis, no Pusher, no side effects.

Game rules (standard Connect 4):
- 7 columns × 6 rows vertical grid
- 2 players: Red (room creator, Player 1) and Yellow (Player 2)
- Players alternate turns dropping a piece into a column
- Piece falls to lowest available row in that column
- First to get 4 in a row (horizontal, vertical, diagonal) wins
- Board full with no winner = draw

State model (from Section 3.3 of OYSTER-SPEC.md):
- `board`: 7×6 array indexed as `board[col][row]`, row 0 = bottom
- `players`: `{ red: playerId, yellow: playerId }` — fixed, never changes on Play Again
- `currentTurn`: `'red' | 'yellow'`
- `firstTurn`: tracks who went first this game (alternates on Play Again)
- `phase`: `'playing' | 'game_over'`
- `turnStartedAt`, `botActionAt`: serverless-safe timestamps
- `winner`, `winningCells`: result tracking
- `moves`: move history array
- `gamesPlayed`: counter for alternating first turn

Implement:
- `initialize(players)`: Create empty board, assign Red to first player / Yellow to second, set currentTurn based on gamesPlayed (alternates), phase = 'playing'
- `processAction(state, playerId, action)`: Handle two action types:
  - `type: 'drop'` with `payload: { column }`:
    - MUST validate: phase is 'playing', it's this player's turn, column is 0-6, column not full
    - Turn-level idempotency: if moves array length already reflects a move for this turn, reject as no-op
    - Drop piece to lowest available row, add to moves, check win, check draw, switch turn
  - `type: 'play-again'`:
    - Validate: phase is 'game_over'
    - Reset board, increment gamesPlayed, alternate firstTurn, set phase = 'playing'
- `getBotAction(state, botId)`: Returns a GameAction with type 'drop' and chosen column
- `checkGameOver(state)`: Return `{ isOver, winnerId?, isDraw? }`
- `sanitizeForPlayer(state, playerId)`: Connect 4 is full information — return full state (no hidden info)

Win detection — check from last placed piece in all 4 directions (horizontal, vertical, diagonal-up, diagonal-down) as specified in Section 3.7 of OYSTER-SPEC.md. Return the winning cell coordinates.

**2. Bot AI (`/lib/games/4-kate/bots.ts`)**
Priority-based strategy (check in order, take first match):
1. WIN: Can I complete 4 in a row this move? → Take it
2. BLOCK: Can opponent complete 4 in a row next move? → Block it
3. DOUBLE THREAT: Can I create two different ways to win? → Do it
4. CENTER PREFERENCE: Prefer center column (3), then 2/4, then 1/5, then 0/6
5. AVOID GIVING WIN: Don't play in a column if the row directly above would give opponent a win
6. RANDOM: Pick randomly from remaining valid columns

Bot timing uses the serverless-safe timestamp pattern — `botActionAt` set to `now + BOT_MOVE_DELAY_MS` (1500ms), executed on next heartbeat after timestamp passes. Idempotent: if move already recorded for this turn, skip.

**3. Constants (`/lib/games/4-kate/constants.ts`)**
```
BOARD_COLS = 7
BOARD_ROWS = 6
WIN_LENGTH = 4
BOT_MOVE_DELAY_MS = 1500
```

**4. Register in Game Registry**
Add 4 Kate to GAME_REGISTRY in `/lib/games/registry.ts` (should already be there from Phase 1 — verify).

**5. Wire Up Generic Action Route**
The generic `/api/game/action` route from Phase 1 should already dispatch based on `room.gameId`. Verify it correctly routes `type: 'drop'` and `type: 'play-again'` actions to the 4 Kate engine when `gameId` is `'4-kate'`.

**6. Heartbeat Integration**
Update the heartbeat endpoint to handle 4 Kate bot actions:
- Check `shouldExecuteBotAction()` using `botActionAt` timestamp
- If bot's turn and botActionAt has passed, execute bot move via the engine
- Idempotent: check move count before executing
- Trigger Pusher events after bot move

**7. Mid-Game Player Departure**
When a human leaves a 4 Kate game:
- Bot inherits their position and color
- If it's now the bot's turn, set botActionAt
- Game continues seamlessly

**8. UI Components (`/lib/games/4-kate/components/`)**

Board component:
- 7×6 CSS grid
- Each cell: empty (dark/neutral), red piece, or yellow piece
- Pieces should be circles (border-radius: 50%)
- Column hover effect: ghost piece shown at the top of the hovered column in the current player's color (only when it's their turn)
- Click/tap entire column to drop a piece
- Piece drop animation: piece visually falls from top to its resting row
- Winning cells: highlighted with glow or distinct animation when game ends
- Mobile: board fits screen width without horizontal scroll, minimum 44px touch targets per column

Game view:
- **Top**: Player indicators — "🔴 [Red name]" vs "🟡 [Yellow name]", active player highlighted/bolded
- **Center**: Game board (responsive)
- **Bottom**: Turn status text:
  - Your turn: "Your turn — drop a piece!"
  - Opponent's turn: "Waiting for [name]..."
  - Bot thinking: "Bot is thinking..."
- **Game Over overlay/section**:
  - Winner: "[Name] wins!" with winning line highlighted on board
  - Draw: "It's a draw!"
  - "Play Again" button (owner only)
  - "Leave World" button (all players)

**9. Pusher Events**
Wire up these events on the existing room channel (`presence-room-{roomCode}`):
- `game-started`: `{ board, players, currentTurn }`
- `move-made`: `{ column, row, color, currentTurn, board }`
- `game-over`: `{ winner, winningCells, finalBoard, isDraw }`

Client must subscribe to these and update board state in real-time without page refresh.

**Acceptance Criteria — verify all before considering this phase complete:**
- [ ] Can select "4 Kate" when creating a world
- [ ] World is 2 players (1 human + 1 bot, or 2 humans)
- [ ] Board renders correctly as 7×6 grid on desktop and mobile
- [ ] Can drop pieces by clicking/tapping columns
- [ ] Ghost piece shows on column hover (current player's color)
- [ ] Pieces fall to lowest available row with drop animation
- [ ] Turn alternates between Red and Yellow
- [ ] Player indicators show whose turn it is
- [ ] Turn status text updates ("Your turn" / "Waiting..." / "Bot is thinking...")
- [ ] Bot plays after ~1.5s with smart strategy (wins when possible, blocks opponent wins)
- [ ] Win detected correctly for horizontal lines
- [ ] Win detected correctly for vertical lines
- [ ] Win detected correctly for diagonal lines (both directions)
- [ ] Winning cells highlighted/animated on game over
- [ ] Draw detected when board is full with no winner
- [ ] "Play Again" resets board, alternates who goes first, colors stay fixed
- [ ] Second "Play Again" correctly alternates back
- [ ] Works on mobile — board fits screen, columns easy to tap
- [ ] If human leaves mid-game, bot takes over their color and position
- [ ] Bot plays correctly after taking over mid-game
- [ ] No state corruption from rapid double-clicks (turn-level idempotency)
- [ ] No state corruption from duplicate actionIds
- [ ] Actions on wrong phase (e.g., drop after game_over) rejected as no-op
- [ ] Terrible People still works correctly (regression check)
