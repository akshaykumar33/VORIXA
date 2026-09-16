# Incident Response & Critical Fault Protocol: VORIXA

1. **GPU Device Loss**: When `GPUDevice.lost` triggers, the engine traps the event, disposes stale resources, resets canvas contexts, and attempts a single graceful recovery into WebGL2 fallback mode.
2. **Crash Reporting**: Fatal faults display an in-browser crash screen showing diagnostic codes and a one-click copy button with sanitized environment details.
