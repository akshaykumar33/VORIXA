# Release Review Prompt

Final checklist prior to publishing a milestone release:
1. All automated quality gates (typecheck, tests, build) pass with zero warnings.
2. `CHANGELOG.md` reflects all added, changed, and fixed items.
3. Bundle size conforms to the $< 2\text{MB}$ initial payload budget.
4. Git tags created matching SemVer format (e.g. `v0.1.0`).
