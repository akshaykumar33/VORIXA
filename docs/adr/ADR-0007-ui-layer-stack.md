# ADR-0007: UI Layer Stack — React Island over a Framework-Free Engine

* **Status**: Accepted
* **Date**: 2026-09-20
* **Deciders**: Project Owner, Engineering Kernel
* **Supersedes**: The implicit "vanilla `HUDOverlay`" approach in `src/ui/HUDOverlay.ts`

## Context

The project owner has declared UI/UX quality and complete functionality to be **mandatory
acceptance criteria** rather than post-MVP polish, and has explicitly opened the technology stack.

VORIXA's interface surface is large and growing: HUD, pause and settings menus, inventory, skill
trees, crafting, quest logs, map, accessibility controls, input remapping, and save management.
Hand-building this in vanilla DOM means hand-building focus traps, roving tabindex, ARIA wiring,
dialog semantics, and exit animations — repeatedly, and usually incorrectly.

At the same time, ADR-0003 commits the ECS to TypedArray storage and the engine to zero steady-state
allocation in the tick loop. A reactive framework anywhere near that loop would destroy the property
the architecture was designed around.

These two pressures pull in opposite directions, and the decision has to satisfy both.

## Decision Drivers

* UI/UX is a hard requirement — accessibility, motion, and responsive behavior are not optional.
* Velocity on a large menu surface matters; it is a legitimate engineering justification.
* The engine's per-frame allocation budget is non-negotiable.
* Frame-rate-sensitive HUD elements must not go through a VDOM diff.
* Bundle cost is bounded by `docs/performance/PERFORMANCE_BUDGETS.md`.

## Considered Options

| Option | Verdict |
| --- | --- |
| **Vanilla TS + design tokens** (status quo) | Smallest bundle, but every dialog, focus trap, and ARIA relationship is hand-built. Accessibility debt accumulates faster than features ship. **Rejected** — conflicts with the UI/UX mandate. |
| **Svelte 5 + Tailwind** | ~15KB runtime, compiled, no VDOM. Genuinely strong fit. Rejected on ecosystem: no equivalent to Radix for accessible primitives, so a large share of the hand-building problem returns. |
| **React 19 + Tailwind v4 + Radix + Motion** | Largest runtime of the three (~50KB gzip), but the only option where accessible primitives, animation, and styling are all solved by mature, maintained libraries. **Selected.** |
| **Full-canvas immediate-mode UI** | Perfect frame integration, but forfeits screen readers, native text input, browser zoom, and OS accessibility entirely. **Rejected** — irreconcilable with WCAG AA. |

## Decision

Adopt a **two-layer architecture** with a strictly enforced boundary.

```text
┌──────────────────────────────────────────────────────────┐
│ UI LAYER   #ui-root — React 19 island                    │
│   Tailwind v4   design tokens from docs/design/           │
│   Radix         dialog, tabs, slider, select, tooltip     │
│   Motion        transitions, damage/XP feedback           │
│   Reads engine state by subscription. Dispatches intent   │
│   as Actions on the Action Bus. Never mutates simulation. │
├──────────────────────────────────────────────────────────┤
│ ENGINE     <canvas> — framework-free, zero-allocation     │
│   core · ecs · rendering · input · audio                  │
│   Imports no UI framework. Ever.                          │
└──────────────────────────────────────────────────────────┘
```

**Selected stack:**

* **React 19** — UI overlay in its own DOM layer above the canvas.
* **Tailwind v4** — CSS-first config bound to the tokens already specified in
  `docs/design/COLOR_SYSTEM.md`, `TYPOGRAPHY.md`, and `MOTION_SYSTEM.md`.
* **Radix Primitives** — accessible, unstyled dialog/tabs/slider/select/tooltip.
* **Motion** — the motion system in `docs/design/MOTION_SYSTEM.md`, with
  `prefers-reduced-motion` honored globally.

### Binding constraints

1. **No engine module imports React.** `src/core`, `src/ecs`, `src/rendering`, `src/input`, and
   `src/audio` must remain framework-free. This is CI-enforceable and should be enforced.
2. **Per-frame HUD values bypass React.** Frame time, FPS, health bars, and any value that changes
   every frame are written to pre-created DOM nodes or a 2D overlay canvas via direct mutation — not
   through component state. React owns *structure and interaction*; the engine owns *per-frame
   numbers*.
3. **UI dispatches Actions, never mutations.** The boundary established in ADR-0004 holds: UI emits
   normalized actions onto the Action Bus exactly as a gamepad or touch adapter would.
4. **The UI layer is gamepad-navigable.** Menus are reachable and operable without a pointer.

## Consequences

### Positive
* Accessible dialogs, focus management, and keyboard navigation come from a maintained library
  instead of accumulating as bespoke bugs.
* Large menu surfaces become tractable to build and to restyle.
* The motion system becomes declarative and consistent across the interface.
* The engine's allocation guarantees are untouched — the boundary is architectural, not advisory.

### Negative
* ~50KB gzip added to the UI layer. Bounded by, and must be tracked against, the performance budget.
* Two mental models in one codebase: reactive UI and imperative engine. Constraint #2 is the seam
  most likely to be violated, and reviewers should watch for it specifically.
* React's release cadence becomes a maintenance input for the project.

### Neutral
* `src/ui/HUDOverlay.ts` remains valid under constraint #2 — it is precisely the kind of
  direct-mutation, per-frame surface that should *not* move into React.

## Revisit Conditions

* UI bundle exceeds its performance budget on the low-power mobile tier.
* React rendering shows up as a measurable cost in frame-time profiles.
* The engine/UI boundary is violated more than once, indicating the split is impractical in
  day-to-day work rather than merely unfamiliar.
