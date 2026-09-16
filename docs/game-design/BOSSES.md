# Boss Encounters: VORIXA

Bosses guard biome monoliths and act as apex extraction challenges.

## 1. The Monolith Warden: "Apex Sol-Construct"
* **Arena**: Elevated planetary crater with floating magnetic pillars.
* **Phase 1 (100% – 60% HP)**:
  - Sweeps laser grids across ground level, forcing player to wall-run and leap between suspended pillars.
* **Phase 2 (60% – 25% HP)**:
  - Enters airborne artillery mode, raining thermal bombardment while spawning Scarab Swarms.
* **Phase 3 (< 25% HP)**:
  - Overcharges its core: arena gravity decreases by 50%, and the boss charges across the arena, requiring timed air-dash evasions.

## 2. Design Invariants
* Every boss attack must provide a distinct visual and audio telegraph (> 400ms).
* Arena layouts must always support the player's full kinetic traversal toolkit (slides, wall-runs, air-dashes).
