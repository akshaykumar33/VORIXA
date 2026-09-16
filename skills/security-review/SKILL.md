---
name: security-review
description: Auditing web runtime safety, shader execution integrity, and memory safety.
---

# Security Review Skill

Use this skill when introducing network protocols, shader code, or persistence migrations.

## Guidelines
1. **Shader Static Analysis**: Ensure shaders contain bounded loops and validated array offsets.
2. **Input Sanitization**: Treat all incoming network and savegame payloads as untrusted data.
3. **No Unsafe Execution**: Disallow `eval()` or unsanitized DOM insertion.
