# Entity-Component-System (ECS) Architecture: VORIXA

The ECS provides high-throughput, cache-conscious state management for thousands of procedural entities, particles, and physics proxies.

## 1. Design Principles

```text
Entity ID (uint32)
   ↓ (Bitmask Lookup)
Component Storage (TypedArrays: Float32Array / Uint32Array)
   ↓ (Matched by System Query)
Systems (Pure functional tick loops: PhysicsSystem, MovementSystem, CombatSystem)
```

## 2. Memory & Layout
* **Contiguous TypedArrays**: Component attributes (e.g. `TransformComponent: x, y, z, rx, ry, rz, rw, sx, sy, sz`) are stored in flat TypedArrays rather than arrays of JavaScript heap objects, avoiding garbage collection pauses during gameplay.
* **Component Bitmasks**: Fast 64-bit integer masks allow $O(1)$ query testing to filter entities matching required archetypes.
* **Recycled Entity Pools**: Recycled slot pools ensure entity destruction does not trigger garbage collection sweeps.
