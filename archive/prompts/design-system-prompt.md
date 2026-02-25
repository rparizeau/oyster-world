# Session Prompt: Design System Extraction

I have a multiplayer web game called **Oyster World** built with a serverless architecture. Over development I've established a visual identity and interaction patterns but they only exist implicitly in my component code. I need you to extract and document them into a `DESIGN_SYSTEM.md` that I can paste into future Claude sessions so I never have to re-explain design decisions with screenshots again.

**This document is written for Claude as the audience** — use concrete values, actual CSS/Tailwind classes from the codebase, and specific examples. No abstract design language.

---

## What to Extract

### Visual Foundations
- Color palette — every color in use with exact hex/rgb/tailwind values and where each is used (primary actions, backgrounds, text, accents, states, etc.)
- Typography — font families, sizes, weights, line heights as used across headings, body, labels, etc.
- Spacing system — padding/margin conventions, consistent gaps between elements
- Border radii — what radius values are used and where
- Shadows/elevation — any box-shadow patterns
- Dark/light mode — how it's handled, token mapping if applicable

### Component Patterns
- Buttons — variants (primary, secondary, ghost, etc.), sizes, padding, hover/active/disabled states
- Cards — styling, internal spacing, shadow, radius
- Modals/dialogs — overlay, sizing, animation
- Inputs/forms — styling, focus states, validation appearance
- Any other recurring components — document their visual conventions

### Layout Principles
- Page/screen structure — how screens are composed
- Responsive behavior — breakpoints, how layout adapts
- Grid/spacing system — column structure, container widths, gutters
- Navigation patterns — how players move between views

### Interaction Patterns
- Transition/animation durations and easing curves
- Hover states — what changes on hover across component types
- Loading states — spinners, skeletons, or other patterns
- Micro-interactions — any subtle feedback animations

### UX Conventions
- Error states — how errors are displayed (inline, toast, modal)
- Empty states — what users see when there's no data
- Confirmation flows — destructive actions, leaving games, etc.
- Notifications/toasts — positioning, timing, styling
- Game-specific UX — turn indicators, player status, real-time updates

---

## Process

1. I'm going to share my frontend component files and any relevant styles
2. Read through everything first — ask clarifying questions before generating
3. Extract the implicit design system into a single comprehensive `DESIGN_SYSTEM.md`
4. For anything ambiguous or inconsistent in the code (signs of drift between sessions), flag it so I can make a decision
5. I'll review and we'll iterate

---

## Important

- If you find **inconsistencies** (e.g., two different border radii on similar components, mixed spacing values), call them out explicitly in a "Inconsistencies to Resolve" section rather than silently picking one
- If a pattern is **underspecified** (e.g., no disabled state exists for buttons), note it in a "Gaps to Define" section
- Organize the doc so the most frequently needed info (colors, typography, spacing) is at the top

Here are my frontend files:

[PASTE COMPONENT FILES / STYLES HERE]
