# My Oyster World — UI/UX Design Specification

**Platform:** myoysterworld.com  
**Type:** Multiplayer game platform (mobile-first web app)  
**Audience:** All ages / family friendly  
**Brand Vibe:** Playful & whimsical, retro/nostalgic  
**Date:** February 2026

---

## 1. Core Metaphor

The entire platform is built on a single extended metaphor drawn from the idiom *"The world is your oyster."*

| Concept | Metaphor | Usage |
|---------|----------|-------|
| The Platform / Your Account | **Your Oyster** | "Open your oyster" = log in, return home |
| Games | **Pearls** | "Pick a pearl," "New pearl dropped," "Your pearls" |
| Starting a Game | **Diving In / Cracking Open** | "Dive In" (CTA), "Crack it open" |
| Your Profile | **Your Shell** | Public-facing identity |
| Community / Social | **The Reef** | Where oysters cluster together |
| Seasons / Events | **Tides** | "The Spring Tide is here" |
| Trending / Popular | **The Current** | What the reef is playing now |
| Points / XP / Currency | **Sand** | Every pearl starts as a grain of sand |

**Metaphor Rules:**
- Oyster = account/platform, Pearl = game. **These never swap.**
- Max 1–2 ocean references per screen/section. More feels like a theme park.
- If a sentence sounds weird with ocean language, just say it normally.
- Don't name features with ocean terms until the feature actually ships.

---

## 2. The Dive Model

The user experience is structured as a **descent into the ocean**. Background gradients shift from light (surface) to dark (ocean floor) as the user progresses deeper into the app. This is the core UX concept.

### Depth Ladder

```
SURFACE ─── lightest (teal/ocean tones at top)
  │
WADING ──── one step deeper
  │
CHOOSING ── committing to a direction (host only)
  │
DESCENT ─── loading transition
  │
THE DEEP ── darkest (lobby + gameplay, unified)
  │
SURFACING ─ lightening again (post-game)
```

### Gradient Definitions

| Depth | Top Color | Bottom Color | Used For |
|-------|-----------|-------------|----------|
| Surface | `#2a8a9e` (bright teal) | `#0d1b3e` (deep navy) | Home screen |
| Wading | `#1e6e8e` (ocean blue) | `#080c1a` (near black) | Name entry, Join screen |
| Choosing | `#1a5276` (mid navy) | `#080c1a` | Pearl selection (host) |
| Descent | Radial glow from `#0d1b3e` into `#080c1a` | — | Loading transitions |
| The Deep | Flat `#080c1a` | — | Lobby + gameplay |
| Surfacing | `#1e6e8e` → `#080c1a` | Same as Wading | Post-game |

**Key rule:** Wading and Surfacing are **mirror states** — same depth, same visual treatment, opposite directions (descending vs ascending).

### Pearl Size Progression

The Pearl Globe icon shrinks and rises as the user goes deeper:

| Depth | Pearl Size | Position |
|-------|-----------|----------|
| Surface | 96px | Centered, floating animation |
| Wading / Surfacing | 64px | Centered, floating animation |
| Choosing | 48px | Centered above title, floating animation |
| Descent | 56px | Centered, pulse animation |
| The Deep | 18px | Top-left nav bar (home button) |

---

## 3. Three Brand Zones

Every screen falls into one of three brand zones:

### Full Brand Zone
- **Screens:** Home, Name Entry, Pick a Pearl, Loading, Post-Game
- **Treatment:** Pearl Globe visible, brand typography (Fredoka One headlines), brand colors, ocean gradient backgrounds, branded copy/language
- **The platform is speaking**

### Light Brand Zone
- **Screens:** Lobby, In-Game (both share the same persistent top bar)
- **Treatment:** Only the top bar carries the brand — pearl icon (tap to go home), game name, pearl badge. Everything below the bar belongs to the game or the lobby content.
- **The brand whispers, the game speaks**

### Game Zone
- **Screens:** The actual game board/play area within The Deep
- **Treatment:** No brand presence. Cards, boards, interactions are all game-specific. Each pearl (game) has its own visual personality within the play area.
- **The game owns it completely**

---

## 4. User Flows

### Host Flow (6 steps)

```
1. SURFACE — Home
   "Dive In" / "Join a Game"

2. WADING — Name Entry
   "What's your name?"
   "This is how other players will see you"
   [Name input] → [Next]

3. CHOOSING — Pick a Pearl
   Pearl cards with game icon, name, description, player count
   [Crack It Open]

4. DESCENT — Loading
   "Cracking open your pearl..."
   "{Game Name} · {N} players"

5. THE DEEP — Lobby → Gameplay (unified screen)
   Persistent bar: Pearl icon | Game Name | ✦ PEARL badge
   Lobby: Game code, teams, settings, [Start Game]
   Game starts in the same space — no transition, no loading

6. SURFACING — Post-Game
   "Pearl Played!"
   Scores → [Play Again] / [Back to Lobby] / [Leave Game]
```

### Guest Flow (5 steps)

```
1. SURFACE — Home
   "Join a Game"

2. WADING — Join (name + code combined, faster descent)
   "Join a Game"
   "Enter your name and the code you were given"
   [Name input] + [Game Code input] → [Dive In]

3. DESCENT — Loading
   "Diving in..."  (different language than host: joining, not creating)
   "Joining {Game Name}"

4. THE DEEP — Lobby (waiting) → Gameplay (unified screen)
   Same persistent bar as host
   Lobby: "Waiting for host to start..." (no Start button, no settings)
   Game starts seamlessly — same space, same bar

5. SURFACING — Post-Game
   Identical to host. Everyone surfaces together.
```

**Key differences:**
- Guest skips the Choosing (Pick a Pearl) step entirely
- Guest combines name + code on one screen (pulled down faster by the host)
- Guest loading says "Diving in..." not "Cracking open your pearl..."
- Guest lobby has no Start button and no game settings — shows waiting state
- Once in-game, host and guest experiences are identical

---

## 5. The Deep — Unified Lobby + Gameplay

This is the most important structural decision. The lobby and gameplay exist in the **same screen** with the **same persistent top bar.**

### Persistent Top Bar
```
[Pearl Icon 🔵] [Game Name          ] [✦ PEARL badge]
```
- Pearl icon: 18px, tappable, returns to home (surface)
- Game name: Baloo 2 font, truncated with ellipsis for long names
- Pearl badge: Small accent label

### Lobby State
- Game code (large, Fredoka One, letter-spaced)
- Copy invite link
- Teams grid (Team A / Team B with player cards)
- Points to Win selector (host only)
- Start Game button (host only)
- Leave Game button
- Guest sees "Waiting for host to start..." with loading dots

### Gameplay State
- Score bar appears below the top bar: `● A 0 [YOU] vs ● B 0 — to 10`
- Game area takes up the remaining space
- "Leave Game" link at bottom
- **No transition animation between lobby and gameplay** — the game starts around you

### Score Bar
```
[● A  0  YOU]  vs  [● B  0]        to 10
```
- Team A: `--shallow` (#7EB8D4)
- Team B: `--coral` (#E8A87C)
- YOU badge: Pearl Gold on dark background
- Target: Muted, right-aligned

---

## 6. Visual Design System

### Color Palette

**Primary:**
| Name | Hex | Usage |
|------|-----|-------|
| Midnight Sea | `#0D1B3E` | Deep backgrounds (60%) |
| Deep Tide | `#1A5276` | Mid-depth backgrounds |
| Pearl Gold | `#F0C27F` | Primary accent, CTAs, headlines (25%) |
| Shell Cream | `#F5E6CA` | Text on dark, headings |

**Accents (10%):**
| Name | Hex | Usage |
|------|-----|-------|
| Coral Sunset | `#E8A87C` | Team B, warm highlights |
| Sea Glass | `#6BBFA3` | Success states, positive |
| Starfish | `#C9658A` | Destructive actions, leave/delete |
| Shallow Water | `#7EB8D4` | Team A, links, cool highlights |

**Neutrals (5%):**
| Name | Hex | Usage |
|------|-----|-------|
| Ink | `#2A1F3D` | Darkest text |
| Driftwood | `#8B7355` | Shell/pearl accent tones |
| Sandy | `#D4C5A9` | Light mode backgrounds |
| Foam | `#F8F4ED` | Lightest background |

**Color hierarchy:** 60% backgrounds / 25% Pearl Gold / 10% accents / 5% neutrals.

### Typography

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Brand / Headlines | Fredoka One | Regular (only weight) | Logo, screen titles, taglines, hero text |
| Sub-headlines | Baloo 2 | 700–800 | Game names, feature titles, section heads |
| Body / UI | Quicksand | 400–700 | Body text, buttons, inputs, labels |
| Body Alt | Nunito | 400–700 | Long-form content alternative (never mix with Quicksand on same page) |

**Rules:**
- Fredoka One and Baloo 2 never appear in the same visual block
- No light/thin weights anywhere — breaks the warm rounded brand feel
- Headlines: bold/800 only. Body: 400–600.

### Buttons

| Type | Style | Usage |
|------|-------|-------|
| Primary | Pearl Gold bg, Deep text | Main CTAs: "Dive In," "Start Game," "Crack It Open" |
| Secondary | Transparent, cream border | Alternative actions: "Join a Game," "Back to Lobby" |
| Destructive | Transparent, Starfish border + text | "Leave Game" |
| Back link | Text-only, muted | "← Back" navigation |

### Inputs
- 14px padding, 12px border-radius
- 2px border, `rgba(245,230,202,.1)` default
- Focus: border shifts to `rgba(240,194,127,.3)`
- Code inputs: centered, letter-spaced (6px), uppercase, bold

---

## 7. Brand Language Quick Reference

### Primary Tagline
> **Every game is a pearl.**

### Extended Tagline
> The world is your oyster. The games are your pearls.

### Contextual Copy

| Context | Copy |
|---------|------|
| Login / Welcome Back | "Open your oyster." |
| CTA (host) | "Dive In" |
| CTA (guest) | "Dive In" |
| Game selection | "Pick a Pearl" / "Crack It Open" |
| Host loading | "Cracking open your pearl..." |
| Guest loading | "Diving in..." |
| New game launch | "We just dropped a new pearl." |
| Post-game | "Pearl Played!" / "Another pearl played. Ready for the next one?" |
| Empty state | "No pearls yet? Dive into the collection and find your first treasure." |
| Error / 404 | "Looks like this pearl rolled away. Let's get you back to the reef." |
| Game loading spinner | "Forming your pearl..." |
| Footer quip | "We make pearls faster than oysters. 🦪" |
| Invite prompt | "Share the code — the more the merrier" |

---

## 8. Logo System — Pearl Globe

The logo is an abstract pearl with subtle longitude/latitude lines suggesting a globe. The shimmer and highlights carry the identity — it reads as precious, worldly, and full of possibility without being literally geographic.

### Variations
1. **Stacked (Primary)** — Icon above wordmark. Headers, marketing, loading screens.
2. **Horizontal (Inline)** — Icon left of wordmark. Nav bars, game lobbies.
3. **Icon Only** — Pearl globe alone. Social avatars, watermarks, favicons.
4. **Light Background** — Inverted for print, light-mode, merchandise.
5. **Minimal Line Mark** — Single-color outline. Embossing, monochrome.
6. **Badge / Stamp** — Circular treatment with URL. Stickers, "powered by."

### Favicon
Recommended: Pearl on Deep Tide (`#1A5276`) rounded-square background. Strong presence in browser tabs.

---

## 9. Key Design Decisions Log

1. **Depth = visual treatment.** Same depth always means same pearl size, same font, same color weight, regardless of the screen's purpose.
2. **Wading and Surfacing are mirrors.** Same visual treatment, opposite emotional direction.
3. **Lobby and gameplay are one screen.** Same top bar, same depth, no loading transition between them. The game starts around you.
4. **Guest descent is faster.** Fewer steps, combined screens. They're being pulled down by the host.
5. **The pearl shrinks as you descend.** 96px → 64px → 48px → 18px (nav icon). Like watching the surface light recede above you.
6. **The game owns its own space.** No ocean language forced onto game mechanics. The brand frames the experience but doesn't intrude on gameplay.
7. **"World" terminology removed from game context.** "Leave World" → "Leave Game." "World Code" → "Game Code." "World" in the brand name means the platform, not a game session.
8. **No loading screen between lobby and gameplay.** The game starts seamlessly within The Deep.

---

*Reference artifacts: Brand Toolkit v2, Dive Flow v2*
