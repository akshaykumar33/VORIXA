# AI Agent Operating System & Engineering Constitution: VORIXA

This document is the canonical specification and operating system for every AI coding agent (Claude Code, Gemini, Codex, Cursor, Copilot, Antigravity) operating in the **VORIXA** repository.

---

## 1. Prime Directive

All engineering changes must follow the canonical sequence:

```text
Research → Define → ADR → Design → Prototype → Benchmark → Implement → Test → Profile → Document → Review → Commit → Continue
```

* **No Unjustified Dependencies**: Never install an external library simply because it is well-known. Every dependency must solve a documented technical requirement.
* **Respect Architectural Boundaries**:
  - Presentation/UI never mutates simulation state directly.
  - Input hardware never writes directly to character coordinates; all inputs emit normalized actions to the Action Bus.
  - Rendering must not contain gameplay rules.

---

## 2. Coding Conventions & Standards

* **Language**: TypeScript 5.x in strict mode. No `any` types; use explicit interfaces and discriminated unions.
* **Contiguous Memory**: In hot paths (physics, math, ECS, chunk voxel processing), use `TypedArrays` (`Float32Array`, `Uint32Array`). Never allocate objects or arrays inside per-frame update loops.
* **Pure Functions in Math**: Vector, matrix, and quaternion math utilities should mutate destination targets (`out`) to eliminate heap object allocation.

---

## 3. Git Workflow & Commit Requirements

* **Conventional Commits**: Format must be `<type>(<scope>): <lowercase message>`.
* **Atomic Scope**: Commits must represent a single coherent change set.
* **Pre-Commit Verification**: Run `pnpm typecheck` and `pnpm test` before any commit.
* **No Premature Remote Push**: Never force-push or push unreviewed broken states.

---

## 4. Definition of Done (DoD)

A task or feature is considered Done ONLY when:
1. Implementation matches the corresponding architecture design or ADR.
2. Code strictly passes TypeScript typechecking (`pnpm typecheck`).
3. Unit or smoke tests exist and pass (`pnpm test`).
4. Performance budget is maintained (zero memory leaks, frame time $< 16.66\text{ms}$).
5. Related documentation and roadmaps are updated to reflect the change.
6. Clean Conventional Commit created.

---

## 5. Prohibited Shortcuts

* ❌ **Never fake completion**: Do not claim a system is "optimized" or "production-ready" without verifiable benchmark evidence.
* ❌ **Never create empty placeholder files**: Do not litter directories with empty `.ts` or `.md` files to give a false impression of progress.
* ❌ **Never suppress TypeScript errors**: Do not use `@ts-ignore` or `any` casting to bypass compiler errors.
