export const MAX_ENTITIES = 10000;

export const COMPONENT_TRANSFORM = 1 << 0;
export const COMPONENT_VELOCITY = 1 << 1;

export class World {
  private nextEntityId: number = 1;
  private freeEntities: number[] = [];
  public masks: Uint32Array;

  // Component Storage: Transform (x, y, z)
  public posX: Float32Array;
  public posY: Float32Array;
  public posZ: Float32Array;

  // Component Storage: Velocity (vx, vy, vz)
  public velX: Float32Array;
  public velY: Float32Array;
  public velZ: Float32Array;

  public activeCount: number = 0;

  constructor(maxEntities: number = MAX_ENTITIES) {
    this.masks = new Uint32Array(maxEntities);
    this.posX = new Float32Array(maxEntities);
    this.posY = new Float32Array(maxEntities);
    this.posZ = new Float32Array(maxEntities);

    this.velX = new Float32Array(maxEntities);
    this.velY = new Float32Array(maxEntities);
    this.velZ = new Float32Array(maxEntities);
  }

  public createEntity(): number {
    let id: number;
    if (this.freeEntities.length > 0) {
      id = this.freeEntities.pop()!;
    } else {
      id = this.nextEntityId++;
    }
    this.masks[id] = 0;
    this.activeCount++;
    return id;
  }

  public destroyEntity(id: number): void {
    if (id <= 0 || id >= MAX_ENTITIES) return;
    this.masks[id] = 0;
    this.freeEntities.push(id);
    this.activeCount--;
  }

  public addTransform(id: number, x: number = 0, y: number = 0, z: number = 0): void {
    this.masks[id] |= COMPONENT_TRANSFORM;
    this.posX[id] = x;
    this.posY[id] = y;
    this.posZ[id] = z;
  }

  public addVelocity(id: number, vx: number = 0, vy: number = 0, vz: number = 0): void {
    this.masks[id] |= COMPONENT_VELOCITY;
    this.velX[id] = vx;
    this.velY[id] = vy;
    this.velZ[id] = vz;
  }

  public hasComponents(id: number, requiredMask: number): boolean {
    return (this.masks[id] & requiredMask) === requiredMask;
  }

  public query(requiredMask: number, callback: (id: number) => void): void {
    for (let id = 1; id < this.nextEntityId; id++) {
      if ((this.masks[id] & requiredMask) === requiredMask) {
        callback(id);
      }
    }
  }

  public tick(deltaTime: number): void {
    const required = COMPONENT_TRANSFORM | COMPONENT_VELOCITY;
    for (let id = 1; id < this.nextEntityId; id++) {
      if ((this.masks[id] & required) === required) {
        this.posX[id] += this.velX[id] * deltaTime;
        this.posY[id] += this.velY[id] * deltaTime;
        this.posZ[id] += this.velZ[id] * deltaTime;
      }
    }
  }
}
