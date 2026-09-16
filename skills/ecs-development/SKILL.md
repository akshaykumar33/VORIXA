---
name: ecs-development
description: Patterns for high-performance Entity-Component-System design in VORIXA.
---

# ECS Development Skill

Use this skill when defining components, creating systems, or optimizing entity iteration.

## Guidelines
1. **Contiguous Arrays**: Store entity component fields in flat `Float32Array` or `Uint32Array` buffers.
2. **Bitmask Archetypes**: Use bitwise masks for $O(1)$ query qualification.
3. **No Garbage Collection**: Never instantiate new JavaScript objects in per-frame query loops.
