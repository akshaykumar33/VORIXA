<!--
  Title must be a Conventional Commit — it becomes the squash-merge subject on main.
  e.g. feat(ui): add inventory grid with keyboard navigation
  Ruleset: docs/operations/GIT_WORKFLOW.md
-->

## Problem
<!-- What is broken, missing, or needed? Why now? -->

## Solution
<!-- What you changed and why this approach. Note alternatives you rejected. -->

## Related
Closes / Relates to: #
Roadmap phase:

---

## Experience
<!-- REQUIRED for any user-facing change. Delete this section only for pure internals. -->

**Screenshot / capture:**
<!-- Drag in an image, GIF, or video. Include a mobile width for responsive surfaces. -->

- [ ] Visually consistent with `docs/design/`
- [ ] Loading, empty, error, and offline states all handled
- [ ] Transitions animated; `prefers-reduced-motion` honored
- [ ] Keyboard navigable; focus visible and trapped correctly in modals
- [ ] Screen-reader labelled; contrast meets WCAG AA
- [ ] Verified at mobile, tablet, and desktop widths
- [ ] Verified with gamepad (if this surface is gamepad-reachable)

## Functionality
- [ ] The feature is **complete** — no dead controls, no happy-path-only handling
- [ ] Failure modes handled and surfaced to the player
- [ ] Any state it owns survives a reload

---

## Quality Gates
- [ ] `pnpm typecheck` — 0 errors, no `any`, no `@ts-ignore`
- [ ] `pnpm test` — 0 failures, new behavior covered
- [ ] `pnpm build` — succeeds
- [ ] `pnpm verify:secrets` — clean
- [ ] No steady-state heap allocation in tick/render loops
- [ ] Engine core still framework-free (ADR-0007)

## Security
- [ ] No API keys, tokens, passwords, certificates, or real `.env` files introduced
- [ ] No new client-trusted values (XP, currency, inventory, damage, scores)
- [ ] `--no-verify` was **not** used — or, if it was, it is disclosed here with justification:
<!-- If you bypassed the hook, say what was flagged, why it is safe, and confirm this PR narrows the pattern. -->

## Architecture & Performance
**Architecture impact:**
<!-- Boundaries crossed, contracts changed, ADR added or superseded. "None" is a valid answer. -->

**Performance impact:**
<!-- Measured numbers only. Name the browser and device. "Not measured" is better than a guess. -->

```text
Device / Browser:
Avg FPS:        P95 frame time:
JS heap:        Draw calls:
Bundle delta:
```

**New dependencies:**
<!-- Name, purpose, gzip size, license, and how we'd remove it later. "None" is a valid answer. -->

## Documentation
- [ ] Docs, ADRs, and roadmap updated to match reality
- [ ] README updated if commands or setup changed

## Risks & Rollback
**Risks:**

**Rollback:**
<!-- Usually "revert the squash commit" — say so if anything makes it harder than that. -->
