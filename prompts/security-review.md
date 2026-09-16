# Security Review Prompt

Audit client and protocol safety:
1. Verify no dynamic code evaluation (`eval()`, `new Function()`).
2. Verify all network messages and save state payloads undergo schema validation.
3. Validate origin isolation and safe CSP compliance.
