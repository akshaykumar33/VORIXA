---
name: game-ai
description: Engineering reactive, performant AI agents using Utility AI and Behavior Trees.
---

# Game AI Skill

Use this skill when implementing enemy behaviors, squad tactics, and pathfinding.

## Guidelines
1. **Time Slicing**: Distribute AI decision cycles across multiple frames to avoid CPU spikes.
2. **Squad Tokens**: Require combat units to claim tokens before initiating high-impact attacks.
3. **Sensor Queries**: Cache raycast visibility checks across simulation ticks.
