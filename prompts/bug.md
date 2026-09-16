# Bug Fix Prompt

Use this prompt when investigating and resolving an engine bug:

1. **Reproduce**: Create a minimal reproducing test case in `tests/`.
2. **Root Cause Analysis**: Inspect call stacks, state mutations, and memory logs.
3. **Fix**: Apply the minimal necessary fix respecting system boundaries.
4. **Verify**: Ensure the test passes and existing test suites remain green.
5. **Commit**: Create a conventional commit: `fix(<scope>): <description>`.
