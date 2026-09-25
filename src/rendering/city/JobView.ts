import * as THREE from 'three';

/**
 * The job's marks in the world (ADR-0014): a tall beam of light over the current objective, visible
 * over the rooftops, and the Tithe's gold stars, spinning where they hang.
 */
export class JobView {
  public readonly group = new THREE.Group();
  private readonly beam: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly coins: THREE.Group[] = [];
  private readonly coinGeometry: THREE.BufferGeometry;
  private readonly coinMaterial = new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.9, roughness: 0.22, emissive: 0x6b4a00, emissiveIntensity: 0.9 });

  public constructor() {
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffc23d).multiplyScalar(1.6), transparent: true, opacity: 0.28, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 120, 24, 1, true).translate(0, 60, 0), beamMaterial);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23d).multiplyScalar(2), transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false })
    );
    this.ring.position.y = 0.05;
    this.beam.visible = this.ring.visible = false;
    this.beam.renderOrder = 5;
    this.group.add(this.beam, this.ring);
    // A five-pointed star, extruded.
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.2 : 0.45;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    this.coinGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }).center();
  }

  public setTarget(target: { x: number; z: number } | null): void {
    this.beam.visible = this.ring.visible = target !== null;
    if (!target) return;
    this.beam.position.set(target.x, 0, target.z);
    this.ring.position.set(target.x, 0.05, target.z);
  }

  public setCoins(coins: readonly { x: number; y: number; z: number; taken: boolean }[]): void {
    while (this.coins.length < coins.length) {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(this.coinGeometry, this.coinMaterial);
      mesh.castShadow = true;
      const glow = new THREE.PointLight(0xffc93c, 3, 5, 2);
      g.add(mesh, glow);
      this.group.add(g);
      this.coins.push(g);
    }
    this.coins.forEach((g, i) => {
      const c = coins[i];
      g.visible = !!c && !c.taken;
      if (c) g.position.set(c.x, c.y, c.z);
    });
  }

  public update(time: number): void {
    const pulse = 0.22 + Math.sin(time * 3) * 0.06;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = pulse;
    this.ring.scale.setScalar(1 + Math.sin(time * 4) * 0.08);
    for (const g of this.coins) {
      g.rotation.y = time * 2.4;
      g.children[0].position.y = Math.sin(time * 2 + g.position.x) * 0.08;
    }
  }
}
