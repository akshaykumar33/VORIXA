# VORIXA

> A next-generation, web-native, infinite procedural game and experimental game-engine platform.

[![CI Status](https://github.com/akshaykumar33/VORIXA/actions/workflows/ci.yml/badge.svg)](https://github.com/akshaykumar33/VORIXA/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Engine: WebGPU / WebGL2](https://img.shields.io/badge/Graphics-WebGPU%20%7C%20WebGL2-orange.svg)](#technology-overview)

---

## 1. Project Vision

**VORIXA** is designed from the metal up to deliver an infinite, procedural, continuous 3D game universe directly in modern web browsers without plugins, external downloads, or multi-gigabyte installations. By pairing modern WebGPU compute and rasterization with a deterministic ECS simulation, VORIXA establishes a clean, decoupled architecture built to evolve over years of active development.

```text
               +----------------------------------+
               |        Presentation & HUD        |
               +----------------------------------+
                                |
               +----------------------------------+
               |         Gameplay Systems         |
               +----------------------------------+
                                |
               +----------------------------------+
               |        ECS Simulation Loop       |
               +----------------------------------+
                /        |               |        \
               v         v               v         v
         [Rendering]  [Input Engine]  [Audio]  [World Chunks]
```

---

## 2. Capability Status

We separate measured facts from targets. Per the project constitution, systems are classified strictly by their verified status:

| Subsystem | Status | Details |
| --------- | ------ | ------- |
| **Capability Detection** | `Implemented` | Dynamic inspection of WebGPU, WebGL2, float textures, max dimensions, and device tiers |
| **Runtime Engine Shell** | `Implemented` | Fixed-timestep (60 ticks/s) loop, delta time accumulation, variable render interpolation |
| **Normalized Input Engine** | `Implemented` | Action-based input bus decoupling keyboard, mouse, and gamepads from simulation logic |
| **Typed ECS Foundation** | `Implemented` | Dense typed entity allocation, bitmask component filters, cache-coherent iteration |
| **Audio Engine Stub** | `Implemented` | Web Audio API master bus, sound effect synthesizer, ambient generative pad |
| **Diagnostic HUD** | `Implemented` | Real-time FPS, P95 frame latency, active GPU API, hardware capability readout |
| **WebGPU Pipeline** | `Experimental` | WGSL shader pipeline with dynamic color passes |
| **WebGL2 Fallback** | `Experimental` | Context fallback for platforms and browsers without native WebGPU support |
| **Procedural Terrain** | `Planned` | Deterministic Simplex/Voronoi terrain generation with chunk streaming (Phase 3) |
| **Character Physics** | `Planned` | Decoupled raycast and AABB collision resolution (Phase 2) |
| **Multiplayer Replication** | `Research` | WebRTC DataChannels state synchronization and rollback prediction (Phase 6) |
| **WebXR Support** | `Research` | Dual-view spatial tracking and WebXR device integration (Phase 7) |

---

## 3. Architecture Overview

VORIXA enforces strict layer decoupling:

1. **Platform Layer**: Browser capabilities, event listeners, canvas management, and WebGPU/WebGL2 contexts.
2. **Engine Kernel**: Deterministic fixed-timestep loop (`Engine.ts`) guaranteeing identical simulation updates across hardware.
3. **Normalized Input Bus**: Devices emit normalized actions (`MOVE_FORWARD`, `LOOK`, `JUMP`, `PAUSE`) so gameplay code is completely agnostic of input hardware.
4. **ECS Core**: Pure data components managed in contiguous TypedArrays for cache efficiency.
5. **Renderer Abstraction**: Clean rendering interface (`Renderer.ts`) allowing runtime switching between WebGPU and WebGL2 without touching game logic.

---

## 4. Current Controls

| Action | Primary Keyboard / Mouse | Gamepad |
| ------ | ------------------------ | ------- |
| **Move Forward** | `W` / `ArrowUp` | Left Stick Up |
| **Move Backward** | `S` / `ArrowDown` | Left Stick Down |
| **Strafe Left** | `A` / `ArrowLeft` | Left Stick Left |
| **Strafe Right** | `D` / `ArrowRight` | Left Stick Right |
| **Jump** | `Space` | Button `A` (Bottom Face) |
| **Dash / Sprint** | `ShiftLeft` | Button `X` / Left Stick Click |
| **Look / Turn** | Mouse Movement | Right Stick |
| **Pause / Menu** | `Escape` / `KeyP` | Start / Options |

---

## 5. Supported Platforms & Device Tiers

| Tier | Target Hardware | Graphics API | Resolution Target | Frame Rate |
| ---- | --------------- | ------------ | ----------------- | ---------- |
| **Tier 1 (High)** | Desktop / Modern Laptop GPU (NVIDIA RTX, Apple Silicon M-series, AMD RDNA) | WebGPU | 1440p – 4K | 60 – 120 FPS |
| **Tier 2 (Mid)** | Ultrabooks / Mid-tier Mobile (Intel Iris Xe, Snapdragon 8 Gen) | WebGPU / WebGL2 | 1080p | 60 FPS |
| **Tier 3 (Low)** | Budget Laptops / Older Mobile Devices | WebGL2 Fallback | 720p – 1080p | 30 – 60 FPS |

---

## 6. Local Development

### Prerequisites
- **Node.js**: `v20.0.0` or higher
- **pnpm**: `v9.0.0` or higher (recommended)
- A WebGPU-compatible browser (Chrome 113+, Edge 113+, Firefox Nightly with WebGPU flag, or Safari 18+)

### Setup
```bash
# Clone the repository
git clone https://github.com/akshaykumar33/VORIXA.git
cd VORIXA

# Install dependencies
pnpm install

# Start local development server with HMR
pnpm dev
```

Navigate to `http://localhost:3000` in your browser.

---

## 7. Testing & Quality Gates

```bash
# Run unit tests
pnpm test

# Run TypeScript strict typecheck
pnpm typecheck

# Verify production build compilation
pnpm build

# Run benchmark suite
pnpm benchmark
```

---

## 8. Master Phased Roadmap

* **[Phase 00 — Foundation](docs/roadmap/PHASE-00-FOUNDATION.md)**: Repository constitution, AI operating system, minimal runnable shell, capabilities detection, and baseline HUD. `[CURRENT]`
* **[Phase 01 — Vertical Slice](docs/roadmap/PHASE-01-VERTICAL-SLICE.md)**: First-person camera, primitive 3D mesh rendering, basic physics collision, spatial movement.
* **[Phase 02 — Gameplay Mechanics](docs/roadmap/PHASE-02-GAMEPLAY.md)**: Kinetic parkour movement, stamina, weapons, combat actions.
* **[Phase 03 — Procedural World](docs/roadmap/PHASE-03-PROCEDURAL-WORLD.md)**: Infinite chunk generation, noise algorithms, level-of-detail (LOD), world streaming.
* **[Phase 04 — AI & Ecosystems](docs/roadmap/PHASE-04-AI.md)**: Utility AI, behavior trees, enemy archetype state machines.
* **[Phase 05 — Progression & RPG](docs/roadmap/PHASE-05-PROGRESSION.md)**: Inventory, stats, skill trees, persistence with IndexedDB.
* **[Phase 06 — Multiplayer](docs/roadmap/PHASE-06-MULTIPLAYER.md)**: WebRTC DataChannels, state synchronization, client-side prediction.
* **[Phase 07 — Natural Input & XR](docs/roadmap/PHASE-07-XR.md)**: WebXR API, 6DoF VR/AR controllers, hand tracking.
* **[Phase 08 — Production Hardening](docs/roadmap/PHASE-08-PRODUCTION.md)**: Asset optimization, global CDN streaming, cross-device QA.

---

## 9. Documentation Index

- [Architecture System Overview](docs/architecture/SYSTEM_OVERVIEW.md)
- [Architectural Decision Records (ADRs)](docs/adr/README.md)
- [Game Design Master Document (GDD)](docs/game-design/GDD.md)
- [Performance Budgets](docs/performance/PERFORMANCE_BUDGETS.md)
- [Testing Strategy](docs/testing/TEST_STRATEGY.md)
- [AI Agent Instructions (AGENTS.md)](AGENTS.md)

---

## 10. License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
