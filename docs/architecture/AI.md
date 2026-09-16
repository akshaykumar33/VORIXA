# AI & Entity Behavior Architecture: VORIXA

AI agents run under a lightweight, deterministic **Utility AI + Behavior Tree** hybrid model.

## 1. Decision Loop
1. **Perception**: Sensor queries evaluate distance, line-of-sight raycasts, and squad communication tokens.
2. **Utility Scoring**: Scoring functions rank candidate actions (Attack, Seek Cover, Reposition, Flank) based on player health, distance, and current squad aggression tokens.
3. **Execution**: Selected behavior tree node runs until completion, interruption, or priority shift.

## 2. Performance Safeguards
* AI updates are time-sliced across 4 frames: only 25% of active enemy entities re-evaluate high-level decisions per tick, keeping CPU execution under $1.5\text{ms}$ per frame.
