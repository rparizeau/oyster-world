# My Oyster World — Claude CLI Build Handoff

## What This Is

This document packages a complete UI/UX redesign for myoysterworld.com — a multiplayer game platform. The redesign introduces a new brand identity, a "dive" depth-based navigation model, and a persistent lobby architecture. The existing game logic for each game (Euchre, Connect 4, Terrible People, etc.) should remain unchanged — the games just need to sit on the new visual foundation.

---

## Step 1: Feed Claude CLI These Files

Give Claude CLI the following context in this order:

### 1. The UX Specification (text)
Copy the full contents of the **"My Oyster World — UI/UX Design Specification"** document. This is the authoritative reference for all design decisions, the depth model, color system, typography, user flows, and brand rules.

### 2. The Interactive Mockup (HTML)
Save the **"My Oyster World — Dive Flow v4 (Interactive)"** artifact as an HTML file. This is a fully clickable prototype showing both host and guest flows across all screens. Tell Claude CLI:

> "This HTML file is the design target. It shows every screen state, every transition, and the exact visual treatment for each depth level. Match this as closely as possible."

### 3. Your Existing Codebase
Point Claude CLI at your project directory. It needs to understand:
- Your current routing/navigation structure
- How game state is managed (WebSocket? Polling? What server framework?)
- Your current component structure
- Where game-specific code lives vs platform code

---

## Step 2: The Prompt

Here's a prompt template to give Claude CLI. Customize the technical details in brackets:

```
I'm redesigning myoysterworld.com — a multiplayer game platform. I have a complete 
UX specification and interactive HTML mockup that define the target design.

## Context Files
- UX Spec: [path to spec markdown]
- Design Mockup: [path to HTML mockup file] — open this to see every screen state
- Current codebase: [path to project root]

## What Needs to Change

### Visual Layer (everything changes)
- New color system based on ocean depth gradients (see spec for exact hex values)
- New typography: Fredoka One (headlines), Baloo 2 (sub-headlines), Quicksand (body)
- Background gradients shift from light to dark as user goes deeper into the app
- Pearl Globe icon at various sizes acts as brand anchor across screens
- All purple (#a855f7) elements replaced with Pearl Gold (#F0C27F)
- Dark backgrounds shift from flat black to navy depth gradients

### Navigation / Screen Structure (significant changes)
The app follows a "dive" model with these depth levels:

1. SURFACE (Home) — lightest gradient, 96px pearl centered
2. WADING (Name entry / Join) — mid gradient, 64px pearl
3. CHOOSING (Pick a Pearl — host only) — deeper gradient, 48px pearl
4. DESCENT (Loading transition) — deep, pulsing pearl animation
5. THE DEEP (Lobby + Gameplay) — darkest, 18px pearl in persistent top bar
6. SURFACING (Post-game) — gradient lightens back up, 64px pearl

Key structural changes:
- Lobby and gameplay share the same screen with a persistent top bar
- Top bar: [Pearl icon → home] [Game name] [Lobby button → return to lobby mid-game]
- No loading screen between lobby and gameplay — game starts in place
- "World" terminology replaced with "Game" (Leave Game, Game Code, etc.)
- Guest flow is shorter: Home → Join (name+code combined) → Descent → The Deep

### Persistent Lobby Architecture (new feature)
The lobby stays alive during gameplay:
- Players can tap "Lobby" in the top bar to return to lobby without leaving
- A bot takes over their seat, they keep their player ID
- Lobby shows "Game in progress · [Player]'s turn" banner
- "Join Game" button (solid gold) to re-enter, "Leave Game" below it
- Player cards show "IN LOBBY · BOT COVERING" for absent players (dashed border, faded)
- New players joining mid-game take over the next available bot seat
- Active players returning to lobby keep their original seat assignment

### Game Area (minimal changes)
- Each game's play area stays the same functionally
- Game backgrounds change from flat black (#000) to The Deep color (#080c1a)
- Game top bar (score strip) gets the new persistent bar treatment
- Card backs and UI elements should feel cohesive with the new palette but 
  game-specific visuals can keep their personality

## Implementation Approach

Please analyze my current codebase first, then propose a migration plan before 
making changes. I'd suggest:

1. Start with the shared design system (colors, fonts, buttons, inputs)
2. Build the persistent top bar component
3. Refactor navigation to follow the depth model
4. Update each screen in order: Home → Name → Pick Pearl → Lobby → Game wrapper
5. Implement the persistent lobby state management
6. Update game-specific wrappers (background color, top bar integration)
7. Test both host and guest flows end-to-end

Do NOT change game logic, game state management, or multiplayer sync code.
Only change the visual layer and navigation structure around the games.
```

---

## Step 3: Key Technical Decisions for Claude CLI

Things you should tell Claude CLI about your stack so it makes the right choices:

### Questions to answer before starting:
1. **Framework:** What's the frontend built with? (React? Next.js? Vanilla JS?)
2. **Styling:** How are styles managed? (CSS modules? Tailwind? Styled-components?)
3. **Routing:** How does navigation work? (React Router? File-based? Hash routing?)
4. **State management:** How is game state shared? (Context? Redux? WebSocket messages?)
5. **Fonts:** Are Google Fonts already loaded, or do they need to be added?
6. **Deployment:** How does the app deploy? (Vercel? AWS? Docker?)

### Suggested CSS custom properties to establish first:
```css
:root {
  /* Depth gradients */
  --surface: #2a8a9e;
  --shallows: #1e6e8e;
  --mid: #1a5276;
  --deep: #0d1b3e;
  --abyss: #080c1a;

  /* Brand colors */
  --pearl: #f0c27f;
  --cream: #f5e6ca;
  --coral: #e8a87c;
  --glass: #6bbfa3;
  --star: #c9658a;
  --shallow-water: #7eb8d4;

  /* Neutrals */
  --ink: #2a1f3d;
  --drift: #8B7355;
  --sandy: #d4c5a9;
  --foam: #f8f4ed;
}
```

---

## Step 4: Validation Checklist

After Claude CLI builds each screen, verify:

- [ ] Background gradient matches the correct depth level
- [ ] Pearl icon is the correct size for that depth
- [ ] Fredoka One is used for headlines (not Baloo 2 or Quicksand)
- [ ] Pearl Gold (#F0C27F) is the primary accent, not purple
- [ ] Buttons follow the hierarchy: Primary (gold) → Secondary (cream outline) → Destructive (pink, bottom only)
- [ ] No red/destructive colors in the persistent top bar
- [ ] "Lobby" button appears during gameplay, hidden during pre-game
- [ ] Pearl icon in top bar navigates to home
- [ ] Guest flow skips the Pick a Pearl screen
- [ ] Guest join screen combines name + code on one screen
- [ ] Loading screen auto-advances (host: "Cracking open your pearl..." / guest: "Diving in...")
- [ ] Game area background is #080c1a, not pure black
- [ ] Existing game logic is completely untouched

---

## Reference Artifacts

These artifacts contain the full visual detail:

1. **Brand Toolkit v2** — Logo system, color palette, typography, brand guidelines, tagline system, metaphor map, copy examples
2. **Dive Flow v4** — Interactive clickable prototype of all screens for both host and guest flows, including persistent lobby states
3. **UI/UX Design Specification** — Complete written spec covering depth model, three brand zones, user flows, color system, typography rules, and design decision log

All three should be provided to Claude CLI for maximum context.
