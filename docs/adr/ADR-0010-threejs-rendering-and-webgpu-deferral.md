# ADR-0010: Three.js Rendering, and Deferring WebGPU

* **Status**: Accepted
* **Date**: 2026-09-23
* **Deciders**: Engineering Kernel
* **Supersedes**: ADR-0002 (WebGPU primary with WebGL2 fallback)

## Context

ADR-0002 is Accepted and says the renderer will be a **custom dual-backend engine** — a hand-rolled
`WebGPURenderer` with a `WebGL2Renderer` fallback — listing "avoiding premature lock-in to
heavyweight third-party rendering engines (Three.js/Babylon.js)" among its drivers.

The codebase does the opposite. `src/rendering/GameRenderer.ts` is built on Three.js, and its own
header records why: *"This replaces the hand-rolled WebGPU/WebGL2 renderers. That code was correct
in the end, but everything it spent effort on — colour space, winding order, depth conventions,
shadow setup — is solved infrastructure that contributes nothing to whether the game is fun."*

So an accepted architectural decision was reversed in code with nothing recording the reversal.
Anyone reading `docs/adr/` would conclude the renderer is custom and dual-backend. It is neither.
This ADR closes that gap and states the current position.

## Decision

**Three.js is the renderer.** WebGPU is deferred, not abandoned.

## Why the reversal was right

ADR-0002's negative consequence — "requires maintaining two shader representations (WGSL and GLSL
ES 3.00) for common materials" — was understated. In practice the custom backends also owned colour
management, shadow mapping, tone mapping, frustum culling and resource lifetime. All of it is
solved, none of it is differentiating, and every hour spent on it was an hour not spent on the
course or the movement.

The lock-in concern was real but mispriced. Three.js is a library, not a framework: it renders a
scene graph and imposes nothing on the engine core, which remains framework-free per ADR-0007.

## Why WebGPU is deferred rather than pursued

The goal in ADR-0002 — WebGPU where available, WebGL2 elsewhere — is now reachable *through*
Three.js via `three/webgpu` and TSL, without a custom engine. It is still not worth doing yet:

* **No measured need.** The game runs at 144 fps, 6.95 ms average, 7.96 ms p95, and is
  vsync-limited rather than GPU-bound. There is no bottleneck for WebGPU to relieve.
* **It would mean rewriting every shader.** `Atmosphere`, `GateMaterial` and the dust field are
  raw GLSL `ShaderMaterial`s. Worse, `SurfaceMaterial` patches the standard material through
  `onBeforeCompile`, which has **no equivalent under WebGPU** — TSL replaces the mechanism outright.
  That is not a migration, it is a rewrite of the entire visual layer.
* **Dynamic resolution already covers the real risk.** The failure this project actually faces is
  a weak laptop GPU, and DRS trades resolution for frame rate automatically. WebGPU would raise
  the ceiling; DRS raises the floor, and the floor is what loses players.

## Consequences

### Positive

* The documentation now matches the code, which is the point of keeping ADRs at all.
* Effort stays on gameplay and visual design rather than on re-implementing solved infrastructure.
* Compute shaders and draw-call reduction remain available later without another rewrite, because
  Three.js supports both backends behind one scene graph.

### Negative

* No compute shaders today, so GPU-side culling and particle simulation are off the table.
* Three.js is now a load-bearing dependency: the main bundle is 601 kB (153 kB gzipped), most of
  it Three.js, over Vite's 500 kB warning threshold.
* WGSL expertise in `skills/shader-development` is currently unused.

### Revisit when

Any one of: the frame budget is genuinely GPU-bound at target resolution on mid-range hardware;
a feature needs compute shaders (large-scale particle simulation, GPU culling); or the TSL
ecosystem matures enough that porting the four custom shaders is a day rather than a week.

Until then, treat "we should move to WebGPU" as an unmeasured assumption and ask which frame it
would make faster.
