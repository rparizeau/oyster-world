Read SPEC.md for original architecture context, then read OYSTER-SPEC.md for the platform architecture, then read WHOS-DEAL-SPEC.md for the full Who's Deal? specification. Phase 1 (lobby, helpers) and Phase 2 (game engine, bots) are complete and working.

Implement Phase 3: All UI components for the Who's Deal? game view. The engine and bot logic are done — this phase is purely about rendering the game state and wiring up player interactions.

**1. Game View Layout (`/lib/games/whos-deal/components/`)**

Build the main game view following the layout from Section 11 of WHOS-DEAL-SPEC.md:

```
┌─────────────────────────────────┐
│         Partner (top)           │
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

**2. Table Component (`Table.tsx`)**
- 4 player positions arranged around a central trick area
- Your hand at the bottom (face up, interactive)
- Partner at top (card backs only)
- Opponents on left and right (card backs only)
- Active player (whose turn it is) highlighted with a border, glow, or indicator
- Dealer has a visible chip/badge ("D" or dealer icon)
- During Going Alone: inactive partner greyed out with "Sitting out" or "Partner is going alone" label
- Team indicators: each player's name shows their team color

**3. Card Components**
- Face-up card: shows rank and suit with appropriate colors (♥♦ red, ♠♣ black)
- Face-down card: generic card back design
- Cards should look like cards — rounded corners, slight shadow, white background for face-up
- Selected card state: lifted/raised or highlighted border
- Dimmed card state: for cards that can't be played (follow suit enforcement)

**4. Trump Calling UI**

**During trumpPhase = 'round1':**
- Face-up card displayed prominently in the center of the table
- If it's the current player's turn:
  - Two buttons: "Order it up" / "Pass"
  - "Go Alone" toggle or checkbox (optional, off by default)
  - Clear text: "Trump would be [suit]"
- If it's another player's turn:
  - Face-up card still shown
  - Text: "Waiting for [name] to decide..."
- As players pass, show pass indicators next to their seat

**During trumpPhase = 'round2':**
- Face-up card shown but slightly dimmed (it was turned down)
- If it's the current player's turn:
  - 4 suit buttons (♠ ♥ ♦ ♣) — face-up card's suit is DISABLED (greyed out, not clickable)
  - "Pass" button — HIDDEN (not just disabled) when Stick the Dealer applies (dealer + all others passed)
  - "Go Alone" toggle
  - Text: "Name trump (cannot pick [turned down suit])"
- If it's another player's turn:
  - Text: "Waiting for [name]..."
  - If Stick the Dealer applies: "[Dealer name] must call trump"

**During trumpPhase = 'dealer_discard':**
- If current player is the dealer:
  - Show all 6 cards in hand
  - The picked-up card should be visually distinct (highlighted border or "NEW" badge)
  - Text: "Choose a card to discard"
  - Tap a card to select it, then "Discard" button to confirm
- If current player is not the dealer:
  - Text: "[Dealer name] is discarding..."

**5. Trump Confirmed Indicator**
Once trump is called and play begins:
- Persistent indicator showing: trump suit (large icon), who called it, "Going Alone" if applicable
- This stays visible throughout all trick play

**6. Trick Area**
- Center of the table
- As each player plays a card, it appears in their position relative to center
- Cards are face-up, clearly showing rank and suit
- When trick is complete:
  - Brief highlight on winning card (TRICK_RESULT_DISPLAY_MS = 2000ms)
  - Winner indicated with text or animation
  - Then cards clear for next trick

**7. Hand Display (Bottom)**
- Player's cards displayed face-up in a row
- During trick play:
  - Playable cards (from getPlayableCards) are normal/highlighted
  - Unplayable cards are dimmed/greyed — visual follow suit enforcement
  - Only clickable when it's the player's turn
- Tap a card to select it (raised/highlighted state)
- Tap selected card again to deselect, or tap "Play" button to confirm
- During Going Alone as the inactive partner: hide hand, show "Your partner is going alone" message

**8. Scoreboard**
- Persistent display at bottom or top of screen
- "Team A: [score] — Team B: [score]" with clear team colors
- Target score shown: "Playing to [X]"
- Visual indicator of which team the current player is on (highlight or "Your team" label)
- Trick count for current round: "Tricks — A: [X]  B: [X]"

**9. Game Over Screen**
- Overlay or full-screen result
- Winning team announced prominently
- Final scores displayed
- "Play Again" button (owner only)
- "Leave World" button (all players)

**10. Pusher Event Subscriptions**
Wire up the game view to react to all Pusher events from Section 10 of WHOS-DEAL-SPEC.md:
- `game-started` → Initialize game view, show dealt cards
- `hand-updated` → Update player's hand (private channel)
- `trump-action` → Show pass/call indicators, update trump calling UI
- `trump-confirmed` → Show trump indicator, transition to trick play view
- `dealer-discarded` → Clear discard UI, transition to play
- `trick-started` → Clear trick area, highlight lead player
- `card-played` → Animate card into trick area from the playing seat
- `trick-won` → Highlight winning card, update trick count
- `round-over` → Show round summary (points awarded, running scores)
- `new-round` → Reset for new round (new dealer, new face-up card)
- `game-over` → Show game over screen

All state updates should be smooth — no full page reloads or jarring transitions.

**11. Mobile Responsiveness**
- Portrait orientation as primary layout
- Cards must be readable on small screens — minimum tap targets (44px)
- Hand may need horizontal scroll on phones with 5+ cards during discard (6 cards)
- Trick area scales down but cards remain identifiable
- Trump calling suit buttons are large and easy to tap
- Test on a real phone or mobile simulator

**Acceptance Criteria — verify all:**
- [ ] Game view renders with 4 player positions and central trick area
- [ ] Your cards shown face-up at bottom, others show card backs
- [ ] Active player is visually highlighted
- [ ] Dealer has a visible indicator
- [ ] Trump calling Round 1: face-up card shown, Order/Pass buttons work
- [ ] Trump calling Round 2: suit buttons shown, turned-down suit disabled
- [ ] Stick the Dealer: Pass button hidden for stuck dealer
- [ ] Go Alone toggle works in both rounds
- [ ] Dealer discard: shows 6 cards, can select and confirm discard
- [ ] Non-dealers see "Dealer is discarding..." during discard phase
- [ ] Trump indicator appears after trump is called (suit, caller, alone status)
- [ ] Trick area shows cards as they're played
- [ ] Follow suit enforcement visual: playable cards normal, unplayable dimmed
- [ ] Can only interact with cards when it's your turn
- [ ] Trick completion: winning card highlighted, brief pause, then clears
- [ ] Scoreboard shows both team scores and trick count
- [ ] Game over screen shows winner, scores, Play Again / Leave buttons
- [ ] Going Alone: inactive partner sees "Partner is going alone", hand hidden
- [ ] Going Alone: inactive partner seat greyed out on table
- [ ] All Pusher events update UI smoothly without refresh
- [ ] Mobile: cards readable, buttons tappable, layout fits portrait screen
- [ ] Terrible People and 4 Kate still work (regression check)
