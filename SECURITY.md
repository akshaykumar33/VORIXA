# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

VORIXA takes client-side security, memory safety, and web runtime containment seriously.

If you discover a security vulnerability within VORIXA:

1. **Do not create a public GitHub issue.**
2. Send a detailed report to `akshaykumarpatil33@gmail.com`.
3. Include the following details:
   - Type of issue (e.g., buffer overflow in WebAssembly, malicious shader execution / GPU hanging, client-side injection).
   - Full steps to reproduce the vulnerability.
   - Proof of Concept (PoC) scripts or minimal reproduction repo.
   - Affected browsers, platforms, and GPU hardware.

We will acknowledge receipt within 48 hours and provide a timeline for triage and remediation.

## Threat Model & Security Principles

* **GPU Execution Containment**: All WGSL / GLSL shaders loaded dynamically or procedurally generated must strictly adhere to bounds checking to prevent GPU hangs (TDR) or denial-of-service.
* **Input Sanitization**: Client events and incoming multiplayer network packets are treated as untrusted and validated against strict schemas before passing to the simulation kernel.
* **Storage Isolation**: IndexedDB local saves and user configuration are isolated to the origin, validating schema versioning to prevent prototype pollution or corrupted state injection.
