import { Renderer } from './Renderer';
import { World } from '../ecs/World';

export class WebGPURenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';

  public async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported on this browser.');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to acquire WebGPU adapter.');
    }

    this.device = await adapter.requestDevice();
    this.context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;

    if (!this.context) {
      throw new Error('Failed to create WebGPU canvas context.');
    }

    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque'
    });
  }

  public resize(width: number, height: number): void {
    if (!this.canvas || !this.context || !this.device) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  public render(_world: World, _alpha: number): void {
    if (!this.device || !this.context) return;

    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.024, g: 0.027, b: 0.039, a: 1.0 }, // Deep space atmospheric horizon (#06070a)
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    // Future Phase 01: bind mesh pipeline, uniform buffers, and draw procedural geometry
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  public getBackendName(): string {
    return 'WebGPU (Primary)';
  }

  public dispose(): void {
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.context = null;
    this.canvas = null;
  }
}
