---
name: procedural-generation
description: Deterministic algorithms for infinite procedural terrain, flora distribution, and world streaming.
---

# Procedural Generation Skill

Use this skill when developing terrain algorithms, noise samplers, or chunk streaming pipelines.

## Guidelines
1. **Mathematical Determinism**: Pure functions based on Seed and $(X, Z)$ coordinate space.
2. **Worker Offloading**: Iso-surface meshing and noise evaluation must execute in background Web Workers.
3. **LOD Boundaries**: Generate appropriate level-of-detail meshes based on player proximity.
