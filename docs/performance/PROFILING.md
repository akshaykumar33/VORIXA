# Profiling Guidelines: VORIXA

Guidelines for profiling engine memory, GPU buffers, and event loop latency:

1. **Memory Leak Detection**:
   - Take Heap Snapshot at $T=0$, $T=5\text{min}$, $T=15\text{min}$.
   - Retained objects must remain flat; any unbounded growth in arrays, event listeners, or WebGPU buffer handles is flagged as a blocking bug.
2. **GPU Memory Profiling**:
   - Inspect GPU memory via `chrome://gpu` and WebGPU device loss callbacks.
   - Verify that destroyed chunk meshes invoke `.destroy()` on their respective `GPUBuffer` instances immediately upon unmounting.
