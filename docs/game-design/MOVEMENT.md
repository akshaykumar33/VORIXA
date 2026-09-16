# Movement & Kinetic Traversal: VORIXA

Movement is the primary expressive mechanic in VORIXA. Inspired by the velocity preservation in *Titanfall 2* and *Tribes*, traversal is designed to feel buttery, responsive, and exhilarating.

## Movement Abilities & Parameters

| State | Trigger | Speed / Vector | Energy Cost | Notes |
| ----- | ------- | -------------- | ----------- | ----- |
| **Walk** | Default Directional Input | 5.5 m/s | None | Base traversal |
| **Sprint** | `Shift` (toggle or hold) | 9.0 m/s | 5 stamina/s | Gradual acceleration over 0.4s |
| **Slide** | Crouch while Sprinting | Initial boost + momentum | None | Preserves velocity on downward slopes; friction reduced by 80% |
| **Jump** | `Space` while grounded | +6.2 m/s vertical | None | Fixed impulse |
| **Air Dash** | `Shift` in mid-air + Vector | +14 m/s directional | 35 stamina | 0.8s cooldown; cancels downward gravity for 0.2s |
| **Wall Run** | Jump against wall angle < 30° | 10.5 m/s parallel | 10 stamina/s | Maximum 2.5s duration; wall-jump grants 45° outward impulse |
| **Mantle** | Move toward ledge at chest height | Smooth vertical lift | None | Hands pull player over obstacles up to 2.2m |

## Acceleration & Physics Curve
* **Air Control**: 60% of ground steering responsiveness, preventing floaty disorientation while rewarding skillful steering.
* **Slope Velocity Transfer**: When transitioning from fall to an incline slope, vertical momentum converts directly into forward slide momentum:
  $$\vec{v}_{\text{slide}} = \vec{v}_{\text{parallel}} + \beta \cdot |\vec{v}_{\text{vertical}}| \cdot \sin(\theta_{\text{slope}})$$
