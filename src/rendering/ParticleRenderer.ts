import * as THREE from 'three';
import { ParticlePool, type BurstKind, type BurstOptions } from './ParticlePool';

/**
 * Draws a `ParticlePool` as one instanced mesh.
 *
 * Every live particle is a small low-poly puff; the whole pool is a single draw call however many
 * bursts are in flight. Live particles are packed to the front of the instance buffer each frame
 * and `count` is set to how many there are, so the GPU never processes dead slots.
 *
 * Unlit on purpose. The world is cel-shaded; lit particles would pick up the toon bands and read
 * as tiny rocks. Flat colour reads as dust, confetti and sparks — effects, not objects.
 */
export class ParticleRenderer {
  public readonly pool: ParticlePool;
  private readonly mesh: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  private readonly disposables: { dispose(): void }[] = [];

  public constructor(capacity = 512) {
    this.pool = new ParticlePool(capacity, 0x51f15);
    // Icosahedron at detail 0: 20 faces, reads as round at particle size, costs nothing.
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    // Particles fly well outside any bounds three.js could compute from one icosahedron.
    this.mesh.frustumCulled = false;
    this.disposables.push(geometry, material);
  }

  public get object(): THREE.Object3D {
    return this.mesh;
  }

  public burst(kind: BurstKind, x: number, y: number, z: number, options?: BurstOptions): void {
    this.pool.burst(kind, x, y, z, options);
  }

  /**
   * @param nearZ Particles beyond this z (toward a camera looking down -z) are not drawn. A burst
   *              that drifts back into the lens fills the screen with giant blobs.
   */
  public update(dt: number, nearZ = Infinity): void {
    const pool = this.pool;
    pool.update(dt);

    let drawn = 0;
    for (let i = 0; i < pool.capacity; i++) {
      const size = pool.displaySize(i);
      if (size <= 0 || pool.z[i] > nearZ) continue;
      this.position.set(pool.x[i], pool.y[i], pool.z[i]);
      this.scale.setScalar(size);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(drawn, this.matrix);
      this.color.setHex(pool.color[i]);
      this.mesh.setColorAt(drawn, this.color);
      drawn++;
    }

    this.mesh.count = drawn;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    for (const item of this.disposables) item.dispose();
  }
}
