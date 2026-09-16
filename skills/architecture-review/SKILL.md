---
name: architecture-review
description: Comprehensive workflow for evaluating architectural boundaries, subsystem coupling, and dependency health in VORIXA.
---

# Architecture Review Skill

Use this skill when introducing a new subsystem, altering cross-layer interfaces, or conducting architectural reviews.

## Review Steps
1. **Boundary Check**: Ensure presentation/UI does not mutate simulation state directly; ensure rendering does not contain gameplay rules.
2. **Memory Analysis**: Verify that hot paths do not introduce object allocations inside frame tick loops.
3. **ADR Alignment**: If the change introduces a new paradigm or external dependency, ensure an accepted ADR is authored.
4. **Summary**: Provide an architectural diff and risk assessment.
