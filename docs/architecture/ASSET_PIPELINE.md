# Asset Pipeline: VORIXA

The asset pipeline prioritizes procedural synthesis, modern compact formats, and web streaming efficiency.

## 1. Format Standards
* **3D Models**: Binary glTF (`.glb`) compressed via Draco or meshoptimizer, loaded asynchronously via streaming Fetch.
* **Textures**: Basis Universal / KTX2 supercompressed GPU texture formats, transcoding natively to BC7 (desktop), ASTC (mobile), or ETC2 at runtime.
* **Shaders**: Authoritative WGSL (WebGPU) with automated transpile/fallback to GLSL ES 3.00 for WebGL2.

## 2. Zero-Blocking Asynchronous Loading
Assets load in dedicated background Web Workers, transferring typed array vertex and index buffers to the main thread using zero-copy `Transferable` buffers.
