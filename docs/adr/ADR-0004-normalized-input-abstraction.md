# ADR-0004: Normalized Action Bus Input Abstraction

* **Status**: Accepted
* **Date**: 2026-09-16
* **Deciders**: Engineering Kernel

## Context
VORIXA is committed to multiplatform cross-device play: desktop (keyboard/mouse), gamepads (Xbox, PlayStation), mobile/touch, and eventually WebXR spatial controllers and gesture inputs. Coupling input listeners directly to player movement creates fragile spaghetti code.

## Decision Drivers
* Complete decoupling of physical input hardware from gameplay logic.
* Simplified user remapping of controls.
* Seamless simulation replay and automated bot testing.

## Considered Options
1. **Direct DOM Event Handlers in Player Class**: Fast to hack, impossible to test or adapt to gamepads.
2. **Normalized Action Bus**: Hardware adapters convert raw signals into normalized continuous and impulsive actions.

## Decision
Adopt a **Normalized Action Bus** architecture where devices publish abstract actions (`MOVE_FORWARD`, `STRAFE_LEFT`, `JUMP`, `DASH`, `LOOK`), and the simulation solely reads the bus.

## Consequences
### Positive
* Clean separation of concerns.
* Adding a new device (e.g. WebXR controller or touch joystick) requires only writing an adapter, with zero changes to movement or combat code.
### Negative
* Slight indirection layer between event firing and simulation polling.
