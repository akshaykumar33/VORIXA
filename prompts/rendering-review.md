# Rendering Review Prompt

Verify rendering pipeline correctness:
1. Ensure WebGPU and WebGL2 fallback backends exhibit visual parity.
2. Check that vertex buffers, uniform buffers, and textures are cleanly destroyed upon chunk unmount.
3. Validate that no simulation logic is executed inside the render pass.
