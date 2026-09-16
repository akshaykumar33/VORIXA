import { Renderer } from './Renderer';
import { World } from '../ecs/World';

export class WebGL2Renderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;

  public async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      throw new Error('WebGL2 is not supported on this device.');
    }

    this.gl = gl;
    this.gl.clearColor(0.024, 0.027, 0.039, 1.0); // #06070a
    this.gl.enable(this.gl.DEPTH_TEST);
  }

  public resize(width: number, height: number): void {
    if (!this.canvas || !this.gl) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  public render(_world: World, _alpha: number): void {
    if (!this.gl) return;
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    // Future Phase 01: draw fallback meshes
  }

  public getBackendName(): string {
    return 'WebGL2 (Fallback)';
  }

  public dispose(): void {
    this.gl = null;
    this.canvas = null;
  }
}
