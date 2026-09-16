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
