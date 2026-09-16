# Security Architecture: VORIXA

The security architecture guarantees sandbox containment, memory safety, and client data integrity.

## 1. Browser Sandbox Safeguards
* **No Unsafe Eval**: Content Security Policy (CSP) forbids `eval()`, `new Function()`, or dynamic script injection.
* **Shader Validation**: Procedurally assembled WGSL and GLSL shaders are statically analyzed and bounds-checked prior to GPU pipeline compilation to prevent GPU driver hangs or memory faults.

## 2. Multiplayer & State Integrity
* Client inputs sent over WebRTC are bound-checked against physical possibility (maximum acceleration limits, impossible velocity spikes) to reject client tampering.
