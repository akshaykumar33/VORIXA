import { World } from '../ecs/World';

export interface Renderer {
  initialize(canvas: HTMLCanvasElement): Promise<void>;
  resize(width: number, height: number): void;
  render(world: World, alpha: number): void;
  getBackendName(): string;
  dispose(): void;
}
