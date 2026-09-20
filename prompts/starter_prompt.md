# VORIXA — MASTER REPOSITORY BOOTSTRAP PROMPT

> ## ⚠️ SUPERSEDED FOR ONGOING WORK
>
> This prompt bootstrapped the repository (Phase 0) and is retained as **historical record of how
> VORIXA was founded**. It is no longer the operating prompt.
>
> **For all work from Phase 1 onward, use [`master_execution_prompt.md`](master_execution_prompt.md).**
>
> Two policies below have been **deliberately rescinded** by the project owner:
>
> | Section | Was | Now |
> | --- | --- | --- |
> | §15, §28, Final Principle | Minimize dependencies; keep the stack small | **Open stack.** Any library is permitted when it delivers materially better experience or capability. Deliberate choice, not scarcity. |
> | §15, §24 | UI/UX treated as one concern among many | **UI/UX and complete functionality are mandatory acceptance criteria.** A feature that works but feels bad is not done. |
>
> The Prime Directive, architectural boundaries, phased roadmap, ADR system, and security rules
> below all remain in force.

You are entering a greenfield repository for **VORIXA**, a next-generation, web-native, infinite procedural game and experimental game-engine platform.

Do NOT immediately start generating random gameplay code.

Your first responsibility is to establish an exceptionally well-structured engineering repository that can be developed for years by humans and AI coding agents without turning into an unmaintainable prototype.

The long-term vision is a responsive, cross-device, continuously streamed 3D universe supporting combinations of:

* WebGPU
* WebGL2 fallback
* Three.js / lower-level rendering where justified
* WGSL / GLSL shaders
* ECS architecture
* procedural generation
* deterministic simulation
* physics
* advanced animation
* spatial/3D audio
* adaptive music
* keyboard
* mouse
* touch
* gamepad
* voice
* gesture
* MediaPipe
* device motion
* WebXR
* AI-driven NPC systems
* procedural quests
* adaptive enemies
* local/offline capabilities
* multiplayer
* persistent worlds
* progression
* XP
* skills
* combat
* exploration
* parkour
* vehicles
* bosses
* dynamic ecosystems
* world events
* eventually ML/AI-assisted gameplay

The game must eventually be capable of desktop, laptop, mobile, tablet, foldable, gamepad, VR/XR and other supported environments.

However:

**DO NOT TRY TO BUILD ALL OF THIS NOW.**

We are establishing an architecture that can progressively reach this vision.

---

# 0. PRIME DIRECTIVE

The project must always follow this sequence:

Research
→ Define
→ ADR
→ Design
→ Prototype
→ Benchmark
→ Implement
→ Test
→ Profile
→ Document
→ Review
→ Commit
→ Continue

Never introduce a major dependency or architecture merely because it sounds advanced.

Every technology must solve a documented problem.

Do not use AI, ML, WebXR, WebGPU compute, microservices, multiplayer infrastructure or other advanced technologies until the corresponding phase requires them.

Prefer the simplest architecture capable of evolving toward the final vision.

---

# 1. FIRST TASK — REPOSITORY DISCOVERY

Before modifying anything:

1. Inspect the entire repository.
2. Inspect package manifests.
3. Inspect configuration.
4. Inspect Git history if available.
5. Inspect existing documentation.
6. Inspect assets.
7. Inspect existing architecture.
8. Identify incomplete work.
9. Identify technical debt.
10. Identify contradictions.

If this is an empty repository, explicitly record that.

Create:

`docs/audits/INITIAL_REPOSITORY_AUDIT.md`

Document:

* current state
* existing technologies
* reusable code
* problems
* risks
* assumptions
* recommended starting point

Never destroy working code without documenting why.

---

# 2. CREATE THE DOCUMENTATION SYSTEM

Create a professional documentation architecture.

Suggested structure:

```text
/
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
├── CHANGELOG.md
├── AGENTS.md
├── CLAUDE.md
├── GEMINI.md
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CODEOWNERS
│   ├── workflows/
│   └── dependabot.yml
│
├── docs/
│   ├── README.md
│   │
│   ├── vision/
│   │   ├── PRODUCT_VISION.md
│   │   ├── GAME_PILLARS.md
│   │   ├── PLAYER_FANTASY.md
│   │   ├── DIFFERENTIATION.md
│   │   └── NON_GOALS.md
│   │
│   ├── game-design/
│   │   ├── GDD.md
│   │   ├── CORE_LOOP.md
│   │   ├── META_LOOP.md
│   │   ├── COMBAT.md
│   │   ├── MOVEMENT.md
│   │   ├── PROGRESSION.md
│   │   ├── WORLD.md
│   │   ├── PROCEDURAL_GENERATION.md
│   │   ├── ENEMIES.md
│   │   ├── BOSSES.md
│   │   ├── ITEMS.md
│   │   ├── ECONOMY.md
│   │   └── DIFFICULTY.md
│   │
│   ├── architecture/
│   │   ├── SYSTEM_OVERVIEW.md
│   │   ├── RENDERING.md
│   │   ├── ECS.md
│   │   ├── SIMULATION.md
│   │   ├── PHYSICS.md
│   │   ├── INPUT.md
│   │   ├── AUDIO.md
│   │   ├── AI.md
│   │   ├── NETWORKING.md
│   │   ├── PERSISTENCE.md
│   │   ├── ASSET_PIPELINE.md
│   │   ├── WORLD_STREAMING.md
│   │   └── SECURITY.md
│   │
│   ├── adr/
│   │   ├── README.md
│   │   └── ADR-0001-*.md
│   │
│   ├── design/
│   │   ├── ART_DIRECTION.md
│   │   ├── DESIGN_SYSTEM.md
│   │   ├── TYPOGRAPHY.md
│   │   ├── COLOR_SYSTEM.md
│   │   ├── MOTION_SYSTEM.md
│   │   ├── HUD.md
│   │   ├── MENUS.md
│   │   └── ACCESSIBILITY.md
│   │
│   ├── performance/
│   │   ├── PERFORMANCE_BUDGETS.md
│   │   ├── DEVICE_TIERS.md
│   │   ├── BENCHMARKING.md
│   │   └── PROFILING.md
│   │
│   ├── testing/
│   │   ├── TEST_STRATEGY.md
│   │   ├── GAMEPLAY_TESTING.md
│   │   ├── VISUAL_TESTING.md
│   │   ├── PERFORMANCE_TESTING.md
│   │   └── COMPATIBILITY_MATRIX.md
│   │
│   ├── roadmap/
│   │   ├── MASTER_ROADMAP.md
│   │   ├── PHASE-00-FOUNDATION.md
│   │   ├── PHASE-01-VERTICAL-SLICE.md
│   │   ├── PHASE-02-GAMEPLAY.md
│   │   ├── PHASE-03-PROCEDURAL-WORLD.md
│   │   ├── PHASE-04-AI.md
│   │   ├── PHASE-05-PROGRESSION.md
│   │   ├── PHASE-06-MULTIPLAYER.md
│   │   ├── PHASE-07-XR.md
│   │   └── PHASE-08-PRODUCTION.md
│   │
│   ├── operations/
│   │   ├── CI_CD.md
│   │   ├── RELEASES.md
│   │   ├── OBSERVABILITY.md
│   │   └── INCIDENT_RESPONSE.md
│   │
│   ├── audits/
│   └── decisions/
│
├── skills/
├── prompts/
├── scripts/
├── tools/
├── benchmarks/
├── prototypes/
├── packages/
└── apps/
```

Adjust this structure when technically justified.

Do not create meaningless empty files simply to satisfy the tree.

Every created document must contain useful starter content.

---

# 3. AGENT OPERATING SYSTEM

Create `AGENTS.md`.

This is the primary instruction manual for every AI coding agent.

It must explain:

* project vision
* architectural boundaries
* coding conventions
* dependency rules
* testing requirements
* performance requirements
* documentation requirements
* security requirements
* Git workflow
* commit requirements
* definition of done
* prohibited shortcuts

Also create appropriate agent-specific adapters where useful.

Examples:

`CLAUDE.md`
`GEMINI.md`

These must NOT duplicate hundreds of lines from AGENTS.md.

They should point back to the canonical rules.

---

# 4. SKILLS SYSTEM

Create reusable AI skills under:

`/skills`

Examples:

```text
skills/
├── architecture-review/
├── rendering-engine/
├── gameplay-system/
├── shader-development/
├── ecs-development/
├── procedural-generation/
├── game-ai/
├── performance-profiling/
├── multiplayer/
├── webxr/
├── accessibility/
├── testing/
├── security-review/
├── documentation/
└── release-management/
```

Each skill should contain focused instructions for an AI agent performing that category of work.

Do not create enormous duplicate prompts.

Use composable skills.

---

# 5. PROMPT LIBRARY

Create `/prompts`.

Include reusable prompts such as:

```text
prompts/
├── feature.md
├── bug.md
├── architecture-review.md
├── performance-audit.md
├── rendering-review.md
├── gameplay-review.md
├── shader-review.md
├── security-review.md
├── refactor.md
├── test-generation.md
├── documentation-update.md
└── release-review.md
```

The prompts must force agents to:

understand existing code → plan → implement → test → profile where appropriate → document → summarize.

---

# 6. ARCHITECTURE PRINCIPLES

Design the game around clear boundaries.

Investigate an architecture similar to:

```text
Platform Layer
      ↓
Engine Kernel
      ↓
ECS / Simulation
      ↓
Rendering / Physics / Audio / Input
      ↓
World Systems
      ↓
Gameplay Systems
      ↓
Game Content
      ↓
Presentation / UI
```

Rendering must NOT contain gameplay rules.

Input devices must NOT directly control player logic.

Instead:

```text
Device
   ↓
Input Adapter
   ↓
Normalized Action
   ↓
Command
   ↓
Gameplay System
```

Therefore:

Keyboard "W"

Gamepad stick

Touch joystick

Hand gesture

Voice command

XR controller

can eventually produce common actions such as:

```text
MOVE
LOOK
JUMP
DASH
ATTACK
BLOCK
INTERACT
ABILITY_1
ABILITY_2
PAUSE
```

Gameplay should not care which device generated the command.

---

# 7. RENDERING STRATEGY

Investigate:

WebGPU primary

WebGL2 fallback where practical.

Do NOT blindly combine Three.js, Babylon.js, PixiJS and every rendering library.

Choose technologies deliberately.

Document the decision through ADRs.

Rendering architecture must eventually support:

* PBR
* instancing
* GPU particles
* LOD
* frustum culling
* occlusion strategies
* post-processing
* dynamic lighting
* shadows
* procedural shaders
* terrain
* vegetation
* water
* atmosphere
* weather
* portals
* world streaming
* compute workloads where beneficial

Create capability detection.

Gracefully degrade visual quality based on device capabilities.

---

# 8. ECS

Research and establish whether the project should use an existing ECS or custom ECS.

Do not automatically build a custom ECS.

Document:

* entity representation
* components
* systems
* queries
* events
* serialization
* deterministic requirements
* networking implications
* memory layout
* performance considerations

Use an ADR for the final choice.

---

# 9. INFINITE WORLD

"Infinite" must not mean allocating an infinite map.

Design:

```text
Player
 ↓
Active simulation radius
 ↓
World chunks
 ↓
Deterministic generation
 ↓
Seed
 ↓
Biome
 ↓
Terrain
 ↓
Structures
 ↓
Encounters
 ↓
NPCs
 ↓
Loot
```

Chunks outside the relevant simulation radius should be:

* unloaded
* serialized
* represented in low-cost form
* or deterministically regenerated

Investigate:

* seeded PRNG
* noise functions
* biome graphs
* world coordinates
* floating-origin techniques
* hierarchical LOD
* asynchronous generation
* worker-based generation
* asset streaming

The architecture must support extremely long traversal without numerical instability.

---

# 10. GAMEPLAY PHILOSOPHY

Do NOT attempt to make the game addictive using manipulative dark patterns.

Optimize for:

* mastery
* discovery
* flow
* curiosity
* meaningful progression
* replayability
* player expression
* surprising systemic interactions

Create approximately 3–5 core gameplay pillars.

Do not combine twenty genres merely because they are possible.

The vertical slice must prove ONE compelling gameplay loop.

---

# 11. INPUT ENGINE

Eventually support:

* keyboard
* mouse
* pointer lock
* touch
* gamepad
* voice
* gesture
* hand tracking
* device orientation
* gyroscope
* WebXR

But build adapters incrementally.

Architecture:

```text
InputDevice
      ↓
Adapter
      ↓
Normalized Input
      ↓
Action Mapper
      ↓
Command Bus
      ↓
Gameplay
```

Allow multiple active input methods.

Include remapping and accessibility.

---

# 12. AI ARCHITECTURE

Do NOT call an LLM every frame.

Separate:

Real-time deterministic AI:

* state machines
* behavior trees
* utility AI
* navigation
* perception
* combat decision making

Higher-level AI:

* narrative generation
* NPC dialogue
* long-term memory
* procedural quest assistance
* world-director systems

Experimental ML:

* ONNX Runtime Web
* TensorFlow.js
* MediaPipe
* WebGPU inference

Only introduce ML when benchmarks justify it.

---

# 13. AUDIO

Design a proper audio architecture supporting:

* Web Audio
* spatial audio
* environmental zones
* occlusion
* dynamic music
* adaptive combat layers
* ambience
* positional SFX
* accessibility controls

Treat "8D audio" as a presentation concept, not a magical engine feature.

Use proper spatial/binaural techniques.

---

# 14. PERFORMANCE BUDGETS

Create explicit budgets.

At minimum define targets for:

Desktop High
Desktop Low
Modern Mobile
Low-Power Mobile
XR

Measure:

* FPS
* frame time
* CPU time
* GPU time
* draw calls
* triangles
* active entities
* physics bodies
* texture memory
* JS heap
* network bandwidth
* initial bundle
* initial load
* chunk generation
* asset streaming

Create:

`docs/performance/PERFORMANCE_BUDGETS.md`

No feature is considered complete if it catastrophically violates its device-tier budget.

---

# 15. DESIGN LANGUAGE

> **Amended.** UI/UX is now a *mandatory acceptance criterion*, not a parallel workstream. See
> `master_execution_prompt.md` §0.1 for the binding Definition of Done. The stack for this layer is
> ratified in `docs/adr/ADR-0007-ui-layer-stack.md`.

Create a distinctive visual language.

Avoid generic "AI SaaS glassmorphism."

The game interface should feel authored for VORIXA.

Develop:

* logo direction
* typography hierarchy
* iconography
* HUD language
* menu system
* loading/streaming presentation
* motion principles
* feedback system
* damage feedback
* XP feedback
* navigation
* accessibility
* responsive behavior

Game UI must remain readable over complex 3D scenes.

---

# 16. TESTING

Establish:

Unit tests

Integration tests

Deterministic simulation tests

Procedural generation tests

Input tests

Save/load tests

Visual regression tests

Browser compatibility tests

Performance tests

End-to-end tests

Smoke tests

Where possible, seeded generation must make failures reproducible.

A procedural bug should be reproducible using its seed.

---

# 17. GITHUB STRATEGY

Use a professional workflow.

Branches:

```text
main
develop
feature/*
fix/*
perf/*
refactor/*
docs/*
test/*
chore/*
release/*
```

Prefer short-lived branches.

Never directly push unfinished feature work into `main`.

---

# 18. CONVENTIONAL COMMITS

Use Conventional Commits.

Examples:

```text
feat(input): add normalized keyboard adapter

feat(world): implement deterministic chunk coordinates

feat(render): add WebGPU capability detection

fix(physics): prevent tunneling during high-speed dash

perf(render): batch vegetation instances

refactor(ecs): separate query cache from world state

test(world): add deterministic generation coverage

docs(adr): document rendering backend decision

build(ci): add browser compatibility workflow

chore(deps): update rendering dependencies
```

Do NOT use meaningless commits such as:

```text
update
changes
stuff
fix
final
final2
working
```

---

# 19. COMMIT SIZE

Commits should be:

* atomic
* reviewable
* independently understandable
* preferably independently buildable

Do not create one gigantic commit containing the entire engine.

Example progression:

```text
chore(repo): initialize workspace

docs(vision): establish game pillars

docs(adr): choose monorepo strategy

feat(engine): create engine kernel

feat(input): add action mapping contracts

feat(render): initialize rendering abstraction

feat(world): add seeded world coordinates

test(world): verify deterministic generation

perf(world): move generation to worker
```

---

# 20. PULL REQUEST STANDARD

Create `.github/PULL_REQUEST_TEMPLATE.md`.

Every PR should explain:

* Problem
* Why now?
* Solution
* Architecture impact
* Performance impact
* Security impact
* Screenshots/video where relevant
* Tests
* Benchmarks
* Documentation
* Risks
* Rollback strategy

---

# 21. ADR SYSTEM

Major decisions require Architecture Decision Records.

Examples:

```text
ADR-0001-monorepo.md
ADR-0002-renderer.md
ADR-0003-ecs.md
ADR-0004-physics.md
ADR-0005-world-generation.md
ADR-0006-network-model.md
ADR-0007-persistence.md
ADR-0008-audio.md
```

Format:

```text
Status
Context
Decision
Alternatives
Consequences
Performance Impact
Security Impact
Revisit Conditions
```

---

# 22. PHASED ROADMAP

Create a detailed roadmap.

## PHASE 0 — FOUNDATION

Goal:

Create repository foundations.

Deliver:

* monorepo/workspace
* documentation
* CI
* formatting
* linting
* testing
* ADRs
* engine contracts
* performance harness
* development environment

No giant game.

---

## PHASE 1 — VERTICAL SLICE

Build ONE polished playable environment.

Requirements:

* player
* camera
* movement
* jump
* dash
* one weapon
* one enemy
* one combat interaction
* health
* XP
* one small procedural area
* audio
* HUD
* keyboard/mouse
* touch baseline
* gamepad baseline
* save/load
* performance overlay

The purpose is proving the architecture.

---

## PHASE 2 — GAMEPLAY FOUNDATION

Add:

* combat framework
* abilities
* damage system
* status effects
* enemies
* loot
* inventory
* progression
* checkpoints
* animation
* improved movement

---

## PHASE 3 — PROCEDURAL UNIVERSE

Add:

* deterministic chunks
* biomes
* terrain
* structures
* encounter generation
* world streaming
* floating origin
* procedural events
* environmental simulation

---

## PHASE 4 — INTELLIGENCE

Add:

* behavior trees
* utility AI
* perception
* adaptive encounters
* world director
* NPC memory prototype
* optional higher-level generative AI

---

## PHASE 5 — META GAME

Add:

* skill trees
* mastery
* achievements
* crafting
* collections
* long-term progression
* dynamic quests
* economy

---

## PHASE 6 — ONLINE

Only after single-player architecture is stable.

Research and implement:

* authoritative simulation
* synchronization
* prediction
* reconciliation
* interest management
* matchmaking
* persistence
* anti-cheat foundations

---

## PHASE 7 — NATURAL INPUT + XR

Add experimentally:

* MediaPipe
* hand tracking
* gesture
* voice
* device motion
* WebXR
* VR
* AR

These must remain adapters over the same action system.

---

## PHASE 8 — PRODUCTION

Focus heavily on:

* performance
* accessibility
* browser compatibility
* mobile optimization
* telemetry
* crash reporting
* deployment
* security
* scalability
* asset optimization
* QA
* release engineering

---

# 23. PHASE DOCUMENT FORMAT

Every phase file must contain:

```text
Objective
Player Value
Engineering Value
Scope
Non-Scope
Architecture Changes
Dependencies
Tasks
Milestones
Acceptance Criteria
Testing
Performance Targets
Risks
Exit Criteria
Demo Definition
```

Each task should be checkbox-based where useful.

---

# 24. DEFINITION OF DONE

A feature is NOT done merely because it renders.

Done means:

* architecture respected
* implementation complete
* lint passes
* types pass
* tests pass
* relevant browsers tested
* performance checked
* accessibility considered
* documentation updated
* ADR added if architectural
* no obvious memory leak
* no console spam
* no secrets
* graceful error handling
* commit follows repository convention

---

# 25. SECURITY

Never commit:

* API keys
* passwords
* tokens
* private certificates
* service credentials

Create:

`.env.example`

Use secret scanning.

Design server authority for security-sensitive multiplayer state.

Never trust client-provided:

* XP
* currency
* inventory
* damage
* leaderboard scores
* purchases

---

# 26. OBSERVABILITY

Eventually establish:

* structured logs
* crash reporting
* FPS metrics
* frame-time telemetry
* loading metrics
* WebGPU/WebGL capability statistics
* device tiers
* memory warnings
* network quality
* gameplay events

Do not introduce invasive telemetry.

Respect privacy.

---

# 27. ASSET STRATEGY

Document:

* models
* textures
* animations
* audio
* shaders
* fonts
* compression
* licensing
* provenance
* generated assets

Investigate formats such as:

* glTF/GLB
* KTX2
* Basis Universal
* Draco/Meshopt
* compressed audio

Do not commit gigantic unoptimized assets.

---

# 28. DEPENDENCY POLICY

> **Amended — the restrictive posture below is rescinded.** The stack is open. Any library is
> permitted when it delivers a materially better experience or materially more capability, and
> velocity is a legitimate justification. The evaluation checklist below is retained because a
> deliberate choice still has to be *deliberate* — but "we could write it ourselves" is no longer a
> reason to refuse a dependency. Binding policy: `master_execution_prompt.md` §1.
>
> The one hard boundary that remains: **the engine core stays framework-free.** Frameworks live in
> the UI layer, never in the tick or render loop.

Before installing a dependency, evaluate:

* purpose
* bundle impact
* maintenance
* security
* browser compatibility
* alternatives
* license
* whether native APIs suffice

Avoid dependency collection.

The goal is not to demonstrate the number of libraries we know.

The goal is to build an exceptional game.

---

# 29. DOCUMENTATION MUST TRACK CODE

Whenever architecture changes:

update architecture docs.

Whenever a major decision changes:

update/supersede the ADR.

Whenever a feature changes:

update corresponding game-design documentation.

Whenever commands change:

update README.

Whenever a phase completes:

update roadmap.

Documentation drift is considered technical debt.

---

# 30. INITIAL README

Create a premium README containing:

* VORIXA identity
* one-line vision
* current project status
* screenshots placeholder
* architecture overview
* supported platforms
* current controls
* technology overview
* local development
* testing
* benchmarking
* roadmap
* contribution
* documentation links
* license

Do not pretend unfinished systems exist.

Clearly distinguish:

Implemented

Experimental

Planned

Research

---

# 31. FIRST ENGINEERING DECISIONS

Before implementation, research and document recommendations for:

1. package manager
2. monorepo system
3. TypeScript configuration
4. rendering abstraction
5. WebGPU strategy
6. WebGL fallback
7. ECS
8. physics
9. UI framework
10. state management
11. audio
12. asset pipeline
13. test frameworks
14. E2E framework
15. benchmark tooling
16. backend requirements
17. persistence
18. deployment
19. observability
20. multiplayer direction

Do not choose technologies based purely on popularity.

Explain tradeoffs.

---

# 32. STARTER IMPLEMENTATION

After documentation and ADRs are sufficiently established, create only the minimum starter implementation necessary to prove the architecture.

I want to be able to run something equivalent to:

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm benchmark
```

The first runnable experience should preferably contain:

* blank/atmospheric 3D environment
* camera
* player controller
* basic input abstraction
* FPS/frame-time overlay
* renderer capability information
* responsive canvas
* resize handling
* device capability detection
* basic audio initialization
* clean loading state

Do NOT prematurely build the full game.

---

# 33. AI AGENT EXECUTION RULE

Do not repeatedly ask me for permission for ordinary engineering decisions.

Make sensible reversible decisions and document them.

Stop and ask me only when:

* requirements fundamentally conflict
* irreversible destructive action is necessary
* credentials are required
* paid infrastructure is required
* legal/licensing ambiguity materially blocks implementation
* several architecture choices are genuinely equivalent but would fundamentally change the project direction

Otherwise:

Research → decide → document → implement → verify.

---

# 34. NO FAKE COMPLETION

Never claim:

"production ready"

"AAA"

"optimized"

"secure"

"cross-platform"

"60 FPS"

unless demonstrated.

Use evidence.

For example:

```text
Tested:
Chrome 153 / RTX xxxx / 1440p
Average FPS: ...
P95 frame time: ...
JS heap: ...
Draw calls: ...
```

Separate measured facts from targets.

---

# 35. OUTPUT OF THIS FIRST SESSION

Your FIRST execution should primarily establish the repository.

At the end I expect:

1. repository audit
2. finalized repository structure
3. vision documents
4. initial GDD
5. architecture overview
6. initial ADRs
7. design-system documentation
8. performance budgets
9. testing strategy
10. GitHub standards
11. AI agent instructions
12. skills library
13. prompt library
14. master roadmap
15. individual phase plans
16. development scripts
17. CI baseline
18. minimal runnable engine shell
19. tests for that shell
20. clean atomic Git commits

Do not generate hundreds of placeholder files.

Quality over quantity.

---

# 36. GIT EXECUTION

If Git is available:

create the work as a sequence of logical commits.

Example:

```text
chore(repo): establish workspace foundation

docs(vision): define VORIXA product and gameplay pillars

docs(architecture): establish engine boundaries

docs(adr): record foundational technology decisions

docs(roadmap): define phased development strategy

docs(design): establish visual and interaction language

docs(ai): add agent rules and reusable skills

build(ci): establish quality gates

feat(engine): bootstrap minimal runtime shell

feat(input): introduce normalized input architecture

test(engine): establish runtime smoke tests
```

Before each commit:

* inspect diff
* remove accidental files
* run appropriate validation
* ensure commit scope is coherent

Do NOT automatically push to a remote unless explicitly authorized.

---

# 37. FINAL REPORT

When finished, provide:

## Repository Created

Explain the architecture concisely.

## Decisions

List important ADRs and why they were selected.

## Files

Show important files/directories created.

## Validation

Report actual:

* lint
* typecheck
* tests
* build
* benchmark results

## Git

Show commits created.

## Current Playable State

Describe ONLY what actually works.

## Known Limitations

Be explicit.

## Next Phase

Identify the exact next milestone.

## Run

Provide exact commands needed to start development.

---

# FINAL PRINCIPLE

> **Amended.** The warning below is against *undirected accumulation* — adding libraries to look
> capable. It is **not** an argument for a small stack. Reach for whatever makes the game better;
> just be able to say why. Binding version: `master_execution_prompt.md` Final Principle.

We are not trying to impress someone with a repository containing:

WebGPU + WebXR + AI + ML + Three.js + TensorFlow + MediaPipe + multiplayer + 50 libraries.

We are trying to create a genuinely exceptional game.

Every system must earn its complexity.

The long-term ambition is enormous.

The first implementation should therefore be disciplined, measurable, modular and surprisingly small.

Build the foundation so that VORIXA can evolve from:

tiny vertical slice

→ excellent game

→ procedural universe

→ intelligent world

→ multiplayer platform

→ experimental natural-input/XR experience

without requiring us to rewrite the entire project every six months.

Begin by auditing the repository and creating the plan.

Then execute Phase 0.

Do not skip directly to Phase 1.
