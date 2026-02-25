# Who's Deal? (Euchre) — Per-Game Reference

## 1. Overview

| Field | Value |
|-------|-------|
| Game ID | `whos-deal` |
| Display Name | Who's Deal? |
| Players | 4 (min 4, max 4) |
| Icon | `🃏` |
| Description | Classic Euchre. Pick trump. Take tricks. Talk trash. |

## 2. Game Rules

- **Deck**: 24 cards — 9, 10, J, Q, K, A in each of 4 suits (spades, hearts, diamonds, clubs).
- **Teams**: 2 teams of 2. Partners sit across: seats 0 & 2 = Team A, seats 1 & 3 = Team B.
- **Team Assignment**: Room owner can drag/swap players between teams in the lobby before starting.
- **Dealing**: Dealer rotates clockwise. Deals 5 cards to each player. 4 cards remain in the kitty; the top card is turned face-up.

### Trump Calling

- **Round 1** (face-up suit): Starting left of dealer, each player can "order up" (face-up suit becomes trump; dealer picks up the face-up card and discards one) or pass. If all 4 pass, proceed to Round 2.
- **Round 2** (any other suit): Starting left of dealer, each player can name any suit EXCEPT the face-up suit, or pass.
- **Stick the Dealer**: If all 3 non-dealer players pass in Round 2, the dealer MUST call a suit. The server rejects a pass attempt from the dealer in this situation.
- **Going Alone**: When calling trump, a player may declare "going alone." Their partner sits out for the round. Tricks complete after 3 cards (not 4). Bonus scoring applies.
- **Misdeal**: If all 4 players pass both rounds (only possible without Stick the Dealer — but Stick the Dealer is always on), a new round is dealt with the next dealer.

### Card Ranking (Trump Suit)

1. **Right Bower** — Jack of trump suit (highest)
2. **Left Bower** — Jack of the same-color suit (e.g., J of diamonds is Left Bower when hearts is trump)
3. A > K > Q > 10 > 9

The Left Bower belongs to the trump suit for ALL purposes, including follow-suit rules.

### Trick Play

- Left of dealer leads the first trick.
- Players must follow suit (using `getEffectiveSuit()` for the Left Bower). If unable to follow, play any card.
- Trick winner is determined by reducing across ALL played cards using `compareCards()`.
- Winner of each trick leads the next.

### Scoring

| Result | Points |
|--------|--------|
| Calling team takes 3-4 tricks | 1 point |
| March (calling team takes all 5 tricks) | 2 points |
| Euchre (calling team takes 0-2 tricks) | 2 points to defenders |
| Alone sweep (alone player takes all 5 tricks) | 4 points |

First team to reach `targetScore` wins. Valid target scores: 5, 7, 10, or 11.

## 3. State Types

**File**: `src/lib/games/whos-deal/types.ts`

```typescript
interface WhosDealGameState {
  teams: {
    a: { playerIds: [string, string]; score: number };
    b: { playerIds: [string, string]; score: number };
  };
  seats: string[];           // 4 playerIds, clockwise order
  targetScore: number;       // 5, 7, 10, or 11
  dealerSeatIndex: number;
  round: EuchreRound | null;
  phase: 'playing' | 'game_over';
  winningTeam: 'a' | 'b' | null;
  roundsPlayed: number;
  botActionAt: number | null;
  phaseEndsAt: number | null;
}

interface EuchreRound {
  hands: Record<string, Card[]>;
  kitty: Card[];
  trumpPhase: 'round1' | 'round2' | 'dealer_discard' | 'playing' | 'round_over';
  trumpSuit: Suit | null;
  callingPlayerId: string | null;
  callingTeam: 'a' | 'b' | null;
  goingAlone: boolean;
  alonePlayerId: string | null;
  inactivePartnerSeatIndex: number | null;
  faceUpCard: Card;
  dealerDiscarded: boolean;
  currentTurnSeatIndex: number;
  passedPlayers: string[];
  currentTrick: TrickCard[];
  trickLeadSeatIndex: number;
  tricksWon: { a: number; b: number };
  tricksPlayed: number;
  dealerPickedUp: Card | null;
}

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Rank = '9' | '10' | 'J' | 'Q' | 'K' | 'A';
interface Card { suit: Suit; rank: Rank; id: string; }
interface TrickCard { playerId: string; seatIndex: number; card: Card; }

interface WhosDealSettings {
  targetScore: 5 | 7 | 10 | 11;
  teams: { a: [string, string]; b: [string, string]; };
}
```

### Client-Side Additions

The sanitized state sent to clients adds these fields to `round`:

- `round.myHand: Card[]` — the current player's hand (from private channel)
- `round.handCounts: Record<string, number>` — card count per player (opponents see counts, not actual cards)

## 4. Phase State Machine

```
waiting --> game-started --> playing
  round1 (face-up card offered, left of dealer starts):
    --> Players pass or order up
    --> All 4 pass --> round2
    --> Someone orders up --> dealer_discard
  round2 (other 3 suits, left of dealer starts):
    --> Players pass or call suit
    --> All 4 pass --> misdeal (new-round, next dealer)
    --> Someone calls --> playing (tricks)
  dealer_discard:
    --> Dealer picks up face-up, discards one --> playing (tricks)
  playing (tricks):
    --> Left of dealer leads first trick
    --> Players follow suit or play trump
    --> Winner of trick leads next
    --> After 5 tricks --> round_over
  round_over (5s auto-advance):
    --> Score round
    --> Check: team reached targetScore?
      Yes --> game_over
      No  --> new-round (next dealer)
```

`game_over` transitions back to `playing` via `POST /api/game/action` with action `play-again` (owner only). Resets scores, reshuffles, dealer returns to seat 0.

## 5. Action Types & Payloads

### Lobby Actions (waiting status, owner-only)

All via `POST /api/game/action`.

| Action | Payload | Phase |
|--------|---------|-------|
| `swap-teams` | `{ playerIdA: string, playerIdB: string }` | `waiting` |
| `set-target-score` | `{ targetScore: 5 \| 7 \| 10 \| 11 }` | `waiting` |

### Game Actions

All via `POST /api/game/action`.

| Action | Payload | Phase | Who |
|--------|---------|-------|-----|
| `call-trump` | `{ pickUp?: boolean, suit?: Suit, goAlone?: boolean }` | `round1` / `round2` | Current turn player |
| `pass-trump` | _(none)_ | `round1` / `round2` (NOT dealer in Stick the Dealer) | Current turn player |
| `discard` | `{ cardId: string }` | `dealer_discard` | Dealer only |
| `play-card` | `{ cardId: string }` | `playing` | Current turn player (not inactive partner) |
| `play-again` | _(none)_ | `game_over` | Owner only |

### Error Codes

| Code | Meaning |
|------|---------|
| `NOT_YOUR_TURN` | Player attempted an action out of turn |
| `INVALID_SUIT` | Called a suit that is not allowed (e.g., face-up suit in Round 2) |
| `MUST_CALL` | Dealer attempted to pass under Stick the Dealer rule |
| `NOT_DEALER` | Non-dealer attempted to discard |
| `INVALID_CARD` | Card ID not found in player's hand |
| `INACTIVE_PARTNER` | Inactive partner (going alone) attempted to play |
| `MUST_FOLLOW_SUIT` | Player played an off-suit card when they could follow suit |

## 6. Pusher Events

### Room Channel (`presence-room-{roomCode}`)

| Event | Data Shape | Triggered By |
|-------|-----------|--------------|
| `game-started` | `{ teams, seats, dealer, faceUpCard, targetScore }` | Game start / play-again |
| `teams-updated` | `{ teams: { a: string[], b: string[] } }` | Join/leave/swap |
| `settings-updated` | `{ targetScore: number }` | Set target score |
| `trump-action` | `{ seatIndex, action: 'pass' \| 'order-up' \| 'call', suit?, goAlone? }` | Trump calling |
| `trump-confirmed` | `{ trumpSuit, callingPlayer, callingTeam, goAlone }` | Trump called |
| `dealer-discarded` | `{ seatIndex }` | Dealer discard |
| `trick-started` | `{ leadSeatIndex }` | New trick begins |
| `card-played` | `{ seatIndex, card: Card }` | Card played |
| `trick-won` | `{ winningSeatIndex, winningTeam, tricksWon: { a, b } }` | Trick complete |
| `round-over` | `{ callingTeam, tricksWon, pointsAwarded: { a, b }, scores: { a, b }, isGameOver }` | Round complete |
| `new-round` | `{ dealerSeatIndex, faceUpCard }` | Next round dealt |
| `game-over` | `{ winningTeam, finalScores: { a, b } }` | Game ends |

### Private Channel (`private-player-{playerId}`)

| Event | Data Shape | Triggered By |
|-------|-----------|--------------|
| `hand-updated` | `{ hand: Card[] }` | Game start, new round, dealer pickup |

**Disambiguation**: The `hand-updated` event is shared with Terrible People on the same private channel. Hooks distinguish by checking `'suit' in hand[0]` — if `true` it is Who's Deal (cards have a `suit` property), otherwise Terrible People (white cards have only `id` and `text`).

## 7. Client Hook

**File**: `src/app/room/[roomCode]/hooks/useWhosDeal.ts`

### Return Type

```typescript
{
  whosDealState: ClientWhosDealState | null;
  wdTrickWinner: { seatIndex: number; team: 'a' | 'b' } | null;
  wdRoundSummary: {
    callingTeam: 'a' | 'b';
    tricksWon: { a: number; b: number };
    pointsAwarded: { a: number; b: number };
    scores: { a: number; b: number };
    isGameOver: boolean;
  } | null;
  handleWDCallTrump: (payload: { pickUp?: boolean; suit?: Suit; goAlone?: boolean }) => void;
  handleWDPassTrump: () => void;
  handleWDDiscard: (cardId: string) => void;
  handleWDPlayCard: (cardId: string) => void;
  handleWDPlayAgain: () => void;
  handleSwapTeams: (playerIdA: string, playerIdB: string) => void;
  handleSetTargetScore: (targetScore: number) => void;
}
```

### Subscribed Events

Room channel: `game-started`, `teams-updated`, `settings-updated`, `trump-action`, `trump-confirmed`, `dealer-discarded`, `trick-started`, `card-played`, `trick-won`, `round-over`, `new-round`, `game-over`, `player-left`.

Private channel: `hand-updated`.

## 8. Bot Behavior

### Trump Calling

**Round 1** (deciding whether to order up the face-up suit):
- Order up if holding the Right Bower.
- Order up if holding the Left Bower + 2 other trump-suit cards.
- Order up if holding 3+ cards of the face-up suit.
- Order up if dealer and hand is decent.
- Otherwise pass.

**Round 2** (naming a suit):
- Name the suit with the most strength; prefer suits where Bowers are held.
- **Stick the Dealer**: Dealer MUST always call — never passes.

**Going Alone**: Only declare alone with:
- Right Bower + Left Bower + extra trump + off-suit Ace, OR
- Right Bower + 3 other trump cards.

### Trick Play

**Leading a trick** (priority order):
1. Right Bower first.
2. Off-suit Aces.
3. Highest trump if holding 2+ trump.
4. Lowest card.

**Following suit** (can follow):
- If partner is currently winning the trick: play lowest legal card.
- If can beat the current winner: play lowest winning card.
- Otherwise: play lowest legal card.

**Cannot follow suit**:
- If partner is currently winning: play lowest off-suit card.
- Otherwise: trump in with lowest trump card.
- No trump available: play lowest off-suit card.

### Dealer Discard

- Discard the lowest non-trump card (using `getEffectiveSuit()` to correctly handle the Left Bower).
- If all cards are trump: discard the 9 of trump.
- Never discard Bowers.

### Bot Timing

`botActionAt = Date.now() + random(1500, 3000)` ms. Executed on next heartbeat dispatch cycle.

## 9. Constants

**File**: `src/lib/games/whos-deal/constants.ts`

| Constant | Value |
|----------|-------|
| `CARDS_PER_HAND` | `5` |
| `TRICKS_PER_ROUND` | `5` |
| `KITTY_SIZE` | `4` |
| `DEFAULT_TARGET_SCORE` | `10` |
| `VALID_TARGET_SCORES` | `[5, 7, 10, 11]` |
| `BOT_ACTION_DELAY_RANGE_MS` | `[1500, 3000]` |
| `ROUND_RESULT_DISPLAY_MS` | `5000` |
| `TRICK_RESULT_DISPLAY_MS` | `2000` |

## 10. Component Architecture

| File | Purpose |
|------|---------|
| `src/lib/games/whos-deal/index.ts` | Module export |
| `src/lib/games/whos-deal/engine.ts` | Euchre game logic (implements `GameModule`) |
| `src/lib/games/whos-deal/bots.ts` | Strategic AI (trump calling, trick play, discard) |
| `src/lib/games/whos-deal/helpers.ts` | `getEffectiveSuit()`, `compareCards()`, `getPlayableCards()`, `expectedCardsThisTrick()`, `nextActiveSeat()` |
| `src/lib/games/whos-deal/types.ts` | `WhosDealGameState`, `EuchreRound`, `Card`, `Suit`, `Rank` types |
| `src/lib/games/whos-deal/constants.ts` | Game constants |
| `src/lib/games/whos-deal/components/WhosDealGameView.tsx` | Full game view (scoreboard, seats, trick area, hand, trump calling UI) |

## 11. Visual Design

Reference: `DESIGN_SYSTEM.md` section 7 (Who's Deal).

### Container

`flex flex-col max-w-lg mx-auto w-full overflow-x-hidden`

### Team Colors

| Team | CSS Variable | Hex |
|------|-------------|-----|
| Team A | `var(--shallow-water)` | `#7eb8d4` |
| Team B | `var(--coral)` | `#e8a87c` |

### Two-Row Scoreboard (inside WhosDealGameView)

**Row 1** (h-14): `bg rgba(13,27,62,.5)`
- Team A score: `color: var(--shallow-water)`
- Team B score: `color: var(--coral)`
- Trump badge: suit symbol + caller name. NO "Trump" label text.

**Row 2** (h-7): Trick counts in team colors, "Trick X of 5", "Playing to {target}", "Rd {N}".

### Player Seats (5-row fixed-height stack)

| Row | Height | Content |
|-----|--------|---------|
| Dealer chip | h-6 | Gold `bg-amber-500 border-amber-300 rounded-full` + shadow |
| Name tag | h-7 | `rounded-full px-3`. Human: `rgba(26,82,118,.4) text-cream font-semibold`. Bot: `rgba(13,27,62,.3) text-gray-500` |
| Badge row | h-6 | "WON" badge: `bg-emerald-500/20 text-emerald-400`. "ALONE" badge: `bg-red-500/20 text-red-400` |
| Cards row | h-14 | Face-down cards or "Sitting out" text |
| Status row | h-5 | "Thinking..." with `animate-pulse` dot |

**Active turn indicator**: `ring-1 ring-glass/40` with `bg rgba(107,191,163,.15)`.

**"YOU" badge**: `bg-blue-500/80 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1`.

### Playing Cards

**Face-up cards**: `bg-white rounded-lg border-2 border-gray-200 shadow-lg`
- Red suits (hearts, diamonds): rank `text-red-600`, suit symbol `text-red-500`
- Black suits (spades, clubs): rank `text-gray-900`, suit symbol `text-gray-700`
- Hand size: `w-16 h-24`
- Trick area size: `w-14 h-20`

**Face-down cards**: `background: linear-gradient(to bottom right, #1a5276, #0d1b3e)`, `border-2 border-blue-600 rounded-lg shadow-md`, inner diamond `✦` in `text-blue-400/40`.

### Hand Interaction

| State | Styles |
|-------|--------|
| Playable | Full opacity, `cursor-pointer hover:-translate-y-1 transition` |
| Unplayable | `opacity-40 cursor-not-allowed` |
| Selected | `border-2 border-yellow-400 -translate-y-2 shadow-[0_0_8px_rgba(240,194,127,0.4)]` |

**Action area** (h-12): "Play Card" emerald button or "Tap a card to select" gray hint text.

### Trick Area

- Circle: `w-48 h-48 rounded-full` with `bg rgba(13,27,62,.4)` and `border rgba(107,191,163,.12)`.
- Responsive: `w-36 h-36 sm:w-48 sm:h-48`.
- 4 absolute-positioned card slots; empty slots render an invisible div.
- Winning card highlight: `ring-2 ring-glass shadow-[0_0_12px_rgba(107,191,163,0.3)]`.

### Trump Calling UI

| Element | Styles |
|---------|--------|
| "Order it up" button | `bg-glass/80 hover:bg-glass text-white font-semibold min-h-[44px] rounded-full px-6` |
| "Pass" button | `bg rgba(26,82,118,.5) hover:bg rgba(26,82,118,.7) text-cream min-h-[44px] rounded-full px-6` |
| Suit selection buttons | `min-h-[44px] min-w-[44px] rounded-lg` |
| Disabled suit | `opacity-30 cursor-not-allowed` |
| Stick the Dealer | Pass button is **hidden** (not disabled) |

### Game Over

- Winning team name: `text-3xl font-bold font-display` in team color.
- "Play Again" button: emerald `rounded-full` (host only).
- "Leave Game" button: gray `rounded-full`.

## 12. Platform Integration Points

| File | Integration |
|------|-------------|
| `src/lib/games/registry.ts` | `GAME_REGISTRY` entry |
| `src/lib/games/loader.ts` | `getGameModule()` mapping |
| `src/app/room/[roomCode]/types.ts` | `GAME_DISPLAY_NAMES` entry (`"Who's Deal?"`) |
| `src/app/room/[roomCode]/page.tsx` | Rendering branch for `gameId === 'whos-deal'` (includes ScoreBar) |
| `src/app/room/[roomCode]/components/ScoreBar.tsx` | Team scores inline header component |
| `src/app/room/[roomCode]/components/WhosDealTeamAssignment.tsx` | Team drag/swap UI in lobby |
| `src/app/api/game/action/route.ts` | Dispatches all game actions (`call-trump`, `pass-trump`, `discard`, `play-card`, `swap-teams`, `set-target-score`, `play-again`) |
| `src/app/api/game/play-again/route.ts` | Resets scores, reshuffles deck, dealer returns to seat 0 |
| `src/app/api/rooms/create/route.ts` | Default settings: `{ targetScore: 10, teams: { a: [seat0, seat2], b: [seat1, seat3] } }` |
| `src/app/api/rooms/join/route.ts` | Updates team settings when a player replaces a bot |
