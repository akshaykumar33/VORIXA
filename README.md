# VORIXA City: HEAT

> An open-city action game for the web: take a city back from the Choir syndicate, one job and
> one outpost at a time, then head north into the wild country.

[![CI Status](https://github.com/akshaykumar33/VORIXA/actions/workflows/ci.yml/badge.svg)](https://github.com/akshaykumar33/VORIXA/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Built with three.js (WebGL2) and runs in a desktop browser, no install. The design and every
decision behind it are in [ADR-0014](docs/adr/ADR-0014-vorixa-city-flagship.md).

---

## What is in it

| | |
|---|---|
| **The city** | A downtown district of streets and buildings you walk, sprint, climb and drive through. Citizens react to gunfire; HEAT (1-5 stars) brings the police. |
| **The crew** | Ten playable characters, each with a perk (press H for the Safehouse). A realistic cast of 27 MakeHuman people with retargeted animation. |
| **Gunplay** | Pistol, SMG, rifle, shotgun, sniper: recoil, reloads, headshots, cars as cover. First or third person (V). |
| **Chapter 1** | Five storyboarded jobs: steal a car, hit a stash house, lose the police, collect the Tithe, and face Cantor. |
| **Outposts** | Five Choir checkpoints to liberate: loud, or quietly with the pistol and silent takedowns (E). Shoot the alarm before it rings. |
| **Chaos** | Barrels, propane and cars explode in chains and leave fires that spread to fuel. |
| **Rooftops and the glider** | Ladders up the tall buildings (E), and a paraglider (Space in the air) that rides the heat off fires. |
| **Cantor on the radio** | The Choir's boss talks to you about what you just did. |
| **The wild country** | Hills, pine forest and a lake north of the city, with wolf packs that hunt you and the Choir, deer, foxes and stags. |

## Controls

| Action | Keys |
|---|---|
| Move · look | W A S D · mouse |
| Fire · aim · reload | Left mouse · right mouse · R |
| Weapons | 1 – 5, wheel |
| Sprint · jump / open or fold the glider | Shift · Space |
| Takedown · climb a ladder | E |
| Get in / out of a car · drive · handbrake | F · W A S D · Space |
| First / third person | V |
| Safehouse (choose crew) | H |
| Mute | M |

`?lowfx` in the address runs a low-effects preset for weaker GPUs.

## Local development

Requires Node.js 20+ and pnpm.

```bash
pnpm install
pnpm hooks:install   # once per clone
pnpm dev             # development server
pnpm verify          # secret scan + typecheck + tests: the local gate
pnpm build           # production build
```

The game's art is built from CC0 packs by the scripts in `scripts/assets/` (see
[the plan](docs/plans/VORIXA_CITY_PLAN.md)); the built, compressed output is committed under
`public/`, so a fresh clone runs without fetching anything. Every third-party asset is credited
in [docs/CREDITS.md](docs/CREDITS.md).

## Documentation

- [ADR-0014: VORIXA City](docs/adr/ADR-0014-vorixa-city-flagship.md) and all [ADRs](docs/adr/README.md)
- [Credits and licences](docs/CREDITS.md)
- [Git workflow and delivery rules](docs/operations/GIT_WORKFLOW.md)
- [Contributor instructions](AGENTS.md)

## License

MIT, see [LICENSE](LICENSE). Third-party assets keep their own licences, listed in
[docs/CREDITS.md](docs/CREDITS.md).
