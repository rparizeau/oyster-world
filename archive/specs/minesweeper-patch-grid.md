# Minesweeper — Patch: Grid Overflow + Sizing Fix

## Context Files to Include

Paste these files into the conversation before this prompt:
- `ARCHITECTURE.md`
- `DESIGN_SYSTEM.md`
- `MINESWEEPER-SPEC.md`

---

## Problem

The minesweeper grid overflows the right edge of the screen (see screenshot context). Additionally the cells appear far too small — well under the 36px minimum. The grid is rendering too many columns for the available width.

There's also a cosmetic issue: a gold/yellow strip is visible along the top-left edges of the grid where the container background bleeds through at the rounded corners.

## Root Causes

1. **Wrong width source**: `calculateGrid` uses `window.innerWidth` but the grid renders inside a `max-w-lg mx-auto` container (capped at ~512px) with `px-4` padding (16px each side). The calculation doesn't know about these CSS constraints so it computes more columns than actually fit.

2. **Gap pixels not accounted for**: The grid uses `gap: 1px` between cells. With N columns, that's `(N-1)` extra pixels of width. These aren't subtracted before calculating cell size, so `cols * cellSize + (cols-1) * gap > containerWidth`.

3. **Cell size not being enforced**: Even though `MIN_CELL_SIZE = 36` exists in constants, the actual rendered cells are much smaller, meaning the clamp isn't working correctly in the calculation chain.

## Fix Instructions

### 1. Measure the actual container instead of the viewport

Replace the viewport-based width calculation with a ref-based measurement of the real grid container element. This automatically respects `max-w-lg`, padding, and any other CSS constraints.

In the game view component, add a ref to the container div that wraps the grid (the one with padding applied). After mount, measure its `clientWidth` and use that as the available width for grid calculation.

```tsx
const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (containerRef.current) {
    const availableWidth = containerRef.current.clientWidth;
    // Pass this to the grid calculation instead of window.innerWidth
  }
}, []);
```

Put the ref on the padded container — NOT on the grid element itself. The ref should measure the space the grid has to fit *within*.

### 2. Fix calculateGrid to account for gap pixels

Update the `calculateGrid` function in `helpers.ts`. The key formula change:

```typescript
function calculateGrid(containerWidth: number, containerHeight: number, difficulty: Difficulty) {
  // Available width is already the real container width (measured via ref)
  // No need to subtract GRID_PADDING — CSS already handled that
  const availW = containerWidth;
  const availH = containerHeight;

  // Calculate max columns that fit, accounting for 1px gap between each cell
  // Total width = cols * cellSize + (cols - 1) * 1px gap
  // So: cols * MIN_CELL_SIZE + (cols - 1) ≤ availW
  // Solving: cols ≤ (availW + 1) / (MIN_CELL_SIZE + 1)
  let cols = Math.floor((availW + 1) / (MIN_CELL_SIZE + 1));
  cols = Math.max(MIN_COLS, Math.min(MAX_COLS, cols));

  // Same for rows
  let rows = Math.floor((availH + 1) / (MIN_CELL_SIZE + 1));
  rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, rows));

  // Cell size: fill available width evenly, subtracting total gap space
  const totalGapW = (cols - 1) * 1; // 1px gap
  const cellSize = Math.floor((availW - totalGapW) / cols);

  // Mine count from density
  const totalCells = rows * cols;
  const mineCount = Math.max(1, Math.min(
    totalCells - 9,
    Math.round(totalCells * MINE_DENSITY[difficulty])
  ));

  return { rows, cols, cellSize, mineCount };
}
```

The critical changes are:
- Accept container-measured width, not viewport width
- Factor `(cols - 1)` gap pixels into both the column count calculation AND the cell size calculation
- Remove any `GRID_PADDING` subtraction from inside this function — the container ref measurement already accounts for padding

### 3. Update the function signature and all call sites

`calculateGrid` should no longer accept `viewportWidth` / `viewportHeight`. Update it to accept the measured container dimensions. Find everywhere it's called (likely in `useMinesweeper.ts` `init` action or an effect) and pass the ref-measured values instead of `window.innerWidth` / `window.innerHeight`.

For the height calculation: the available height is the viewport height minus the DeepBar and header. This can still use `window.innerHeight` since the vertical space isn't constrained by `max-w-lg`. So:

```typescript
const availH = window.innerHeight - DEEPBAR_HEIGHT - HEADER_HEIGHT - BOTTOM_PADDING;
const availW = containerRef.current.clientWidth; // measured

const grid = calculateGrid(availW, availH, difficulty);
```

### 4. Set explicit grid width to prevent overflow

As a safety net, set an explicit width on the grid element itself so it can never exceed its container:

```tsx
<div
  style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
    gap: '1px',
    width: `${cols * cellSize + (cols - 1)}px`, // exact calculated width
  }}
>
```

This removes any ambiguity — the grid is exactly as wide as the math says, not auto-sized.

### 5. Fix the gold border bleed at rounded corners

The gold/yellow strip along the top-left edge is the grid container's background color showing through where the rounded corners of the outer container don't align with the square cells. Fix by:

- Remove any visible background color from the grid's outer rounded container, OR
- Set `overflow: hidden` on the rounded container so cells clip to the rounded corners, OR  
- Apply the rounded corners directly to the grid element and set `overflow: hidden` on it

The simplest fix: make sure the container that has `rounded-lg` also has `overflow-hidden`, and that its background matches the gap color (`rgba(245,230,202,.06)`) or is transparent. If the gold is coming from a different background, track down which element has that background and remove or match it.

---

## Verification

After the fix, check on these viewports (use responsive dev tools):

- [ ] **375px wide** (iPhone SE): Grid fits within screen, no horizontal overflow, cells ≥ 36px, ~9 columns
- [ ] **390px wide** (iPhone 14): Same checks
- [ ] **430px wide** (larger phone): Might get 10 columns, cells still ≥ 36px
- [ ] **768px wide** (tablet): Grid capped at `max-w-lg` (~512px), centered, cells larger
- [ ] **1280px wide** (desktop): Same as tablet — grid stays within max-w-lg
- [ ] No gold/yellow border bleed on any screen size
- [ ] Grid has subtle 1px lines between cells (gap color visible)
- [ ] Grid has rounded corners with no cell overflow at corners
- [ ] Cells are not tiny — visually confirm they look tappable
- [ ] Game still plays correctly after grid resize (first click, flood fill, flags, win/loss)
