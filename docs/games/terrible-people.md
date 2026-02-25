# Terrible People — Per-Game Reference

## 1. Overview

| Field | Value |
|-------|-------|
| Game ID | `terrible-people` |
| Display Name | Terrible People |
| Players | 4 (min 4, max 4) |
| Icon | `😈` |
| Description | Fill in the blanks. Be terrible. |
| Genre | Cards Against Humanity clone |

## 2. Game Rules

- One player is **"The Crown"** (internal code: `czar`) each round, rotating through the players array by index.
- The Crown reveals a **black prompt card** that requires either 1 or 2 white answer cards (`pick` field).
- All other (non-Crown) players submit white answer card(s) from their hand.
- Submissions are **shuffled and anonymized** via `revealOrder` before the Crown sees them.
- The Crown picks the funniest answer — that player scores **1 point**.
- First player to reach `targetScore` (default **7**) wins.
- Each player holds a hand of **10 white cards**, replenished each round.

## 3. State Types

All types live in `src/lib/types.ts` (NOT in the game's own types file — this is tech debt).

```typescript
interface GameState {
  currentRound: number;
  targetScore: number;       // Default: 7
  czarIndex: number;         // Index in players array
  phase: 'czar_reveal' | 'submitting' | 'judging' | 'round_result' | 'game_over';
  phaseEndsAt: number | null;
  botActionAt: number | null;
  blackCard: BlackCard;
  submissions: Record<string, WhiteCard[]>;
  revealOrder: string[];     // Shuffled player IDs (anonymizes submissions)
  roundWinnerId: string | null;
  hands: Record<string, WhiteCard[]>;
  blackDeck: BlackCard[];
  whiteDeck: WhiteCard[];
  discardWhite: WhiteCard[];
  discardBlack: BlackCard[];
}

interface BlackCard {
  id: string;
  text: string;
  pick: number;  // 1 or 2
}

interface WhiteCard {
  id: string;
  text: string;
}

// Sanitized version sent to clients (strips hands, decks, discards):
interface SanitizedGameState {
  currentRound: number;
  targetScore: number;
  czarIndex: number;
  phase: GameState['phase'];
  phaseEndsAt: number | null;
  blackCard: BlackCard;
  submissions: Record<string, WhiteCard[]>;
  revealOrder: string[];
  roundWinnerId: string | null;
}
```

## 4. Phase State Machine

```
waiting --> game-started --> czar_reveal (3s auto-advance)
                               |
                               v
                           submitting (until all non-czar submit)
                               |
                               v
                            judging (Crown picks winner)
                               |
                               v
                          round_result (5s auto-advance)
                               |
                               v
                     winner reached targetScore?
                      /                    \
                    Yes                    No
                     |                      |
                     v                      v
                 game_over          czar_reveal (next round, czar rotates)
```

## 5. Action Types & Payloads

This game uses **LEGACY dedicated routes**, not the generic `/api/game/action`.

| Route | Body | Phase | Notes |
|-------|------|-------|-------|
| `POST /api/game/submit` | `{ roomCode, playerId, cardIds: string[] }` | `submitting` | Non-czar players only |
| `POST /api/game/judge` | `{ roomCode, playerId, winnerId: string }` | `judging` | Crown (czar) only |
| `POST /api/game/play-again` | `{ roomCode, playerId }` | `game_over` | Room owner only |

**Note for new game developers**: New games should use the generic `/api/game/action` route instead of dedicated routes.

## 6. Pusher Events

### Room channel (`presence-room-{roomCode}`)

| Event | Data Shape | Triggered By |
|-------|-----------|--------------|
| `game-started` | `{ gameState: SanitizedGameState }` | Game start / play-again |
| `phase-changed` | `{ phase, blackCard?, czarId?, czarIndex?, currentRound?, phaseEndsAt? }` | Phase advancement |
| `player-submitted` | `{ playerId }` | Card submission |
| `submissions-revealed` | `{ submissions: { id, cards: WhiteCard[] }[] }` | All non-czar submitted |
| `round-result` | `{ winnerId, winnerName, submission: WhiteCard[], scores, isGameOver }` | Crown judges |
| `game-over` | `{ finalScores, winnerId, winnerName }` | Game ends |

### Private channel (`private-player-{playerId}`)

| Event | Data Shape | Triggered By |
|-------|-----------|--------------|
| `hand-updated` | `{ hand: WhiteCard[] }` | Game start, play-again, new round |

**Disambiguation**: The `hand-updated` event is shared with Who's Deal on the same private channel. Hooks distinguish by checking `'suit' in hand[0]` — if `true` it is Who's Deal, otherwise Terrible People.

## 7. Client Hook

**File**: `src/app/room/[roomCode]/hooks/useTerriblePeople.ts`

### Return type

```typescript
{
  gameState: SanitizedGameState | null;
  hand: WhiteCard[];
  selectedCards: string[];
  submitting: boolean;
  hasSubmitted: boolean;
  judging: boolean;
  revealedSubmissions: { id: string; cards: WhiteCard[] }[];
  roundResult: { winnerId: string; winnerName: string; submission: WhiteCard[]; scores: Record<string, number>; isGameOver: boolean } | null;
  gameOver: { finalScores: Record<string, number>; winnerId: string; winnerName: string } | null;
  phaseKey: number;
  handleSubmitCards: () => void;           // POST /api/game/submit
  handleJudge: (winnerId: string) => void; // POST /api/game/judge
  handlePlayAgain: () => void;             // POST /api/game/play-again
  toggleCardSelection: (cardId: string) => void;
}
```

### Subscribed events

`game-started`, `phase-changed`, `player-submitted`, `submissions-revealed`, `round-result`, `game-over`, `hand-updated` (private channel).

## 8. Bot Behavior

- **Submit**: Random card selection from hand after a random delay in the range `BOT_SUBMIT_DELAY_RANGE_MS` (2000--5000 ms).
- **Judge**: Random winner selection after `BOT_JUDGE_DELAY_MS` (3000 ms).
- **Timing**: Uses the `botActionAt` timestamp stored in Redis. Executed on heartbeat via `processAdvancement()`.

## 9. Constants

Defined in `src/lib/constants.ts` (global file, NOT game-specific — tech debt).

| Constant | Value |
|----------|-------|
| `HAND_SIZE` | `10` |
| `DEFAULT_TARGET_SCORE` | `7` |
| `BOT_SUBMIT_DELAY_RANGE_MS` | `[2000, 5000]` |
| `BOT_JUDGE_DELAY_MS` | `3000` |
| `CZAR_REVEAL_DURATION_MS` | `3000` |
| `ROUND_RESULT_DURATION_MS` | `5000` |

## 10. Component Architecture

| File | Purpose |
|------|---------|
| `src/lib/games/terrible-people/index.ts` | Module export |
| `src/lib/games/terrible-people/engine.ts` | CAH game logic |
| `src/lib/games/terrible-people/bots.ts` | Random card selection + judging |
| `src/lib/games/terrible-people/cards.ts` | Card data loading |
| `src/lib/games/terrible-people/components/TerriblePeopleGameView.tsx` | Full game view |

## 11. Visual Design

Reference: `DESIGN_SYSTEM.md` section 7 (Terrible People).

### Card classes (defined in `globals.css` — DO NOT MODIFY)

**`.card-black`** (prompt cards):
- `background: #1a1a1a`
- `color: white`
- `border-radius: 12px`
- `padding: 24px`
- `font-weight: 700`
- `font-size: 1.2rem`
- `border: 2px solid var(--surface-lighter)`
- "Oyster World" watermark bottom-right at 20% opacity

**`.card-white`** (answer cards):
- `background: #f5f5f5`
- `color: #1a1a1a`
- `border-radius: 12px`
- `padding: 16px`
- `font-weight: 600`
- `font-size: 0.9rem`
- Hover: `translateY(-2px)`, deeper shadow
- Watermark at 15% opacity

### In-component patterns

**Player strip**: `flex gap-2 overflow-x-auto`, each card `flex-shrink-0 px-3 py-2 rounded-xl`
- Crown (czar): `border 2px solid var(--pearl)`, `bg rgba(240,194,127,.08)`, `shadow 0 0 10px rgba(240,194,127,0.15)`
- Current player: `border-accent/50 bg-accent/5`
- Others: `border-border bg-surface`

**Hand cards**: `w-[160px] md:w-auto min-h-[100px]` in `.hand-scroll` container
- Selected: `border-accent shadow-[0_0_12px_rgba(240,194,127,0.3)]`
- Unselected: `border-transparent hover:border-border-light`

**Judging cards**: hover `border-accent shadow-[0_0_12px_rgba(240,194,127,0.2)]`

**Winner reveal**: `animate-winner-reveal`, `shadow-[0_0_20px_rgba(107,191,163,0.2)]`

**Submit button**: `bg-accent text-surface font-bold py-3 rounded-xl active:scale-[0.98] disabled:opacity-30`

**UI text**: "Card Czar" is displayed as **"The Crown"** in all user-facing UI. Internal code still uses `czar`.

## 12. Platform Integration Points

| Integration | File |
|------------|------|
| GameState, BlackCard, WhiteCard types | `src/lib/types.ts` (tech debt: not in game dir) |
| Game timing constants | `src/lib/constants.ts` (tech debt: not in game dir) |
| GAME_REGISTRY entry | `src/lib/games/registry.ts` |
| getGameModule() mapping | `src/lib/games/loader.ts` |
| GAME_DISPLAY_NAMES, SanitizedGameState re-export | `src/app/room/[roomCode]/types.ts` |
| Rendering branch (default fallback: if playing + gameState exists) | `src/app/room/[roomCode]/page.tsx` |
| Legacy dedicated submit route | `src/app/api/game/submit/route.ts` |
| Legacy dedicated judge route | `src/app/api/game/judge/route.ts` |
| Play-again route (reinitializeGame, resets scores) | `src/app/api/game/play-again/route.ts` |
