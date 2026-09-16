# Shader Review Prompt

Inspect WGSL / GLSL shader code:
1. Ensure strict memory alignment for uniform structs.
2. Confirm array indices in compute shaders are strictly clamped against buffer lengths.
3. Validate presence of equivalent WebGL2 fallback implementation.
