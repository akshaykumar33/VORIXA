# Contributing to VORIXA

Thank you for your interest in contributing to **VORIXA**, the next-generation web-native infinite procedural game and experimental game-engine platform.

## Prime Directive

Every contribution must honor the engineering cycle defined in the project constitution:

```text
Research → Define → ADR → Design → Prototype → Benchmark → Implement → Test → Profile → Document → Review → Commit → Continue
```

* **No Premature Complexity**: Never introduce heavy libraries (Three.js, Babylon.js, TensorFlow, MediaPipe) without an approved ADR proving necessity.
* **Architectural Boundaries**:
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
* `repo`, `engine`, `render`, `ecs`, `input`, `audio`, `world`, `ui`, `adr`, `vision`, `ci`, `test`

## Development Workflow

1. Clone repository and install dependencies:
   ```bash
   pnpm install
   ```
2. Run local development server:
   ```bash
   pnpm dev
   ```
3. Run tests and typechecking:
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```
4. Open a Pull Request following `.github/PULL_REQUEST_TEMPLATE.md`.
