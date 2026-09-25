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

<!-- CODEGRAPH_START -->
## CodeGraph & Graphify Architecture Sync

This repository is indexed by CodeGraph (.codegraph/).
To minimize token consumption, prevent hallucinations, and preserve context:
- **ALWAYS reach for CodeGraph FIRST** before using grep, glob, or reading raw source files.
- Use the MCP tool codegraph_explore or run codegraph explore "<symbol or question>" to understand code, relationships, and call paths in one call.
- Use codegraph node <symbol> to view exact symbol implementations and caller/callee trails.
- Never dump or read full large files into context unless actively modifying them.
<!-- CODEGRAPH_END -->

## Award-Winning Creative & System Skills (`skills/`)
Activate the relevant skill from `skills/<name>/SKILL.md` before starting work:
- **`creative-motion-typography`**: GSAP ScrollTrigger, Lenis smooth scroll, fluid clamp typography, variable fonts, and magnetic cursors.
- **`creative-webgl-shaders`**: Three.js, custom GLSL/WGSL shaders, instanced particles, post-processing bloom, and shader pre-warming.
- **`sound-designer`**: Web Audio API master bus, procedural sound synthesis, spatial audio, and audio-reactive visuals.
- **`token-optimizer`**: CodeGraph symbol exploration, AST interface pruning, and surgical diff modifications.
- **`design-system-architect`**: Modern CSS (@container, @layer), OKLCH tokens, fluid responsiveness, and multi-device ergonomics.
- **`shader-development`**: Low-level WGSL & GLSL struct alignment and compute pipelines.
- **`rendering-engine`**: Engine render passes, Three.js pipelines, and frame-rate budgets.
- **`performance-profiling`**: Zero-allocation audits, memory leak detection, and 60+ FPS enforcement.
- **`accessibility`**: WCAG AA/AAA compliance, focus rings, screen reader labelling, and reduced motion.
