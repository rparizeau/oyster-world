Read SPEC.md for full context. The project has been scaffolded with types, constants, and folder structure already in place.

Implement Phase 1: Infrastructure & Room System. Work through these in order:

**1. Redis layer (/lib/redis.ts)**
- Create a Redis client using @vercel/kv (with @upstash/redis as documented fallback)
- Implement room CRUD operations: createRoom, getRoom, updateRoom, deleteRoom
- ALL mutations must be atomic — use optimistic locking or Lua scripts. Never do naive read → modify → write. This is a concurrent serverless environment.
- Implement PlayerSession CRUD: createSession, getSession, deleteSession
- All keys use TTL as defined in constants (ROOM_TTL_SECONDS)
- Room TTL must refresh on every mutation, heartbeat, and join/leave (Section 4.6)

**2. Pusher layer (/lib/pusher.ts)**
- Server-side Pusher client (for triggering events from API routes)
- Client-side Pusher config (exported for components to use)
- Pusher auth endpoint at /api/pusher/auth/route.ts for presence and private channels

**3. Utility functions (/lib/utils.ts)**
- Room code generator: 6-character uppercase alphanumeric, collision-checked against Redis
- UUID generator for player IDs
- Any shared helpers

**4. API Routes**
Implement all room management routes from Section 7.1:
- POST /api/rooms/create — See Section 4.1 for full flow. Generate room code, create player, fill 3 bot seats, store in Redis, return roomCode + playerId. Set playerId in httpOnly cookie.
- POST /api/rooms/join — See Section 4.2 for full flow. ATOMIC seat claim via Redis transaction. Race condition: if two players join the last seat simultaneously, only one succeeds (410 for the other). Validate room exists, status is 'waiting', bot seat available.
- POST /api/rooms/leave — See Section 4.4 for full flow. Replace player with bot. Owner transfer to next human by join order. If no humans remain, destroy room.
- GET /api/rooms/[roomCode] — Return sanitized room state (no game hands).
- POST /api/rooms/heartbeat — Update lastSeen timestamp. Trigger disconnect check for all players (mark disconnected if lastSeen > DISCONNECT_TIMEOUT_MS). Replace disconnected players with bots after BOT_REPLACEMENT_TIMEOUT_MS.

All error responses must use the standardized { error, code } shape from /lib/errors.ts. See Section 13 for all error scenarios and their HTTP status codes.

**5. Pages**
- / (Home page) — App title, two paths: "Create Room" and "Join Room". Join Room shows a text input for room code. Both flows lead to a name entry step. Keep the UI basic and functional — no styling polish yet. After name entry, call the appropriate API and redirect to /room/[roomCode].
- /room/[roomCode] (Lobby view) — Subscribe to Pusher presence channel. Display: room code with copy button, shareable URL with copy button, player list (4 slots showing human names and "Bot" for bot seats), "Start Game" button (visible only to room owner, disabled for now — Phase 2), "Leave Room" button. Wire up real-time updates: player-joined and player-left events update the player list without page refresh.
- /join/[roomCode] (Join page) — Name entry form. On submit, call join API. On success, redirect to /room/[roomCode]. On error (room full, not found, game in progress), show the error message with a "Return Home" button.

**Acceptance criteria — verify all of these work before moving on:**
- [ ] User can create a room and see a 6-character room code
- [ ] Second user can join via direct URL (/join/{code}) or by entering code on home page
- [ ] Both users see real-time player list updates (no refresh needed)
- [ ] Room shows bots in unfilled seats (e.g., "Bot Alice", "Bot Bob")
- [ ] When creator leaves, ownership transfers to next human
- [ ] Room code can be copied to clipboard
- [ ] Shareable link can be copied to clipboard
- [ ] All API errors return { error, code } format
- [ ] Invalid room codes return 404
- [ ] Joining a full room returns 410
