# Physics Architecture: VORIXA

Physics in VORIXA is designed specifically for high-speed kinetic player movement and raycast projectile detection without the overhead of monolithic 3D physics engines.

## 1. Subsystems
* **Character Controller**: Kinematic capsule controller with continuous collision detection (CCD) for high-velocity slides and dashes to prevent tunneling through thin terrain geometry.
* **Spatial Partitioning**: Dynamic bounding volume hierarchy (BVH) and uniform spatial hash grids for fast local terrain collision queries.
* **Projectile Raycasting**: Segment sweep tests calculated in simulation ticks for hit-scan and fast projectile weapons.

## 2. Invariants
* Physics queries never block the main rendering thread.
* Broadphase spatial queries utilize bitwise coordinate cell hashes ($32\text{m}$ cubes).
