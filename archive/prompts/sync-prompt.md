# Session Prompt: Documentation Synthesis

I have a multiplayer web game called **Oyster World** (real-time, serverless architecture). Over the course of development I created multiple feature-level SPEC documents but never established a single master document that ties everything together.

I need you to help me create **two master documents** from my existing specs and codebase:

---

## 1. `ARCHITECTURE.md` — Technical Source of Truth

This should be the single file I paste into every new Claude session to get up to speed immediately. It should cover:

- **Project overview** — what Oyster World is, tech stack, deployment target
- **Architecture** — high-level system design, how the major pieces connect (real-time layer, game state, API, frontend)
- **Key design decisions** — why things are built the way they are, patterns in use, constraints we're working within
- **Module map** — brief description of each major area of the codebase and where to find it
- **Current state** — what's built, what's in progress, known issues or tech debt
- **Conventions** — naming, error handling, state management patterns, anything a new session needs to follow to stay consistent
- **References** — pointers to the individual feature SPECs for deeper context

---

## 2. `DESIGN_SYSTEM.md` — UI/UX Source of Truth

This should capture the implicit design system currently embedded in the components so I don't have to re-explain visual decisions with screenshots every session. It should cover:

- **Visual foundations** — color palette (actual values), typography, spacing system, border radii, dark/light mode
- **Component patterns** — how buttons, cards, modals, inputs, etc. are styled (concrete values, classes used)
- **Layout principles** — responsive approach, grid/spacing, navigation patterns
- **Interaction patterns** — animations, transitions, hover/active states, loading states
- **UX conventions** — error handling UI, empty states, confirmations, toasts, notifications
- **Write it for Claude as the audience** — use concrete values, actual CSS/Tailwind classes from the codebase, and specific examples rather than abstract design language

---

## Process

1. I'm going to paste in my existing SPEC documents and relevant code files
2. First, read through everything and ask me any clarifying questions before generating
3. Then generate both documents
4. I'll review and we'll iterate

Here are my SPEC documents:

- SPEC.md
- OYSTER-SPEC.md
- WHOS-DEAL-SPEC.md
- PUNCH-LIST-SPEC.md
- pearl-carousel-spec.md
- design/phase 1/oyster-world-ux-doc.md
- oyster-dive-flows.html (interactive prototype — host + guest dive flows, persistent lobby, surfacing screen)
