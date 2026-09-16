# Game Design Document (GDD) — VORIXA

## Executive Summary
* **Title**: VORIXA
* **Genre**: Sci-Fi Procedural Action-Adventure / Explorer
* **Target Audience**: Fans of *Risk of Rain*, *No Man's Sky*, *Titanfall 2*, and web-native emergent gaming
* **Perspective**: First-Person (with optional Third-Person spectator / XR mode)
* **Platforms**: Modern Web Browsers (Desktop Chrome/Edge/Firefox/Safari, Mobile, WebXR)

---

## 1. Core Gameplay Loop

```text
+-------------------+        +-------------------+        +-------------------+
|     TRAVERSE      | ---->  |   SURVIVE/FIGHT   | ---->  |   EXTRACT/UPGRADE |
| Procedural Terrain|        | Rogue Guardians   |        | Anomalous Cores   |
| Kinetic Movement  |        | Biome Hazards     |        | Suit Capacitors   |
+-------------------+        +-------------------+        +-------------------+
          ^                                                         |
          +---------------------------------------------------------+
```

1. **Traverse**: Explore unfamiliar biomes across procedural heights, navigating chasms via double-jump, dash, and slope slides.
2. **Survive & Fight**: Engage rogue biome automatons using projectile weapons, defensive shields, and environmental positioning.
3. **Extract & Upgrade**: Recover rare resonance crystals and technology relics to enhance suit thrusters, unlock weapon modifications, and attune portal gateways.

---

## 2. World Design & Biomes
Worlds are divided into distinct ecological biomes:
* **Crystalline Barrens**: Sharp silica spires, low gravity pockets, electrical atmospheric storms.
* **Bioluminescent Chasms**: Deep subterranean caves, glowing fungal canopies, zero-light stealth gameplay.
* **Obsidian Calderas**: Volcanic magma flows, thermal air updrafts allowing extended aerial gliding.
* **Sub-Zero Cryo-Plains**: Slippery ice sheets that amplify slide velocity, blinding blizzards.

---

## 3. Player Mechanics Breakdown
* **Health & Shield System**: Rechargeable energy barrier that absorbs instant damage, backed by finite suit integrity requiring nanite repair packs.
* **Kinetic Momentum Engine**: Velocity accumulates while sliding down inclines and converts into vertical leaps.
* **Modular Weapon Matrix**: Base particle carbine customizable with elemental affinities (Thermal, Cryo, Kinetic, Disruption).
