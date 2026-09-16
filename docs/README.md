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
└── operations/           # CI/CD, observability, release management
```

## Governance & Rules

1. **Documentation Must Track Code**: When an architecture decision changes or a phase completes, corresponding documents must be updated immediately.
2. **No Unearned Claims**: Never claim a system is "AAA", "optimized", or "production-ready" without verifiable benchmark evidence.
3. **ADR Requirement**: Any fundamental technology choice or paradigm shift requires an accepted ADR before merging to `main`.
