# Oyster World --- Platform Review & Execution Plan

**Author:** External Architectural Assessment\
**Date:** Feb 2026\
**Target Audience:** Claude (in-repo execution agent)

------------------------------------------------------------------------

# 1. Objective

This document outlines a structured architectural review of Oyster World
and defines concrete execution tasks for improvement.

The platform is architecturally strong. This is not a rewrite plan.\
This is a refinement, consolidation, and hardening pass.

Claude: your role is to validate assumptions against the actual codebase
and produce diffs or structured proposals for each section below.

------------------------------------------------------------------------

# 2. Architectural Status Summary

Oyster World currently demonstrates:

-   Server-authoritative multiplayer architecture
-   Redis CAS-based atomic state updates
-   Idempotent action handling
-   Serverless-safe timing model (heartbeat-driven advancement)
-   Pluggable GameModule engine abstraction
-   Bot lifecycle integration
-   Phase-driven deterministic state machines
-   Structured design system with tokenized styling
-   Clean lobby/game separation

Status: **Structured Alpha --- Architecturally Stable**

The following sections define improvement targets.

------------------------------------------------------------------------

# 3. High-Priority Improvements

------------------------------------------------------------------------

## 3.1 Standardize Terrible People to Generic Action Route

### Current State

-   Uses legacy endpoints:
    -   `/api/game/submit`
    -   `/api/game/judge`
-   Other games use `/api/game/action`

### Goal

Refactor Terrible People to use:

    POST /api/game/action

### Required Work

1.  Replace legacy routes with action types:
    -   `submit-cards`
    -   `judge-winner`
2.  Move validation into `processAction()` inside the game engine.
3.  Remove deprecated route files.
4.  Ensure idempotency via `actionId` handling.
5.  Confirm Pusher events remain identical in payload shape.

Deliverable: - Proposed diff for route removal - Updated engine logic -
Confirmation of no regression in event contract

------------------------------------------------------------------------

## 3.2 Extract Game-Specific Types from Global Types

### Current State

Terrible People types exist in `src/lib/types.ts`.

### Goal

Move all game-specific types to:

    src/lib/games/terrible-people/types.ts

### Required Work

1.  Relocate interfaces.
2.  Update imports.
3.  Ensure no circular dependencies introduced.
4.  Confirm build passes strict TypeScript mode.

Deliverable: - File relocation diff - Import updates

------------------------------------------------------------------------

## 3.3 Create TECH_DEBT.md

### Goal

Centralize all technical debt notes across games.

Include:

-   Legacy Terrible People routes
-   Shared `hand-updated` event multiplexing
-   Global constants leakage
-   Minesweeper architectural exception
-   Redis-only persistence model
-   Missing version headers

Deliverable: - New `docs/platform/TECH_DEBT.md` file - Structured list
grouped by severity

------------------------------------------------------------------------

## 3.4 Add AI_CONTEXT.md

### Goal

Create a single-file AI onboarding summary.

Should include:

-   Architecture diagram (text-based)
-   Data flow summary
-   Timing model explanation
-   Idempotency guarantees
-   GameModule lifecycle
-   Known invariants
-   Deviations (Minesweeper exception)

Deliverable: - `docs/platform/AI_CONTEXT.md`

------------------------------------------------------------------------

# 4. Medium-Priority Improvements

------------------------------------------------------------------------

## 4.1 Event Contract Audit

Validate:

-   No event name collisions across games
-   No ambiguous shared private-channel payloads
-   No implicit payload assumptions

Deliverable: - Table of all Pusher events - Notes on potential
collisions

------------------------------------------------------------------------

## 4.2 Advancement Recursion Safety Audit

Inspect:

-   `processAdvancement()` recursion patterns
-   `recurse: true` behavior
-   Safeguards against infinite loops

Deliverable: - Written confirmation of safety OR - Patch proposal

------------------------------------------------------------------------

## 4.3 CAS Failure Handling Audit

Validate:

-   Proper retry behavior on CAS mismatch
-   No partial state leaks
-   Proper error propagation

Deliverable: - Summary of mutation safety guarantees

------------------------------------------------------------------------

# 5. Documentation Improvements

------------------------------------------------------------------------

## 5.1 Add Platform Version Header

To `ARCHITECTURE.md`:

    Platform Version: 1.0
    Last Updated: Feb 2026

------------------------------------------------------------------------

## 5.2 Create Cross-Game State Machine Index

Table including:

-   Game
-   Phases
-   Timed transitions
-   Bot participation
-   Private information usage

Deliverable: - Add to `ARCHITECTURE.md` or new `STATE_MACHINES.md`

------------------------------------------------------------------------

# 6. Future-Ready Enhancements (Do Not Execute Yet)

-   Persistent accounts layer
-   Spectator mode
-   Analytics instrumentation
-   Tournament orchestration
-   Elo/ranked mode
-   Redis-to-database abstraction layer

These are roadmap items, not immediate tasks.

------------------------------------------------------------------------

# 7. Execution Instructions

Claude:

For each section:

1.  Validate assumptions against actual implementation.
2.  Identify divergences between documentation and code.
3.  Propose diffs where appropriate.
4.  Do NOT rewrite working architecture.
5.  Preserve idempotency, CAS safety, and timing model integrity.

------------------------------------------------------------------------

# 8. Conclusion

Oyster World is architecturally sound and ready for structured
refinement.

This review is intended to harden and consolidate the system, not
redesign it.

Proceed systematically.
