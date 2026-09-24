# ADR-0014: VORIXA City — one open city that holds every game style

* **Status**: Accepted
* **Date**: 2026-09-24
* **Deciders**: Project owner, working session
* **Plan**: [docs/plans/VORIXA_CITY_PLAN.md](../plans/VORIXA_CITY_PLAN.md)

## Context

The owner's review of Rush and On Foot: it does not look or play like the games it was asked to
be (GTA, Counter-Strike, Mario, Contra, with a storyboarded story). They are right, for two reasons.

1. **Genre.** Rush is a three-lane runner (closer to Subway Surfers than GTA), and On Foot is one
   platformer level. GTA is a free-roam city you walk and drive through, where police and people
   react to you and missions carry the story. Counter-Strike is aim-anywhere gunplay with recoil
   and reloads. Contra is eight-way aiming, weapon pickups and bosses. Mario is many levels, each
   teaching one idea and twisting it. None of that core existed.
2. **Assets.** Nearly every model was assembled from boxes and spheres in code, which is what
   reads as a toy. Studio games look the way they do because of modelled, textured, animated art.

Asked to choose one flagship, the owner chose **"a mix of all"**, with a camera **switchable
between third and first person (V)**.

## Decision

Build **VORIXA City**: one open city district that *hosts* every style, instead of five separate
shallow modes.

* **GTA is the frame.** A third-person hero walks, sprints and jumps anywhere in the district,
  gets into any car and drives it, and draws police (wanted stars) by breaking the law.
* **Counter-Strike is the gunplay.** Aim anywhere, recoil, reload, limited ammo, headshots, and
  `V` switches to a first-person view with the gun on screen.
* **Contra is the mission type for set pieces**: waves, weapon pickups (spread, laser, rapid) and
  bosses (a gunship, a tank).
* **Mario is the exploration layer**: star coins and secrets on rooftops and in alleys, reached by
  climbing and jumping, plus power-ups; On Foot's side-scrolling levels become arcade cabinets.
* **Rush is the chase mission type**: police and getaway chases on the city's roads.
* **The story is told in storyboards**: comic-panel intros and outros around every mission
  (the existing `ComicUI`), in a chapter structure.

**Art** comes from CC0 packs rather than code: Quaternius's Downtown City MegaKit (PBR-textured
modular city), Ultimate Modular Characters and Ultimate Modular Women (13 modern outfits, including
police in SWAT gear, each with 24 clips such as gun idle, run-and-shoot and strafing runs),
Realistic Car Pack and Ultimate Gun Pack. Moves the clothed rig lacks (jump, driving, reload) are
posed procedurally. Every file is listed in `docs/CREDITS.md`. Mixamo is avoided: its
licence forbids redistributing raw files, which a web game cannot prevent.

**Pipeline.** A build-time script (`scripts/assets/build-city.mjs`, glTF-Transform) merges the
pieces we use into a few GLB files with WebP textures at game resolution, so the game downloads
tens of megabytes, not the packs' hundreds.

**Process.** A **vertical slice first**: one district and one complete mission at the best quality
reachable, reviewed by the owner with screenshots and video, before anything expands.

## Consequences

* **Positive:** one hero, one world, one art direction; every new feature deepens the same game.
* **Positive:** the look is carried by modelled, PBR-textured assets, not code primitives.
* **Negative:** a large build. Phased, each phase playable and reviewed (see the plan).
* **Negative:** Rush and On Foot stop being the focus; they are kept as side modes.
* **Honest limit:** a browser game made with free assets will not look like GTA V. The target is
  the finish of a polished stylized game, and the owner judges each phase against it.

## Update (2026-09-24): VORIXA City: HEAT, everything merged

Asked to merge the phases into one engaging whole with a large, good-looking cast, the city became
**VORIXA City: HEAT**: a crew taking the city back from the **Choir** syndicate.

* **Crew (Safehouse, H).** Ten playable characters, each a clothed outfit in a palette of its own
  with a role, a bio and a perk that changes play (Quickdraw, Plated, Focus bullet time, Mechanic,
  Marksman, Wheelman, Field medic, Breacher, Ghost, Smooth). Clearing waves and jobs recruits
  them. The Choir, the police and the citizens are dressed the same way.
* **Chapter 1** strings the styles into five jobs, each a storyboard briefing with rendered
  portraits of the crew, a run of steps, and an outro: *Wheels* (steal and deliver, GTA), *Stash
  House* (clear a crew, Counter-Strike), *Loud Exit* (lose three stars of heat), *Tithe* (star
  coins high over planters, Mario), *Cantor* (a plated boss with a bare head, Contra). After the
  chapter, the turf war's waves never stop.
* **City life.** Citizens walk the sidewalks and panic at gunfire; hurting them raises HEAT (1-5
  stars) and police respond; it cools only out of their sight. Cars are cover.
* **Honest limit, again:** the characters are low-poly, flat-coloured CC0 models, dressed and lit
  as well as they can be (palettes, per-material finishes, rim light, a studio for portraits).
  They are not film-quality people; that would need a character artist or paid assets.
