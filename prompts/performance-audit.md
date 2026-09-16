# Performance Audit Prompt

Audit execution metrics against the 16.66ms frame budget:
1. Run automated benchmarks (`pnpm benchmark`).
2. Verify that P95 frame time remains below 16.66ms.
3. Validate zero heap allocations inside the 60Hz tick loops.
4. Report hard figures (draw calls, active entities, memory footprint).
