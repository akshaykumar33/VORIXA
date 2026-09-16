# Gameplay Testing & Simulation Replays: VORIXA

To test complex gameplay mechanics without manual human play:
1. **Headless Bot Replays**: Simulated bot controllers inject synthetic actions (`MOVE_FORWARD`, `JUMP`, `DASH`) into the Action Bus at fixed ticks.
2. **Assertion Verification**: Checks that after $N$ ticks, player position reaches designated coordinate boundaries, validating kinematic collision resolution and velocity preservation.
