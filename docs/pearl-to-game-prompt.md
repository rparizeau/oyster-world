# Task: Replace pearl-as-game language with plain game language

We're shifting the "pearl" metaphor away from referring to games. Pearls will eventually become a reward currency (earned by winning, high scores, etc.), but for now we just need to remove all references to games being pearls.

## Load these docs first
- `docs/platform/ARCHITECTURE.md`
- `docs/platform/DESIGN_SYSTEM.md`

## Specific copy changes

All of these are in `src/app/page.tsx` (the home/game selection screen):

| Location | Old copy | New copy |
|----------|----------|----------|
| Tagline (home screen) | Every game is a pearl | Your world, your games |
| Game selection screen title | Pick a Pearl | Choose your Game |
| Game selection screen subtitle | Each game is a treasure | Invite your friends to play! |
| Game card badge | `✦ PEARL` badge | Remove entirely (delete the badge element) |
| CTA button (game selected) | Crack It Open | Let's Go! |
| Loading screen text | Cracking open your pearl... | Getting things ready... |

## What NOT to change
- **PearlGlobe component** — keep as-is, it's the brand icon not a game reference
- **"Pearl" in CSS class names** (e.g. `text-pearl`, `bg-pearl`, `--pearl`) — these are color tokens, not game references
- **Pearl carousel** — the component name can stay, it's an internal implementation detail. But if there are any user-facing strings in the carousel code that say "pearl" meaning "game", update those too.
- **Design system / brand colors** — no changes
- **DeepBar, lobby, or game views** — no changes expected, but grep for any "pearl" strings that refer to games and flag them

## How to verify
1. `grep -rn "pearl" src/app/page.tsx` — should only return color tokens and PearlGlobe references, not game-related copy
2. Run the app and click through: Home → game selection → pick a game → loading screen. Confirm no "pearl = game" language remains.
