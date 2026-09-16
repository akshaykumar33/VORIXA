# ADR-0005: Procedural Infinite World Generation and Chunk Streaming

* **Status**: Accepted
* **Date**: 2026-09-16
* **Deciders**: Engineering Kernel

## Context
VORIXA requires an infinite-scale world without exceeding browser heap limits (~2GB) or stalling the main rendering thread.

## Decision Drivers
* Deterministic mathematical seeds.
* Non-blocking background mesh generation.
* Strict memory and GPU buffer recycling.

## Decision
Generate terrain as cubic coordinate chunks ($32\text{m} \times 64\text{m} \times 32\text{m}$) using multi-octave Simplex noise and cellular automata. Offload mesh generation to background Web Workers, transferring typed arrays directly to the main thread. Recycle evacuated chunk mesh buffers into an active pool.

## Consequences
### Positive
* Infinite terrain generation with zero main-thread hitching.
* Fixed, deterministic memory usage bounded by the active radius.
### Negative
* Inter-chunk boundary normal stitching requires adjacent coordinate awareness.
