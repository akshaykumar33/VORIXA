---
name: gameplay-system
description: Development patterns for decoupled, deterministic gameplay mechanics in VORIXA.
---

# Gameplay System Development Skill

Use this skill when implementing player abilities, movement states, combat mechanics, or weapon systems.

## Guidelines
1. **Input Decoupling**: Read actions exclusively from the Normalized Action Bus.
2. **Deterministic Ticks**: Update gameplay logic within the $60\text{Hz}$ simulation tick, taking fixed $\Delta t$.
3. **State Machines**: Model character traversal (Walk, Sprint, Slide, WallRun, AirDash) as explicit, non-overlapping states.
