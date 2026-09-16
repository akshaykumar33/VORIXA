# Simulation Loop & Determinism: VORIXA

To guarantee identical gameplay across divergent refresh rates (60Hz vs 120Hz vs 240Hz), VORIXA uses a canonical **Fixed-Timestep Simulation with Render Interpolation** loop:

```typescript
const TICK_RATE = 60; // 60 ticks per second
const TICK_DURATION = 1000 / TICK_RATE; // 16.666 ms

let accumulator = 0;
let lastTime = performance.now();

function frame(currentTime: number) {
  const delta = Math.min(currentTime - lastTime, 100); // clamp to prevent spiral of death
  lastTime = currentTime;
  accumulator += delta;

  // Fixed simulation updates
  while (accumulator >= TICK_DURATION) {
    world.tick(TICK_DURATION / 1000);
    accumulator -= TICK_DURATION;
  }

  // Alpha for smooth rendering interpolation between previous and current state
  const alpha = accumulator / TICK_DURATION;
  renderer.render(world, alpha);

  requestAnimationFrame(frame);
}
```

## Guarantees
* **Deterministic Traversal**: Physics and trajectory calculations execute exactly 60 times per simulation second.
* **Jitter-Free Camera**: Rendering interpolates between previous tick transform and current tick transform via `alpha`.
