# Contributing to VORIXA

Thank you for your interest in contributing to **VORIXA**, the next-generation web-native infinite procedural game and experimental game-engine platform.

## Prime Directive

Every contribution must honor the engineering cycle defined in the project constitution:

```text
Research → Define → ADR → Design the Experience → Prototype → Benchmark
  → Implement → Test → Profile → Document → Review → PR → Merge → Continue
```

### The two non-negotiables

* **UI/UX is an acceptance criterion.** A feature that works but feels bad is not done. Every
  user-facing change needs considered visuals, motion, loading/empty/error/offline states, keyboard
  navigation, screen-reader labels, and verified mobile/tablet/desktop behavior.
* **Functionality ships complete.** No buttons that do nothing, no happy-path-only work, no settings
  that don't take effect. Cut scope vertically, never horizontally.

### Dependencies

The stack is **open**. Reach for any library that delivers a materially better experience or more
capability — velocity counts as justification. What you owe in return is a recorded reason, a
measured bundle cost, and an exit path. Architectural changes still need an ADR.

* **Architectural Boundaries**:
  - **The engine core stays framework-free** — `src/core`, `src/ecs`, `src/rendering`, `src/input`,
    `src/audio` import no UI framework. CI enforces this (ADR-0007).
  - Presentation/UI never mutates simulation state directly.
  - Input hardware never touches player movement logic directly; all inputs normalize into commands.
  - Rendering must not contain gameplay rules.

## Git & Commit Standards

We strictly enforce **Conventional Commits v1.0.0**:

Format: `<type>(<scope>): <short description in lowercase>`

Allowed Types:
* `feat`: New feature for the user or runtime
* `fix`: Bug fix
* `docs`: Documentation only changes
* `style`: Code style (formatting, white-space)
* `refactor`: Code change that neither fixes a bug nor adds a feature
* `perf`: Performance improvements
* `test`: Adding missing tests or correcting existing tests
* `build`: Build system or external dependencies
* `ci`: Continuous Integration configuration
* `chore`: Maintenance tasks

Allowed Scopes:
* `repo`, `engine`, `render`, `ecs`, `input`, `audio`, `world`, `ui`, `ux`, `adr`, `vision`, `ci`, `test`, `deps`, `security`

Commit messages are validated automatically by the `commit-msg` hook.

## Development Workflow

**The full ruleset is [`docs/operations/GIT_WORKFLOW.md`](docs/operations/GIT_WORKFLOW.md). Read it once.**

> **Nothing reaches `main` except through a pull request** — including one-line fixes.

1. Clone and install:
   ```bash
   pnpm install
   pnpm hooks:install     # enables secret scanning + commit validation. Run once per clone.
   ```
2. Branch from an up-to-date `main`:
   ```bash
   git checkout main && git pull --ff-only origin main
   git checkout -b feat/ui-inventory-grid
   ```
3. Develop:
   ```bash
   pnpm dev
   ```
4. Gate locally before you push:
   ```bash
   pnpm verify            # secret scan + typecheck + tests
   ```
5. Push and open a PR:
   ```bash
   git push -u origin feat/ui-inventory-grid
   gh pr create --fill --base main
   ```
   Complete `.github/PULL_REQUEST_TEMPLATE.md` fully. **Attach a screenshot or capture for any
   visual change** — this is required, not encouraged.
6. Merge once `quality-gates`, `engine-boundary`, and `secret-scan` are green:
   ```bash
   gh pr merge --squash --delete-branch
   ```

## Codebase Protection

The pre-commit hook blocks commits containing credentials, `.env` files, private keys, files over
2 MB, conflict markers, or `debugger` statements — and blocks committing on `main` at all.

```bash
pnpm verify:secrets          # scan staged changes
pnpm verify:secrets --all    # scan the whole repository
```

If you ever commit a secret: **rotate the credential first**, then fix history. See
`GIT_WORKFLOW.md` §2.5. For a genuine false positive, `--no-verify` exists — but you must disclose
it in the PR and narrow the pattern in the same PR (§2.4).
