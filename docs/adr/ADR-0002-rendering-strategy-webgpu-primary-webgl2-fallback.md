# ADR-0002: Rendering Strategy: WebGPU Primary with WebGL2 Fallback

* **Status**: Accepted
* **Date**: 2026-09-16
* **Deciders**: Engineering Kernel

## Context
VORIXA aims for visually stunning 3D procedural environments. While WebGPU is the future of web graphics with modern low-overhead pipelines and compute shaders, global browser availability is still evolving.

## Decision Drivers
* Maximizing graphical throughput (draw-call reduction, compute culling).
* Ensuring maximum cross-device accessibility (laptops, mobile phones, older browsers).
* Avoiding premature lock-in to heavyweight third-party rendering engines (Three.js/Babylon.js).

## Considered Options
1. **Three.js**: Broad device reach, but carries substantial memory overhead, garbage collection churn, and historical baggage.
2. **WebGPU Exclusively**: Cutting edge, but excludes users on older browsers or hardware lacking WebGPU driver support.
3. **Custom Dual-Backend (WebGPU Primary + WebGL2 Fallback)**: Direct engine interface that routes drawing to WebGPU when available and falls back cleanly to WebGL2.

## Decision
Adopt a custom **dual-backend rendering architecture**: `Renderer` interface with `WebGPURenderer` as the primary engine and `WebGL2Renderer` as the compatibility fallback.

## Consequences
### Positive
* High-end devices unlock full compute shader culling and advanced lighting passes.
* Guaranteed functional fallback on any device with basic WebGL2 support.
* Direct memory management without third-party runtime bloat.
### Negative
* Requires maintaining two shader representations (WGSL and GLSL ES 3.00) for common materials.
