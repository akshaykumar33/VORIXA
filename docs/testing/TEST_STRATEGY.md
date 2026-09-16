# Testing Strategy & Pyramid: VORIXA

Testing in VORIXA is divided into discrete layers:

```text
               / \
              /   \
             / E2E \       <-- Playwright headless browser tests
            /-------\
           /  Integ  \     <-- Input-to-Simulation integration
          /-----------\
         /  Unit Tests \   <-- Vitest / Node test runner: ECS, Math, Inputs
        /---------------\
```

## Quality Gates
* **Unit Tests**: Must execute in $< 5$ seconds locally via `pnpm test`.
* **Typecheck**: Zero TypeScript errors allowed (`pnpm typecheck`).
* **Deterministic Simulation**: A fixed sequence of input actions fed into the simulation kernel must produce the exact same entity coordinates across test runs down to floating point precision ($10^{-5}$).
