# Pearl Carousel — Build Spec

**Target:** Pick a Pearl screen (Host Flow, Step 3 — "Choosing" depth)  
**File(s):** Whichever component renders the pearl selection / game picker  
**Date:** February 2026

---

## Overview

Replace the current horizontal scroll pearl card list with a **centered infinite snap carousel**. The selected game is always centered, with neighboring pearls peeking from both sides. The carousel wraps infinitely — swiping past the last pearl reveals the first, and vice versa.

---

## Carousel Behavior

### Layout
- Cards are horizontally arranged in a single row
- The **active card is always centered** in the viewport
- Neighboring cards peek from left and right edges
- Card width = **88% of the CTA button width** (the "Crack It Open" button), so the card is slightly narrower than the button and both are visually aligned by center

### Infinite Wrap
- Render 3 copies of the pearl array (e.g., for 3 games = 9 DOM nodes)
- Start the carousel index at the first card of the **middle** copy
- After every snap animation completes (`transitionend`), silently re-center to the middle copy without animation to prevent index drift
- This creates the illusion that the last pearl peeks on the left of the first, and the first peeks on the right of the last

### Snap / Selection
- Swiping or dragging past **20% of card width** triggers a snap to the next/previous card
- Less than 20% snaps back to current
- Tapping a peeking card snaps it to center
- The centered card is always the selected pearl — no separate tap-to-select required
- Transition easing: `cubic-bezier(.25, .85, .35, 1)` over `0.4s`

### Drag / Swipe
- Support both mouse drag and touch swipe
- During drag, disable the CSS transition (add a `.dragging` class that sets `transition: none`)
- Track drag delta from start position
- On release, apply the 20% threshold logic above

### Scroll Indicator Dots
- One dot per real pearl (not per DOM copy)
- Active dot: Pearl Gold (`#F0C27F`), stretched to pill shape (`width: 18px`, `border-radius: 3px`)
- Inactive dots: `rgba(245, 230, 202, 0.12)`, `6px` circles
- Tapping a dot snaps to that pearl
- Dots update on every snap based on `current % pearlCount`

---

## Card States

### Centered (active)
- `opacity: 1`
- `transform: scale(1)`
- `border-color: rgba(255, 255, 255, 0.12)`
- `background: rgba(255, 255, 255, 0.05)`

### Near (±1 from center)
- `opacity: 0.6`
- `transform: scale(0.95)`

### Far (all others)
- `opacity: 0.45`
- `transform: scale(0.92)`

All states transition with the same `0.4s cubic-bezier(.25, .85, .35, 1)`.

---

## Card Layout

Each pearl card contains:

```
┌─────────────────────────────┐
│                             │
│  [Icon]  Title              │
│          [✦ PEARL] [N plrs] │
│                             │
│  Description text that can  │
│  wrap to multiple lines     │
│                             │
└─────────────────────────────┘
```

### Structure
```
card
├── header (row: icon + header-text)
│   ├── icon (emoji, 2em)
│   └── header-text (column)
│       ├── name (Baloo 2, 1.05em, cream)
│       └── meta (row)
│           ├── pearl badge ("✦ PEARL")
│           └── player count badge
└── description (Quicksand, 0.72em, muted)
```

### Card Styles
- `border-radius: 18px`
- `padding: 18px 18px 20px`
- `border: 2px solid rgba(255, 255, 255, 0.06)`
- `background: rgba(255, 255, 255, 0.03)`
- `backdrop-filter: blur(4px)`
- Header gap: `14px` between icon and text
- Header-text gap: `5px` between name and meta row
- Header margin-bottom: `14px`
- Meta row gap: `6px`

### Pearl Badge
- Text: `✦ PEARL`
- `font-size: 0.5em`
- `background: rgba(240, 194, 127, 0.1)`
- `color: var(--pearl)` / `#F0C27F`
- `padding: 3px 9px`
- `border-radius: 6px`
- `font-weight: 700`, `letter-spacing: 0.5px`

### Player Count Badge
- `font-size: 0.62em`
- `background: rgba(126, 184, 212, 0.1)`
- `color: var(--shallow)` / `#7EB8D4`
- `padding: 3px 8px`
- `border-radius: 6px`
- `font-weight: 700`
- `width: fit-content` (badge hugs text, no wider)

---

## Current Pearls Data

```json
[
  {
    "icon": "❤️",
    "name": "Take 4",
    "desc": "Classic Connect 4. Drop pieces. Get four in a row.",
    "players": "2 players"
  },
  {
    "icon": "🃏",
    "name": "Who's Deal?",
    "desc": "Classic Euchre. Pick trump. Take tricks. Talk trash.",
    "players": "4 players"
  },
  {
    "icon": "😈",
    "name": "Terrible People",
    "desc": "Fill in the blanks. Be terrible. The worst answer wins.",
    "players": "4 players"
  }
]
```

---

## CTA Button

- "Crack It Open" — always enabled since the centered card is always selected
- Width matches the `actions` container (full width minus `28px` padding per side)
- Below the dots, `margin-top: 20px`
- "← Back" text link below the button

---

## Responsive

- On viewports under 400px, card width ratio stays at 88% of button width (scales naturally)
- Touch swipe must feel native — no jank, no scroll hijacking on the page

---

## Reference

Interactive prototype of this exact spec is available as an HTML artifact in the Claude conversation where this was designed. Use it as the visual source of truth.
