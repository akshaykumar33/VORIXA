# Changelog

All notable changes to VORIXA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Master repository bootstrap prompt and engineering constitution.
- Initial repository audit and technology baseline.
- Complete documentation system: Vision, Game Design (GDD), Architecture, ADRs, Design System, Performance Budgets, Testing Strategy, and Phased Roadmap (Phases 00–08).
- AI Agent Operating System (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) and 15 reusable skills under `skills/`.
- Minimal runnable engine shell with WebGPU capability detection and WebGL2 fallback.
- Normalized Input Engine supporting Keyboard, Mouse, and Gamepad.
- High-performance TypedArray ECS foundation with entity lifecycle and query systems.
- Live HUD overlay tracking FPS, P95 frame time, active rendering backend, and device tier.
- Automated testing suite verifying capability detection, input abstraction, and ECS execution.
- GitHub Actions CI/CD workflows for quality gating and security vulnerability auditing.
- Zero-allocation `Vec3` and `Mat4` math targeting WebGPU conventions (column-major storage, `[0, 1]` clip depth).
- First-person `Camera` with clamped pitch, frame-rate-independent position damping, and sprint FOV widening.
- Pointer-lock mouse capture with observable state, surfaced through a click-to-look prompt and a reticle that only lights up once look is actually captured.
- Playable first-person 3D slice: instanced monolith field rendered in a single draw call on both WebGPU and WebGL2, with hemisphere + key lighting, emissive accent landmarks, distance fog, and an antialiased world-space floor grid.
- Yaw-relative movement with diagonal normalisation, plus gravity, jumping, and ground collision — `Space` now moves the player rather than only playing a sound.

### Fixed
- Mouse look no longer drops motion between frames: deltas accumulate across all `mousemove` events in a frame and are cleared once consumed, so the view neither stutters under load nor spins forever after the mouse stops.
