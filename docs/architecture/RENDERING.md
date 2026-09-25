# Rendering Strategy & Pipeline: VORIXA

VORIXA implements a dual-backend rendering architecture: **WebGPU Primary** with **WebGL2 Fallback**.

## 1. Dual-Backend Architecture

```text
[Device Probe & Capabilities Detection]
                   ↓
        Does navigator.gpu exist?
              /          \
            YES           NO
            /              \
[Initialize WebGPU]     [Initialize WebGL2 Fallback]
  - GPUDevice creation     - Canvas 2D / WebGL2 context
  - WGSL Shader compilation - GLSL 3.00 ES compilation
  - Bind groups & storage  - Uniform buffers & VAOs
  - Compute pipelines      - Standard rasterization pass
```

## 2. WebGPU Capabilities
* **Compute-Assisted Culling**: Frustum culling and distance occlusion calculated on GPU compute passes, generating draw-indirect arguments without CPU stalling.
* **Modern Bind Groups**: Grouping frame-constant uniforms (camera projection, view matrices, sun vector) separately from per-draw dynamic buffers.
* **Precision**: 32-bit floating point depth buffers for rendering astronomical celestial distances without z-fighting.

## 3. WebGL2 Fallback Path
* Ensures playability across older macOS devices without WebGPU flags, legacy smartphones, and locked-down corporate/educational browser environments.
* Gracefully degrades advanced visual features: replaces volumetric volumetric god-rays with lightweight radial post-process blurs, and uses simplified mesh instancing.

## 4. Shared Conventions

Both backends draw the **same** scene from the same buffers. Only the upload and draw calls differ.
Three conventions make that possible, and all three are load-bearing:

| Concern | Convention | Why it is not a free choice |
| ------- | ---------- | --------------------------- |
| Matrix storage | Column-major | Matches WGSL `mat4x4<f32>` memory layout, so a `Mat4` uploads with no transpose. |
| Clip depth | `[0, w]` (WebGPU/D3D) | One projection matrix serves both backends. The WebGL2 vertex shader remaps to OpenGL's `[-w, w]` with a single line: `clip.z = 2.0 * clip.z - clip.w`. |
| Facing | Outward faces wind counter-clockwise; both pipelines use their `CCW` front-face rule | A box with inverted culling still draws a convincing silhouette — you are seeing its inner walls — so the failure is not missing geometry but surfaces lit by the *opposite* normal. Watch for the floor going black. |

Scene generation lives in `src/rendering/SceneGeometry.ts`, outside both renderers, so a player on the
fallback path sees the identical world rather than a different one. It is also testable without a GPU.

## 5. Implemented Vertical Slice

The first-person slice is a single instanced forward pass:

* **Geometry**: one unit cube (24 vertices, flat per-face normals), drawn once per frame with
  `drawIndexed(36, instanceCount)`. The whole monolith field is **one draw call**.
* **Instance attributes**: `[translation, scale, albedo, material]` where `material` is
  `[emissive, grid]`, 44 bytes per instance, uploaded once at startup.
* **Cube origin**: the cube spans `y ∈ [0, 1]`, so an instance's translation is where it meets the
  floor and its Y scale is simply its height.
* **Shading**: hemisphere ambient + Lambert key light + emissive accents, then exponential distance
  fog to the horizon colour so the far plane is never visible as a hard edge.
* **Floor grid**: derivative-antialiased world-space grid (`fwidth`), distance-faded. In an
  untextured scene this is what tells the player they are moving rather than the world sliding past.
  Derivatives must be evaluated in uniform control flow, so the grid is computed for every fragment
  and *then* masked to the floor — not computed inside a branch.
* **Depth**: `depth24plus` on WebGPU, recreated lazily whenever the swap-chain size changes.

Camera behaviour and its two deliberate feel decisions (raw undamped look, damped position and FOV)
are documented at the top of `src/rendering/Camera.ts`.
