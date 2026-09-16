# Device Tiers & Degradation Matrix: VORIXA

| Attribute | Tier 1 (High) | Tier 2 (Mid) | Tier 3 (Low / Fallback) |
| --------- | ------------- | ------------ | ----------------------- |
| **Typical Target** | Desktop RTX/Apple M-Series | Ultrabooks / High-end Phones | Budget Laptops / Older Phones |
| **Primary Backend** | WebGPU | WebGPU / WebGL2 | WebGL2 |
| **Resolution Target**| Native 1440p–4K | 1080p | 720p with dynamic scaling |
| **Target Frame Rate**| 60 – 144 FPS | 60 FPS | 30 – 60 FPS |
| **Active Chunk Radius**| 12 chunks (384m) | 8 chunks (256m) | 4 chunks (128m) |
| **Shadows & Lighting** | Dynamic Casaded Shadow Maps | Directional Shadows | Baked ambient + simple vertex light |
| **Particle Simulation**| GPU Compute Particles (50k) | Instanced Quad Emitters (5k) | Minimal Particle Sprites (500) |
