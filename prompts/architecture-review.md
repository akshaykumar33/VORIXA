# Architecture Review Prompt

Evaluate the target subsystem against VORIXA invariants:
1. Are presentation, simulation, rendering, and input boundaries strictly preserved?
2. Are hot loops free of object allocation and garbage collection risks?
3. Does the system introduce any undocumented third-party dependency?
4. Is an ADR required for this design?
