# Release Strategy & Observability: VORIXA

## Release Cadence
* **Milestone Releases**: Aligned with Phase completions (v0.1.0 = Phase 00, v0.2.0 = Phase 01, etc.).
* **Semantic Versioning**: `MAJOR.MINOR.PATCH` format with corresponding `CHANGELOG.md` updates.

## Observability & Error Logging
* Structured JSON error envelopes for unhandled WebGPU device loss or shader link failures.
* Telemetry strips all user PII, transmitting solely browser agent, GPU vendor/renderer string, and stack traces upon fatal crashes.
