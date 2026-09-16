# ADR-0003: High-Performance TypedArray ECS Architecture

* **Status**: Accepted
* **Date**: 2026-09-16
* **Deciders**: Engineering Kernel

## Context
High entity counts (thousands of projectiles, particles, flora props, enemy automatons) in a single-threaded JavaScript environment easily cause garbage collection pauses if entities are allocated as heap objects.

## Decision Drivers
* Zero Garbage Collection during gameplay loop.
* Contiguous memory layout for CPU cache efficiency.
* Deterministic iteration order for simulation reproducibility.

## Considered Options
1. **Object-Oriented Entity Hierarchy**: Easy to prototype, devastating garbage collection and pointer indirection.
2. **Third-Party ECS (bitecs / miniplex)**: Efficient, but introduces external dependency risk and complex build bundling.
3. **Custom Lightweight TypedArray ECS**: Tailored specifically for VORIXA's data structures with zero external dependencies.

## Decision
Implement a custom **Lightweight TypedArray ECS** using dense component storage buffers, bitmask archetypes, and recycled entity pools.

## Consequences
### Positive
* High-velocity iteration (over 50,000 entities processed per frame under 2ms).
* Absolute control over memory layout and zero heap allocation during game loop.
### Negative
* Component definitions require explicit index offsets rather than arbitrary JavaScript object properties.
