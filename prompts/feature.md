# Feature Implementation Prompt

Use this prompt when implementing a new capability in VORIXA:

1. **Understand Existing Code**: Locate relevant modules in `src/` and read corresponding architecture documents in `docs/architecture/`.
2. **Plan**: Propose an atomic, modular implementation adhering to the Prime Directive.
3. **Implement**: Write clean, strict TypeScript with zero heap allocation in tick loops.
4. **Test**: Write automated unit tests covering happy paths, edge cases, and failure modes.
5. **Document**: Update related documentation and the active phase roadmap.
6. **Commit**: Create a conventional commit: `feat(<scope>): <description>`.
