---
name: testing
description: Automated unit testing, simulation verification, and headless bot integration in VORIXA.
---

# Testing Skill

Use this skill when authoring unit tests, simulation replays, or visual tests.

## Guidelines
1. **Deterministic Tests**: Seed random number generators with fixed constants in test environments.
2. **Execution Speed**: Unit tests must run under $5\text{ms}$ each.
3. **Smoke Verification**: Verify that ECS components can be registered, queried, and unmounted cleanly without leaking memory.
