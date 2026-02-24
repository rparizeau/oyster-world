Read SPEC.md for original architecture context, then read OYSTER-SPEC.md for the platform architecture, then read WHOS-DEAL-SPEC.md for the full Who's Deal? specification. Phase 1 (registry, lobby, helpers) is complete.

Implement Phase 2: The core Euchre game engine with bot AI. This is the most complex phase — follow the spec precisely, especially around Left Bower handling, Going Alone turn mechanics, and the dealer_discard micro-phase.

**1. Game Engine (`/lib/games/whos-deal/engine.ts`)**
Implement the GameModule interface. All game logic functions must be PURE — no Redis, no Pusher, no side effects. Use the helpers from `/lib/games/whos-deal/helpers.ts` that were built in Phase 1.

**Key data model**: Use the WhosDealGameState and EuchreRound interfaces from Section 4.1 of WHOS-DEAL-SPEC.md. Note that `trumpPhase` has FIVE values: `'round1' | 'round2' | 'dealer_discard' | 'playing' | 'round_over'`.

Implement these action handlers (all dispatched via `processAction`):

**Action: `start`**
- Initialize game state from lobby settings (teams, seats, targetScore)
- Shuffle 24-card Euchre deck (9-A in 4 suits)
- Deal 5 cards to each player, 4 to kitty, faceUpCard = kitty[0]
- Set dealerSeatIndex = 0
- Set trumpPhase = 'round1'
- Set currentTurnSeatIndex = seat left of dealer (use nextActiveSeat)

**Action: `call-trump` (trumpPhase: round1)**
- Payload: `{ pickUp: true, goAlone?: boolean }`
- Validate: current phase is round1, it's this player's turn
- Set trumpSuit = faceUpCard suit
- Record callingPlayerId, callingTeam
- If goAlone: set goingAlone=true, alonePlayerId, calculate inactivePartnerSeatIndex
- Dealer receives faceUpCard (now has 6 cards in hand)
- **Transition to trumpPhase = 'dealer_discard'** (NOT directly to playing)
- Set currentTurnSeatIndex = dealer's seat
- If dealer is bot, set botActionAt

**Action: `pass-trump` (trumpPhase: round1)**
- Validate: current phase is round1, it's this player's turn
- Add to passedPlayers
- Advance to next player clockwise
- If all 4 passed: transition to trumpPhase = 'round2', reset passedPlayers, set currentTurnSeatIndex to left of dealer

**Action: `call-trump` (trumpPhase: round2)**
- Payload: `{ suit, goAlone?: boolean }`
- Validate: current phase is round2, it's this player's turn
- Validate: suit is NOT the faceUpCard's suit — reject with INVALID_SUIT if so
- Set trumpSuit = named suit
- Record callingPlayerId, callingTeam
- If goAlone: set goingAlone=true, alonePlayerId, calculate inactivePartnerSeatIndex
- **Transition directly to trumpPhase = 'playing'** (no dealer discard in Round 2)
- Set up first trick: trickLeadSeatIndex = left of dealer (skip inactive partner if Going Alone using nextActiveSeat)
- Set currentTurnSeatIndex = trickLeadSeatIndex
- If current turn is bot, set botActionAt

**Action: `pass-trump` (trumpPhase: round2)**
- **STICK THE DEALER HARD GUARD**: If this player is the dealer AND 3 others have passed, REJECT with `{ error: "Dealer must call", code: "MUST_CALL" }`. Do NOT allow this action through.
- Otherwise: add to passedPlayers, advance to next player

**Action: `discard` (trumpPhase: dealer_discard)**
- Payload: `{ cardId }`
- Validate: phase is dealer_discard, requester is the dealer, card exists in dealer's hand, dealer has 6 cards
- Remove card from dealer's hand (dealer now has 5)
- Set dealerDiscarded = true
- **Transition to trumpPhase = 'playing'**
- Set up first trick: trickLeadSeatIndex = left of dealer (skip inactive partner if Going Alone)
- Set currentTurnSeatIndex = trickLeadSeatIndex
- If current turn is bot, set botActionAt

**Action: `play-card` (trumpPhase: playing)**
- Payload: `{ cardId }`
- Validate: phase is playing, it's this player's turn, player is NOT the inactive partner
- Validate card is in hand
- Determine led suit from first card in currentTrick using getEffectiveSuit()
- Validate follow suit: card MUST be in getPlayableCards(hand, ledSuit, trumpSuit) — reject with MUST_FOLLOW_SUIT if not
- Add card to currentTrick, remove from hand
- Advance currentTurnSeatIndex using nextActiveSeat()
- Check trick completion: `currentTrick.length === expectedCardsThisTrick(round)`
  - If complete: determine winner by REDUCING across all trick cards using compareCards()
  - Update tricksWon, tricksPlayed, trickLeadSeatIndex — ALL in single atomic operation
  - Clear currentTrick
  - If tricksPlayed === 5: calculate round score (Section 3.9), check win condition, transition to round_over or game_over
  - Else: set currentTurnSeatIndex = trick winner, start next trick
- If next player is bot, set botActionAt

**Action: `play-again` (phase: game_over)**
- Validate: requester is owner, phase is game_over
- Reset all scores to 0
- Dealer resets to seat 0 (does NOT continue rotating)
- Reshuffle and deal new round
- trumpPhase = 'round1'

**Round scoring logic** (after 5 tricks):
- Calling team took 3 or 4 tricks → 1 point to calling team
- Calling team took all 5 (march) → 2 points to calling team
- Defending team took 3+ (euchre) → 2 points to defending team
- Going Alone, all 5 tricks → 4 points to calling team
- Going Alone, 3 or 4 tricks → 1 point to calling team
- Going Alone, euchred → 2 points to defending team

After scoring: if team reached targetScore → phase = 'game_over'. Otherwise rotate dealer clockwise, reshuffle, deal, trumpPhase = 'round1'.

**Every action MUST**:
- Validate current phase/trumpPhase before mutating
- Be idempotent (check if action already applied)
- Support optional actionId
- Never mutate on invalid phase

**2. Bot AI (`/lib/games/whos-deal/bots.ts`)**

Implement all bot logic from Section 8 of WHOS-DEAL-SPEC.md:

**Trump calling (Round 1):**
1. Has Right Bower of face-up suit → order it up
2. Has Left Bower + 2 other cards of face-up suit → order it up
3. Has 3+ cards of face-up suit with face cards → order it up
4. Is dealer with decent hand → order it up
5. Pass

**Trump calling (Round 2):**
1. Count strength per suit using getEffectiveSuit(). Name strongest suit.
2. Prefer suits with Bower(s)
3. Stick the Dealer: MUST name a valid suit (pick suit with most cards) — NEVER pass

**Going Alone decision:**
- Right Bower + Left Bower + 1 other trump + 1 off-suit Ace → go alone
- OR Right Bower + 3 other trump → go alone
- Otherwise: don't go alone

**Dealer discard:**
1. Discard lowest non-trump card (use getEffectiveSuit to identify trump)
2. If all trump, discard 9 of trump
3. NEVER discard Right or Left Bower

**Trick play:**
Leading:
1. Lead Right Bower if held
2. Lead off-suit Ace if held
3. Lead highest trump if 2+ trump
4. Lead lowest card

Following suit:
1. Partner winning → play lowest legal card
2. Can win → play lowest winning card
3. Play lowest legal card

Can't follow suit:
1. Partner winning → throw lowest off-suit
2. Trump with lowest trump if trick worth winning
3. Throw lowest off-suit

Bot timing: `botActionAt = now + random(BOT_ACTION_DELAY_RANGE_MS)` — same serverless-safe timestamp pattern. Idempotent: check if action already taken.

**3. Heartbeat Integration**
Update the heartbeat endpoint to handle Who's Deal? bot actions and phase transitions:
- Check shouldExecuteBotAction() — if botActionAt passed, execute pending bot action (trump call, discard, card play)
- Check shouldAdvancePhase() — if phaseEndsAt passed (e.g., after round_over display), advance to next round
- All checks idempotent

**4. Mid-Game Player Departure**
When a human leaves a Who's Deal? game:
- Bot inherits hand, seat, team position
- If it was their turn (any phase — trump calling, discard, trick play), set botActionAt
- If they were the inactive partner (Going Alone), no action needed

**5. Wire Up Pusher Events**
Trigger all events from Section 10 of WHOS-DEAL-SPEC.md at the correct moments:
- `game-started`: when start action completes
- `hand-updated`: private channel, on deal and after dealer discard
- `trump-action`: on every pass/call during trump phases
- `trump-confirmed`: when trump is set and play begins
- `dealer-discarded`: when dealer completes discard (no card info to others)
- `trick-started`: when new trick begins
- `card-played`: when each card is played (visible to all)
- `trick-won`: when trick completes
- `round-over`: when all 5 tricks done (with scores)
- `new-round`: when next round begins after display pause
- `game-over`: when team reaches target score

**Acceptance Criteria — verify all before moving on:**
- [ ] Game starts correctly from lobby with configured teams and target score
- [ ] 5 cards dealt to each player, face-up card shown from kitty
- [ ] Trump calling Round 1: order it up sets trump to face-up suit
- [ ] Ordering up transitions to dealer_discard (NOT directly to playing)
- [ ] Dealer picks up face-up card and must discard (now has 6, then 5)
- [ ] After discard, trick play begins
- [ ] Trump calling Round 1: all 4 pass transitions to Round 2
- [ ] Trump calling Round 2: can name any suit except face-up suit
- [ ] Naming suit in Round 2 goes directly to trick play (no discard)
- [ ] Stick the Dealer: dealer CANNOT pass when all others have passed — server rejects
- [ ] Going Alone: partner is skipped in all turn order
- [ ] Going Alone: tricks complete after 3 cards, not 4
- [ ] Going Alone scoring: 4 points for all 5, 1 point for 3-4, 2 to defenders if euchred
- [ ] Follow suit enforced (Left Bower counts as trump suit)
- [ ] Right Bower > Left Bower > A > K > Q > 10 > 9 of trump
- [ ] Trick winner determined by reduce across all cards
- [ ] Standard scoring: 1pt for 3-4 tricks, 2pt for march, 2pt for euchre
- [ ] Dealer rotates clockwise each round
- [ ] Game ends when team reaches target score
- [ ] Bots call trump sensibly
- [ ] Bots always call when stuck as dealer (never deadlock)
- [ ] Bots play tricks with basic strategy (lead strong, follow smart)
- [ ] Bots discard lowest non-trump, never discard Bowers
- [ ] Play Again resets scores, dealer to seat 0
- [ ] Bot actions fire via heartbeat timestamps (no setTimeout)
- [ ] Player departure: bot takes over seamlessly
- [ ] All actions idempotent and phase-validated
- [ ] No state corruption from rapid/duplicate actions
