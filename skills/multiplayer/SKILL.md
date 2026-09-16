---
name: multiplayer
description: Architecting real-time state replication, client-side prediction, and WebRTC protocols.
---

# Multiplayer Engineering Skill

Use this skill when developing networking protocols, state serialization, or reconciliation logic.

## Guidelines
1. **Unreliable Channel for Position**: Send high-frequency transform updates over unreliable WebRTC DataChannels.
2. **Delta Compression**: Transmit position differences rather than full absolute state vectors.
3. **Rollback Buffers**: Maintain a circular buffer of past local inputs to support authoritative rollbacks.
