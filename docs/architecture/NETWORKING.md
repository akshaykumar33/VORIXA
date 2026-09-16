# Networking & State Replication Strategy: VORIXA

Designed for Phase 6 multiplayer, the networking strategy targets peer-to-peer and authoritative relay topologies using native **WebRTC DataChannels**.

## 1. Network Topology
* **Transport**: Unreliable, unordered WebRTC DataChannels for high-frequency player state updates (position, velocity, orientation); reliable ordered channels for discrete events (damage dealt, items acquired, chat).
* **Client-Side Prediction**: Local client simulates movement immediately; server/host broadcasts authoritative state snapshots; client reconciles past inputs via rollback buffers upon discrepancy.

## 2. Bandwidth Budget
* Target bandwidth: $< 40\text{ KB/s}$ per connected client at 30Hz network tick rate through delta compression and bit-packed quantizations.
