# Procedural Generation: VORIXA

Procedural generation in VORIXA is deterministic, stateless, and mathematically seeded.

## 1. Mathematical Pipeline

```text
Seed + Global Coordinates (x, z)
             ↓
[Domain Warping / Coordinate Perturbation]
             ↓
[Multi-octave Simplex Noise (Continental Elevation)]
             ↓
[Cellular / Voronoi Noise (Biome Classification & Ridgelines)]
             ↓
[3D Perlin Noise Voids (Cavern Systems & Overhangs)]
             ↓
[Iso-surface Marching Cubes / Dual Contouring Meshing]
             ↓
[GPU Buffer Upload via Shared Web Worker Transfer]
```

## 2. Determinism Guarantees
* All random sequences utilize a custom Mulberry32 / PCG32 generator guaranteeing identical float distributions across V8 (Chrome/Node), SpiderMonkey (Firefox), and JavaScriptCore (Safari).
* Chunk generation is pure function:
  $$f(\text{Seed}, X_{\text{chunk}}, Z_{\text{chunk}}) \to \text{MeshBuffer}(\text{Vertices}, \text{Normals}, \text{Indices}, \text{Materials})$$
