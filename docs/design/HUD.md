# Heads-Up Display (HUD) Architecture: VORIXA

The HUD acts as the tactical phase-visor projected directly into the player's view.

```text
+-------------------------------------------------------------------------+
| [FPS: 60 | P95: 16.2ms]                           [SYS: WebGPU Tier 1]  |
|                                                                         |
|                                 +                                       |
|                             (Reticle)                                   |
|                                                                         |
| [SHIELD: 100%]                                          [CARBINE: 30/30]|
| [HEALTH: 100%]                                          [VEL: 14.2 m/s] |
+-------------------------------------------------------------------------+
```

* **Non-Obtrusive Layout**: Peripheral placement ensures maximum center-screen visibility.
* **Dynamic Reticle**: Spreads proportionally with character movement velocity and recoil spread.
