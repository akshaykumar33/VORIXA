# ADR-0013: Premium Stylized Art Direction

* **Status**: Accepted — supersedes the cartoon look described in ADR-0011
* **Date**: 2026-09-24
* **Deciders**: Project owner, working session

## Context

Rush and On Foot were built with a flat cartoon look: toon ramp shading, thick ink outlines,
bean-shaped people, saturated toy colours and a chunky rounded font. It was chosen because every
asset could be made in code. The owner's verdict: it "looks like a kiddo" game, and the target is
the finish of a big-studio title.

Two things make a game read as AAA: **rendering** (physically based materials, image-based
lighting, soft shadows, ambient occlusion, filmic tone mapping and grading) and **art assets**
(detailed, textured, animated characters and props). Code can deliver the first completely; it
cannot deliver the second to that standard.

## Decision

Move the whole game to a **premium stylized** look (in the family of Rocket League, Fortnite and
It Takes Two): stylized shapes, but lit, shaded and finished like a studio game.

* **Physically based materials.** `MeshStandardMaterial` and `MeshPhysicalMaterial` (clear-coated
  car paint, rubber, brushed metal, glass) replace the toon ramp. Ink outlines are removed.
* **Image-based lighting.** Each world is lit and reflected by a CC0 HDR sky photograph from Poly
  Haven, which also provides its backdrop.
* **A post-processing chain** (pmndrs `postprocessing`, zlib): ambient occlusion (N8AO, CC0), bloom
  for emissive detail only, ACES filmic tone mapping, subtle vignette and colour grading, SMAA.
* **Real assets where code falls short.** CC0 packs (Poly Haven, Quaternius, Kenney) for
  characters and props, downloaded, compressed for the web and recorded in `docs/CREDITS.md`.
* **A sleek HUD**: a thin modern typeface and glassy panels in place of the chunky cartoon type.

The simulations do not change. This is a presentation decision only.

## Consequences

* **Positive:** a look that matches the owner's ambition, built on standard, well-supported tools.
* **Positive:** image-based lighting makes every world cohesive with little per-world tuning.
* **Negative:** larger downloads (sky images, models). Mitigated by loading a world's assets only
  when it is first needed, and compressing everything.
* **Negative:** more GPU work per frame. Post-processing is scaled down on weaker hardware, and the
  frame budget is measured, not assumed.
