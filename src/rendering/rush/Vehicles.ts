import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { part, flat, toon, outline, bake } from './Toon';

/**
 * Every car in Rush, and the little people who drive them.
 *
 * Vehicles face **-z** and sit on y = 0. All player vehicles share one collision box in the
 * simulation, so choosing one is purely a matter of taste — none of them is secretly better.
 *
 * The driver is what turns a car into a character. They sit up out of an open top, lean into
 * turns, raise a fist when you blast something and see stars when you crash; the renderer drives
 * all of that through the handles returned here.
 */

export type VehicleKind = 'zippy' | 'monster' | 'hotdog' | 'bubble';

export const VEHICLES: readonly { kind: VehicleKind; name: string; blurb: string }[] = [
  { kind: 'zippy', name: 'Zippy', blurb: 'Open-top racer' },
  { kind: 'monster', name: 'Big Wheels', blurb: 'Monster truck' },
  { kind: 'hotdog', name: 'Hot Dog', blurb: 'Snack van, extra mustard' },
  { kind: 'bubble', name: 'Bubble', blurb: 'Tiny, round, fearless' }
];

export type TrafficKind = 'sedan' | 'taxi' | 'icecream' | 'pickup';
export const TRAFFIC_KINDS: readonly TrafficKind[] = ['sedan', 'sedan', 'taxi', 'icecream', 'pickup'];

export interface DriverModel {
  root: THREE.Group;
  head: THREE.Group;
  scarf: THREE.Mesh[];
  /** Raised to cheer. Rotates about the shoulder. */
  arm: THREE.Group;
  /** Little stars that orbit the head after a crash. */
  stars: THREE.Group;
}

export interface CarModel {
  root: THREE.Group;
  /** Everything above the wheels: squashed, rolled and pitched as a unit. */
  body: THREE.Group;
  wheels: THREE.Mesh[];
  wheelRadius: number;
  flames: THREE.Mesh[];
  turret: THREE.Group | null;
  driver: DriverModel | null;
}

const INK = 0x1d1b33;
const TYRE = 0x2b2d42;
const GLASS = 0x9fe3ff;
const CREAM = 0xfff7e0;

const rounded = (w: number, h: number, d: number, r = 0.18) => new RoundedBoxGeometry(w, h, d, 3, r);

// ─── People ───────────────────────────────────────────────────────────────────────────────────

export function buildDriver(skin: number, helmet: number, scarfColor: number): DriverModel {
  const root = new THREE.Group();
  const torso = part(new THREE.CapsuleGeometry(0.3, 0.3, 4, 10), skin, { outline: 0.04 });
  torso.position.y = 0.3;
  root.add(torso);

  const head = new THREE.Group();
  head.position.y = 0.85;
  root.add(head);
  head.add(part(new THREE.SphereGeometry(0.34, 16, 12), skin, { outline: 0.04 }));
  const lid = part(new THREE.SphereGeometry(0.37, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), helmet, { outline: 0.04 });
  lid.position.y = 0.02;
  head.add(lid);
  // Goggles pushed up on the helmet: the universal sign of a cartoon racer.
  for (const x of [-0.13, 0.13]) {
    const rim = part(new THREE.TorusGeometry(0.1, 0.035, 6, 14), 0x8a5a3a, { outline: 0 });
    rim.position.set(x, 0.2, -0.3);
    rim.rotation.x = -0.5;
    head.add(rim);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.085, 12), flat(0xbff4ff));
    lens.position.set(x, 0.2, -0.305);
    lens.rotation.set(-0.5, Math.PI, 0);
    head.add(lens);
  }
  // Eyes look forward, down the road.
  for (const x of [-0.12, 0.12]) {
    const white = part(new THREE.SphereGeometry(0.09, 10, 8), 0xffffff, { outline: 0.02 });
    white.position.set(x, 0.0, -0.29);
    head.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), flat(INK));
    pupil.position.set(x, 0.0, -0.37);
    head.add(pupil);
  }

  const scarf: THREE.Mesh[] = [];
  const knot = part(new THREE.TorusGeometry(0.24, 0.07, 6, 16).rotateX(Math.PI / 2), scarfColor, { outline: 0.03 });
  knot.position.y = 0.58;
  root.add(knot);
  let tail: THREE.Object3D = root;
  for (let i = 0; i < 4; i++) {
    const segment = part(new THREE.BoxGeometry(0.16, 0.05, 0.3).translate(0, 0, 0.15), scarfColor, { outline: 0.02 });
    if (i === 0) segment.position.set(0.12, 0.6, 0.2);
    else segment.position.set(0, 0, 0.3);
    tail.add(segment);
    tail = segment;
    scarf.push(segment);
  }

  const arm = new THREE.Group();
  arm.position.set(0.3, 0.48, 0);
  const limb = part(new THREE.CapsuleGeometry(0.07, 0.35, 4, 8).translate(0, 0.24, 0), skin, { outline: 0.03 });
  arm.add(limb);
  const fist = part(new THREE.SphereGeometry(0.1, 10, 8), helmet, { outline: 0.03 });
  fist.position.y = 0.52;
  arm.add(fist);
  arm.rotation.z = -2.4;
  root.add(arm);

  const stars = new THREE.Group();
  stars.position.y = 0.55;
  const starGeometry = new THREE.OctahedronGeometry(0.09, 0);
  for (let i = 0; i < 3; i++) {
    const star = new THREE.Mesh(starGeometry, flat(0xffd23f));
    const a = (i / 3) * Math.PI * 2;
    star.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
    stars.add(star);
  }
  stars.visible = false;
  head.add(stars);

  return { root, head, scarf, arm, stars };
}

// ─── Parts shared between vehicles ────────────────────────────────────────────────────────────

function wheels(root: THREE.Object3D, radius: number, width: number, hub: number, positions: [number, number][], y = radius): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const tyre = new THREE.CylinderGeometry(radius, radius, width, 18).rotateZ(Math.PI / 2);
  const hubGeometry = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, width + 0.02, 10).rotateZ(Math.PI / 2);
  const notch = new THREE.BoxGeometry(width + 0.03, radius * 0.18, radius * 0.65);
  for (const [x, z] of positions) {
    const wheel = part(tyre, TYRE, { outline: 0.05 });
    wheel.add(new THREE.Mesh(hubGeometry, toon(hub)));
    // A notch on the hub makes the spin visible; a plain disc looks stationary.
    wheel.add(new THREE.Mesh(notch, toon(CREAM)));
    wheel.position.set(x, y, z);
    root.add(wheel);
    out.push(wheel);
  }
  return out;
}

function lights(body: THREE.Object3D, y: number, frontZ: number, backZ: number, spread = 0.6): void {
  const lamp = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16).rotateX(Math.PI / 2);
  for (const x of [-spread, spread]) {
    const head = new THREE.Mesh(lamp, flat(0xfff6c8));
    head.position.set(x, y, frontZ);
    outline(head, 0.04);
    body.add(head);
    const tail = new THREE.Mesh(lamp, flat(0xff3b4e));
    tail.position.set(x, y, backZ);
    body.add(tail);
  }
}

function exhaustFlames(body: THREE.Object3D, y: number, z: number): THREE.Mesh[] {
  const flames: THREE.Mesh[] = [];
  const cone = new THREE.ConeGeometry(0.2, 1.1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.55);
  for (const x of [-0.45, 0.45]) {
    const flame = new THREE.Mesh(cone, flat(0xffa62b));
    const core = new THREE.Mesh(cone, flat(0xfff3b0));
    core.scale.setScalar(0.55);
    flame.add(core);
    flame.position.set(x, y, z);
    flame.visible = false;
    body.add(flame);
    flames.push(flame);
  }
  return flames;
}

function blaster(): THREE.Group {
  const turret = new THREE.Group();
  turret.add(part(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 14), TYRE, { outline: 0.04 }));
  for (const x of [-0.14, 0.14]) {
    const barrel = part(new THREE.CylinderGeometry(0.075, 0.075, 0.9, 8).rotateX(Math.PI / 2), 0x8a8fa8, { outline: 0.03 });
    barrel.position.set(x, 0.13, -0.4);
    turret.add(barrel);
  }
  return turret;
}

/** A roll bar behind the seat with the blaster on top, clear of the driver's head. */
function rollBar(body: THREE.Object3D, y: number, z: number, color: number): THREE.Group {
  const bar = part(new THREE.TorusGeometry(0.62, 0.07, 8, 20, Math.PI), color, { outline: 0.03 });
  bar.position.set(0, y, z);
  body.add(bar);
  const turret = blaster();
  turret.position.set(0, y + 0.72, z);
  body.add(turret);
  return turret;
}

// ─── Player vehicles ──────────────────────────────────────────────────────────────────────────

export function buildVehicle(kind: VehicleKind): CarModel {
  const car = kind === 'zippy' ? zippy() : kind === 'monster' ? monster() : kind === 'hotdog' ? hotdog() : bubble();
  const d = car.driver;
  if (d) {
    bake(d.head, [d.stars]);
    bake(d.root, [d.head, d.arm, d.scarf[0]]);
  }
  bake(car.body, [...car.flames, ...(car.turret ? [car.turret] : []), ...(d ? [d.root] : [])]);
  return car;
}

function zippy(): CarModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = 0xff5a36;
  const trim = 0xffd23f;

  const chassis = part(rounded(1.9, 0.62, 3.8, 0.24), paint, { outline: 0.06 });
  chassis.position.y = 0.62;
  body.add(chassis);
  const hood = part(rounded(1.7, 0.2, 1.4, 0.1), paint, { outline: 0.04 });
  hood.position.set(0, 0.98, -1.1);
  body.add(hood);
  const stripe = part(new THREE.BoxGeometry(0.34, 0.03, 3.2), CREAM, { outline: 0, shadow: false });
  stripe.position.set(0, 0.94, 0);
  body.add(stripe);
  const screen = part(rounded(1.5, 0.45, 0.08, 0.04), GLASS, { outline: 0.03 });
  screen.position.set(0, 1.2, -0.45);
  screen.rotation.x = -0.35;
  body.add(screen);
  const seat = part(rounded(0.8, 0.7, 0.25, 0.1), INK, { outline: 0.03 });
  seat.position.set(0, 1.15, 0.75);
  body.add(seat);
  for (const z of [-1.9, 1.9]) {
    const bumper = part(rounded(1.95, 0.24, 0.3, 0.1), trim, { outline: 0.04 });
    bumper.position.set(0, 0.42, z);
    body.add(bumper);
  }
  const spoiler = part(rounded(1.8, 0.1, 0.45, 0.04), trim, { outline: 0.04 });
  spoiler.position.set(0, 1.25, 1.75);
  body.add(spoiler);
  lights(body, 0.72, -1.92, 1.92);

  const driver = buildDriver(0xffb27a, 0x3d8bff, 0xffd23f);
  driver.root.position.set(0, 0.85, 0.35);
  body.add(driver.root);
  const turret = rollBar(body, 1.3, 1.05, trim);

  return {
    root, body, driver, turret,
    wheels: wheels(root, 0.46, 0.4, trim, [[-0.98, -1.2], [0.98, -1.2], [-0.98, 1.2], [0.98, 1.2]]),
    wheelRadius: 0.46,
    flames: exhaustFlames(body, 0.45, 2.02)
  };
}

function monster(): CarModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = 0x5ad16b;
  const trim = 0xffd23f;

  const chassis = part(rounded(2.0, 0.7, 3.6, 0.22), paint, { outline: 0.06 });
  chassis.position.y = 1.45;
  body.add(chassis);
  const cab = part(rounded(1.7, 0.2, 1.6, 0.08), paint, { outline: 0.04 });
  cab.position.set(0, 1.9, 0.1);
  body.add(cab);
  // Flames painted down the side: cheap, and it says "monster truck" instantly.
  for (const x of [-1.01, 1.01]) {
    const decal = part(new THREE.ConeGeometry(0.35, 1.6, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(0.05, 1, 1), 0xff5a36, { outline: 0 });
    decal.position.set(x, 1.45, -0.3);
    body.add(decal);
  }
  const springs = part(new THREE.BoxGeometry(1.6, 0.5, 2.8), 0x3a3550, { outline: 0.04 });
  springs.position.y = 0.95;
  body.add(springs);
  lights(body, 1.55, -1.82, 1.82, 0.65);

  const driver = buildDriver(0xc98bff, 0xff5a36, 0x3ff7ff);
  driver.root.position.set(0, 1.98, 0.2);
  body.add(driver.root);
  const turret = rollBar(body, 2.05, 0.95, trim);

  return {
    root, body, driver, turret,
    wheels: wheels(root, 0.78, 0.6, trim, [[-1.1, -1.25], [1.1, -1.25], [-1.1, 1.25], [1.1, 1.25]]),
    wheelRadius: 0.78,
    flames: exhaustFlames(body, 1.3, 1.85)
  };
}

function hotdog(): CarModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const van = part(rounded(1.95, 1.3, 3.8, 0.3), 0xfff0d6, { outline: 0.06 });
  van.position.y = 1.0;
  body.add(van);
  const band = part(new THREE.BoxGeometry(1.98, 0.3, 3.5), 0xff4d5e, { outline: 0 });
  band.position.y = 0.75;
  body.add(band);
  const screen = part(rounded(1.6, 0.5, 0.06, 0.04), GLASS, { outline: 0.03 });
  screen.position.set(0, 1.3, -1.9);
  body.add(screen);
  // The sign on the roof is the whole point of this vehicle.
  const bun = part(new THREE.CapsuleGeometry(0.34, 2.2, 6, 12).rotateX(Math.PI / 2).scale(1.2, 0.7, 1), 0xf2b366, { outline: 0.05 });
  bun.position.set(0, 1.95, 0.5);
  body.add(bun);
  const sausage = part(new THREE.CapsuleGeometry(0.24, 2.6, 6, 12).rotateX(Math.PI / 2), 0xd9573a, { outline: 0.04 });
  sausage.position.set(0, 2.15, 0.5);
  body.add(sausage);
  const mustard = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.04, 6, 12, Math.PI).rotateY(Math.PI / 2),
    toon(0xffd23f)
  );
  for (let i = 0; i < 5; i++) {
    const squiggle = mustard.clone();
    squiggle.position.set(0, 2.38, -0.4 + i * 0.45);
    squiggle.rotation.x = i % 2 === 0 ? 0 : Math.PI;
    body.add(squiggle);
  }
  lights(body, 0.8, -1.92, 1.92);

  const driver = buildDriver(0xffd23f, 0xffffff, 0xff4d5e);
  driver.root.position.set(0.45, 1.25, -0.7);
  driver.root.scale.setScalar(0.85);
  body.add(driver.root);
  const turret = blaster();
  turret.position.set(0, 2.55, -0.9);
  body.add(turret);

  return {
    root, body, driver, turret,
    wheels: wheels(root, 0.46, 0.4, 0xff4d5e, [[-0.98, -1.2], [0.98, -1.2], [-0.98, 1.2], [0.98, 1.2]]),
    wheelRadius: 0.46,
    flames: exhaustFlames(body, 0.45, 2.02)
  };
}

function bubble(): CarModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const shell = part(new THREE.SphereGeometry(1, 22, 16).scale(0.95, 0.6, 1.5), 0x9b6bff, { outline: 0.06 });
  shell.position.y = 0.9;
  body.add(shell);
  const skirt = part(new THREE.TorusGeometry(0.95, 0.12, 8, 28).rotateX(Math.PI / 2).scale(1, 1, 1.5), 0xffd23f, { outline: 0.03 });
  skirt.position.y = 0.7;
  body.add(skirt);
  // A see-through dome, so the driver is visible from the chase camera.
  const domeMaterial = toon(GLASS).clone();
  domeMaterial.transparent = true;
  domeMaterial.opacity = 0.35;
  domeMaterial.depthWrite = false;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMaterial);
  dome.position.set(0, 1.3, 0.1);
  dome.renderOrder = 2;
  body.add(dome);
  lights(body, 0.95, -1.45, 1.45, 0.45);

  const driver = buildDriver(0x5ad16b, 0xff5fa8, 0xffffff);
  driver.root.position.set(0, 1.05, 0.15);
  driver.root.scale.setScalar(0.85);
  body.add(driver.root);
  const turret = blaster();
  turret.position.set(0, 1.95, 0.9);
  body.add(turret);

  return {
    root, body, driver, turret,
    wheels: wheels(root, 0.42, 0.34, 0xffd23f, [[-0.85, -1.0], [0.85, -1.0], [-0.85, 1.0], [0.85, 1.0]]),
    wheelRadius: 0.42,
    flames: exhaustFlames(body, 0.5, 1.5)
  };
}

// ─── Traffic ──────────────────────────────────────────────────────────────────────────────────

export const SEDAN_PALETTES = [0x2ec4b6, 0xffc93c, 0x9b6bff, 0xf7f3e8, 0x5ad16b, 0x3d8bff];

/** A closed car seen from behind: glass cabin, a bean head silhouetted in the rear window. */
export function buildTraffic(kind: TrafficKind, id: number): CarModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = kind === 'taxi' ? 0xffc93c : kind === 'icecream' ? 0xffb3d9 : SEDAN_PALETTES[id % SEDAN_PALETTES.length];

  const chassis = part(rounded(1.9, 0.62, 3.8, 0.24), paint, { outline: 0.06 });
  chassis.position.y = 0.62;
  body.add(chassis);

  if (kind === 'icecream') {
    const box = part(rounded(1.9, 1.3, 2.6, 0.18), 0xfff7e0, { outline: 0.05 });
    box.position.set(0, 1.55, 0.5);
    body.add(box);
    const cone = part(new THREE.ConeGeometry(0.35, 0.9, 12).rotateX(Math.PI), 0xf2b366, { outline: 0.04 });
    cone.position.set(0, 2.65, 0.5);
    body.add(cone);
    const scoop = part(new THREE.SphereGeometry(0.4, 14, 10), 0xff8fc8, { outline: 0.04 });
    scoop.position.set(0, 3.2, 0.5);
    body.add(scoop);
  } else if (kind === 'pickup') {
    const cab = part(rounded(1.6, 0.65, 1.3, 0.16), GLASS, { outline: 0.05 });
    cab.position.set(0, 1.25, -0.6);
    body.add(cab);
    for (const [x, z, c] of [[-0.4, 0.9, 0xd98f4e], [0.35, 1.2, 0xffd23f], [0, 1.4, 0x3d8bff]] as const) {
      const cargo = part(rounded(0.55, 0.5, 0.55, 0.06), c, { outline: 0.04 });
      cargo.position.set(x, 1.2, z);
      body.add(cargo);
    }
  } else {
    const cabin = part(rounded(1.5, 0.6, 1.9, 0.22), GLASS, { outline: 0.05 });
    cabin.position.set(0, 1.15, 0.3);
    body.add(cabin);
    const roof = part(rounded(1.58, 0.16, 1.6, 0.07), paint, { outline: 0.04 });
    roof.position.set(0, 1.47, 0.34);
    body.add(roof);
    // A driver's head in the rear window: traffic has people in it too.
    const head = part(new THREE.SphereGeometry(0.26, 12, 10), [0xffb27a, 0xc98bff, 0x5ad16b, 0xffd23f][id % 4], { outline: 0.03 });
    head.position.set(0.35, 1.18, 0.1);
    body.add(head);
    if (kind === 'taxi') {
      const sign = part(rounded(0.7, 0.3, 0.4, 0.06), 0xfff7e0, { outline: 0.03 });
      sign.position.set(0, 1.7, 0.34);
      body.add(sign);
      const checker = part(new THREE.BoxGeometry(1.92, 0.12, 3.2), INK, { outline: 0 });
      checker.position.y = 0.7;
      body.add(checker);
    }
  }

  for (const z of [-1.9, 1.9]) {
    const bumper = part(rounded(1.95, 0.24, 0.3, 0.1), 0xdfe3ee, { outline: 0.04 });
    bumper.position.set(0, 0.42, z);
    body.add(bumper);
  }
  lights(body, 0.72, -1.92, 1.92);

  // Traffic is seen from behind at a distance, where spinning hubs are invisible: the wheels are
  // baked in with everything else, and the whole car costs a handful of draws.
  wheels(root, 0.46, 0.4, 0xdfe3ee, [[-0.98, -1.2], [0.98, -1.2], [-0.98, 1.2], [0.98, 1.2]]);
  bake(body);
  bake(root, [body]);
  return { root, body, driver: null, turret: null, wheels: [], wheelRadius: 0.46, flames: [] };
}
