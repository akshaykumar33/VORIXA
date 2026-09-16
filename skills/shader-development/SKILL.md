---
name: shader-development
description: Standards for authoring WGSL and GLSL shaders with precision, portability, and safety.
---

# Shader Development Skill

Use this skill when writing or optimizing WGSL / GLSL shaders.

## Guidelines
1. **WGSL Formatting**: Organize WGSL structs with proper byte alignment (vec3 aligns to 16 bytes).
2. **Bounds Checking**: Prevent out-of-bounds array access in compute shaders.
3. **Dual Authoring**: When authoring a visual effect, verify that the corresponding WebGL2 GLSL 3.00 fallback functions accurately.
