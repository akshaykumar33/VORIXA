# Benchmarking & Profiling Strategy: VORIXA

## Automated Benchmark Protocol
Run via `pnpm benchmark`:
1. **ECS Throughput**: Allocates 10,000 entities with Transform and Velocity components; executes 1,000 continuous ticks; asserts execution $< 2.0\text{ms}$ per tick.
2. **Input Latency**: Simulates 5,000 continuous action bus events; asserts dispatch time $< 0.1\text{ms}$.
3. **Chunk Noise Generation**: Generates a $32 \times 64 \times 32$ heightfield density volume; asserts $< 12\text{ms}$ per chunk on single thread.

## Profiling Workflow
* Chrome DevTools Performance Profiler: Record 10-second continuous gameplay clips.
* Validate that no red "Major GC" blocks occur during active run.
* Verify P95 frame time remains below $16.66\text{ms}$.
