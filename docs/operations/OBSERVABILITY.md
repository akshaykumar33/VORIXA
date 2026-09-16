# Observability & Diagnostics: VORIXA

Live telemetry is exposed through structured metrics:
* **Frame Metrics**: FPS, average frame time, P95 frame time, P99 frame latency.
* **Engine Metrics**: Active entity count, active chunk count, draw call count, GPU buffer bytes allocated.
* **Error Bounds**: All unhandled promise rejections and GPU errors are trapped and forwarded to telemetry listeners.
