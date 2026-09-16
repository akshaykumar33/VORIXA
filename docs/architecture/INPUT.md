# Normalized Input Architecture: VORIXA

The Input Engine converts raw hardware interactions across multiple heterogeneous input devices into normalized gameplay actions.

```text
  [Keyboard]       [Mouse]       [Gamepad]       [Touch]       [WebXR 6DoF]
      │               │              │              │               │
      └───────┬───────┴──────────────┼──────────────┴───────────────┘
              ▼
   +─────────────────────────────────────────────────────────────+
   |                    Input Adapters Layer                     |
   +─────────────────────────────────────────────────────────────+
                                  │
                                  ▼
   +─────────────────────────────────────────────────────────────+
   |                 Normalized Action Bus                       |
   | Actions: MOVE_FORWARD, STRAFE_LEFT, JUMP, DASH, LOOK, PAUSE |
   +─────────────────────────────────────────────────────────────+
                                  │
                                  ▼
   +─────────────────────────────────────────────────────────────+
   |                   ECS Movement & Combat                     |
   +─────────────────────────────────────────────────────────────+
```

## Features
* **Rebinding Support**: Actions are mapped to arbitrary input bindings without altering gameplay code.
* **Continuous & Impulsive Actions**: Continuous analog axes (normalized $-1.0$ to $+1.0$) for directional movement and look deltas; discrete pulse events for jumps, dashes, and menu toggles.
* **Virtual Joystick Fallback**: Mobile and touch screens automatically synthesize virtual analog sticks when touch events are detected.
