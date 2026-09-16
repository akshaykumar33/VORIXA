# ADR-0001: Workspace Architecture and Tooling Stack

* **Status**: Accepted
* **Date**: 2026-09-16
* **Deciders**: Engineering Kernel

## Context
VORIXA requires an ultra-fast build, development, and testing pipeline capable of handling ESNext modules, WebGPU/WGSL shaders, native browser APIs, and strict TypeScript verification without sluggish bundler overhead.

## Decision Drivers
* Instant local development feedback (sub-100ms HMR).
* Zero-configuration TypeScript compilation.
* Native browser ES modules (ESM) integration.
* Efficient package management and minimal disk duplication.

## Considered Options
1. **Webpack 5**: Mature but slow cold start and configuration overhead.
2. **Rollup directly**: Great for library builds, awkward for interactive web development server.
3. **Vite + TypeScript + pnpm**: Instant startup via native ESM, rich plugin ecosystem, clean build output.

## Decision
Adopt **Vite** as the primary build tool and dev server, paired with **pnpm** and **TypeScript 5.x** in strict mode.

## Consequences
### Positive
* Instant hot module reloading during engine development.
* First-class support for raw text imports (WGSL shader files).
* Strict typechecking prevents whole classes of runtime bugs.
### Negative
* Developers must use modern browsers supporting ES modules.
