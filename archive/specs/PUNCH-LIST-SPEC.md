# Session 2 Design Specification — Who's Deal? Visual Overhaul

## Purpose

This document is the definitive design reference for the Who's Deal? visual overhaul. It supplements `tweak-session-2-prompt.md` with exact implementation details derived from a QA audit of the current build against the original spec.

Prompt files (`tweak-session-2-batch-1.md` and `tweak-session-2-batch-2.md`) reference this spec. Read this file first.

---

## 1. Core Design Principles

These three rules apply to EVERY component. Violations are bugs.

1. **No jank** — Every element that can appear/disappear must have its space pre-allocated. When a badge, label, or indicator is hidden, the reserved space remains — it just renders invisible. Nothing pushes, wraps, or jumps.

2. **No ghost gaps** — Reserved space must feel intentional when empty, not like something is missing. The layout should look complete in every state.

3. **No wrapping text** — Labels, names, and badges must never wrap to a second line. Truncate with ellipsis if needed.

---

## 2. Color System

| Token | Usage | Value |
|---|---|---|
| Base background | Page / game view | `bg-gray-950` |
| Top bars | Scoreboard rows | `bg-gray-900` |
| Team A identity | Names, dots, scores | blue-300 (text), blue-400 (scores/counts) |
| Team B identity | Names, dots, scores | orange-300 (text), orange-400 (scores/counts) |
| Active player | Ring + background on name tag | emerald-500/40 ring, emerald-500/20 bg |
| Dealer chip | Gold circle | amber-500 bg, amber-300 border, amber glow shadow |
| Trick area felt | Center circle | emerald-950/30 bg, emerald-900/20 border |
| Winning card glow | Trick result | emerald-400 ring, emerald shadow |
| Selected card | Your hand | yellow-400 border, yellow shadow |
| Playable card | Your hand (can play) | Full opacity |
| Unplayable card | Your hand (can't follow suit) | opacity-40 |
| Red suits (♥♦) | Card rank / suit text | red-600 rank, red-500 suit |
| Black suits (♠♣) | Card rank / suit text | gray-900 rank, gray-700 suit |
| Human name tag | Player seat | bg-gray-700/60, border-gray-600/50, text-white font-semibold |
| Bot name tag | Player seat | bg-gray-800/30, border-gray-800/50, text-gray-500 |

---

## 3. Scoreboard (Top Bar)

Two-row fixed header. Both rows always render at their fixed heights.

### Row 1 — Scores & Trump (h-14)
```
[●] TeamName  Score   vs   [●] TeamName  Score        [♦] CallerName
 ^blue-300  ^blue-400  ^gray-500 ^orange-300 ^orange-400   ^suit-color ^gray-400
```

- Container: `h-14 bg-gray-900 px-4 flex items-center justify-between`
- Left side: colored dot (w-2 h-2 rounded-full), team name (text-sm, truncate), score (text-2xl font-bold), "vs" (text-gray-500 text-sm)
- Right side: Trump suit symbol (text-2xl, ring-1 in suit color), caller name (text-gray-400 text-sm)
- **NO "Trump" label text** — just the suit icon and caller name
- Use custom team names from game state, fall back to "Team A" / "Team B"

### Row 2 — Trick Count & Info (h-7)
```
Tricks 2 - 1  Trick 3 of 5                    Playing to 10 • Rd 7
       ^blue ^orange   ^gray-500                ^gray-500      ^gray-500
```

- Container: `h-7 bg-gray-900 border-b border-gray-800 px-4 flex items-center justify-between text-xs`
- Left: "Tricks" gray-500, A count blue-400, "-" gray-500, B count orange-400, "Trick X of 5" gray-500
- Right: "Playing to {target}" gray-500, bullet, "Rd {roundsPlayed}" gray-500

---

## 4. Player Seat Structure

Every seat (top/partner, left, right, bottom/you) uses an identical fixed-height vertical stack. Every row always renders at its fixed height regardless of content.

```
┌─────────────────────┐
│  [D] ← dealer chip  │  h-6  (absolute, overlaps name tag top-left)
│  ┌───────────────┐  │
│  │ Name    [YOU] │  │  h-7  name tag (rounded-full pill)
│  └───────────────┘  │
│      [✓ WON]        │  h-6  badge row (or invisible placeholder)
│   [🂠][🂠][🂠][🂠][🂠]   │  h-14 cards row
│     Thinking...      │  h-5  status row (or invisible placeholder)
└─────────────────────┘
```

### 4.1 Dealer Chip (h-6)
- **Is dealer**: `absolute -top-1 -left-1 z-10 w-6 h-6 bg-amber-500 border-2 border-amber-300 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(245,158,11,0.4)]` — contains `<span className="text-black text-xs font-bold">D</span>`
- **Not dealer**: `w-6 h-6 opacity-0` — same dimensions, invisible, space reserved

### 4.2 Name Tag (h-7)
- Base: `h-7 rounded-full px-3 flex items-center gap-1.5 text-sm truncate`
- **Human**: `bg-gray-700/60 border border-gray-600/50 text-white font-semibold`
- **Bot**: `bg-gray-800/30 border border-gray-800/50 text-gray-500`
- **Active turn** (add to existing): `ring-1 ring-emerald-500/40 bg-emerald-500/20`
- **"YOU" badge** (current player only): `<span className="bg-blue-500/80 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-1">YOU</span>`
- **No "(Bot)" text** — remove all "(Bot)" labels. Strip "Bot " prefix from names (e.g., "Bot Alice" → "Alice"). Dimmed styling is the differentiator.

### 4.3 Badge Row (h-6)
- Container: `h-6 flex items-center justify-center`
- **"✓ WON"**: `bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full`
- **"ALONE"**: `bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full`
- **Empty**: `<div className="h-6" />` — always rendered
- **No "MAKER" or "CALLED" badges** — remove if they exist. Caller info is in the scoreboard only.

### 4.4 Cards Row (h-14)
- Container: `h-14 flex items-center justify-center gap-1`
- Opponents/partner: face-down cards
- Going Alone inactive partner: `<span className="text-gray-600 text-xs italic">Sitting out</span>`
- Your seat: face-up interactive cards (see Section 7)

### 4.5 Status Row (h-5)
- Container: `h-5 flex items-center justify-center`
- **Thinking**: `<span className="text-gray-500 text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-pulse" />Thinking...</span>`
- **Empty**: `<div className="h-5" />` — always rendered

---

## 5. Trick Area (Center)

- Circle container: `w-48 h-48 rounded-full bg-emerald-950/30 border border-emerald-900/20 relative`
- Responsive: `w-36 h-36 sm:w-48 sm:h-48`
- 4 card positions: absolute within the circle (top-center, left-center, right-center, bottom-center)
- Each position: fixed w-14 h-20 container (responsive: `w-12 h-[68px] sm:w-14 sm:h-20`)
- **Card played**: render face-up card at that position
- **Empty**: `<div className="w-14 h-20" />` — invisible placeholder, always rendered
- **Winning card**: add `ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]` briefly on trick completion
- Trick area cards are **smaller** than hand cards (w-14 h-20 vs w-16 h-24)

---

## 6. Card Design

### Face-Up Cards
- Container: `bg-white rounded-lg border-2 border-gray-200 shadow-lg flex flex-col items-center justify-center`
- Rank: `font-bold` — `text-lg` for hand cards, `text-base` for trick area
- Suit symbol: slightly smaller than rank, below it
- **Red suits (♥♦)**: rank `text-red-600`, suit `text-red-500`
- **Black suits (♠♣)**: rank `text-gray-900`, suit `text-gray-700`

### Face-Down Cards
- Container: `bg-gradient-to-br from-blue-800 to-blue-950 border-2 border-blue-600 rounded-lg shadow-md relative`
- Decoration: `<div className="absolute inset-1.5 border border-blue-500/30 rounded flex items-center justify-center text-blue-400/40 text-xs">✦</div>`

---

## 7. Your Hand (Bottom Seat)

Same vertical stack as all seats (Section 4), plus interactive card behavior:

### Card States
| State | Classes |
|---|---|
| Playable | Full opacity, `cursor-pointer hover:-translate-y-1 transition` |
| Unplayable | `opacity-40 cursor-not-allowed` — no hover effect |
| Selected | `border-2 border-yellow-400 -translate-y-2 shadow-[0_0_8px_rgba(250,204,21,0.4)] transition` |

- Card sizing: `w-16 h-24` (hand) vs `w-14 h-20` (trick area)
- Playability determined by `getPlayableCards()` helper

### Action Area (h-12)
Fixed-height container below cards: `h-12 flex items-center justify-center`

| State | Content |
|---|---|
| Card selected | `<button className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-6 py-2 rounded-full transition">Play Card</button>` |
| No card selected | `<span className="text-gray-600 text-sm">Tap a card to select</span>` |

Both render in the same h-12 container — zero layout shift.

---

## 8. Status Text Area

Fixed-height container between trick area and your hand: `h-8 flex items-center justify-center`

| State | Content |
|---|---|
| Your turn (must follow) | `<span className="text-emerald-400 text-sm font-medium">Your turn — follow suit {suitSymbol}</span>` |
| Your turn (leading) | `<span className="text-emerald-400 text-sm font-medium">Your turn — lead any card</span>` |
| You won trick | `<span className="text-emerald-400 text-sm font-medium">✓ You won the trick!</span>` |
| Bot thinking | `<span className="text-gray-500 text-sm">{name} is thinking...</span>` |
| Waiting for player | `<span className="text-gray-500 text-sm">Waiting for {name}...</span>` |
| No status | `<div className="h-8" />` |

Remove all floating/free-positioned status text from the current build. Status lives here; trump info lives in the scoreboard.

---

## 9. Trump Calling Screens

All trump calling states render in a fixed-height center content area. Transitioning between Round 1 → Round 2 → Dealer Discard → Playing must cause zero layout shift.

### Round 1 — Face-Up Card
- Face-up card in center (card design per Section 6)
- Buttons: "Order it up" (`bg-emerald-500 hover:bg-emerald-600 text-white font-semibold min-h-[44px] rounded-full px-6`) + "Pass" (`bg-gray-700 hover:bg-gray-600 text-white min-h-[44px] rounded-full px-6`)
- "Go Alone" toggle below buttons (`text-gray-400 text-sm`)
- Non-active: "[Name] is deciding..." (`text-gray-500 text-sm`)

### Round 2 — Name Suit
- 4 suit buttons: row or 2×2 grid, each `min-h-[44px] min-w-[44px] rounded-lg`
  - Active suits: `bg-gray-700 hover:bg-gray-600 text-white`
  - Turned-down suit: `opacity-30 cursor-not-allowed pointer-events-none`
- "Pass" button: **HIDDEN** (not rendered) when Stick the Dealer applies — container keeps fixed height
- "Go Alone" toggle below
- Non-active: "[Name] is deciding..."

### Dealer Discard
- 6 face-up cards with same interactive behavior as hand (Section 7) — tap to select, yellow border
- Same h-12 action area: "Discard" button when selected, "Tap a card to discard" hint otherwise
- Non-dealer: "Dealer is discarding..." in status area

---

## 10. Game Over Screen

- Centered layout: `flex flex-col items-center justify-center` in full available height
- Winning team: `text-3xl font-bold` in team color (blue-400 or orange-400)
- "wins!" — `text-gray-400 text-xl`
- Final scores: both teams with name + score in team colors
- Round count: "After {roundsPlayed} rounds" — `text-gray-500 text-sm`
- Buttons (`flex gap-3 mt-8`):
  - "Play Again" — `bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-8 py-3 rounded-full` (host only)
  - "Leave World" — `bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-full` (all)

---

## 11. "The Crown" Rename (Terrible People)

- ALL user-facing "Czar" → "The Crown" in Terrible People components
- "Card Czar" → "The Crown"
- "The czar is choosing" → "The Crown is choosing"
- Keep existing crown icon/emoji
- Internal code (`czarIndex`, `czar_reveal` phase) stays as-is — UI text only

---

## 12. Mobile Requirements

- Minimum viewport: 375px width
- All interactive elements: min 44px tap targets
- Name tags: `truncate` class, max-width if needed
- Scoreboard: no overflow, no wrapping
- Hand cards (5+): `overflow-x-auto flex-nowrap` for horizontal scroll
- Trick area: responsive sizing (`w-36 h-36 sm:w-48 sm:h-48`)
- Page level: `overflow-x-hidden` — no horizontal page scroll ever
- All trump calling / game over screens tested at 375px

---

## 13. QA Audit Summary

Audit performed against current build screenshots. Items marked ❌ are confirmed failing. Items marked ⚠️ require code verification (not visible in screenshots).

| Area | ❌ Confirmed Failing | ⚠️ Needs Verification |
|---|---|---|
| Color Scheme | 3 | 3 |
| Scoreboard | 5 | 0 |
| Dealer Chip | 3 | 1 |
| Name Tags | 5 | 1 |
| Badge Row | 3 | 1 |
| Cards & Status Rows | 2 | 2 |
| Your Hand | 4 | 2 |
| Trick Area | 3 | 1 |
| Card Design | 2 | 4 |
| Status Text | 3 | 2 |
| Trump Calling | 0 | 5 |
| Game Over | 0 | 4 |
| The Crown | 0 | 2 |
| Mobile | 1 | 2 |
| **TOTAL** | **34** | **30** |

Key failures:
- Scoreboard is single-row, wrong format, "Trump" label still present
- Dealer chip is blue, not gold, wrong position
- "(Bot)" text labels still showing
- No active player emerald ring
- No emerald felt circle in trick area
- No playable/unplayable card distinction
- Status text floating in wrong location
- Face-down cards have no gradient or decoration
