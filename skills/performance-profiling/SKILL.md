---
name: performance-profiling
description: Profiling runtime execution, memory allocations, GPU frame times, and garbage collection.
---

# Performance Profiling Skill

Use this skill when auditing frame times, diagnosing memory leaks, or benchmarking systems.

## Guidelines
1. **Target Budgets**: Assert frame execution stays under $16.66\text{ms}$ (60 FPS).
2. **Allocation Tracing**: Ensure zero allocations occur in per-frame tick loops.
3. **P95 Latency**: Track 95th-percentile frame latency rather than simple averages.
