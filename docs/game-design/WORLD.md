# World Architecture & Biomes: VORIXA

The world of VORIXA is generated as an unbounded planetary surface tessellated into coordinate-addressed chunks.

## 1. Biome Stratification

```text
Altitude > 180m  : Alpine Spire (Glacial peaks, jagged silica reefs)
Altitude 60–180m : Highland Savannah (Alien brush, mineral formations, ruins)
Altitude 10–60m  : Valley Basin (Dense bioluminescent flora, riverbeds)
Altitude < 10m   : Subterranean Caverns (Sub-surface voids, magma pools)
```

## 2. Chunk Streaming Matrix
* **Chunk Volume**: $32 \times 64 \times 32$ meters.
* **Active Radius**:
  - Inner Circle ($r \le 64\text{m}$): Full collision mesh + dynamic entity simulation + high-poly LOD 0.
  - Middle Circle ($64\text{m} < r \le 192\text{m}$): Simplified collision + static LOD 1 mesh.
  - Outer Horizon ($192\text{m} < r \le 512\text{m}$): Impostor heightfield silhouette LOD 2 (no collision).
