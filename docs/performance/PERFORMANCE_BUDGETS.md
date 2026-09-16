# Performance Budgets: VORIXA

The target baseline is an unwavering **60 FPS ($16.66\text{ms}$ frame time)** across all supported tiers, with $120\text{Hz}$ / $144\text{Hz}$ supported on Tier 1 hardware.

## Per-Frame Time Budget (60 FPS / 16.66ms)

```text
+-----------------------+-----------------------+-----------------------+
| Simulation / ECS Tick | Culling & Scene Graph | GPU Command Encoding  |
| 3.0ms maximum         | 2.5ms maximum         | 3.0ms maximum         |
+-----------------------+-----------------------+-----------------------+
| Physics & Raycasts    | Audio & Input Events  | Presentation / HUD    |
| 3.5ms maximum         | 1.0ms maximum         | 1.5ms maximum         |
+-----------------------+-----------------------+-----------------------+
| Headroom Safety Buffer: 2.16ms                                        |
+-----------------------------------------------------------------------+
```

## Hard Resource Thresholds
* **JavaScript Heap Memory**: $< 350\text{MB}$ steady state.
* **GC Allocations Per Frame**: Zero object allocations inside simulation and render update loops.
* **Draw Calls**: $< 150$ draw calls per frame via GPU instancing and indirect draws.
* **Initial Page Payload**: $< 2.0\text{MB}$ compressed.
