# ADR-0006: Web Audio API Native Positional Sound Engine

* **Status**: Accepted
* **Date**: 2026-09-16
* **Deciders**: Engineering Kernel

## Context
3D immersive audio enhances player spatial awareness, but heavy audio libraries increase bundle size and memory footprints.

## Decision Drivers
* Native zero-dependency browser integration.
* Hardware-accelerated HRTF spatial audio positioning.
* Procedural generative sound capabilities to avoid large audio downloads.

## Decision
Use the standard browser **Web Audio API** directly, constructing an audio node graph with a master compressor, spatial HRTF PannerNodes, and procedural noise oscillators for atmospheric effects.

## Consequences
### Positive
* Zero bundle weight overhead.
* True 3D spatialized audio with distance roll-off models.
### Negative
* Requires user gesture interaction before AudioContext can transition out of `suspended` state.
