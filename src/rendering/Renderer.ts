import { World } from '../ecs/World';
import { Camera } from './Camera';

export interface Renderer {
  initialize(canvas: HTMLCanvasElement): Promise<void>;
  resize(width: number, height: number): void;
  /**
   * Draws one frame.
   *
   * @param alpha  Fraction of a simulation tick elapsed since the last one, for interpolation.
   * @param camera Owns the view-projection matrix; already updated for this frame.
   */
  render(world: World, alpha: number, camera: Camera): void;
  getBackendName(): string;
  dispose(): void;
}
