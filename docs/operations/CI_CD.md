# CI/CD Pipeline: VORIXA

The Continuous Integration pipeline runs via GitHub Actions on every push and pull request:
1. **Lint & Format**: Ensures formatting and zero TypeScript syntax errors.
2. **Typecheck**: Verifies strict compiler flags (`tsc --noEmit`).
3. **Unit Tests**: Executes automated test runner suite.
4. **Production Build**: Compiles production bundles to guarantee zero bundling failure.
5. **Security Audit**: Dependency vulnerability scan (`npm audit`).
