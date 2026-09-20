# VORIXA Documentation System

Welcome to the engineering documentation library for **VORIXA**.

## Documentation Structure

```text
docs/
├── audits/               # Repository and performance audits
│   └── INITIAL_REPOSITORY_AUDIT.md
├── vision/               # Product identity, pillars, player fantasy
├── game-design/          # GDD, core/meta loops, combat, progression
├── architecture/         # System overview, rendering, ECS, input, audio
├── adr/                  # Architectural Decision Records
├── design/               # Visual design system, HUD, UI, accessibility
├── performance/          # Frame budgets, device tiers, profiling
├── testing/              # Testing pyramid, QA, compatibility matrix
├── roadmap/              # Master roadmap and phase documentation (00–08)
└── operations/           # Git workflow, CI/CD, observability, releases
```

## Start Here

| Document | What it governs |
| --- | --- |
| [`../AGENTS.md`](../AGENTS.md) | The engineering constitution — binding on humans and AI agents |
| [`../prompts/master_execution_prompt.md`](../prompts/master_execution_prompt.md) | The operating prompt for all work from Phase 1 onward |
| [`operations/GIT_WORKFLOW.md`](operations/GIT_WORKFLOW.md) | Branching, secret protection, PR standard, merge rules |
| [`adr/README.md`](adr/README.md) | Every architectural decision on record |

## Governance & Rules

1. **Documentation Must Track Code**: When an architecture decision changes or a phase completes, corresponding documents must be updated immediately.
2. **No Unearned Claims**: Never claim a system is "AAA", "optimized", or "production-ready" without verifiable benchmark evidence.
3. **ADR Requirement**: Any fundamental technology choice or paradigm shift requires an accepted ADR before merging to `main`.
4. **Experience Is Mandatory**: UI/UX quality and complete functionality are acceptance criteria, not follow-up work. See `AGENTS.md` §0.
5. **PR-Only Delivery**: Nothing reaches `main` except through a pull request with green checks. See `operations/GIT_WORKFLOW.md`.
