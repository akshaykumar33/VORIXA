---
name: rendering-engine
description: Best practices for WebGPU and WebGL2 rendering pipeline development in VORIXA.
---

# Rendering Engine Development Skill

Use this skill when developing shaders, pipeline layouts, bind groups, or render passes.

## Guidelines
1. **WebGPU First**: Structure graphics pipelines around WebGPU bind groups and render bundles.
2. **WebGL2 Parity**: Provide clean fallback paths for unsupported hardware.
3. **Buffer Management**: Explicitly call `.destroy()` on unreferenced `GPUBuffer` instances when chunks unmount.
4. **Draw Call Optimization**: Use instanced rendering and multidraw indirect where available.
