# Differentiation: VORIXA

How VORIXA stands distinct against existing landscape games:

| Dimension | Typical Indie 3D Game | Typical Browser Game | VORIXA |
| --------- | --------------------- | -------------------- | ------ |
| **Distribution** | Steam / Epic / 40GB Install | WebGL / 2D / Casual IO game | Instant Web URL, < 2MB initial shell, streaming |
| **Graphics Tech** | Unreal / Unity native | Basic WebGL1 / Three.js demo | Custom WebGPU pipeline + WebGL2 fallback |
| **Simulation** | Heavy Physics / Non-deterministic | Single-thread JS animation loop | Fixed-timestep (60Hz) deterministic ECS |
| **World Scale** | Static hand-baked maps | Small arena / flat tile grid | Infinite procedural voxel/heightfield streaming |
| **Device Reach** | Windows PC only | Desktop Chrome only | Cross-device: Desktop, Mobile, Tablet, Gamepad, WebXR |
| **Input System** | Keyboard/Controller hardcoded | DOM click handlers | Normalized Action Bus supporting all input devices |
