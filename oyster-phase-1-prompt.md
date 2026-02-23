Read SPEC.md for the original architecture context, then read OYSTER-SPEC.md for the full Oyster World platform upgrade specification.

Implement Phase 1: Platform Refactor. This transforms the existing single-game "Terrible People" app into the multi-game "Oyster World" platform.

**1. Branding Rebrand**
- Update all user-facing text: "Terrible People" → "Oyster World"
- Update all user-facing text: "Room" → "World" (e.g., "Create a World", "Join a World", "World Code", "Leave World")
- Update page titles, meta tags, and any hardcoded string references
- Internal code (variable names, Redis keys, file names) can keep using "room" — this is a UI-only rename

**2. Game Registry & Types**
- Create `/lib/games/registry.ts` with the GAME_REGISTRY array containing configs for 'terrible-people' and '4-kate' as defined in Section 2.3 of OYSTER-SPEC.md
- Create `/lib/games/types.ts` with the GameModule interface and GameAction type as defined in Section 2.9 of OYSTER-SPEC.md
- GameAction must be a structured type with `type: string`, `payload?: unknown`, `actionId?: string` — no `any` types

**3. Room Model Update**
- Add `gameId: string` field to the Room interface
- Player array length is now dynamic based on the game's maxPlayers from the registry
- Update all Room creation/reading logic to handle the new field

**4. Room Creation API Update**
- `/api/rooms/create` now accepts `{ name, gameId }` in the body
- Server MUST validate `gameId` against GAME_REGISTRY — reject unknown gameId with `{ error: "Invalid game", code: "INVALID_GAME" }` (400)
- Look up GameConfig to determine maxPlayers, create room with correct number of bot seats
- Store gameId in the Room object in Redis

**5. Home Page (`/`)**
- "Oyster World" title and tagline
- Two buttons: "Create a World" / "Join a World"

**6. Create Flow UI**
- Step 1: Enter display name
- Step 2: Horizontal swipeable carousel of game cards
  - Each card shows: game icon (emoji), game name, short description, player count (e.g., "2 players", "4 players")
  - User swipes/scrolls horizontally to browse games
  - Tap a card to select it — selected card gets a highlighted/active state
  - "Create" button below the carousel, disabled until a game is selected
  - Must work smoothly on both mobile (swipe) and desktop (click/drag or arrow buttons)
- After selection: POST to create API with name and gameId, redirect to lobby

**7. Join Flow UI**
- Single screen: display name input + world code input
- On submit: POST to join API, redirect to lobby
- On error: show error message with "Return Home" button

**8. Lobby View Update**
- Shows which game is selected (icon + name from game card)
- "World Code" label with copy button
- Shareable link with copy button
- Player slot count matches the game's maxPlayers (2 slots for 4 Kate, 4 slots for Terrible People)
- "Start Game" button (owner only)
- "Leave World" button
- All labels use "World" terminology

**9. Join Page Update**
- `/join/[roomCode]` page shows which game the world is playing

**10. Refactor Terrible People into Game Module**
- Move existing game engine code into `/lib/games/terrible-people/engine.ts`
- Move existing bot code into `/lib/games/terrible-people/bots.ts`
- Move existing game-specific UI components into `/lib/games/terrible-people/components/`
- Refactor the engine to implement the GameModule interface from `/lib/games/types.ts`
- Every action in processAction MUST validate the current phase before mutating — invalid phase actions must be a no-op or return an error, never mutate state

**11. Generic Action Route**
- Create `POST /api/game/action` with body: `{ roomCode, playerId, actionId?, type, payload? }`
- Server flow:
  1. Load room from Redis
  2. Validate playerId belongs to room
  3. Look up game module by room.gameId
  4. If actionId provided, check against last processed actionId for this player — if duplicate, return success (no-op)
  5. Dispatch to gameModule.processAction()
  6. Store updated state atomically in Redis
  7. Track actionId as last processed
  8. Trigger appropriate Pusher events
- Existing routes (`/api/game/submit`, `/api/game/judge`, `/api/game/start`, `/api/game/play-again`) should still work — either keep them as aliases that internally use the generic route, or migrate them. Terrible People must keep working.

**12. Verify Everything**
After all changes, Terrible People must work exactly as before — create a world, select Terrible People, play a full game with bots. Nothing should be broken by the refactor.

**Acceptance Criteria — verify all before moving on:**
- [ ] Home page shows "Oyster World" with "Create a World" / "Join a World"
- [ ] Create flow: name entry → horizontal swipeable game carousel → create
- [ ] Game cards show icon, name, description, player count
- [ ] Carousel swipes on mobile and scrolls/clicks on desktop
- [ ] "Create" button disabled until game selected
- [ ] Join flow: name + world code on same screen
- [ ] Unknown gameId rejected with INVALID_GAME error
- [ ] Selecting "Terrible People" creates a 4-player world
- [ ] Lobby shows selected game icon + name, world code, "World" terminology
- [ ] Player slots match game's maxPlayers
- [ ] Terrible People gameplay is completely unchanged
- [ ] Join page shows which game the world is playing
- [ ] Generic `/api/game/action` route dispatches correctly to Terrible People module
- [ ] actionId idempotency works (duplicate actionId returns success, no state change)
