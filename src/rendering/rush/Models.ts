import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { part, flat, toon, outline } from './Toon';
import { hazardTexture, chevronTexture, crateTexture, trailerTexture } from './Textures';

/**
 * The cast of Rush, modelled in code.
 *
 * Every model faces **-z** (the direction of travel) and sits on y = 0. Shapes are chunky and
 * rounded with oversized wheels and lights: the proportions of a toy, which is what reads as
 * "cartoon" far more than any shader does.
 *
 * Builders return the parts the renderer animates (wheels to spin, a body to squash, flames to
 * flicker) alongside the root, so animation never has to search the scene graph by name.
 */

const rounded = (w: number, h: number, d: number, r = 0.18) => new RoundedBoxGeometry(w, h, d, 3, r);

export interface CarModel {
  root: THREE.Group;
  /** Everything above the wheels: squashed, rolled and pitched as a unit. */
  body: THREE.Group;
  wheels: THREE.Mesh[];
  flames: THREE.Mesh[];
  /** The roof blaster, turned toward the crosshair. Absent on traffic. */
  turret: THREE.Group | null;
}

export interface CarPalette {
  paint: number;
  trim: number;
  stripe: number;
}

export const PLAYER_PALETTE: CarPalette = { paint: 0xff5a36, trim: 0xffd23f, stripe: 0xfff7e0 };

export const TRAFFIC_PALETTES: CarPalette[] = [
  { paint: 0x2ec4b6, trim: 0xfff7e0, stripe: 0x1d1b33 },
  { paint: 0xffc93c, trim: 0xff5a36, stripe: 0x1d1b33 },
  { paint: 0x9b6bff, trim: 0xfff7e0, stripe: 0xffd23f },
  { paint: 0xf7f3e8, trim: 0x3d8bff, stripe: 0x3d8bff },
  { paint: 0x5ad16b, trim: 0xfff7e0, stripe: 0xfff7e0 }
];

const TYRE = 0x2b2d42;
const GLASS = 0x9fe3ff;

export function buildCar(palette: CarPalette, armed: boolean): CarModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const chassis = part(rounded(1.9, 0.62, 3.8, 0.24), palette.paint, { outline: 0.06 });
  chassis.position.y = 0.62;
  body.add(chassis);

  const cabin = part(rounded(1.5, 0.6, 1.9, 0.22), GLASS, { outline: 0.05 });
  cabin.position.set(0, 1.15, 0.3);
  body.add(cabin);

  const roof = part(rounded(1.58, 0.16, 1.6, 0.07), palette.paint, { outline: 0.04 });
  roof.position.set(0, 1.47, 0.34);
  body.add(roof);

  const stripe = part(new THREE.BoxGeometry(0.34, 0.04, 1.3), palette.stripe, { outline: 0, shadow: false });
  stripe.position.set(0, 0.95, -1.15);
  body.add(stripe);

  const bumper = part(rounded(1.95, 0.24, 0.3, 0.1), palette.trim, { outline: 0.04 });
  bumper.position.set(0, 0.42, -1.9);
  body.add(bumper);
  const rearBumper = bumper.clone();
  rearBumper.position.z = 1.9;
  body.add(rearBumper);

  // Big round headlights are most of what gives a cartoon car a face.
  const lampGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16).rotateX(Math.PI / 2);
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(lampGeometry, flat(0xfff6c8));
    lamp.position.set(x, 0.72, -1.92);
    outline(lamp, 0.04);
    body.add(lamp);
    const tail = new THREE.Mesh(lampGeometry, flat(0xff3b4e));
    tail.position.set(x, 0.72, 1.92);
    body.add(tail);
  }

  const spoiler = part(rounded(1.8, 0.1, 0.45, 0.04), palette.trim, { outline: 0.04 });
  spoiler.position.set(0, 1.25, 1.75);
  body.add(spoiler);
  for (const x of [-0.6, 0.6]) {
    const strut = part(new THREE.BoxGeometry(0.1, 0.3, 0.1), TYRE, { outline: 0 });
    strut.position.set(x, 1.05, 1.75);
    body.add(strut);
  }

  const wheels: THREE.Mesh[] = [];
  const tyreGeometry = new THREE.CylinderGeometry(0.46, 0.46, 0.4, 18).rotateZ(Math.PI / 2);
  const hubGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.98, -1.2], [0.98, -1.2], [-0.98, 1.2], [0.98, 1.2]]) {
    const wheel = part(tyreGeometry, TYRE, { outline: 0.05 });
    const hub = new THREE.Mesh(hubGeometry, toon(palette.trim));
    // A notch on the hub makes the spin visible; a plain disc looks stationary.
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.08, 0.3), toon(0xfff7e0));
    wheel.add(hub, notch);
    wheel.position.set(x, 0.46, z);
    root.add(wheel);
    wheels.push(wheel);
  }

  const flames: THREE.Mesh[] = [];
  const flameGeometry = new THREE.ConeGeometry(0.2, 1.1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.55);
  for (const x of [-0.45, 0.45]) {
    const flame = new THREE.Mesh(flameGeometry, flat(0xffa62b));
    const core = new THREE.Mesh(flameGeometry, flat(0xfff3b0));
    core.scale.setScalar(0.55);
    flame.add(core);
    flame.position.set(x, 0.45, 2.02);
    flame.visible = false;
    body.add(flame);
    flames.push(flame);
  }

  let turret: THREE.Group | null = null;
  if (armed) {
    turret = new THREE.Group();
    const base = part(new THREE.CylinderGeometry(0.34, 0.4, 0.2, 14), TYRE, { outline: 0.04 });
    turret.add(base);
    for (const x of [-0.16, 0.16]) {
      const barrel = part(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8).rotateX(Math.PI / 2), 0x8a8fa8, { outline: 0.03 });
      barrel.position.set(x, 0.14, -0.4);
      turret.add(barrel);
    }
    turret.position.set(0, 1.62, 0.3);
    body.add(turret);
  }

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.parent !== null && (o as THREE.Mesh).material !== undefined) {
      // Shadows only from solid parts; lamps and flames cast none.
      const mesh = o as THREE.Mesh;
      if (mesh.material instanceof THREE.MeshBasicMaterial) mesh.castShadow = false;
    }
  });

  return { root, body, wheels, flames, turret };
}

export function buildTruck(livery: string, cabColor: number): THREE.Group {
  const root = new THREE.Group();
  const trailer = new THREE.Mesh(rounded(2.6, 2.7, 5.6, 0.2), toon(0xffffff, { map: trailerTexture(livery) }));
  trailer.castShadow = true;
  outline(trailer, 0.07);
  trailer.position.set(0, 2.0, 1.0);
  root.add(trailer);

  const cab = part(rounded(2.5, 2.1, 1.9, 0.3), cabColor, { outline: 0.07 });
  cab.position.set(0, 1.55, -2.85);
  root.add(cab);
  const windscreen = part(rounded(2.1, 0.8, 0.12, 0.05), GLASS, { outline: 0.03 });
  windscreen.position.set(0, 2.05, -3.8);
  root.add(windscreen);
  const grille = part(rounded(1.6, 0.6, 0.1, 0.04), 0xdfe3ee, { outline: 0.03 });
  grille.position.set(0, 1.0, -3.82);
  root.add(grille);

  const tyre = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 16).rotateZ(Math.PI / 2);
  for (const z of [-2.8, 0.2, 2.6]) {
    for (const x of [-1.2, 1.2]) {
      const wheel = part(tyre, TYRE, { outline: 0.05 });
      wheel.position.set(x, 0.55, z);
      root.add(wheel);
    }
  }
  return root;
}

export interface BarrierModel {
  root: THREE.Group;
  lamps: THREE.Mesh[];
}

export function buildBarrier(): BarrierModel {
  const root = new THREE.Group();
  const plank = new THREE.Mesh(rounded(2.6, 0.5, 0.3, 0.08), toon(0xffffff, { map: hazardTexture() }));
  plank.castShadow = true;
  outline(plank, 0.05);
  plank.position.y = 0.72;
  root.add(plank);
  for (const x of [-1.0, 1.0]) {
    const leg = part(rounded(0.18, 0.9, 0.5, 0.05), 0xf4f1ea, { outline: 0.04 });
    leg.position.set(x, 0.45, 0);
    root.add(leg);
  }
  const lamps: THREE.Mesh[] = [];
  for (const x of [-0.9, 0.9]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), flat(0xffb020));
    outline(lamp, 0.03);
    lamp.position.set(x, 1.1, 0);
    root.add(lamp);
    lamps.push(lamp);
  }
  return { root, lamps };
}

export function buildCrate(): THREE.Group {
  const root = new THREE.Group();
  const box = new THREE.Mesh(rounded(1.55, 1.55, 1.55, 0.08), toon(0xffffff, { map: crateTexture() }));
  box.castShadow = true;
  outline(box, 0.05);
  box.position.y = 0.78;
  root.add(box);
  return root;
}

export interface DroneModel {
  root: THREE.Group;
  rotors: THREE.Mesh[];
  pupil: THREE.Mesh;
  light: THREE.Mesh;
}

/** A small, grumpy flying saucer with one big eye. The villain should be cute, not grim. */
export function buildDrone(): DroneModel {
  const root = new THREE.Group();
  const hull = part(new THREE.SphereGeometry(1, 20, 14).scale(1.25, 0.5, 1.25), 0x8e5cff, { outline: 0.06 });
  root.add(hull);
  const ring = part(new THREE.TorusGeometry(1.25, 0.12, 8, 28).rotateX(Math.PI / 2), 0xffd23f, { outline: 0.03 });
  root.add(ring);
  const dome = part(new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xc9b6ff, { outline: 0.04 });
  dome.position.y = 0.3;
  root.add(dome);

  // The eye faces +z: toward the player, who is behind the drone.
  const eye = part(new THREE.SphereGeometry(0.46, 16, 12), 0xffffff, { outline: 0.05 });
  eye.position.set(0, 0.05, 1.05);
  root.add(eye);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), flat(0x1d1b33));
  pupil.position.set(0, 0, 0.32);
  eye.add(pupil);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), flat(0xffffff));
  glint.position.set(0.08, 0.1, 0.18);
  pupil.add(glint);
  const brow = part(new THREE.BoxGeometry(0.8, 0.14, 0.14), 0x1d1b33, { outline: 0 });
  brow.position.set(0, 0.55, 1.1);
  brow.rotation.z = 0.18;
  root.add(brow);

  const rotors: THREE.Mesh[] = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = part(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), 0x1d1b33, { outline: 0 });
    arm.position.set(x * 0.95, 0.35, z * 0.95);
    root.add(arm);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.14), toon(0xfff7e0));
    rotor.position.set(x * 0.95, 0.62, z * 0.95);
    root.add(rotor);
    rotors.push(rotor);
  }

  const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), flat(0xff3b4e));
  light.position.set(0, -0.5, 0);
  root.add(light);
  return { root, rotors, pupil, light };
}

export function buildShot(): THREE.Group {
  const root = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), flat(0xff4fd8));
  outline(orb, 0.06);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), flat(0xfff0ff));
  orb.add(core);
  root.add(orb);
  return root;
}

export function buildNitro(): THREE.Group {
  const root = new THREE.Group();
  const can = part(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 16), 0x2fb3ff, { outline: 0.05 });
  root.add(can);
  const cap = part(new THREE.CylinderGeometry(0.2, 0.26, 0.24, 12), 0xdfe3ee, { outline: 0.03 });
  cap.position.y = 0.6;
  root.add(cap);
  const bolt = new THREE.Shape();
  bolt.moveTo(0.05, 0.35);
  bolt.lineTo(-0.2, -0.02);
  bolt.lineTo(0, -0.02);
  bolt.lineTo(-0.08, -0.35);
  bolt.lineTo(0.2, 0.06);
  bolt.lineTo(0, 0.06);
  bolt.closePath();
  const boltMesh = part(new THREE.ExtrudeGeometry(bolt, { depth: 0.06, bevelEnabled: false }), 0xffd23f, { outline: 0.02 });
  boltMesh.position.set(0, 0, 0.4);
  root.add(boltMesh);
  return root;
}

export function buildHeart(): THREE.Group {
  const root = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.1, -0.4, -0.6, -0.1, -0.6, 0.2);
  s.bezierCurveTo(-0.6, 0.5, -0.2, 0.6, 0, 0.35);
  s.bezierCurveTo(0.2, 0.6, 0.6, 0.5, 0.6, 0.2);
  s.bezierCurveTo(0.6, -0.1, 0.1, -0.4, 0, -0.5);
  const geometry = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3 });
  geometry.center();
  root.add(part(geometry, 0xff4a6a, { outline: 0.05 }));
  return root;
}

/** A wedge rising toward -z, the direction the car drives onto it. */
export function buildRamp(): THREE.Group {
  const root = new THREE.Group();
  const profile = new THREE.Shape();
  profile.moveTo(-2.6, 0);
  profile.lineTo(2.6, 0);
  profile.lineTo(-2.6, 1.1);
  profile.closePath();
  const geometry = new THREE.ExtrudeGeometry(profile, { depth: 2.8, bevelEnabled: false });
  // Shape x → world z (rising toward -z), extrusion → world x, centred on the lane.
  // rotateY(-90°) maps (x, y, z) → (-z, y, x): the tall end at shape x = -2.6 lands at z = -2.6.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(1.4, 0, 0);
  const texture = chevronTexture();
  texture.repeat.set(1, 3);
  const ramp = new THREE.Mesh(geometry, toon(0xffffff, { map: texture }));
  ramp.castShadow = true;
  outline(ramp, 0.05);
  root.add(ramp);
  return root;
}

/** Coins are instanced: this is the shared geometry, facing the camera. */
export function coinGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.55, 0.55, 0.14, 22).rotateX(Math.PI / 2);
}
