import * as THREE from 'three';
import { citizen, CITIZEN_MODELS } from '../../city/Crew';
import type { CityLife } from '../../city/CityLife';
import { People, type Person } from './People';

/**
 * Draws VORIXA City's citizens (ADR-0014, phase 4): each one an Ultimate Modular outfit in the
 * everyday palette `Crew.citizen` gives them, walking, running when panicked, falling when hurt.
 * Outfits load in the background after the city; a citizen appears once theirs has arrived.
 */
export class CityLifeView {
  public readonly group = new THREE.Group();
  private readonly people = new Map<number, Person>();
  private readonly outfits = new Map<string, Awaited<ReturnType<People['load']>>>();
  private started = false;

  public constructor(private readonly factory: People) {}

  /** Starts fetching the citizens' outfits, one after another so the city stays responsive. */
  public preload(): void {
    if (this.started) return;
    this.started = true;
    void (async () => {
      for (const model of CITIZEN_MODELS) {
        try {
          this.outfits.set(model, await this.factory.load(model));
        } catch (error) {
          console.warn('[city] citizen outfit failed', model, error);
        }
      }
    })();
  }

  public update(life: CityLife, dt: number): void {
    for (const c of life.citizens) {
      let p = this.people.get(c.id);
      if (!p) {
        const def = citizen(c.id);
        const gltf = this.outfits.get(def.model);
        if (!gltf) continue;
        p = this.factory.makeFrom(gltf, def, 0.2);
        this.people.set(c.id, p);
        this.group.add(p.root);
        People.play(p, 'Walk', 0);
      }
      p.root.position.set(c.x, 0, c.z);
      p.root.rotation.y = c.facing;
      if (!c.alive) People.play(p, 'Death', 0.1, true);
      else if (c.panic > 0) People.play(p, 'Run', 0.15, false, 1.15);
      else People.play(p, 'Walk', 0.3, false, 0.85);
      p.mixer.update(dt);
    }
  }
}
