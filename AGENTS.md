# AI Agent Operating System & Engineering Constitution: VORIXA

This document is the canonical specification and operating system for every AI coding agent (Claude Code, Gemini, Codex, Cursor, Copilot, Antigravity) operating in the **VORIXA** repository.

---

> **Operating prompt**: [`prompts/master_execution_prompt.md`](prompts/master_execution_prompt.md)
> is the binding session prompt for all work from Phase 1 onward.
> [`prompts/starter_prompt.md`](prompts/starter_prompt.md) is retained as historical record only.

---

## 0. The Two Non-Negotiables

The project owner has declared these mandatory. They outrank every preference below.

### 0.1 UI/UX is an acceptance criterion

A feature that works but feels bad is **not done**. "We'll polish it later" is a rejected plan.
Every user-facing change ships with considered visuals, motion, loading/empty/error/offline states,
keyboard navigation, screen-reader labels, `prefers-reduced-motion` support, and verified behavior
at mobile, tablet, and desktop widths.

### 0.2 Functionality ships complete

No buttons that do nothing. No happy-path-only implementations. No settings that don't take effect.
No saves that don't survive a reload. If a system is too large for one change, **cut it vertically**
— one complete capability end to end, never five half-built layers.

---

## 1. Prime Directive

All engineering changes must follow the canonical sequence:

```text
Research → Define → ADR → DESIGN THE EXPERIENCE → Prototype → Benchmark
  → Implement → Test → Profile → Document → Review → PR → Merge → Continue
```

* **Deliberate Dependencies**: The stack is **open**. Any library is permitted when it delivers a
  materially better experience or materially more capability — velocity is a legitimate
  justification. "We could write it ourselves" is not a reason to refuse one. What a dependency owes
  you is a *recorded reason*, a measured bundle cost, and an exit path. See
  `master_execution_prompt.md` §1.
* **Respect Architectural Boundaries**:
  - **The engine core stays framework-free.** `src/core`, `src/ecs`, `src/rendering`, `src/input`,
    and `src/audio` import no UI framework. CI enforces this (ADR-0007).
  - Presentation/UI never mutates simulation state directly.
  - Input hardware never writes directly to character coordinates; all inputs emit normalized
    actions to the Action Bus.
  - Rendering must not contain gameplay rules.

---

## 2. Coding Conventions & Standards

* **Language**: TypeScript 5.x in strict mode. No `any` types; use explicit interfaces and discriminated unions.
* **Contiguous Memory**: In hot paths (physics, math, ECS, chunk voxel processing), use `TypedArrays` (`Float32Array`, `Uint32Array`). Never allocate objects or arrays inside per-frame update loops.
* **Pure Functions in Math**: Vector, matrix, and quaternion math utilities should mutate destination targets (`out`) to eliminate heap object allocation.
* **UI Layer**: React 19 + Tailwind v4 + Radix + Motion, in its own DOM island above the canvas
  (ADR-0007). Per-frame values (FPS, frame time, health bars) bypass React and mutate pre-created
  nodes directly — React owns structure and interaction, the engine owns per-frame numbers.

---

## 3. Git Workflow & Codebase Protection

**Canonical ruleset: [`docs/operations/GIT_WORKFLOW.md`](docs/operations/GIT_WORKFLOW.md).**

> **Nothing reaches `main` except through a pull request.** No exceptions — not for one-line fixes,
> not for docs, not because you are the only person working.

```text
1. Branch    git checkout -b <type>/<scope>-<slug>    (pre-commit hook blocks commits on main)
2. Commit    atomic, Conventional Commits, enforced by the commit-msg hook
3. Protect   pre-commit hook scans staged content for secrets and blocks the commit
4. Push      git push -u origin <branch>
5. PR        gh pr create — full template, screenshots for any visual change
6. Verify    quality-gates, engine-boundary, and secret-scan all green
7. Merge     squash merge, delete the branch
```

* **Enable protection once per clone**: `pnpm hooks:install`
* **Gate locally before pushing**: `pnpm verify` (secrets + typecheck + tests)
* **Before every commit**, confirm your diff contains no API keys, tokens, passwords, private
  certificates, connection strings, real `.env` files, personal paths, or oversized binaries. The
  hook is a safety net, not a substitute for reading your own diff.
* **AI agents never merge autonomously.** Open the PR, push to it, report it ready — a human merges.
* **Never force-push** to a protected branch or push a knowingly broken state.

---

## 4. Definition of Done (DoD)

A task or feature is Done ONLY when **all** of the following hold. No partial credit.

**Engineering**
1. Implementation matches the corresponding architecture design or ADR.
2. `pnpm typecheck` passes — no `any`, no `@ts-ignore`.
3. Tests covering the new behavior exist and pass (`pnpm test`).
4. `pnpm build` succeeds and `pnpm verify:secrets` is clean.
5. Performance budget maintained (zero steady-state allocation in tick/render paths, frame time $< 16.66\text{ms}$).

**Experience**
6. Visually consistent with `docs/design/`; transitions animated; `prefers-reduced-motion` honored.
7. Loading, empty, error, and offline states all handled.
8. Keyboard navigable, screen-reader labelled, contrast meets WCAG AA.
9. Verified at mobile, tablet, and desktop widths — and with gamepad where reachable.

**Evidence**
10. Screenshot or capture attached to the PR for any visual change.
11. Measured numbers, not adjectives, for any performance claim.
12. Documentation and roadmaps updated; merged via a squash-merged PR.

---

## 5. Prohibited Shortcuts

* ❌ **Never fake completion**: Do not claim a system is "optimized" or "production-ready" without verifiable benchmark evidence.
* ❌ **Never create empty placeholder files**: Do not litter directories with empty `.ts` or `.md` files to give a false impression of progress.
* ❌ **Never suppress TypeScript errors**: Do not use `@ts-ignore` or `any` casting to bypass compiler errors.
* ❌ **Never commit secrets**: API keys, tokens, passwords, private certificates, or real `.env` files. If one is ever committed, **rotate it first**, then fix history — see `GIT_WORKFLOW.md` §2.5.
* ❌ **Never commit directly to `main`**: branch and open a PR, every time.
* ❌ **Never ship dark patterns**: no manipulative retention mechanics, artificial scarcity, or engagement traps.
* ❌ **Never trust the client**: XP, currency, inventory, damage, and scores are server-authoritative.
