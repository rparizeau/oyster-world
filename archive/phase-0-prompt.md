Read SPEC.md — this is the full technical specification for a real-time multiplayer card game called "Terrible People."

Initialize the project:

1. Create a new Next.js 14+ project with App Router, TypeScript (strict mode), and Tailwind CSS
2. Install dependencies: pusher, pusher-js, @vercel/kv (or @upstash/redis as fallback)
3. Create the full project folder structure as defined in Section 12 of the spec — create all directories and empty placeholder files so the structure is in place
4. Create /lib/constants.ts with all constants from Section 12.1
5. Create /lib/types.ts with all TypeScript interfaces from Section 3 (Room, Player, GameState, BlackCard, WhiteCard, PlayerSession, ApiError)
6. Create /lib/errors.ts with a helper function that returns standardized error responses matching the ApiError interface from Section 12.2
7. Create a .env.local.example file with all environment variables from Section 11 (with empty values)
8. Create a minimal /data/cards.json with 5 black cards (mix of pick-1 and pick-2) and 20 white cards for early testing

Do NOT implement any API routes, pages, or game logic yet. This is scaffolding only.
