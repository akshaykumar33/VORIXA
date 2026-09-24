import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { part, flat, toon, outline, bake, bent } from './Toon';
import { hazardTexture, chevronTexture, crateTexture, trailerTexture } from './Textures';

/**
 * The cast of Rush, modelled in code.
 *
 * Every model faces **-z** (the direction of travel) and sits on y = 0. Shapes are chunky and
 * rounded with oversized wheels and lights: the proportions of a toy, which is what reads as
 * "cartoon" far more than any shader does.
 *
 * Builders return the parts the renderer animates alongside the root, so animation never has to
 * search the scene graph by name. Cars live in `Vehicles.ts`.
 */

const rounded = (w: number, h: number, d: number, r = 0.18) => new RoundedBoxGeometry(w, h, d, 3, r);

const TYRE = 0x2b2d42;
const GLASS = 0x9fe3ff;

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
  bake(root);
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
  bake(root, lamps);
  return { root, lamps };
}

export function buildCrate(): THREE.Group {
  const root = new THREE.Group();
  const box = new THREE.Mesh(rounded(1.55, 1.55, 1.55, 0.08), toon(0xffffff, { map: crateTexture() }));
  box.castShadow = true;
  outline(box, 0.05);
  box.position.y = 0.78;
  root.add(box);
  bake(root);
  return root;
}

export type DroneStyle = 'saucer' | 'bee' | 'ufo';

export interface DroneModel {
  root: THREE.Group;
  style: DroneStyle;
  /** Spinning rotors (saucer), flapping wings (bee) or a turning light ring (ufo). */
  spinners: THREE.Object3D[];
  pupil: THREE.Mesh;
  /** The pupil's resting position; animation offsets from it. */
  pupilHome: THREE.Vector3;
  light: THREE.Mesh;
}

/** The big tracking eye every enemy shares: a villain that watches you is one you notice. */
function eye(parent: THREE.Object3D, x: number, y: number, z: number, size = 0.46): THREE.Mesh {
  const white = part(new THREE.SphereGeometry(size, 16, 12), 0xffffff, { outline: 0.05 });
  white.position.set(x, y, z);
  parent.add(white);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.48, 12, 10), flat(0x1d1b33));
  pupil.position.set(0, 0, size * 0.7);
  white.add(pupil);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(size * 0.15, 8, 6), flat(0xffffff));
  glint.position.set(size * 0.17, size * 0.22, size * 0.4);
  pupil.add(glint);
  return pupil;
}

/**
 * The enemy, dressed for the world it appears in. All three styles share the eye, the blink
 * light and the wind-up squash before firing, so they read as one enemy in different costumes.
 *
 * Every style faces +z: toward the player, who is behind it.
 */
export function buildDrone(style: DroneStyle, hullColor = 0x8e5cff, trimColor = 0xffd23f): DroneModel {
  const root = new THREE.Group();
  const spinners: THREE.Object3D[] = [];
  let pupil: THREE.Mesh;

  if (style === 'bee') {
    root.add(part(new THREE.SphereGeometry(1, 20, 14).scale(0.9, 0.85, 1.25), hullColor, { outline: 0.06 }));
    for (const z of [-0.45, 0.1]) {
      const stripe = part(new THREE.TorusGeometry(0.86, 0.12, 8, 24), 0x1d1b33, { outline: 0 });
      stripe.position.z = z;
      root.add(stripe);
    }
    const stinger = part(new THREE.ConeGeometry(0.18, 0.6, 10).rotateX(-Math.PI / 2), 0x1d1b33, { outline: 0.03 });
    stinger.position.z = -1.45;
    root.add(stinger);
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.add(part(new THREE.SphereGeometry(0.7, 12, 8).scale(1, 0.08, 0.55).translate(0.65, 0, 0), 0xe8f7ff, { outline: 0.03 }));
      wing.position.set(side * 0.45, 0.7, -0.2);
      wing.scale.x = side;
      root.add(wing);
      spinners.push(wing);
      const antenna = part(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5).translate(0, 0.3, 0), 0x1d1b33, { outline: 0 });
      antenna.position.set(side * 0.3, 0.75, 0.7);
      antenna.rotation.z = -side * 0.35;
      root.add(antenna);
      const bobble = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), flat(0x1d1b33));
      bobble.position.set(side * 0.52, 1.3, 0.7);
      root.add(bobble);
    }
    pupil = eye(root, 0, 0.15, 0.95, 0.42);
  } else if (style === 'ufo') {
    root.add(part(new THREE.SphereGeometry(1, 24, 12).scale(1.6, 0.32, 1.6), hullColor, { outline: 0.06 }));
    const ring = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), flat(i % 2 === 0 ? 0x3ff7ff : 0xff3df2));
      bulb.position.set(Math.cos(a) * 1.45, -0.05, Math.sin(a) * 1.45);
      ring.add(bulb);
    }
    root.add(ring);
    spinners.push(ring);
    const domeMaterial = bent(new THREE.MeshToonMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.45, depthWrite: false }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMaterial);
    dome.position.y = 0.22;
    dome.renderOrder = 2;
    root.add(dome);
    // A little green pilot, because a UFO with nobody in it is just a lamp.
    const alien = part(new THREE.SphereGeometry(0.34, 14, 10).scale(1, 1.1, 1), 0x5ad16b, { outline: 0.03 });
    alien.position.y = 0.5;
    root.add(alien);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 2.6, 20, 1, true).translate(0, -1.3, 0),
      bent(new THREE.MeshBasicMaterial({ color: 0x3ff7ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }))
    );
    beam.position.y = -0.2;
    root.add(beam);
    pupil = eye(alien, 0, 0.08, 0.26, 0.15);
  } else {
    root.add(part(new THREE.SphereGeometry(1, 20, 14).scale(1.25, 0.5, 1.25), hullColor, { outline: 0.06 }));
    root.add(part(new THREE.TorusGeometry(1.25, 0.12, 8, 28).rotateX(Math.PI / 2), trimColor, { outline: 0.03 }));
    const dome = part(new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, { outline: 0.04 });
    dome.position.y = 0.3;
    root.add(dome);
    const brow = part(new THREE.BoxGeometry(0.8, 0.14, 0.14), 0x1d1b33, { outline: 0 });
    brow.position.set(0, 0.55, 1.1);
    brow.rotation.z = 0.18;
    root.add(brow);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const arm = part(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), 0x1d1b33, { outline: 0 });
      arm.position.set(x * 0.95, 0.35, z * 0.95);
      root.add(arm);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.14), toon(0xfff7e0));
      rotor.position.set(x * 0.95, 0.62, z * 0.95);
      root.add(rotor);
      spinners.push(rotor);
    }
    pupil = eye(root, 0, 0.05, 1.05);
  }

  const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), flat(0xff3b4e));
  light.position.set(0, -0.5, 0);
  root.add(light);
  bake(root, [...spinners, pupil, light]);
  return { root, style, spinners, pupil, pupilHome: pupil.position.clone(), light };
}

/** A spinning rainbow "?" box: the promise of something good. */
export function buildItemBox(): THREE.Group {
  const root = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable for the item box texture');
  const gradient = g.createLinearGradient(0, 0, 128, 128);
  ['#ff5a36', '#ffd23f', '#5ad16b', '#3fa7ff', '#9b6bff'].forEach((c, i) => gradient.addColorStop(i / 4, c));
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  g.font = 'bold 96px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#1d1b33';
  g.strokeText('?', 64, 70);
  g.fillStyle = '#ffffff';
  g.fillText('?', 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Its own material (it carries a texture), bent like everything else so it sits on the road.
  const box = new THREE.Mesh(rounded(1.4, 1.4, 1.4, 0.18), bent(new THREE.MeshBasicMaterial({ map: texture })));
  outline(box, 0.07);
  root.add(box);
  return root;
}

// ─── World Tour pieces ────────────────────────────────────────────────────────────────────────

function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

/** A big spinning star coin: the thing worth going out of your way for. */
export function buildStarCoin(): THREE.Group {
  const root = new THREE.Group();
  const disc = part(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 28).rotateX(Math.PI / 2), 0xffc93c, { outline: 0.06, emissive: 0x6b4a00 });
  root.add(disc);
  const star = new THREE.ExtrudeGeometry(starShape(0.6, 0.26), { depth: 0.12, bevelEnabled: false });
  star.translate(0, 0, 0.1);
  const front = part(star, 0xfff3b0, { outline: 0.03, emissive: 0x8a6a00 });
  root.add(front);
  const back = front.clone();
  back.rotation.y = Math.PI;
  root.add(back);
  return root;
}

/** A glowing golden crate floating overhead. Shoot it open; something is inside. */
export function buildGoldCrate(): THREE.Group {
  const root = new THREE.Group();
  root.add(part(rounded(1.55, 1.55, 1.55, 0.12), 0xffc93c, { outline: 0.06, emissive: 0x7a5200 }));
  const emblem = new THREE.ExtrudeGeometry(starShape(0.5, 0.22), { depth: 0.06, bevelEnabled: false });
  for (const [ry, z] of [[0, 0.78], [Math.PI, 0.78], [Math.PI / 2, 0.78], [-Math.PI / 2, 0.78]] as const) {
    const face = new THREE.Mesh(emblem, flat(0xfff7e0));
    face.position.z = z;
    const pivot = new THREE.Group();
    pivot.rotation.y = ry;
    pivot.add(face);
    root.add(pivot);
  }
  bake(root);
  return root;
}

export interface PortalModel {
  root: THREE.Group;
  rings: THREE.Object3D[];
}

/** The warp: a swirling ring standing on the road. */
export function buildPortal(): PortalModel {
  const root = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.22, 10, 36), flat(0x9b6bff));
  outline(outer, 0.05);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 8, 30), flat(0x3ff7ff));
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 30),
    bent(new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }))
  );
  for (const m of [outer, inner, core]) m.position.y = 1.9;
  root.add(outer, inner, core);
  return { root, rings: [outer, inner] };
}

function finishTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable for the finish banner');
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? '#1d1b33' : '#fff7e0';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  g.fillStyle = '#ff5a36';
  g.fillRect(150, 6, 212, 52);
  g.font = 'bold 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff7e0';
  g.fillText('FINISH', 256, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The finish arch across all three lanes. */
export function buildFinishArch(): THREE.Group {
  const root = new THREE.Group();
  for (const x of [-6.2, 6.2]) {
    const post = part(new THREE.CylinderGeometry(0.28, 0.34, 5.6, 10), 0xfff7e0, { outline: 0.05 });
    post.position.set(x, 2.8, 0);
    root.add(post);
    const ball = part(new THREE.SphereGeometry(0.45, 14, 10), 0xffd23f, { outline: 0.04 });
    ball.position.set(x, 5.8, 0);
    root.add(ball);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(12.4, 1.5, 0.2), toon(0xffffff, { map: finishTexture() }));
  banner.position.y = 5.0;
  outline(banner, 0.06);
  root.add(banner);
  bake(root);
  return root;
}

/**
 * A boss: that world's drone, blown up to giant size and crowned. The last one is Baron Buzz
 * himself, in a top hat and monocle.
 */
export function buildBoss(style: DroneStyle, hull: number, trim: number, baron: boolean): DroneModel {
  const d = buildDrone(style, hull, trim);
  if (baron) {
    const hat = part(new THREE.CylinderGeometry(0.55, 0.6, 1.0, 16), 0x1d1b33, { outline: 0.04 });
    hat.position.y = 1.55;
    d.root.add(hat);
    const brim = part(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 20), 0x1d1b33, { outline: 0.03 });
    brim.position.y = 1.05;
    d.root.add(brim);
    const band = part(new THREE.CylinderGeometry(0.61, 0.61, 0.18, 16), 0xff4d5e, { outline: 0 });
    band.position.y = 1.2;
    d.root.add(band);
    const monocle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 20), flat(0xffd23f));
    monocle.position.set(0.2, 0.2, 1.3);
    d.root.add(monocle);
  } else {
    const crown = part(new THREE.CylinderGeometry(0.62, 0.62, 0.35, 5, 1, true), 0xffd23f, { outline: 0.03, emissive: 0x6b4a00 });
    crown.position.y = 1.05;
    d.root.add(crown);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = part(new THREE.ConeGeometry(0.14, 0.4, 6), 0xffd23f, { outline: 0.02 });
      spike.position.set(Math.cos(a) * 0.62, 1.4, Math.sin(a) * 0.62);
      d.root.add(spike);
    }
  }
  return d;
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
  bake(root);
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
