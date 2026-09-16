# System Overview & Architectural Boundaries: VORIXA

VORIXA is architected around strict unidirectional boundaries to ensure long-term maintainability, deterministic simulation, and cross-platform flexibility.

## 1. Architectural Stack

```text
+-------------------------------------------------------------------------+
|                           Presentation Layer                            |
|                 DOM HUD / Menus / Debug Overlays / Audio                |
+-------------------------------------------------------------------------+
                                    ↑
                                    | (Read-only State Observation)
+-------------------------------------------------------------------------+
|                            Simulation Layer                             |
|               ECS (Entities, Components, Query Systems)                 |
+-------------------------------------------------------------------------+
       ↑                                             |
       | (Commands via Action Bus)                   | (Transforms & Visible Mesh)
+-------------------------------+             +---------------------------+
|          Input Engine         |             |      Rendering Layer      |
| Keyboard / Mouse / Gamepad /  |             | WebGPU Primary Engine /   |
| Touch / Natural Gesture Bus   |             | WebGL2 Fallback Engine    |
+-------------------------------+             +---------------------------+
```

## 2. Invariants & Rules of Boundary
1. **Rendering is Purely Visual**: The renderer receives world state (transforms, mesh instances, camera view matrix) and draws them. It **never** mutates gameplay variables, calculates hit collision damage, or decides game state transitions.
2. **Input Decoupling**: Hardware events (keydown, touchmove, gamepadaxis) pass through input adapters into a **Normalized Action Bus**. Simulation systems query actions (`MOVE_FORWARD`, `DASH`), never raw physical keycodes.
3. **ECS Contiguity**: Components contain raw data, structured in TypedArrays where high performance is demanded. Systems contain logic; entities are numeric IDs.
4. **Deterministic Timestep**: Simulation physics and logic execute on a fixed clock ($60\text{Hz} = 16.666\text{ms}$ ticks). Rendering runs variable refresh rates ($30\text{Hz}$ to $144\text{Hz}$) with state interpolation.
