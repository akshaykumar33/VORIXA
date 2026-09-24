import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Ladder } from '../../city/Rooftops';

/**
 * The city's second level (ADR-0014, Far Cry layer): fire-escape ladders up the tall buildings,
 * each with a glowing mark on the pavement at its foot, and the hero's paraglider: a curved
 * canopy in the crew's colour with white ribs, hung from lines to the harness, opening with a
 * snap and banking into turns.
 */

function canopyTexture(accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = accent;
  g.fillRect(0, 0, 512, 128);
  // Cells: a white rib between each, a darker trailing edge.
  for (let x = 0; x <= 512; x += 512 / 14) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(x - 2, 0, 4, 128);
  }
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, 104, 512, 24);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(0, 18, 512, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A paraglider canopy: a span × chord sheet bent into an arc, leading edge toward +z. */
function canopyGeometry(span: number, chord: number, arc: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(span, chord, 28, 4).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const r = span / arc;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = x / r;
    // Around the arc, and a little camber front to back.
    pos.setXYZ(i, Math.sin(a) * r, Math.cos(a) * r - r + (1 - (z / (chord / 2)) ** 2) * 0.12, -z);
  }
  g.computeVertexNormals();
  return g;
}

export class RooftopView {
  public readonly group = new THREE.Group();
  /** The paraglider, parented to the hero's root by the renderer. */
  public readonly glider = new THREE.Group();
  private readonly canopy: THREE.Mesh;
  private readonly marks: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private open = 0;
  private target = 0;
  private bank = 0;
  private time = 0;

  public constructor(ladders: readonly Ladder[], accent: string) {
    const steel = new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.5, metalness: 0.8 });
    const parts: THREE.BufferGeometry[] = [];
    const rail = new THREE.BoxGeometry(0.06, 1, 0.06);
    const rung = new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6).rotateZ(Math.PI / 2);
    const hoop = new THREE.TorusGeometry(0.36, 0.022, 6, 16, Math.PI).rotateX(Math.PI / 2);
    for (const l of ladders) {
      const out = l.facing === 0 ? 1 : -1;
      const m = new THREE.Matrix4();
      const top = l.roofY + 1.1;
      for (const side of [-0.25, 0.25]) {
        m.makeScale(1, top, 1).setPosition(l.wallX + side, top / 2, l.wallZ + out * 0.18);
        parts.push(rail.clone().applyMatrix4(m));
      }
      for (let y = 0.3; y < top - 0.2; y += 0.3) parts.push(rung.clone().translate(l.wallX, y, l.wallZ + out * 0.18));
      // Safety hoops from two metres up, as fire escapes have.
      for (let y = 2.4; y < top; y += 0.9) {
        m.makeRotationY(l.facing === 0 ? 0 : Math.PI).setPosition(l.wallX, y, l.wallZ + out * 0.18);
        parts.push(hoop.clone().applyMatrix4(m));
      }
      // Stand-offs bolting it to the wall.
      for (let y = 1; y < top; y += 3) parts.push(new THREE.BoxGeometry(0.56, 0.05, 0.2).translate(l.wallX, y, l.wallZ + out * 0.09));
      const mark = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.62, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23d).multiplyScalar(1.8), transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false })
      );
      mark.position.set(l.x, 0.04, l.z);
      this.marks.push(mark);
      this.group.add(mark);
    }
    const ladder = new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))), steel);
    ladder.castShadow = ladder.receiveShadow = true;
    this.group.add(ladder);

    // The glider: canopy high over the harness, lines down to the shoulders.
    this.canopy = new THREE.Mesh(
      canopyGeometry(8.4, 2.2, 1.6),
      new THREE.MeshStandardMaterial({ map: canopyTexture(accent), roughness: 0.6, side: THREE.DoubleSide })
    );
    this.canopy.position.set(0, 6.2, -0.4);
    this.canopy.castShadow = true;
    const lines: number[] = [];
    const pos = (this.canopy.geometry as THREE.BufferGeometry).getAttribute('position');
    for (let i = 0; i < pos.count; i += 7) {
      if (Math.abs(pos.getZ(i)) > 0.6) continue;
      lines.push(pos.getX(i), pos.getY(i) + 6.2, pos.getZ(i) - 0.4, pos.getX(i) > 0 ? 0.22 : -0.22, 1.45, -0.1);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const cords = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0xd9d9d9, transparent: true, opacity: 0.7 }));
    this.glider.add(this.canopy, cords);
    this.glider.visible = false;
  }

  /** Opens (true) or folds (false) the glider. */
  public setGliding(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  /**
   * @param turn How fast the hero is turning (rad/s), for the bank.
   */
  public update(dt: number, turn: number, heroX: number, heroZ: number): void {
    this.time += dt;
    // The canopy snaps open with a little overshoot, and folds away faster.
    const rate = this.target > this.open ? 5 : 8;
    this.open += (this.target - this.open) * Math.min(1, rate * dt);
    const shown = this.open > 0.02;
    this.glider.visible = shown;
    if (shown) {
      const s = this.target > 0 ? this.open * (1 + Math.sin(Math.min(1, this.open) * Math.PI) * 0.12) : this.open;
      this.glider.scale.set(s, 0.3 + 0.7 * s, s);
      this.bank += (Math.max(-0.5, Math.min(0.5, -turn * 0.35)) - this.bank) * Math.min(1, 4 * dt);
      this.glider.rotation.z = this.bank;
      this.canopy.position.y = 6.2 + Math.sin(this.time * 1.7) * 0.06;
    }
    // Ladder marks pulse gently when the hero is near enough to see them.
    for (const m of this.marks) {
      const d = Math.hypot(m.position.x - heroX, m.position.z - heroZ);
      m.visible = d < 45;
      if (m.visible) m.material.opacity = 0.45 + Math.sin(this.time * 3) * 0.2;
    }
  }
}
