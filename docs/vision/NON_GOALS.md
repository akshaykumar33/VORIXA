# Non-Goals: VORIXA

Explicit non-goals prevent architectural bloat, premature complexity, and project derailment.

## What VORIXA Is NOT

1. **Not a Generic 3D Framework Demonstration**:
   - VORIXA is an actual game with unified art direction and cohesive gameplay, not a loose collection of 3D tech demos.
2. **Not a Monolithic Pre-baked MMO**:
   - We will not spend months building complex dedicated server matchmaking or massive guild databases before our single-player movement and procedural generation feel phenomenal.
3. **Not a Heavy Asset Dump**:
   - No multi-gigabyte uncompressed 4K photogrammetry texture packs. All visual assets prioritize mathematical procedural generation, compact vector/normal encoding, and GPU procedural synthesis.
4. **Not a Kitchen-Sink Physics Playground**:
   - We do not simulate individual fluid Navier-Stokes particles or full soft-body car crashes in early phases. Physics serves responsive gameplay first (character controller, kinematic collision, raycasting).
5. **No AI/ML Dependency for Core Mechanics**:
   - Fundamental game loops (movement, shooting, procedural seeds) must run 100% deterministically client-side without requiring external LLM API calls or paid cloud inference.
