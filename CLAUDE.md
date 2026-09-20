# Claude Code Assistant Instructions

This repository is governed by the **VORIXA AI Operating System**.

Please refer directly to the canonical constitution and instructions in:
👉 [AGENTS.md](AGENTS.md)

The binding session prompt is [prompts/master_execution_prompt.md](prompts/master_execution_prompt.md).
The delivery ruleset is [docs/operations/GIT_WORKFLOW.md](docs/operations/GIT_WORKFLOW.md).

## Non-Negotiables
1. **UI/UX is an acceptance criterion.** A feature that works but feels bad is not done.
2. **Functionality ships complete.** No dead controls, no happy-path-only work.
3. **Nothing reaches `main` except through a PR.** Including one-line fixes.
4. **The engine core stays framework-free.** Frameworks live in `src/ui` only (ADR-0007).

## Quick Commands
* Enable hooks (once per clone): `pnpm hooks:install`
* Development server: `pnpm dev`
* Full local gate: `pnpm verify` (secrets + typecheck + tests)
* Run tests: `pnpm test`
* Strict typecheck: `pnpm typecheck`
* Secret scan: `pnpm verify:secrets` (add `--all` for the whole repo)
* Production build: `pnpm build`
* Benchmarks: `pnpm benchmark`

## Delivery
```bash
git checkout -b feat/<scope>-<slug>    # never commit on main
pnpm verify
git push -u origin feat/<scope>-<slug>
gh pr create --fill --base main        # screenshots required for visual changes
gh pr merge --squash --delete-branch   # after checks are green; a human merges, not the agent
```

Always adhere to the Prime Directive: Research → Define → ADR → Design the Experience → Prototype → Benchmark → Implement → Test → Profile → Document → Review → PR → Merge → Continue.
