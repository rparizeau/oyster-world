# Oyster World — Design System Reference

> Extracted from actual component code (Feb 2026). Written for Claude as the audience.
> Concrete values, actual classes, specific examples. No abstract design language.
>
> **Game-specific visual styles**: see `docs/games/{game-id}.md` §11 for each game's styles.

---

## 1. Color Palette

### CSS Custom Properties (`:root` in `src/app/globals.css`)

**Depth Gradients** — background progression from light (surface) to dark (gameplay):
| Token | Hex | Usage |
|-------|-----|-------|
| `--depth-surface` | `#2a8a9e` | Home screen (brightest) |
| `--depth-shallows` | `#1e6e8e` | Name entry, join screen |
| `--depth-mid` / `--surface-light` | `#1a5276` | Mid-depth, panels |
| `--depth-deep` / `--surface` | `#0d1b3e` | Deep backgrounds, cards |
| `--depth-abyss` / `--background` | `#080c1a` | Lobby + gameplay (darkest) |

**Brand:**
| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `--pearl` | `#f0c27f` | `text-pearl`, `bg-pearl`, `text-accent`, `bg-accent` | Primary accent, CTAs, headlines, highlights |
| `--cream` | `#f5e6ca` | `text-cream`, `text-foreground` | Primary text on dark |
| `--coral` | `#e8a87c` | `text-coral` | Team B identity, warm highlights |
| `--glass` | `#6bbfa3` | `text-glass`, `text-success`, `bg-success` | Success, active/interactive states |
| `--star` | `#c9658a` | `text-star`, `text-danger`, `bg-danger` | Destructive actions, errors |
| `--shallow-water` | `#7eb8d4` | `text-shallow-water` | Team A identity, links, cool highlights |

**Mapped Tokens (most commonly used in components):**
| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `--accent-hover` | `#f5d08f` | `text-accent-hover` | Pearl hover state |
| `--warning` | `#f59e0b` | `text-warning`, `bg-warning` | Reconnection banner |
| `--muted` | `#8b7355` | `text-muted` | Secondary text |
| `--border` | `rgba(245,230,202,.1)` | `border-border` | Default borders |
| `--border-light` | `rgba(245,230,202,.15)` | `border-border-light` | Lighter borders |

**No purple anywhere.** Old `#8b5cf6` fully replaced with pearl gold.

### Team Colors (Platform Tokens)

These are platform-level CSS custom properties reusable by any team-based game:
| Team | Color Variable | Hex | Used In |
|------|---------------|-----|---------|
| Team A | `var(--shallow-water)` | `#7eb8d4` | Scoreboard, name tags, team assignment, lobby |
| Team B | `var(--coral)` | `#e8a87c` | Scoreboard, name tags, team assignment, lobby |

Game-specific player colors (e.g., Take 4's red/yellow) live in per-game docs.

### Muted Text Opacity Scale (as used in code)

Muted text uses `rgba(232,230,240, opacity)` at varying levels:
| Opacity | Usage |
|---------|-------|
| `.45` | Subtitles (join page, wading screens) |
| `.35` | Secondary labels, score text |
| `.25` | Tertiary text, back links, placeholder-like |
| `.2` | Faint hints, lobby footnotes |
| `.18` | Footer quips, barely visible hints |

**Color Hierarchy Rule:** 60% backgrounds / 25% pearl gold / 10% accents / 5% neutrals.

---

## 2. Typography

### Font Stack

Loaded in `src/app/layout.tsx` via Next.js font system:

| Role | Font | CSS Variable | Tailwind | Weights | Usage |
|------|------|-------------|----------|---------|-------|
| Headlines | Fredoka One | `--font-display` | `font-display` | 700 only | Screen titles, game codes, hero text |
| Sub-headlines | Baloo 2 | `--font-sub` | `font-sub` | 500-800 | Game names (DeepBar, carousel), section heads |
| Body / UI | Quicksand | `--font-body` | `font-body` | 400-700 | Body text, buttons, inputs, labels (default) |

`body` default: `font-family: var(--font-quicksand), system-ui, -apple-system, sans-serif`

### Type Scale (as used across components)

| Context | Size | Weight | Font |
|---------|------|--------|------|
| Home title | `text-[2em]` | bold | Fredoka |
| Screen titles (wading) | `text-[1.7em]` | bold | Fredoka |
| Pearl selection title | `text-[1.5em]` | bold | Fredoka |
| Loading title | `text-[1.3em]` | bold | Fredoka |
| Game code display | `text-[2.2em]` + `tracking-[6px]` | bold | Fredoka |
| Game name (DeepBar) | `0.92em` | — | Baloo 2 |
| Game name (carousel) | `1.05em` | — | Baloo 2 |
| Scoreboard scores | `text-2xl` | `font-bold` | — |
| Body / status text | `text-sm` | `font-semibold` | — |
| Labels / badges | `text-xs` / `text-[0.62em]` | `font-bold` | — |
| Carousel description | `0.72em` | — | — |
| Footer quip | `text-[0.65em]` | 600 | — |

### Rules
- Fredoka One and Baloo 2 never in the same visual block
- No light/thin weights — breaks the warm rounded brand feel
- Headlines: bold only. Body: 400-600.

---

## 3. Depth Gradient Backgrounds

The ocean-depth metaphor — screens darken as users go deeper:

```css
.bg-depth-surface   → linear-gradient(180deg, #2a8a9e, #1e6e8e 40%, #1a5276 75%, #0d1b3e)
.bg-depth-wading    → linear-gradient(180deg, #1e6e8e, #1a5276 40%, #0d1b3e 85%, #080c1a)
.bg-depth-choosing  → linear-gradient(180deg, #1a5276, #0d1b3e 50%, #080c1a)
.bg-depth-descent   → radial-gradient(ellipse at 50% 30%, rgba(13,27,62,.6), #080c1a)
.bg-depth-deep      → flat #080c1a
.bg-depth-surfacing → same as wading (mirror state)
```

| Depth | Screens | Pearl Size |
|-------|---------|-----------|
| Surface | Home | 96px, float animation |
| Wading | Name entry, Join | 64px, float animation |
| Choosing | Pearl selection | 48px, float animation |
| Descent | Loading | 56px, pulse animation |
| Deep | Lobby + gameplay | 18px in DeepBar |
| Surfacing | Post-game | 64px (mirrors wading) |

---

## 4. Buttons

### Brand Button Tokens (globals.css)

**`.btn-primary`** — Pearl Gold, main CTAs:
```css
background: var(--pearl);  color: var(--depth-deep);
font-weight: 700;  padding: 14px;  border-radius: 12px;  width: 100%;
/* Hover: bg #f5d08f, translateY(-1px) */
/* Active: scale(0.98) */
/* Disabled: opacity 0.5, cursor not-allowed */
```
Used for: "Dive In", "Start Game", "Crack It Open", "Next"

**`.btn-secondary`** — Outline:
```css
background: transparent;  border: 2px solid rgba(245,230,202,.15);  color: var(--cream);
/* Hover: border-color rgba(245,230,202,.35) */
```
Used for: "Join a Game", "Back to Lobby"

**`.btn-danger`** — Starfish:
```css
background: transparent;  border: 1.5px solid rgba(201,101,138,.18);  color: var(--star);
font-size: 0.85em;
/* Hover: border brighter, faint bg tint */
```
Used for: "Leave Game"

### In-Game Action Buttons (Tailwind, not token classes)

Game views use Tailwind directly for action buttons:
```
Emerald primary: bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-full px-6 py-2 min-h-[44px]
Gray secondary:  bg-gray-700 hover:bg-gray-600 text-white rounded-full px-6 min-h-[44px]
```

---

## 5. Inputs

**`.input-ocean`** — Standard text input:
```css
padding: 14px 18px;  border-radius: 12px;
border: 2px solid rgba(245,230,202,.1);  background: rgba(255,255,255,.04);
color: var(--cream);
/* Focus: border rgba(240,194,127,.3), bg rgba(255,255,255,.06) */
/* Placeholder: rgba(232,230,240,.25) */
```

**`.input-ocean-code`** — Game code entry (add to `.input-ocean`):
```css
text-align: center;  letter-spacing: 6px;  font-weight: 700;
font-size: 1.1em;  text-transform: uppercase;
```

---

## 6. Component Patterns

### PearlGlobe (`src/components/PearlGlobe.tsx`)

SVG pearl with radial gradient (`#fff` → `#f5ece2` → `#ead8c0` → `#bfab8e`).

| Size | Features | Animation |
|------|----------|-----------|
| 96px | Outer glow + globe lines + sparkle | `float` / `pulse` / `none` |
| 64px | Highlight + sparkle | `float` |
| 56px | Highlight + sparkle | `pulse` |
| 48px | Highlight + sparkle | `float` |
| 30px | Highlight only | — |
| 18px | Minimal (DeepBar) | — |

Drop shadow when animated: `drop-shadow(0 8px 24px rgba(240,194,127,.15))`

### DeepBar (`src/components/DeepBar.tsx`)

```
[Pearl 18px → home]  [Game Name (Baloo 2)]  [Action Button]
```
- Background: `rgba(13,27,62,.5)` with `border-bottom: 1px solid rgba(255,255,255,.04)`
- Home button: `w-[30px] h-[30px] rounded-full`, bg `rgba(240,194,127,.06)`, border `1.5px solid rgba(240,194,127,.1)`
- Game name: `font-sub text-cream flex-1 ml-2.5 truncate`, `fontSize: 0.92em`
- Action button: `text-pearl`, `fontSize: 0.7em`, `fontWeight: 700`, `padding: 6px 14px`, `borderRadius: 8px`, border `1.5px solid rgba(240,194,127,.3)`
- When no action: invisible spacer `w-[60px]` preserves layout

### ScoreBar (`src/app/room/[roomCode]/components/ScoreBar.tsx`)

Single-row inline bar (used on room page above Who's Deal game view):
- Background: `rgba(240,194,127,.04)` with `border-bottom: 1px solid rgba(240,194,127,.06)`
- Layout: `flex items-center justify-center gap-3 px-4 py-2.5 text-[0.8em] font-bold`
- Team A score: `color: var(--shallow-water)`, Team B: `color: var(--coral)`
- "YOU" badge: `text-[0.55em] bg pearl/10 text-pearl px-1.5 py-0.5 rounded ml-1`
- Target: `text-[0.65em]` muted, right-aligned with `ml-auto`

### PlayerCard (`src/app/room/[roomCode]/components/PlayerCard.tsx`)

- Container: `flex items-center gap-2 rounded-[10px] px-2.5 py-2.5`
- Background: `rgba(126,184,212,.05)`, border: `1.5px solid rgba(126,184,212,.1)`
- Avatar: `w-7 h-7 rounded-lg`, human bg `rgba(126,184,212,.2)`, bot bg `rgba(255,255,255,.06)`
- Name: `text-[0.82em] font-bold text-cream` (bots: `text-cream/60`)
- Labels: `text-[0.55em] uppercase tracking-[1px] font-bold`
  - OWNER: `color: var(--pearl)`
  - BOT: muted color
  - DISCONNECTED: `text-danger`
- Opacity: disconnected human = `opacity-40`, bot = `opacity-45`
- Staggered entrance: `animationDelay: ${index * 50}ms`

### Toast (`src/app/room/[roomCode]/components/ToastContainer.tsx`)

- Position: `fixed top-4 left-1/2 -translate-x-1/2 z-50`
- Stack: `flex flex-col gap-2`, container `pointer-events-none`, toasts `pointer-events-auto`
- Style: `px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-sm text-sm font-medium`
- Types:
  - Success: `bg-success/90 text-white`
  - Warning: `bg-warning/90 text-black`
  - Default: `bg-surface-light/90 text-foreground border border-border`
- Animation: `.toast-enter` → `fade-in-down 0.3s ease-out`

### ConnectionBanner (`src/app/room/[roomCode]/components/ConnectionBanner.tsx`)

- Position: `fixed top-0 left-0 right-0 z-40 py-2 px-4 text-center`
- Reconnecting: `bg-warning/90 text-black`
- Disconnected: `bg-danger/90 text-white`
- SVG spinner: `animate-spin h-4 w-4`
- Entry: `animate-fade-in-down`

### Loading Skeleton

```css
.skeleton {
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-light) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 8px;
}
```

---

## 7. Animations

### Defined in globals.css (`@keyframes` + `@theme inline`):

| Animation | Tailwind | Duration | Easing | Usage |
|-----------|----------|----------|--------|-------|
| `fade-in` | `animate-fade-in` | 0.3s | ease-out | General page entrance |
| `fade-in-up` | `animate-fade-in-up` | 0.4s | ease-out | Content from below |
| `fade-in-down` | `animate-fade-in-down` | 0.3s | ease-out | Toasts, banners |
| `slide-up` | `animate-slide-up` | 0.3s | ease-out | Bottom sheets |
| `scale-in` | `animate-scale-in` | 0.2s | ease-out | Elements popping in |
| `pulse-soft` | `animate-pulse-soft` | 2s infinite | ease-in-out | Subtle breathing |
| `card-deal` | `animate-card-deal` | 0.3s | ease-out | Cards being dealt |
| `card-select` | `animate-card-select` | 0.15s | ease-out | Card tap feedback |
| `winner-reveal` | `animate-winner-reveal` | 0.5s | ease-out | Winner announcement |
| `bounce-in` | `animate-bounce-in` | 0.4s | ease-out | Playful entry |
| `shimmer` | `animate-shimmer` | 1.5s infinite | ease-in-out | Skeleton loading |
| `float` | `animate-float` | 4s infinite | ease-in-out | Pearl globe bobbing |
| `pearl-pulse` | `animate-pearl-pulse` | 2s infinite | ease-in-out | Pearl globe breathing |

### Game-specific (CSS only, no Tailwind class):
- `bubble-rise` — decorative bubbles, randomized 6-18s duration
- `dot-pulse` — loading dots, 1.4s staggered
- `c4-glow` — winning cell scale 1→1.08 (see `docs/games/4-kate.md`)
- `c4-drop` — piece drop with bounce (see `docs/games/4-kate.md`)
- `pearl-shimmer` — brightness 1→1.2→1

### Motion Conventions
- **Page entrances**: `fade-in` 0.3s
- **Interactive feedback**: `scale(0.98)` on press, `translateY(-1px)` on hover
- **Carousel**: `cubic-bezier(.25,.85,.35,1)` over 0.4s
- **General transitions**: `transition: all 0.2s` or Tailwind `transition`

---

## 8. Pearl Carousel

Game selection screen (home → "Dive In" → pearl picking):

- **3 copies** of pearl array for infinite wrap illusion
- **Snap threshold**: 20% of card width
- **Transition**: `cubic-bezier(.25,.85,.35,1)` 0.4s
- **Card width**: 88% of CTA button width

**Card states:**
| Position | Opacity | Scale | Border |
|----------|---------|-------|--------|
| Centered | 1.0 | 1.0 | `2px solid rgba(255,255,255,.12)`, bg `rgba(255,255,255,.05)` |
| Near (+-1) | 0.6 | 0.95 | `2px solid rgba(255,255,255,.06)`, bg `rgba(255,255,255,.03)` |
| Far | 0.45 | 0.92 | Same as near |

**Card structure**: `borderRadius: 18px`, `padding: 18px 18px 20px`, `backdrop-filter: blur(4px)`
- Header: icon (2em) + title (Baloo 2, 1.05em) + badges row
- Pearl badge: `✦ PEARL` in `bg rgba(240,194,127,.1) text-pearl text-[0.5em]`
- Player count: `bg rgba(126,184,212,.1) text-shallow-water text-[0.62em]`
- Description: `0.72em` muted text

**Indicator dots:**
- Active: Pearl Gold `#F0C27F`, pill `width: 18px`, `borderRadius: 3px`
- Inactive: `rgba(245,230,202,.12)`, circle `6px`

---

## 9. Layout Patterns

### Page Structure (The Deep)

```
┌─────────────────────────┐
│ DeepBar (persistent)    │  Pearl → home | Game Name | Action
├─────────────────────────┤
│ ScoreBar (if game)      │  Team scores (Who's Deal only)
├─────────────────────────┤
│                         │
│ Game View (flex-1)      │  Game-specific content
│                         │
├─────────────────────────┤
│ ConnectionBanner (z-40) │  Fixed top, shown on disconnect
│ ToastContainer (z-50)   │  Fixed top-center, notification stack
└─────────────────────────┘
```

### Container Pattern

All game views: `flex flex-col max-w-lg mx-auto w-full` (max-width ~32rem, centered)
All brand screens: `flex min-h-dvh flex-col items-center justify-center p-6`

### Mobile-First

- Minimum viewport: 375px
- All interactive elements: `min-h-[44px]` tap targets
- `overflow-x-hidden` on game view containers
- Player names: `truncate` + `max-w-[80px]`
- Card hands: `overflow-x-auto flex-nowrap` for horizontal scroll

### Spacing Scale (as used)

| Level | Values | Context |
|-------|--------|---------|
| Macro | `p-6`, `gap-6`, `mb-8` | Page-level spacing |
| Meso | `p-4`, `gap-3`, `mb-4` | Component-level |
| Micro | `px-2.5`, `gap-1.5`, `py-2` | Sub-component |

---

## 10. Border Radius Strategy

| Context | Value | Tailwind |
|---------|-------|----------|
| Brand buttons / inputs | 12px | `rounded-xl` or inline |
| Game action buttons | pill | `rounded-full` |
| Carousel cards | 18px | inline |
| Player cards / team assignment | 10px | `rounded-[10px]` |
| Playing cards (face-up/down) | 8px | `rounded-lg` |
| Badges / tags | 6px | `rounded-md` or inline |
| Toasts | — | `rounded-xl` |
| Modals / panels | — | `rounded-2xl` |
| Circles (avatars, dots, chips) | 50% | `rounded-full` |

---

## 11. Known Inconsistencies

These are places where similar elements use different styles — signs of drift between sessions:

1. **Muted text opacity**: `rgba(232,230,240)` used with `.45`, `.35`, `.3`, `.25`, `.2`, `.18` interchangeably. No semantic naming. Consider defining 3-4 named opacity tiers.

2. **CSS variables vs Tailwind classes**: Heavy mixing. Example: `border-accent` (Tailwind) vs `border: '2px solid var(--pearl)'` (inline) for same effect.

3. **Border radius drift**: Player cards use `rounded-[10px]`, lobby score buttons use `rounded-lg` (8px), game buttons use `rounded-full`, brand buttons use `12px`.

4. **Shadow values**: Card selection shadows use `.3`, `.2`, `.15` opacity for similar purposes. No consistent shadow scale.

5. **Button styling systems**: Brand screens use `.btn-primary` / `.btn-secondary` / `.btn-danger` (globals.css). Game views use raw Tailwind (`bg-emerald-500 rounded-full`). Two different systems coexist.

6. **Active player indicator**: Who's Deal uses `ring-1 ring-glass/40` + teal bg. Terrible People uses `border-accent/50 bg-accent/5`. Different color semantics for the same concept.

7. **Scoreboard location**: Who's Deal has TWO scoreboards — `ScoreBar` in page.tsx (pearl gold) AND two-row scoreboard inside `WhosDealGameView` (gray). These overlap.

---

## 12. Gaps to Define

1. **No disabled button style for game actions** — Brand buttons have `disabled:opacity-50` but in-game emerald/gray buttons have no defined disabled state.
2. **No loading spinner on game actions** — Only Terrible People's submit has inline SVG spinner.
3. **No error display for game actions** — Failed actions silently fail.
4. **No card transition animations** — Cards appear/disappear instantly.
5. **No turn timer visualization** — Bot delays invisible to user.
6. **No reconnection recovery UI** — No "here's what happened" catch-up screen.
7. **No focus/keyboard states** — No visible focus rings or keyboard navigation. Accessibility gap.
8. **No "rules" or "how to play" overlay**.
9. **No sound design**.
10. **Persistent lobby not built** — Designed in prototype, not implemented.
11. **Surfacing screen not built** — Post-game "Pearl Played!" screen designed but not implemented.
