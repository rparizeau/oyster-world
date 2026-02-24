Read SPEC.md for original architecture context, then read OYSTER-SPEC.md for the platform architecture, then read WHOS-DEAL-SPEC.md for the full Who's Deal? specification.

Implement Phase 1: Platform updates and lobby enhancements for Who's Deal? This phase adds the game to the registry, updates the lobby to support team configuration and game settings, and scaffolds the game module files.

**1. Game Registry Update**
- Add "Who's Deal?" to GAME_REGISTRY in `/lib/games/registry.ts` as defined in Section 2 of WHOS-DEAL-SPEC.md
- Update existing game icons: Terrible People → 😈, 4 Kate → 🔴, Who's Deal? → 🃏
- Verify the game carousel on the Create a World flow shows all three games correctly

**2. Room Model Update**
- Add optional `settings` field to the Room interface as defined in Section 4.2 of WHOS-DEAL-SPEC.md
- `settings` is game-specific — for Who's Deal? it contains `targetScore` and `teams`
- Ensure existing games (Terrible People, 4 Kate) are unaffected by this addition

**3. Lobby Team Assignment UI (Who's Deal? only)**
When `gameId === 'whos-deal'` in the lobby, render a team assignment component:
- Two team columns: Team A (left) and Team B (right)
- Default assignment: players alternate by join order — seats 0 & 2 = Team A, seats 1 & 3 = Team B
- Player cards in each column showing name and "Bot" label for bots
- Owner can drag player cards between teams OR tap a swap button to swap selected players
- Swaps are pairwise: one player moves from A to B, one from B to A (teams must always have exactly 2)
- Non-owners see the teams but cannot rearrange
- Clear visual team identity (different colors or styling per team)

**4. Lobby Settings Panel (Who's Deal? only)**
Below the team assignment, owner sees:
- **Points to win**: 4 buttons in a row — 5, 7, 10, 11
- Default selected: 10
- Selected button is highlighted
- Non-owners can see the setting but cannot change it

**5. Lobby API Actions**
Implement two new actions through the generic `/api/game/action` route:

`POST /api/game/action { type: 'swap-teams', payload: { playerIdA, playerIdB } }`
- Validate: requester is owner, room status is 'waiting', gameId is 'whos-deal'
- Validate: one player is in Team A, the other in Team B
- Swap them between teams
- Store updated teams in room settings in Redis (atomic)
- Trigger Pusher event: `teams-updated` { teams }
- Error if invalid: `{ error: "Invalid swap", code: "INVALID_SWAP" }`

`POST /api/game/action { type: 'set-target-score', payload: { targetScore } }`
- Validate: requester is owner, room status is 'waiting', gameId is 'whos-deal'
- Validate: targetScore is one of [5, 7, 10, 11]
- Store in room settings in Redis (atomic)
- Trigger Pusher event: `settings-updated` { targetScore }
- Error if invalid: `{ error: "Invalid target score", code: "INVALID_SETTING" }`

Both actions must be idempotent and support optional actionId.

**6. Scaffold Game Module Files**
Create the following empty or minimal files:
- `/lib/games/whos-deal/engine.ts` — export a class/object implementing GameModule interface (stub methods for now)
- `/lib/games/whos-deal/bots.ts` — empty export
- `/lib/games/whos-deal/constants.ts` — all constants from Section 9 of WHOS-DEAL-SPEC.md
- `/lib/games/whos-deal/helpers.ts` — implement ALL card logic helpers from Section 7 of WHOS-DEAL-SPEC.md:
  - `getEffectiveSuit()` — Left Bower resolution
  - `isSameColor()` — suit color check
  - `getPartnerSuit()` — same-color partner suit
  - `compareCards()` — with explicit contract (returns positive if a beats b, negative if b beats a)
  - `getTrumpRank()` — trump card ordering
  - `getStandardRank()` — non-trump card ordering
  - `getPlayableCards()` — follow suit validation using effective suits
  - `expectedCardsThisTrick()` — returns 3 if Going Alone, 4 otherwise
  - `nextActiveSeat()` — clockwise advancement skipping inactive partner
- `/lib/games/whos-deal/components/` — empty directory

The helpers are the foundation everything else builds on — implement them fully now with the exact logic from the spec. They are pure functions with no dependencies.

**7. Start Game Validation**
Update the "Start Game" button for Who's Deal? to validate:
- Each team has exactly 2 players
- Target score is set (default 10 if not changed)
- Pass `{ targetScore, teams }` in the start action payload

**Acceptance Criteria — verify all before moving on:**
- [ ] Game carousel shows all 3 games with correct icons (😈, 🔴, 🃏)
- [ ] Selecting "Who's Deal?" creates a 4-player world
- [ ] Lobby shows team assignment UI with two columns when Who's Deal? is selected
- [ ] Default team assignment alternates by join order (0&2 vs 1&3)
- [ ] Owner can swap players between teams (drag or button)
- [ ] Non-owners see teams but cannot modify
- [ ] Swaps update in real-time for all players via Pusher
- [ ] Owner sees target score selector (5, 7, 10, 11) with 10 as default
- [ ] Non-owners see target score but cannot change it
- [ ] Target score updates in real-time for all players via Pusher
- [ ] Invalid swap (same team) returns INVALID_SWAP error
- [ ] Invalid target score returns INVALID_SETTING error
- [ ] Non-owner attempting changes returns NOT_OWNER error
- [ ] All card helpers implemented and correct (especially Left Bower handling)
- [ ] Terrible People and 4 Kate still work correctly (regression check)
