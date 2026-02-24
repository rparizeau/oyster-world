# Who's Deal? — Euchre Game Module Technical Specification v1.0 (FINAL)

## 1. Overview

**Who's Deal?** is a 4-player team-based Euchre game module for the Oyster World platform. Standard North American Euchre rules with Stick the Dealer and Going Alone support. The room owner can configure teams and point targets from the lobby.

This spec builds on SPEC.md and OYSTER-SPEC.md. All existing platform architecture applies (serverless-safe timing, atomic Redis, idempotent actions, Pusher real-time, GameModule interface, generic action route).

---

## 2. Game Registry Entry

```typescript
// Update GAME_REGISTRY in /lib/games/registry.ts
export const GAME_REGISTRY: GameConfig[] = [
  {
    id: 'terrible-people',
    name: 'Terrible People',
    description: 'Fill in the blanks. Be terrible.',
    minPlayers: 4,
    maxPlayers: 4,
    icon: '😈',
  },
  {
    id: '4-kate',
    name: '4 Kate',
    description: 'Classic Connect 4. Drop pieces. Get four in a row.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🔴',
  },
  {
    id: 'whos-deal',
    name: "Who's Deal?",
    description: 'Classic Euchre. Pick trump. Take tricks. Talk trash.',
    minPlayers: 4,
    maxPlayers: 4,
    icon: '🃏',
  },
];
```

---

## 3. Euchre Rules Reference

### 3.1 The Deck
- 24 cards: 9, 10, J, Q, K, A in each of the 4 suits (♠ ♥ ♦ ♣)
- No jokers in standard Euchre

### 3.2 Teams
- 2 teams of 2 players each
- Partners sit across from each other (seats 0 & 2 = Team A, seats 1 & 3 = Team B)
- Owner can drag/swap players between teams in the lobby before starting

### 3.3 Dealing
- Dealer rotates clockwise each round
- Deal 5 cards to each player (standard: 3-2 or 2-3 in two rounds of dealing)
- Remaining 4 cards form the kitty; top card is turned face-up

### 3.4 Trump Calling (Two Rounds)

**Round 1 — Face-up card:**
- Starting left of dealer, each player can:
  - **Order it up**: The face-up card's suit becomes trump. Dealer MUST pick up the face-up card and discard one card from their hand. This is mandatory and cannot be refused — server MUST enforce regardless of client behavior.
  - **Pass**: Move to next player
- If all 4 players pass, move to Round 2

**Round 2 — Name trump:**
- Starting left of dealer, each player can:
  - **Name a suit**: Any suit EXCEPT the face-up card's suit becomes trump
  - **Pass**: Move to next player
- **Stick the Dealer (HARD ENFORCEMENT)**: If the current player is the dealer AND all three other players have already passed in Round 2, the server MUST reject any `pass-trump` action from the dealer. The dealer MUST name a valid suit (any suit except the face-up card's suit). The server must validate that the named suit is not the turned-down suit. Bots must always call a valid suit when stuck — they cannot deadlock. Malformed payloads cannot bypass this rule.

### 3.5 Going Alone

- When a player calls trump (either round), they may declare "Going Alone"
- Their partner sits out for that hand (does not play cards)
- **Turn order invariant**: During Going Alone, the inactive partner's seat is skipped in ALL turn-order calculations. `currentTurnSeatIndex` advancement MUST skip the inactive seat. Lead calculation for subsequent tricks MUST also skip the inactive seat.
- **Trick size invariant**: A trick completes after 3 cards (not 4) when Going Alone. Use the `expectedCardsThisTrick()` helper as the single source of truth for this check — never hardcode 3 or 4.
- Scoring bonus: if the lone player takes all 5 tricks, their team earns 4 points instead of 2

### 3.6 Card Ranking (Trump Suit)
When trump is called, card ranking within trump suit (highest to lowest):
1. **Right Bower**: Jack of trump suit (highest card in the game)
2. **Left Bower**: Jack of the same-color suit (e.g., if trump is ♥, the J♦ is the Left Bower). This card is considered part of the trump suit for all purposes.
3. A, K, Q, 10, 9 of trump suit

Non-trump suits rank normally: A, K, Q, J, 10, 9
(Note: the Left Bower jack is removed from its original suit and belongs to trump)

### 3.7 Same-Color Suit Reference
- ♠ and ♣ are the same color (black)
- ♥ and ♦ are the same color (red)

### 3.8 Trick Play
- Player to the left of the dealer leads the first trick
- If Going Alone, lead is left of the lone player (skipping inactive partner throughout)
- Players MUST follow suit if they can. **Follow-suit validation MUST use `getEffectiveSuit()` so the Left Bower is treated as trump, not as its printed suit.** This invariant must be enforced consistently to prevent regressions.
- If a player cannot follow suit, they may play any card (including trump)
- Highest card of the led suit wins the trick, unless trump was played — then highest trump wins
- **Trick winner MUST be determined by reducing across ALL played cards using the `compareCards()` comparator, not by pairwise UI order assumptions.**
- Trick winner leads the next trick

### 3.9 Scoring

| Scenario | Points |
|---|---|
| Calling team takes 3 or 4 tricks | 1 point |
| Calling team takes all 5 tricks (march) | 2 points |
| Defending team takes 3+ tricks (euchre) | 2 points |
| Going Alone, takes all 5 tricks | 4 points |
| Going Alone, takes 3 or 4 tricks | 1 point |
| Going Alone, euchred (defenders take 3+) | 2 points to defenders |

### 3.10 Win Condition
- First team to reach the target score wins (owner chooses: 5, 7, 10, or 11)

---

## 4. Data Models

### 4.1 Game State

```typescript
interface WhosDealGameState {
  // Teams
  teams: {
    a: { playerIds: [string, string]; score: number };
    b: { playerIds: [string, string]; score: number };
  };
  
  // Seating (clockwise order, indices 0-3)
  // Seats 0 & 2 = Team A, Seats 1 & 3 = Team B
  seats: string[];  // [playerId, playerId, playerId, playerId]
  
  // Settings
  targetScore: number;  // 5, 7, 10, or 11
  
  // Dealer tracking
  dealerSeatIndex: number;  // Rotates clockwise each round
  
  // Round state
  round: EuchreRound | null;
  
  // Game phase
  phase: 'playing' | 'game_over';
  
  // Result
  winningTeam: 'a' | 'b' | null;
  
  // Timing (serverless-safe)
  botActionAt: number | null;
  phaseEndsAt: number | null;
}

interface EuchreRound {
  // Deck & dealing
  hands: Record<string, Card[]>;  // playerId → cards in hand
  kitty: Card[];                   // 4 cards, kitty[0] is the face-up card
  
  // Trump calling — includes explicit dealer_discard micro-phase
  trumpPhase: 'round1' | 'round2' | 'dealer_discard' | 'playing' | 'round_over';
  trumpSuit: Suit | null;
  callingPlayerId: string | null;
  callingTeam: 'a' | 'b' | null;
  goingAlone: boolean;
  alonePlayerId: string | null;
  inactivePartnerSeatIndex: number | null;  // Seat index of partner sitting out during Going Alone
  
  // Face-up card tracking
  faceUpCard: Card;               // The turned-up card from kitty
  dealerDiscarded: boolean;       // Has dealer discarded after picking up?
  
  // Current action
  currentTurnSeatIndex: number;   // Whose turn to act
  
  // Trump calling pass tracking
  passedPlayers: string[];        // Player IDs who have passed this calling round
  
  // Trick play
  currentTrick: TrickCard[];      // Cards played in current trick
  trickLeadSeatIndex: number;     // Who led the current trick
  tricksWon: { a: number; b: number };
  tricksPlayed: number;
  
  // Dealer discard
  dealerPickedUp: Card | null;    // The face-up card dealer picked up (Round 1 only)
}

interface Card {
  suit: Suit;
  rank: Rank;
  id: string;    // e.g., "9S", "JH" (rank + suit initial)
}

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Rank = '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface TrickCard {
  playerId: string;
  seatIndex: number;
  card: Card;
}
```

### 4.2 Lobby Settings (Pre-Game)

The Room model gains a `settings` field for games that support configuration:

```typescript
interface Room {
  // ...existing fields...
  gameId: string;
  settings?: GameSettings;  // NEW — game-specific settings from lobby
}

interface WhosDealSettings {
  targetScore: 5 | 7 | 10 | 11;
  teams: {
    a: [string, string];  // playerIds for Team A
    b: [string, string];  // playerIds for Team B
  };
}
```

---

## 5. Lobby Enhancements

### 5.1 Team Assignment UI

When the selected game is "Who's Deal?", the lobby shows:

- **Two team columns**: Team A (left) and Team B (right)
- **Player cards** in each column showing player names (and "Bot" label for bots)
- **Default assignment**: Seats 0 & 2 = Team A, Seats 1 & 3 = Team B (alternating by join order)
- **Owner can drag/swap**: Owner drags player cards between teams to rearrange
  - Each team must have exactly 2 players
  - Swapping moves one player from Team A to Team B and vice versa
  - Non-owners see the teams but cannot rearrange
- **Visual**: Clear team identity (e.g., Team A in one color, Team B in another)

### 5.2 Settings Panel

Below the team assignment, owner sees a settings section:

- **Points to win**: Segmented control or button group — options: 5, 7, 10, 11
- Default: 10
- Non-owners can see the setting but not change it

### 5.3 Start Game Validation

"Start Game" button validates:
- Each team has exactly 2 players (humans or bots)
- Target score is set
- At least 1 human player (owner is always human, so this is always true)

Settings are stored in the Room object when the game starts.

---

## 6. Game Flow

### 6.1 Game Start

```
Owner clicks "Start Game"
  → POST /api/game/action { type: 'start', payload: { targetScore, teams } }
  → Server validates settings
  → Initialize WhosDealGameState:
      - Set teams and seats from lobby settings
      - Set targetScore
      - Set dealerSeatIndex = 0 (owner deals first)
      - Deal first round (shuffle 24-card deck, deal 5 to each, 4 in kitty)
      - Set trumpPhase = 'round1'
      - Set currentTurnSeatIndex = left of dealer
      - If current turn player is bot, set botActionAt
  → Pusher events:
      - 'game-started' to room channel (teams, dealer, face-up card)
      - 'hand-updated' to each player's private channel (their 5 cards)
```

### 6.2 Trump Calling — Round 1

```
Phase: trumpPhase = 'round1'
Starting left of dealer, clockwise:

Each player's turn:
  → Player sees the face-up card and can:
      A) "Order it up" → POST /api/game/action { type: 'call-trump', payload: { pickUp: true, goAlone?: boolean } }
         → Face-up card suit becomes trump
         → Record callingPlayerId, callingTeam
         → If goAlone: set goingAlone=true, alonePlayerId, inactivePartnerSeatIndex
         → Dealer receives face-up card (now has 6 cards)
         → Transition to trumpPhase = 'dealer_discard'
         → Set currentTurnSeatIndex = dealer's seat
         → If dealer is bot, set botActionAt for discard
      
      B) "Pass" → POST /api/game/action { type: 'pass-trump' }
         → Add to passedPlayers
         → Move to next player clockwise
         → If all 4 passed → transition to trumpPhase = 'round2', reset passedPlayers

  → Pusher event: 'trump-action' { playerSeat, action: 'pass' | 'order-up', goAlone? }
```

### 6.3 Trump Calling — Round 2

```
Phase: trumpPhase = 'round2'
Starting left of dealer, clockwise:

Each player's turn:
  → Player can:
      A) "Name suit" → POST /api/game/action { type: 'call-trump', payload: { suit, goAlone?: boolean } }
         → Server validates: suit must NOT be the face-up card's suit
         → Named suit becomes trump
         → Record callingPlayerId, callingTeam
         → If goAlone: set goingAlone=true, alonePlayerId, inactivePartnerSeatIndex
         → Transition to trumpPhase = 'playing', set up first trick
      
      B) "Pass" → POST /api/game/action { type: 'pass-trump' }
         → **STICK THE DEALER GUARD**: If this player is the dealer AND 3 players have already passed:
             → Server MUST reject this action with { error: "Dealer must call", code: "MUST_CALL" }
             → Bot dealer MUST always call (never attempt to pass)
         → Otherwise: add to passedPlayers, move to next player clockwise
         
  → Pusher event: 'trump-action' { playerSeat, action: 'pass' | 'call', suit?, goAlone? }
```

### 6.4 Dealer Discard (Round 1 Only)

```
Phase: trumpPhase = 'dealer_discard'

INVARIANT: Trick play MUST NOT begin until this phase completes.

  → Dealer has 6 cards (5 original + picked-up face-up card)
  → Dealer must discard 1 card
  → POST /api/game/action { type: 'discard', payload: { cardId } }
  → Server validates:
      ✓ Current phase is 'dealer_discard'
      ✓ Requester is the dealer
      ✓ Card exists in dealer's hand
      ✓ Dealer currently has 6 cards
  → Remove card from hand, add to kitty (face down)
  → Dealer now has 5 cards
  → Set dealerDiscarded = true
  → Transition to trumpPhase = 'playing'
  → Set up first trick: trickLeadSeatIndex = left of dealer (or left of lone player if Going Alone, skipping inactive partner)
  → Set currentTurnSeatIndex = trickLeadSeatIndex
  → If current turn player is bot, set botActionAt
  
  → If dealer is a bot: bot selects worst card to discard (see Bot AI section)
  → Pusher event: 'dealer-discarded' { seatIndex } (no card info revealed to others)
  → Pusher event: 'hand-updated' to dealer's private channel (updated 5-card hand)
```

### 6.5 Trick Play

```
Phase: trumpPhase = 'playing'

Lead player starts each trick (left of dealer for trick 1, then trick winner leads).
If Going Alone, skip inactivePartnerSeatIndex in ALL turn advancement.

Each player's turn:
  → POST /api/game/action { type: 'play-card', payload: { cardId } }
  → Validate:
      ✓ It's this player's turn
      ✓ Player is not the inactive partner (Going Alone)
      ✓ Card is in their hand
      ✓ Follow suit validation using getEffectiveSuit():
          - Determine led suit from first card in currentTrick (using getEffectiveSuit)
          - Get playable cards via getPlayableCards(hand, ledSuit, trumpSuit)
          - Submitted card MUST be in the playable set
      ✓ If cannot follow suit, any card is valid
  → Add card to currentTrick
  → Advance currentTurnSeatIndex (skipping inactive partner if Going Alone)
  
  → Check trick completion using expectedCardsThisTrick():
      if currentTrick.length === expectedCardsThisTrick(round):
        → Determine trick winner by REDUCING across all played cards using compareCards()
        → Increment tricksWon for winning team
        → Increment tricksPlayed
        → Set trickLeadSeatIndex to winner's seat
        → Clear currentTrick
        → ALL of the above (winner determination, tricksWon update, tricksPlayed increment,
          lead update) MUST occur in a SINGLE atomic Redis mutation
        → If tricksPlayed === 5 → round over, calculate score
        → Else → set currentTurnSeatIndex = trickLeadSeatIndex, start next trick
  
  → Pusher events:
      - 'card-played' { seatIndex, card } (visible to all)
      - After trick complete: 'trick-won' { winningSeatIndex, winningTeam, tricksWon }
```

### 6.6 Round Scoring

```
After 5 tricks:
  → Calculate points per Section 3.9 scoring table
  → Add points to winning team's score
  → Check if either team reached targetScore
      → If yes: phase = 'game_over', winningTeam set
      → If no: start new round
          → Rotate dealerSeatIndex clockwise
          → Reshuffle and deal
          → Reset round state
          → trumpPhase = 'round1'
  → Pusher events:
      - 'round-over' { callingTeam, tricksWon, pointsAwarded, scores, isGameOver }
      - After pause (phaseEndsAt = now + ROUND_RESULT_DISPLAY_MS): 'new-round' { dealer, faceUpCard }
```

### 6.7 Game Over

```
Phase: phase = 'game_over'
  → Display final scores and winning team
  → "Play Again" button (owner only):
      - Resets ALL scores to 0
      - Reshuffles and deals
      - Dealer resets to seat 0 (does NOT continue rotating from previous game)
      - New game begins
  → "Leave World" button for all
  → Pusher event: 'game-over' { winningTeam, finalScores }
```

---

## 7. Card Logic Helpers

### 7.1 Suit Resolution (Left Bower Handling)

```typescript
// Get the "effective suit" of a card given the current trump
function getEffectiveSuit(card: Card, trumpSuit: Suit): Suit {
  // Left Bower: Jack of same-color suit belongs to trump
  // Defensive check: verify effective suit matches trump, not just color
  if (
    card.rank === 'J' &&
    card.suit !== trumpSuit &&
    isSameColor(card.suit, trumpSuit)
  ) {
    return trumpSuit;
  }
  return card.suit;
}

function isSameColor(a: Suit, b: Suit): boolean {
  const blacks: Suit[] = ['spades', 'clubs'];
  const reds: Suit[] = ['hearts', 'diamonds'];
  return (blacks.includes(a) && blacks.includes(b)) || (reds.includes(a) && reds.includes(b));
}

function getPartnerSuit(suit: Suit): Suit {
  const map: Record<Suit, Suit> = {
    spades: 'clubs', clubs: 'spades',
    hearts: 'diamonds', diamonds: 'hearts',
  };
  return map[suit];
}
```

### 7.2 Card Comparison

```typescript
/**
 * Compare two cards in the context of a trick.
 * 
 * CONTRACT:
 * - Returns POSITIVE if card `a` beats card `b`
 * - Returns NEGATIVE if card `b` beats card `a`
 * - Returns ZERO if equal (should not occur in Euchre — all 24 cards are unique)
 * 
 * USAGE:
 * Trick winner MUST be determined by reducing across ALL played cards:
 *   const winner = trick.reduce((best, current) =>
 *     compareCards(current.card, best.card, ledSuit, trumpSuit) > 0 ? current : best
 *   );
 */
function compareCards(a: Card, b: Card, leadSuit: Suit, trumpSuit: Suit): number {
  const aEffective = getEffectiveSuit(a, trumpSuit);
  const bEffective = getEffectiveSuit(b, trumpSuit);
  
  const aIsTrump = aEffective === trumpSuit;
  const bIsTrump = bEffective === trumpSuit;
  
  // Trump beats non-trump
  if (aIsTrump && !bIsTrump) return 1;
  if (!aIsTrump && bIsTrump) return -1;
  
  // Both trump: use trump ranking (Right Bower > Left Bower > A > K > Q > 10 > 9)
  if (aIsTrump && bIsTrump) {
    return getTrumpRank(a, trumpSuit) - getTrumpRank(b, trumpSuit);
  }
  
  // Neither trump: only cards matching lead suit can win
  const aFollows = aEffective === leadSuit;
  const bFollows = bEffective === leadSuit;
  if (aFollows && !bFollows) return 1;
  if (!aFollows && bFollows) return -1;
  if (!aFollows && !bFollows) return 0; // Neither follows, neither wins
  
  // Both follow suit: standard ranking
  return getStandardRank(a) - getStandardRank(b);
}

// Trump rank (higher = better)
// Right Bower = 8, Left Bower = 7, A = 6, K = 5, Q = 4, 10 = 3, 9 = 2
function getTrumpRank(card: Card, trumpSuit: Suit): number {
  if (card.rank === 'J' && card.suit === trumpSuit) return 8; // Right Bower
  if (card.rank === 'J' && isSameColor(card.suit, trumpSuit)) return 7; // Left Bower
  const ranks: Record<Rank, number> = { 'A': 6, 'K': 5, 'Q': 4, '10': 3, '9': 2 };
  return ranks[card.rank] || 0;
}

// Standard rank for non-trump (higher = better)
function getStandardRank(card: Card): number {
  const ranks: Record<Rank, number> = { 'A': 6, 'K': 5, 'Q': 4, 'J': 3, '10': 2, '9': 1 };
  return ranks[card.rank] || 0;
}
```

### 7.3 Follow Suit Validation

```typescript
/**
 * INVARIANT: This function MUST use getEffectiveSuit() so the Left Bower
 * is treated as trump, not as its printed suit.
 */
function getPlayableCards(hand: Card[], leadSuit: Suit | null, trumpSuit: Suit): Card[] {
  if (!leadSuit) return hand; // Leading — can play anything
  
  // Check if player has any cards of the led suit (using effective suit)
  const followCards = hand.filter(c => getEffectiveSuit(c, trumpSuit) === leadSuit);
  
  if (followCards.length > 0) return followCards; // Must follow suit
  return hand; // Can't follow — play anything
}
```

### 7.4 Trick Size Helper

```typescript
/**
 * Single source of truth for how many cards complete a trick.
 * MUST be used everywhere trick completion is checked — never hardcode 3 or 4.
 */
function expectedCardsThisTrick(round: EuchreRound): number {
  return round.goingAlone ? 3 : 4;
}
```

### 7.5 Turn Advancement Helper

```typescript
/**
 * Advance seat index clockwise, skipping inactive partner during Going Alone.
 */
function nextActiveSeat(currentSeat: number, round: EuchreRound): number {
  let next = (currentSeat + 1) % 4;
  if (round.goingAlone && next === round.inactivePartnerSeatIndex) {
    next = (next + 1) % 4;
  }
  return next;
}
```

---

## 8. Bot AI (Euchre)

### 8.1 Trump Calling Bot Logic

**Round 1 (Face-up card):**
```
Priority:
1. If bot has Right Bower of face-up suit → order it up
2. If bot has Left Bower + 2 other trump of face-up suit → order it up
3. If bot has 3+ cards of face-up suit (including face cards) → order it up
4. If bot is dealer and has decent hand → order it up (getting an extra trump)
5. Pass
```

**Round 2 (Name suit):**
```
Priority:
1. Count cards per suit (using effective suits). Name the suit where bot has most strength.
2. Prefer suits with Bower(s)
3. Stick the Dealer: if forced, pick suit with most cards (MUST always name a valid suit — never pass)
```

**Going Alone:**
```
Bot goes alone if:
- Has Right Bower + Left Bower + at least 1 other trump + 1 off-suit Ace
- OR has Right Bower + 3 other trump
(Conservative — only on very strong hands)
```

### 8.2 Trick Play Bot Logic

```
Priority for playing a card:
1. If leading:
   a. Lead Right Bower if held (draw out trump)
   b. Lead off-suit Ace if held
   c. Lead highest trump if 2+ trump in hand
   d. Lead lowest card
   
2. If following suit:
   a. If partner is currently winning the trick → play lowest legal card
   b. If can win the trick → play lowest winning card
   c. Play lowest legal card (don't waste high cards)
   
3. If can't follow suit:
   a. If partner is currently winning → throw lowest off-suit card
   b. Trump with lowest trump if trick is worth winning
   c. Throw lowest off-suit card
```

### 8.3 Dealer Discard Bot Logic

```
When dealer picks up face-up card and must discard:
1. Discard lowest non-trump card (using getEffectiveSuit to identify trump cards)
2. If all trump, discard lowest trump (9 of trump)
3. Never discard a Bower (Right or Left)
```

### 8.4 Bot Timing

Same serverless-safe timestamp pattern:
- `botActionAt = now + random(BOT_ACTION_DELAY_RANGE_MS)`
- Executed on next heartbeat after timestamp passes
- Idempotent: check if action already taken for current game state

---

## 9. Constants

```typescript
// /lib/games/whos-deal/constants.ts
export const CARDS_PER_HAND = 5;
export const TRICKS_PER_ROUND = 5;
export const KITTY_SIZE = 4;
export const DEFAULT_TARGET_SCORE = 10;
export const VALID_TARGET_SCORES = [5, 7, 10, 11] as const;
export const BOT_ACTION_DELAY_RANGE_MS = [1500, 3000] as const;
export const ROUND_RESULT_DISPLAY_MS = 5000;
export const TRICK_RESULT_DISPLAY_MS = 2000;
```

---

## 10. Pusher Events

| Event | Payload | Triggered When |
|---|---|---|
| `game-started` | `{ teams, seats, dealer, faceUpCard, targetScore }` | Game begins |
| `hand-updated` | `{ hand: Card[] }` | Private — dealt cards or after discard |
| `trump-action` | `{ seatIndex, action, suit?, goAlone? }` | Player passes, orders up, or names suit |
| `dealer-discarded` | `{ seatIndex }` | Dealer discards (no card revealed) |
| `trump-confirmed` | `{ trumpSuit, callingPlayer, callingTeam, goAlone? }` | Trump is set, play begins |
| `trick-started` | `{ leadSeatIndex }` | New trick begins |
| `card-played` | `{ seatIndex, card }` | Player plays a card |
| `trick-won` | `{ winningSeatIndex, winningTeam, tricksWon }` | Trick completed |
| `round-over` | `{ callingTeam, tricksWon, pointsAwarded, scores, isGameOver }` | All 5 tricks done |
| `new-round` | `{ dealerSeatIndex, faceUpCard }` | Next round begins |
| `game-over` | `{ winningTeam, finalScores }` | Team reaches target |

Private channel (`private-player-{playerId}`): `hand-updated`
Room channel (`presence-room-{roomCode}`): all other events

---

## 11. UI Components

### 11.1 Game View Layout

```
┌─────────────────────────────────┐
│         Partner (top)           │  ← Team indicator
│         [5 card backs]          │
│                                 │
│  Left     ┌──────────┐  Right  │
│  Player   │  TRICK   │  Player │
│  [cards]  │  AREA    │  [cards]│
│           │          │         │
│           └──────────┘         │
│                                 │
│    ┌── Trump Indicator ──┐     │
│    │  ♥ Trump / Calling  │     │
│    └─────────────────────┘     │
│                                 │
│      Your Hand (bottom)         │
│   [card] [card] [card] [card]  │
│                                 │
│  Team A: 4    Team B: 7        │
└─────────────────────────────────┘
```

### 11.2 Component Breakdown

**Table View** (`/lib/games/whos-deal/components/Table.tsx`)
- 4 player positions arranged around a central trick area
- Your hand at the bottom (face up, clickable)
- Partner at top (card backs)
- Opponents on left and right (card backs)
- Active player highlighted
- Dealer chip/indicator on current dealer
- Inactive partner greyed out during Going Alone

**Trump Calling UI**
- During Round 1: face-up card displayed prominently in center
  - Buttons: "Order it up" / "Pass" (+ "Go Alone" checkbox or toggle)
  - Only visible to the player whose turn it is
  - Other players see "Waiting for [name]..."
- During Round 2: suit selection
  - 4 suit buttons (face-up card's suit disabled/greyed out)
  - "Pass" button (HIDDEN for dealer when Stick the Dealer applies — cannot be clicked)
  - "Go Alone" checkbox/toggle
- Clear indication of who called trump and what suit

**Dealer Discard UI** (trumpPhase = 'dealer_discard')
- Dealer sees their 6 cards (5 original + picked up card, clearly marked)
- Must tap one to discard
- "Discard" button confirms selection
- Other players see "Dealer is discarding..."

**Trick Area**
- Center of table shows played cards
- Cards appear as each player plays
- Brief pause (TRICK_RESULT_DISPLAY_MS) to show completed trick before clearing
- Trick winner indicated before cards clear

**Hand Display**
- Player's 5 cards displayed face-up
- Playable cards are highlighted/normal, unplayable cards are dimmed (follow suit enforcement visual using getPlayableCards)
- Tap to select, tap again or confirm button to play
- When Going Alone as partner: hand hidden, "Partner is going alone" message

**Scoreboard**
- Persistent score display: "Team A: X — Team B: X"
- Target score shown
- Visual indication of which team the player is on
- Trick count for current round: "Tricks: A:2 B:1"

**Trump Indicator**
- Shows current trump suit (large suit icon)
- Shows who called it
- Shows if Going Alone

### 11.3 Mobile Considerations
- Cards must be readable on mobile (minimum tap targets)
- Hand may need horizontal scroll on smaller screens
- Trick area scales down but cards remain identifiable
- Trump calling buttons are large and easy to tap
- Consider portrait orientation as primary layout

---

## 12. Lobby Enhancements for Who's Deal?

### 12.1 Team Assignment Component

When `gameId === 'whos-deal'` in the lobby, render a team assignment UI:

```
┌──── Team A ────┐   ┌──── Team B ────┐
│  [Player 1]    │   │  [Player 2]    │
│  [Player 3]    │   │  [Player 4]    │
└────────────────┘   └────────────────┘
         [↔ Swap]  (owner only)
```

- Owner can drag player cards between columns, or tap a "swap" button to swap selected players
- Swaps are pairwise: one player from A swaps with one from B (teams must stay at 2 each)
- Non-owners see teams but cannot modify
- Bots can be on either team
- Pusher event: `teams-updated` { teams } — updates all clients in real-time

### 12.2 Settings Component

Below teams, owner sees:

- **Points to win**: 4 buttons in a row — 5, 7, 10, 11. Selected one is highlighted. Default: 10.
- Pusher event: `settings-updated` { targetScore } — updates all clients

### 12.3 Lobby API Updates

New actions for lobby configuration (before game starts):

```
POST /api/game/action { type: 'swap-teams', payload: { playerIdA, playerIdB } }
  → Validate: requester is owner, room status is 'waiting'
  → Validate: playerIdA is in Team A, playerIdB is in Team B (or vice versa)
  → Swap players between teams
  → Pusher event: 'teams-updated'

POST /api/game/action { type: 'set-target-score', payload: { targetScore } }
  → Validate: requester is owner, room status is 'waiting'
  → Validate: targetScore is in VALID_TARGET_SCORES
  → Update room settings
  → Pusher event: 'settings-updated'
```

---

## 13. Action Types Summary

All actions go through `POST /api/game/action`:

| Action Type | Payload | Phase | Who |
|---|---|---|---|
| `swap-teams` | `{ playerIdA, playerIdB }` | waiting (lobby) | Owner |
| `set-target-score` | `{ targetScore }` | waiting (lobby) | Owner |
| `start` | `{ targetScore, teams }` | waiting | Owner |
| `call-trump` | `{ pickUp?: boolean, suit?: Suit, goAlone?: boolean }` | round1 / round2 | Current turn |
| `pass-trump` | — | round1 / round2 (NOT dealer in Stick the Dealer) | Current turn |
| `discard` | `{ cardId }` | dealer_discard | Dealer only |
| `play-card` | `{ cardId }` | playing | Current turn (not inactive partner) |
| `play-again` | — | game_over | Owner |

All actions MUST:
- Validate current phase (trumpPhase for round actions)
- Be idempotent (support optional actionId)
- Never mutate state on invalid phase

---

## 14. Implementation Phases

### Phase 1: Who's Deal? Game Module
**Goal**: Fully playable Euchre with bots, team configuration, and settings.

1. Create `/lib/games/whos-deal/engine.ts` implementing GameModule interface
2. Create `/lib/games/whos-deal/bots.ts` with Euchre bot AI
3. Create `/lib/games/whos-deal/constants.ts`
4. Create `/lib/games/whos-deal/helpers.ts` with card logic:
   - `getEffectiveSuit()` — Left Bower resolution
   - `isSameColor()` — suit color check
   - `getPartnerSuit()` — same-color partner suit
   - `compareCards()` — with explicit contract (positive/negative/zero)
   - `getTrumpRank()` — trump card ordering
   - `getStandardRank()` — non-trump card ordering
   - `getPlayableCards()` — follow suit validation using effective suits
   - `expectedCardsThisTrick()` — single source of truth for trick size
   - `nextActiveSeat()` — clockwise advancement skipping inactive partner
5. Register "Who's Deal?" in GAME_REGISTRY, update existing game icons (Terrible People → 😈)
6. Add `settings` field to Room interface for game-specific configuration
7. Implement lobby team assignment UI (drag/swap, owner only)
8. Implement lobby settings panel (target score selection, owner only)
9. Implement lobby API actions (swap-teams, set-target-score) with Pusher events
10. Wire up all game actions through generic `/api/game/action` route
11. Implement full trump calling flow:
    - Round 1 → dealer_discard → playing
    - Round 1 → (all pass) → Round 2 → playing
    - Stick the Dealer hard enforcement in Round 2
12. Implement Going Alone:
    - `inactivePartnerSeatIndex` tracking
    - Skip inactive partner in ALL turn advancement (use `nextActiveSeat()`)
    - Trick completion uses `expectedCardsThisTrick()` (3 not 4)
    - Correct scoring (4 points for sweep, 1 for 3-4 tricks)
13. Implement dealer discard as explicit `dealer_discard` phase:
    - Trick play MUST NOT begin until discard completes
    - Dealer pickup is mandatory (server enforced)
14. Implement trick play:
    - Follow suit using `getPlayableCards()` with `getEffectiveSuit()`
    - Trick winner via `reduce` across all cards using `compareCards()`
    - Trick resolution (winner, tricksWon, tricksPlayed, lead update) in SINGLE atomic Redis mutation
15. Implement round scoring per scoring table
16. Implement win condition check against target score
17. Implement dealer rotation (clockwise each round, resets to seat 0 on Play Again)
18. Implement Play Again (reset scores, reshuffle, dealer to seat 0)
19. Implement bot AI (trump calling, trick play, dealer discard)
20. Build all UI components (table layout, trump calling, dealer discard, trick area, hand display, scoreboard, trump indicator)
21. Wire up all Pusher events
22. Handle mid-game player departure (bot takeover — inherits hand, seat, team)
23. Mobile-responsive layout

**Acceptance Criteria**:
- [ ] Can select "Who's Deal?" when creating a world
- [ ] World is 4 players with bots filling empty seats
- [ ] Lobby shows team assignment with drag/swap (owner only)
- [ ] Lobby shows target score selector (5, 7, 10, 11) (owner only)
- [ ] Non-owners see teams and settings but cannot change them
- [ ] Teams and settings update in real-time for all players via Pusher
- [ ] Cards deal correctly (5 per player, 4 in kitty, face-up card shown)
- [ ] Trump calling Round 1 works (order it up or pass)
- [ ] Ordering up transitions to dealer_discard phase (trick play does NOT start early)
- [ ] Dealer picks up face-up card and must discard (mandatory, server enforced)
- [ ] Trump calling Round 2 works (name suit or pass, face-up suit disabled)
- [ ] Stick the Dealer: dealer CANNOT pass in Round 2 when all others passed — server rejects
- [ ] Going Alone: partner sits out, skipped in turn order, tricks complete after 3 cards
- [ ] Going Alone scoring: 4 points for all 5 tricks, 1 point for 3-4 tricks
- [ ] Euchre scoring: 2 points to defending team when callers fail
- [ ] Follow suit enforced correctly (Left Bower treated as trump via getEffectiveSuit)
- [ ] Right Bower beats Left Bower beats other trump cards
- [ ] Trick winner determined by reduce across all cards (not pairwise)
- [ ] Round scoring correct for all scenarios (1pt, 2pt march, 2pt euchre, 4pt alone)
- [ ] Dealer rotates clockwise each round
- [ ] Game ends when team reaches target score
- [ ] Bots call trump sensibly (don't pass with strong hands, always call when stuck)
- [ ] Bots play tricks strategically (lead strong, follow smart, trump when beneficial)
- [ ] Bots discard sensibly as dealer (lowest non-trump, never discard Bowers)
- [ ] Play Again resets scores, reshuffles, dealer resets to seat 0
- [ ] Mid-game player departure: bot takes over hand, seat, and team seamlessly
- [ ] UI works on mobile (cards readable, buttons tappable)
- [ ] All actions idempotent, phase-validated
- [ ] No state corruption from duplicate/rapid actions
- [ ] Terrible People and 4 Kate still work (regression check)

---

## 15. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Play card not in hand | 400 → `{ error: "Card not in hand", code: "INVALID_CARD" }` |
| Play card that doesn't follow suit | 400 → `{ error: "Must follow suit", code: "MUST_FOLLOW_SUIT" }` |
| Call face-up suit in Round 2 | 400 → `{ error: "Cannot call that suit", code: "INVALID_SUIT" }` |
| Dealer tries to pass in Stick the Dealer | 400 → `{ error: "Dealer must call", code: "MUST_CALL" }` |
| Action out of turn | 403 → `{ error: "Not your turn", code: "NOT_YOUR_TURN" }` |
| Inactive partner tries to play | 403 → `{ error: "Partner is going alone", code: "INACTIVE_PARTNER" }` |
| Action in wrong phase | 409 → No-op or error, state never mutates |
| Discard when not dealer | 403 → `{ error: "Not the dealer", code: "NOT_DEALER" }` |
| Discard when not in dealer_discard phase | 409 → No-op |
| Invalid target score | 400 → `{ error: "Invalid target score", code: "INVALID_SETTING" }` |
| Swap players not on opposite teams | 400 → `{ error: "Invalid swap", code: "INVALID_SWAP" }` |
| Non-owner tries to change settings | 403 → `{ error: "Not the owner", code: "NOT_OWNER" }` |
| Duplicate actionId | 200 → Success (no-op) |
| Player leaves mid-trick | Bot inherits hand, seat, and team position, plays remaining tricks |
| Player leaves during dealer_discard | Bot takes over as dealer, discards automatically |

---

## 16. Future Considerations

- **Score animation**: Visual "march" or "euchre" celebration
- **Card dealing animation**: Cards fly to each player
- **Trick history**: View past tricks in current round
- **Chat/Emotes**: In-game reactions
- **Statistics**: Track euchres, loners, marches over time
- **Custom team names**: Let teams pick names
- **Sound effects**: Card play, trump call, trick win sounds
- **Void tracking bot improvement**: Bots remember which suits opponents are void in
- **Trump counting bot improvement**: Bots track how many trump cards have been played
- **Partner strength inference**: Bots adjust play based on partner's revealed cards
