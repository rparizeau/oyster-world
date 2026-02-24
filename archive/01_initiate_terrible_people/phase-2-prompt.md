Read SPEC.md for full context. Phase 1 (room system) is complete and working.

Implement Phase 2: Game Engine (CAH Module). Work through these in order:

**1. Game engine (/lib/game-engine.ts)**
This file must contain PURE FUNCTIONS ONLY — no Redis calls, no Pusher calls, no side effects. It receives state and returns new state.

Implement:
- initializeGame(room: Room, cards: CardData): GameState — Shuffle decks, deal HAND_SIZE cards to each player, set czarIndex=0, draw first black card, set phase='czar_reveal', set phaseEndsAt
- submitCards(state: GameState, playerId: string, cardIds: string[]): GameState — Validate: not already submitted, card count matches blackCard.pick, cards exist in hand. Remove cards from hand, add to submissions. If all non-Czar players submitted, transition to 'judging' phase.
- judgeWinner(state: GameState, winnerId: string): GameState — Record winner, increment score, transition to 'round_result', set phaseEndsAt
- advanceRound(state: GameState): GameState — Discard played cards, replenish hands to HAND_SIZE, advance czarIndex (wrap around), draw new black card, reset submissions, transition to 'czar_reveal'. If deck runs out, reshuffle discard pile.
- checkWinCondition(state: GameState): { isGameOver: boolean, winnerId?: string }
- getShuffledRevealOrder(state: GameState): string[] — Shuffled non-Czar player IDs for anonymous submission display
- shouldAdvancePhase(state: GameState, now: number): boolean — Check if phaseEndsAt has passed
- shouldExecuteBotAction(state: GameState, now: number): boolean — Check if botActionAt has passed

**2. Bot logic (/lib/bots.ts)**
- selectRandomCards(hand: WhiteCard[], count: number): string[] — Random card selection
- selectRandomWinner(submissions: Record<string, WhiteCard[]>, czarId: string): string — Random winner from non-Czar submissions
- getBotActionTimestamp(delayRange: readonly [number, number]): number — Current time + random delay within range

**3. Card data loader**
- Load /data/cards.json server-side
- Expand the starter set to 40 black cards (mix of pick-1 and pick-2) and 200 white cards with original, funny content. Do NOT copy Cards Against Humanity cards. Write original prompts and answers in the same spirit — irreverent, surprising, funny.

**4. API Routes**
Implement all game routes from Section 7.2. Every route must be IDEMPOTENT — check current phase and whether the action was already applied before mutating.

- POST /api/game/start — Validate: requester is owner, room status is 'waiting'. Initialize game state. Set room status to 'playing'. Trigger 'game-started' event. Send each player their hand via private channel. Set phaseEndsAt for czar_reveal. Set botActionAt for any bots that need to act.

- POST /api/game/submit — Validate: correct phase ('submitting'), player hasn't already submitted (ALREADY_SUBMITTED error), card count matches blackCard.pick (INVALID_SUBMISSION error), cards exist in player's hand. Store submission. If all non-Czar players have submitted, transition to 'judging', trigger 'submissions-revealed' with shuffled anonymous submissions.

- POST /api/game/judge — Validate: correct phase ('judging'), requester is Czar, winner hasn't been selected yet. Record winner, increment score, check win condition. If game over, transition to 'game_over'. Otherwise transition to 'round_result' with phaseEndsAt.

- POST /api/game/play-again — Validate: requester is owner, phase is 'game_over'. Reinitialize game state (reshuffle, redeal, reset scores). Transition back to 'czar_reveal'.

**5. Heartbeat-driven phase advancement**
Update the existing heartbeat endpoint to also:
- Check shouldAdvancePhase() — if phaseEndsAt has passed, advance to the next phase (e.g., czar_reveal → submitting, round_result → next round's czar_reveal)
- Check shouldExecuteBotAction() — if botActionAt has passed, execute the pending bot action (submit cards or judge winner)
- These checks must be idempotent — if the phase already advanced or bot already acted, do nothing
- After any advancement, trigger appropriate Pusher events

**6. Mid-game player departure**
Update the leave endpoint to handle game-in-progress scenarios per Section 4.4:
- Bot inherits departing player's hand, score, and seat position
- If player hadn't submitted, set botActionAt for the replacement bot
- If player was Czar, bot assumes Czar duties with botActionAt set

**7. Game UI (/room/[roomCode] — status: playing)**
Build the game view as described in Section 8.3. Keep it functional, not pretty:
- Top: Round number, player scores, Czar indicator (crown or label)
- Center: Black card displayed prominently with blanks visible
- Submissions area: During 'submitting' show progress ("2/3 submitted"). During 'judging' show anonymous cards — Czar can click to select winner. During 'round_result' show winning card with player name.
- Bottom: Player's hand of white cards. Clickable to select. For pick-2 cards, allow selecting two before submitting. Show a "Submit" button that activates when correct number of cards selected.
- Game over: Scoreboard with rankings, "Play Again" (owner only), "Leave Room" for all.

Subscribe to all game Pusher events from Section 6.2 and update UI state accordingly. Player hands come via private channel only.

**Acceptance criteria — verify all of these work:**
- [ ] Owner can start game from lobby, all players transition to game view
- [ ] Each player sees their own hand of 10 cards (private)
- [ ] Black card displays correctly with blank(s)
- [ ] Players can select and submit cards (pick-1 and pick-2 both work)
- [ ] Duplicate submissions are rejected
- [ ] Submissions appear anonymous during judging
- [ ] Czar can select a winner
- [ ] Scores update after each round
- [ ] Czar rotates each round
- [ ] Bots auto-submit and auto-judge via heartbeat-driven timestamps
- [ ] Game ends when a player reaches target score (7)
- [ ] "Play Again" works — reshuffles and restarts
- [ ] If a human leaves mid-game, bot takes over seamlessly
- [ ] If Czar leaves mid-game, bot assumes Czar and judges
- [ ] No state corruption from repeated/duplicate API calls
