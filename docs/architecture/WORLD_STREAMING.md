# World Streaming Architecture: VORIXA

To support an infinite world within finite client memory, VORIXA utilizes coordinate-based chunk streaming with strict memory recycling.

## 1. Streaming Mechanics

```text
Player Coordinates (X, Y, Z)
            ↓
Compute Active Grid [(Cx - R) .. (Cx + R), (Cz - R) .. (Cz + R)]
            ↓
  Check Chunk State:
  - Already Loaded? Keep alive & update distance priority.
  - Needed but Missing? Push to Worker Generation Queue.
  - Out of Active Range? Evict to Pool / Dispose GPU Buffers.
```

## 2. Resource Pooling
* Chunks outside the streaming horizon are unhooked from the scene graph and placed into an object pool rather than deallocated, eliminating garbage collection spikes.
* GPU vertex and index buffers are recycled across chunk instances using uniform buffer sizing.
