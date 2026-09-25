# VORIXA City — the plan

Decision record: [ADR-0014](../adr/ADR-0014-vorixa-city-flagship.md). One open city that holds
every style the owner asked for: GTA's free roam, driving and police; Counter-Strike's gunplay;
Contra's set pieces and bosses; Mario's secrets and power-ups; Rush's chases; a storyboarded story.

## What each reference game contributes

| Game | What makes it that game | How it appears in VORIXA City |
|---|---|---|
| GTA | Free roam, any car, pedestrians and traffic, wanted stars, missions that carry a story | The whole frame: the district, cars, police, mission markers, minimap |
| Counter-Strike | Aim anywhere, recoil patterns, reloads, limited ammo, headshots, tight maps | All gunplay; `V` first-person view; interior shootout missions |
| Contra | 8-way aim, weapon pickups (spread, laser, rapid), relentless waves, huge bosses | Set-piece missions: rooftop gunship, street tank |
| Mario | Levels that teach, develop, twist and test one idea; power-ups; hidden secrets | Star coins and secrets across rooftops; On Foot levels as arcade cabinets |
| Rush | Lane dodging at speed | Police chases and getaways on city roads |
| Storyboards | Comic panels between beats | Mission intros and outros (`ComicUI`), chapter structure |

## Controls (all devices)

| Action | Keys and mouse | Face (E) | Hands (G) |
|---|---|---|---|
| Move | WASD | look left / right to turn | palm position |
| Look / aim | mouse (pointer lock) | gaze | palm |
| Jump / climb | Space | raise brows | fist |
| Sprint | Shift | smile | raised open hand |
| Fire | left mouse | open mouth | pinch |
| Aim down sights | right mouse | — | — |
| Reload | R | — | — |
| Enter / exit car | F | wink | — |
| Camera: third ↔ first person | V | — | — |

## Phases

Every phase ends with a playable build, screenshots and a short video for the owner to judge.

| # | Phase | Done when |
|---|---|---|
| 0 | **Assets and pipeline** | CC0 packs fetched and credited; `build-city.mjs` produces the city, hero and animation GLBs with WebP textures |
| 1 | **The hero in the city** | One district (streets, sidewalks, buildings, props) with PBR lighting; a third-person hero who idles, walks, jogs, sprints, jumps and collides with the city; `V` first person |
| 2 | **Gunplay** | Pistol and rifle: aim, recoil, reload, ammo, hit reactions, muzzle flash, impacts; target dummies, then enemies who take cover |
| 3 | **Cars** | Enter and exit any parked car (`F`), arcade driving, collisions and damage, the driver seen in the seat |
| 4 | **City life** | Pedestrians who walk and flee, traffic on lanes, police with 1–5 wanted stars |
| 5 | **Story chapter one** | Five missions with storyboard intros: a getaway (chase), a warehouse shootout (CS), a rooftop gunship (Contra boss), a star-coin rooftop run (Mario), a finale |
| 6 | **Polish** | Audio, VFX, performance on integrated graphics, gesture controls, a minimap and mission HUD |

**Vertical slice** = phases 0–2 plus one mission from phase 5. It is reviewed before phases 3+.

## Assets

| Pack (Quaternius, CC0) | Used for |
|---|---|
| Downtown City MegaKit | Streets, sidewalks, modular and prebuilt buildings, props, PBR textures |
| Ultimate Modular Characters (men) and Ultimate Modular Women | The hero (Casual Hoodie), police (Swat), soldiers, pedestrians: 13 modern outfits, each with 24 clips (idle, walk, run, strafe runs, gun idle/point/shoot, run-and-shoot, hits, death, punches, kicks, roll, wave) |
| Universal Animation Library 1 and 2 | Every clip of the realistic cast (below), retargeted onto the MakeHuman skeleton |
| Universal Base Characters | Evaluated, not shipped: the free bodies come without modern clothing |
| Realistic Car Pack | Player and traffic cars |
| Ultimate Gun Pack | Pistols, rifles, shotguns, launchers |

Fetched with `scripts/assets/fetch-itch.mjs` (itch.io's free-download flow; each pack's minimum
price is $0) into `assets-src/` (not committed). Built into `public/city/` by
`scripts/assets/build-city.mjs`.

The realistic cast (ADR-0014, 2026-09-25 update) needs Blender 4.2 with the MPFB 2 add-on, and the
CC0 MakeHuman packs (system assets, pants01, shirts01, shoes01, hair01, dress01, from
files.makehumancommunity.org) unpacked into MPFB's user data. Then:

    blender -b --python scripts/assets/blender/make-cast.py     # people and mh-anims into assets-src/cast
    blender -b --python scripts/assets/blender/check-cast.py    # retarget check, no renderer
    node scripts/assets/build-city.mjs                          # compressed into public/city/people
