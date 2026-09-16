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
