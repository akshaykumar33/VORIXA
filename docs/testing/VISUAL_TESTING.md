# Visual Regression & Shader Testing: VORIXA

1. **Snapshot Buffer Dumps**: Renders identical scene frames offscreen into an `ImageBitmap` and compares against golden baseline images.
2. **Pixel Diff Threshold**: Visual diffs exceeding $0.2\%$ delta trigger automated test failure, preventing unintended shader or rasterizer regressions.
