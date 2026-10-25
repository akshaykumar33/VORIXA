# Changelog

All notable changes to VORIXA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-25

The first release: VORIXA's game modes, led by Akhada, a 3D fighter of the epics.

### Added
- **Akhada** (`?mode=akhada`): a one-on-one 3D fighter in the style of Street Fighter.
  - Eight asuras and rakshasas of the Ramayana, Mahabharata, Devi Mahatmya and Bhagavata Purana, each with their own look and powers: Ravana and his ten heads, Mahishasura, Kumbhakarna, Hiranyakashipu, Raktabija, Tataka, Holika and Bakasura.
  - Four arenas in four states, each with three rounds of weather: the ghats of Varanasi, the field of Kurukshetra, the shore of Rameswaram and the golden fort of Jaisalmer.
  - Frame data, blocking high and low, motion-input specials, dashes, throws, special cancels, a super meter, rounds and a 99-second clock.
  - A fighting stance, hit-stop, impact sparks and a fighting-game camera.
  - Arcade ladder with versus screens and an ending, versus CPU at three difficulties, and two players on one keyboard or gamepads.
  - Live-synthesised ragas, the shankh and temple bells.
- **Neon Knuckles** (`?mode=brawler`): a co-op side-scrolling brawler with painted art and story scenes.
- **Rush** (`?mode=rush`) and **On Foot** (`?mode=onfoot`): the car racer and the platformer, restored.
- **VORIXA City** (the default page): an open city with its outposts, chaos, radio and wild country.

### Engine and tooling (earlier work)
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
