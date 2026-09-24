import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ALARM_HEIGHT, type OutpostDef, type Outposts } from '../../city/Outposts';
import type { Box } from '../../city/CityLayout';

/**
 * How the Choir's outposts look (ADR-0014, Far Cry layer): concrete jersey barriers painted with
 * hazard stripes, sandbag walls, the Choir's crimson banners on tall poles (the crew's colours once
 * the outpost is liberated), the alarm on its pole with a light that blinks while the guards count
 * down and strobes red when it rings, and a marker high over each outpost, seen from down the
 * street, so the player can find the fight.
 */

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The Choir's sigil: a ring around three rising bars (voices), over a field. */
function sigil(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, ink: string): void {
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = r * 0.14;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  const w = r * 0.22;
  for (const [dx, h] of [[-0.45, 0.7], [0, 1.1], [0.45, 0.7]] as const) {
    g.fillRect(cx + dx * r - w / 2, cy + r * 0.55 - h * r, w, h * r);
  }
}

function bannerTexture(field: string, ink: string, crew: boolean): THREE.CanvasTexture {
  return canvasTexture(128, 256, (g) => {
    g.fillStyle = field;
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, 128, 10);
    g.fillRect(0, 246, 128, 10);
    if (crew) {
      // The crew's mark: a V in a ring.
      g.strokeStyle = ink;
      g.lineWidth = 9;
      g.beginPath();
      g.arc(64, 110, 42, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(42, 88);
      g.lineTo(64, 136);
      g.lineTo(86, 88);
      g.stroke();
    } else sigil(g, 64, 110, 40, ink);
    // Cloth: faint vertical weave and a frayed hem.
    for (let x = 0; x < 128; x += 3) {
      g.fillStyle = `rgba(0,0,0,${0.03 + (x % 7) * 0.006})`;
      g.fillRect(x, 0, 1, 256);
    }
    g.fillStyle = field;
    for (let x = 0; x < 128; x += 16) {
      g.beginPath();
      g.moveTo(x, 246);
      g.lineTo(x + 8, 256);
      g.lineTo(x + 16, 246);
      g.fill();
    }
  });
}

function stripeTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 32, (g) => {
    g.fillStyle = '#f4f1ea';
    g.fillRect(0, 0, 256, 32);
    g.fillStyle = '#c21d25';
    for (let x = -32; x < 290; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 32, 32);
      g.lineTo(x + 16, 32);
      g.fill();
    }
    g.fillStyle = 'rgba(40,30,25,0.25)';
    for (let i = 0; i < 60; i++) g.fillRect((i * 97) % 256, (i * 13) % 32, 3, 1);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function concreteTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#b9b5ac';
    g.fillRect(0, 0, 128, 128);
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) {
      const v = 150 + Math.floor(rnd() * 70);
      g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`;
      g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    g.fillStyle = 'rgba(60,50,45,0.18)';
    for (let i = 0; i < 12; i++) g.fillRect(rnd() * 128, 90 + rnd() * 38, 1 + rnd() * 3, 6 + rnd() * 18);
  });
}

function markerTexture(held: boolean, accent: string): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.translate(64, 64);
    g.rotate(Math.PI / 4);
    g.fillStyle = 'rgba(10,10,14,0.75)';
    g.fillRect(-40, -40, 80, 80);
    g.strokeStyle = held ? '#ff3b4a' : accent;
    g.lineWidth = 7;
    g.strokeRect(-40, -40, 80, 80);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (held) sigil(g, 64, 64, 22, '#ff3b4a');
    else {
      g.strokeStyle = accent;
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(44, 64);
      g.lineTo(58, 78);
      g.lineTo(86, 48);
      g.stroke();
    }
  });
}

/** The profile of a jersey barrier (x across its width, y up), extruded along its length. */
function barrierGeometry(length: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0);
  s.lineTo(0.3, 0);
  s.lineTo(0.3, 0.08);
  s.lineTo(0.14, 0.3);
  s.lineTo(0.1, 1.05);
  s.lineTo(-0.1, 1.05);
  s.lineTo(-0.14, 0.3);
  s.lineTo(-0.3, 0.08);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
  g.translate(0, 0, -length / 2);
  // Box-project the UVs so the concrete grain reads at the same scale on every face.
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const az = Math.abs(nor.getZ(i));
    uv[i * 2] = (az > ax ? pos.getX(i) : pos.getZ(i)) * 0.8;
    uv[i * 2 + 1] = pos.getY(i) * 0.8;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

interface Site {
  def: OutpostDef;
  banners: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>[];
  lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  alarmBox: THREE.Group;
  marker: THREE.Sprite;
  shownState: string;
  alarmUp: boolean;
  tilt: number;
}

export class OutpostView {
  public readonly group = new THREE.Group();
  private readonly sites: Site[] = [];
  private readonly alarmLight = new THREE.PointLight(0xff1a1a, 0, 26, 2);
  private readonly choirBanner = bannerTexture('#7d0f18', '#f2e9e1', false);
  private readonly crewBanner: THREE.CanvasTexture;
  private readonly heldMarker = markerTexture(true, '#ffffff');
  private readonly ourMarker: THREE.CanvasTexture;
  private time = 0;

  /** @param accent The crew's colour (#rrggbb), for liberated outposts. */
  public constructor(defs: readonly OutpostDef[], accent: string) {
    this.crewBanner = bannerTexture(accent, '#ffffff', true);
    this.ourMarker = markerTexture(false, accent);
    const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.92, metalness: 0 });
    const stripe = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
    const burlap = new THREE.MeshStandardMaterial({ color: 0x8f7d58, roughness: 1 });
    const pole = new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.45, metalness: 0.8 });

    // All the concrete (and all the sandbags) across every outpost, merged: two draw calls.
    const barriers: THREE.BufferGeometry[] = [];
    const stripes: THREE.BufferGeometry[] = [];
    const bags: THREE.BufferGeometry[] = [];
    const piece = barrierGeometry(1.5);
    const band = new THREE.PlaneGeometry(1.46, 0.18);
    const bag = new THREE.SphereGeometry(1, 10, 6).scale(0.3, 0.13, 0.19);
    for (const d of defs) {
      for (const b of d.barricades) this.layBarriers(b, piece, band, barriers, stripes);
      for (const b of d.sandbags) this.laySandbags(b, bag, bags);
    }
    const merged = (list: THREE.BufferGeometry[], m: THREE.Material) => {
      const mesh = new THREE.Mesh(mergeGeometries(list), m);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    merged(barriers, concrete);
    merged(stripes, stripe);
    merged(bags, burlap);

    for (const d of defs) {
      const banners: Site['banners'] = [];
      for (const b of d.banners) {
        const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 5.2, 10).translate(0, 2.6, 0), pole);
        staff.position.set(b.x, 0, b.z);
        staff.castShadow = true;
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 2.1, 6, 1).translate(0.58, 3.9, 0),
          new THREE.MeshStandardMaterial({ map: this.choirBanner, roughness: 0.85, side: THREE.DoubleSide })
        );
        cloth.position.set(b.x, 0, b.z);
        cloth.castShadow = true;
        banners.push(cloth);
        this.group.add(staff, cloth);
      }
      // The alarm: a pole, a yellow box, a red lamp.
      const alarm = new THREE.Group();
      alarm.position.set(d.alarm.x, 0, d.alarm.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, ALARM_HEIGHT + 0.5, 8).translate(0, (ALARM_HEIGHT + 0.5) / 2, 0), pole);
      const box = new THREE.Group();
      box.position.y = ALARM_HEIGHT;
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2), new THREE.MeshStandardMaterial({ color: 0xe8b21e, roughness: 0.5, metalness: 0.2 }));
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x5a0a0a, emissive: 0xff1a1a, emissiveIntensity: 0, roughness: 0.2 })
      );
      lamp.position.y = 0.21;
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.14, 12, 1, true).rotateX(Math.PI / 2), pole);
      horn.position.z = 0.16;
      box.add(shell, lamp, horn);
      box.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      alarm.add(post, box);
      // Face the road.
      alarm.rotation.y = Math.atan2(d.x - d.alarm.x, d.z - d.alarm.z);
      this.group.add(alarm);

      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heldMarker, depthTest: false, fog: false, transparent: true }));
      marker.position.set(d.x, 11, d.z);
      marker.scale.setScalar(2.4);
      marker.renderOrder = 10;
      this.group.add(marker);
      this.sites.push({ def: d, banners, lamp, alarmBox: box, marker, shownState: '', alarmUp: true, tilt: 0 });
    }
    this.group.add(this.alarmLight);
  }

  /** Concrete pieces along a barricade box (along its long side), each with a painted band. */
  private layBarriers(b: Box, piece: THREE.BufferGeometry, band: THREE.PlaneGeometry, out: THREE.BufferGeometry[], stripes: THREE.BufferGeometry[]): void {
    const alongX = b.maxX - b.minX > b.maxZ - b.minZ;
    const length = alongX ? b.maxX - b.minX : b.maxZ - b.minZ;
    const count = Math.max(1, Math.round(length / 1.6));
    const step = length / count;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const t = (alongX ? b.minX : b.minZ) + step * (i + 0.5);
      const cx = alongX ? t : (b.minX + b.maxX) / 2;
      const cz = alongX ? (b.minZ + b.maxZ) / 2 : t;
      // Pieces sit a little askew, as barriers dropped by a crane do.
      const skew = Math.sin(t * 12.9898) * 0.04;
      m.makeRotationY((alongX ? Math.PI / 2 : 0) + skew).setPosition(cx, 0, cz);
      out.push(piece.clone().applyMatrix4(m));
      for (const side of [-1, 1]) {
        const s = band.clone().translate(0, 0.62, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(side > 0 ? Math.PI / 2 : -Math.PI / 2));
        s.translate(side * 0.128, 0, 0);
        stripes.push(s.applyMatrix4(m));
      }
    }
  }

  /** Bags stacked in staggered courses to the wall's height. */
  private laySandbags(b: Box, bag: THREE.BufferGeometry, out: THREE.BufferGeometry[]): void {
    const alongX = b.maxX - b.minX > b.maxZ - b.minZ;
    const length = alongX ? b.maxX - b.minX : b.maxZ - b.minZ;
    const courses = Math.round(b.height / 0.22);
    const m = new THREE.Matrix4();
    for (let c = 0; c < courses; c++) {
      const per = Math.max(1, Math.floor(length / 0.58) - (c % 2));
      for (let i = 0; i < per; i++) {
        const t = (alongX ? b.minX : b.minZ) + (length - per * 0.58) / 2 + 0.29 + i * 0.58;
        for (const row of [-0.17, 0.17]) {
          if (c >= courses - 1 && row > 0) continue;
          const cx = alongX ? t : (b.minX + b.maxX) / 2 + row;
          const cz = alongX ? (b.minZ + b.maxZ) / 2 + row : t;
          m.makeRotationY((alongX ? 0 : Math.PI / 2) + Math.sin(t * 7 + c) * 0.08).setPosition(cx, 0.12 + c * 0.22, cz);
          out.push(bag.clone().applyMatrix4(m));
        }
      }
    }
  }

  public update(outposts: Outposts, dt: number, cameraPos: THREE.Vector3): void {
    this.time += dt;
    let ringing: Site | null = null;
    let ringingD = Infinity;
    for (const site of this.sites) {
      const state = outposts.stateOf(site.def.id);
      if (state !== site.shownState) {
        site.shownState = state;
        const ours = state === 'liberated';
        for (const b of site.banners) {
          b.material.map = ours ? this.crewBanner : this.choirBanner;
          b.material.needsUpdate = true;
        }
        site.marker.material.map = ours ? this.ourMarker : this.heldMarker;
        site.marker.material.needsUpdate = true;
      }
      // Banners stir in the wind.
      site.banners.forEach((b, i) => {
        b.rotation.y = Math.sin(this.time * 1.3 + i * 2 + site.def.x) * 0.25;
      });
      // Markers: seen from afar, gone up close (the outpost itself is there to see).
      const d = Math.hypot(cameraPos.x - site.def.x, cameraPos.z - site.def.z);
      site.marker.material.opacity = Math.min(1, Math.max(0, (d - 28) / 20)) * (state === 'liberated' ? 0.6 : 1);
      site.marker.position.y = 11 + Math.sin(this.time * 2 + site.def.z) * 0.25;

      // The alarm: blinking through the countdown, strobing when it rings; knocked askew when shot.
      const up = outposts.alarmStanding(site.def.id);
      if (!up && site.alarmUp) site.alarmUp = false;
      if (!site.alarmUp) {
        site.tilt = Math.min(0.9, site.tilt + dt * 4);
        site.alarmBox.rotation.x = site.tilt;
        site.lamp.material.emissiveIntensity = 0;
        continue;
      }
      let glow = 0;
      if (state === 'alarm') {
        glow = Math.sin(this.time * 22) > 0 ? 6 : 0.5;
        if (d < ringingD) {
          ringing = site;
          ringingD = d;
        }
      } else if (state === 'alerted') glow = Math.sin(this.time * 7) > 0.3 ? 4 : 0.3;
      site.lamp.material.emissiveIntensity = glow;
    }
    if (ringing) {
      this.alarmLight.position.set(ringing.def.alarm.x, ALARM_HEIGHT + 0.6, ringing.def.alarm.z);
      this.alarmLight.intensity = Math.sin(this.time * 22) > 0 ? 60 : 4;
    } else this.alarmLight.intensity = 0;
  }
}
