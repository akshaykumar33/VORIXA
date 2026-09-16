# Motion System & Micro-Animations: VORIXA

Motion reinforces speed, physical weight, and spatial feedback without causing motion sickness.

## Principles
1. **Sub-Frame Feedback**: Screen reticle changes state within the active frame (< 16ms).
2. **Speed Lines & FOV Dynamic Shift**: When sliding down steep declines or air-dashing, the horizontal FOV expands smoothly from $85^\circ$ to $95^\circ$ over $150\text{ms}$.
3. **Respect Reduced Motion**: If the OS setting `prefers-reduced-motion: reduce` is active, camera bobbing and screen shakes are replaced with static vignette flashes.
