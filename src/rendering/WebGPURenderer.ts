import { Renderer } from './Renderer';
import { World } from '../ecs/World';
import { Camera } from './Camera';
import {
  CUBE_INDEX_COUNT,
  CUBE_INDICES,
  CUBE_VERTICES,
  INSTANCE_STRIDE,
  VERTEX_STRIDE,
  buildScene
} from './SceneGeometry';

/** Floats in the frame uniform block: mat4 (16) + three padded vec3s (12). */
const FRAME_UNIFORM_FLOATS = 28;
const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

const SHADER = /* wgsl */ `
struct Frame {
  viewProj : mat4x4<f32>,
  cameraPos : vec3<f32>,
  fogDensity : f32,
  sunDirection : vec3<f32>,
  _pad0 : f32,
  fogColor : vec3<f32>,
  _pad1 : f32,
};

@group(0) @binding(0) var<uniform> frame : Frame;

struct VertexOut {
  @builtin(position) clipPosition : vec4<f32>,
  @location(0) normal : vec3<f32>,
  @location(1) albedo : vec3<f32>,
  @location(2) material : vec2<f32>,
  @location(3) worldPosition : vec3<f32>,
};

@vertex
fn vs_main(
  @location(0) position : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) translation : vec3<f32>,
  @location(3) scale : vec3<f32>,
  @location(4) albedo : vec3<f32>,
  @location(5) material : vec2<f32>
) -> VertexOut {
  let worldPosition = position * scale + translation;

  var out : VertexOut;
  out.clipPosition = frame.viewProj * vec4<f32>(worldPosition, 1.0);
  // Instances are axis-aligned with positive scale, so cardinal face normals survive the
  // transform unchanged. A normal matrix would be dead weight here.
  out.normal = normal;
  out.albedo = albedo;
  out.material = material;
  out.worldPosition = worldPosition;
  return out;
}

/**
 * Screen-space-antialiased world grid. Dividing the distance-to-line by its own derivative keeps
 * the line one pixel wide at any distance or angle, which is what stops a floor grid from turning
 * into crawling moiré as the player walks.
 */
fn gridFactor(worldXZ : vec2<f32>, spacing : f32) -> f32 {
  let coord = worldXZ / spacing;
  let derivative = max(fwidth(coord), vec2<f32>(1e-5, 1e-5));
  let line = abs(fract(coord - 0.5) - 0.5) / derivative;
  return 1.0 - min(min(line.x, line.y), 1.0);
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4<f32> {
  let n = normalize(in.normal);

  // Hemisphere ambient: cold sky light from above, dim bounce from the floor. This is what keeps
  // unlit faces readable instead of crushing them to pure black.
  let hemisphere = 0.5 + 0.5 * n.y;
  let ambient = mix(vec3<f32>(0.05, 0.055, 0.075), vec3<f32>(0.24, 0.31, 0.44), hemisphere);

  let lambert = max(dot(n, frame.sunDirection), 0.0);
  var shaded = in.albedo * (ambient + vec3<f32>(0.95, 0.93, 1.0) * lambert * 1.15);

  // Accent monoliths carry their own light, which is what makes them usable as landmarks.
  shaded = shaded + in.albedo * in.material.x;

  // Derivatives must be evaluated in uniform control flow, so the grid is always computed and
  // only then masked to the floor.
  let minor = gridFactor(in.worldPosition.xz, 4.0);
  let major = gridFactor(in.worldPosition.xz, 20.0);
  let distance = length(in.worldPosition - frame.cameraPos);
  // Fading the grid with distance keeps the horizon from dissolving into aliased noise.
  let gridMask = in.material.y * step(0.5, n.y) * exp(-distance * 0.018);
  shaded = shaded + vec3<f32>(0.0, 0.94, 1.0) * (minor * 0.05 + major * 0.22) * gridMask;

  // Exponential distance fog dissolves the field into the horizon colour, hiding the far plane
  // instead of letting geometry pop out of nothing.
  let fog = clamp(1.0 - exp(-distance * frame.fogDensity), 0.0, 1.0);

  return vec4<f32>(mix(shaded, frame.fogColor, fog), 1.0);
}
`;

export class WebGPURenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';

  private pipeline: GPURenderPipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private instanceBuffer: GPUBuffer | null = null;
  private depthTexture: GPUTexture | null = null;
  private depthWidth = 0;
  private depthHeight = 0;

  private instanceCount = 0;
  /** Reused every frame so the render path never allocates. */
  private readonly frameUniforms = new Float32Array(FRAME_UNIFORM_FLOATS);

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

    this.createSceneResources();
  }

  private createSceneResources(): void {
    const device = this.device!;
    const scene = buildScene();
    this.instanceCount = scene.instanceCount;

    this.vertexBuffer = device.createBuffer({
      label: 'vorixa:cube-vertices',
      size: CUBE_VERTICES.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, CUBE_VERTICES);

    // WebGPU requires index buffer sizes to be a multiple of 4; our 36 uint16 indices are 72 bytes.
    const indexByteLength = Math.ceil(CUBE_INDICES.byteLength / 4) * 4;
    this.indexBuffer = device.createBuffer({
      label: 'vorixa:cube-indices',
      size: indexByteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(this.indexBuffer, 0, CUBE_INDICES);

    this.instanceBuffer = device.createBuffer({
      label: 'vorixa:instances',
      size: scene.instances.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(this.instanceBuffer, 0, scene.instances);

    this.uniformBuffer = device.createBuffer({
      label: 'vorixa:frame-uniforms',
      size: FRAME_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const module = device.createShaderModule({ label: 'vorixa:scene', code: SHADER });

    this.pipeline = device.createRenderPipeline({
      label: 'vorixa:scene-pipeline',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: VERTEX_STRIDE,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
              { shaderLocation: 1, offset: 12, format: 'float32x3' } // normal
            ]
          },
          {
            arrayStride: INSTANCE_STRIDE,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 2, offset: 0, format: 'float32x3' }, // translation
              { shaderLocation: 3, offset: 12, format: 'float32x3' }, // scale
              { shaderLocation: 4, offset: 24, format: 'float32x3' }, // albedo
              { shaderLocation: 5, offset: 36, format: 'float32x2' } // material: [emissive, grid]
            ]
          }
        ]
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
        // Cube faces wind counter-clockwise seen from outside, and both backends agree that this
        // is the front. Verified empirically, not assumed: with this inverted, a box still draws a
        // convincing silhouette — you are simply seeing its inner walls — so the error shows up
        // not as missing geometry but as surfaces lit by the wrong normal. The floor going black
        // (lit as if its normal pointed down) is the symptom to watch for.
        frontFace: 'ccw'
      },
      depthStencil: {
        format: DEPTH_FORMAT,
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
    });

    this.bindGroup = device.createBindGroup({
      label: 'vorixa:frame-bind-group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
    });
  }

  public resize(width: number, height: number): void {
    if (!this.canvas || !this.context || !this.device) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ensureDepthTexture(width, height);
  }

  private ensureDepthTexture(width: number, height: number): void {
    const device = this.device!;
    if (width <= 0 || height <= 0) return;
    if (this.depthTexture && this.depthWidth === width && this.depthHeight === height) return;

    this.depthTexture?.destroy();
    this.depthTexture = device.createTexture({
      label: 'vorixa:depth',
      size: { width, height },
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.depthWidth = width;
    this.depthHeight = height;
  }

  public render(_world: World, _alpha: number, camera: Camera): void {
    if (!this.device || !this.context || !this.pipeline || !this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width <= 0 || height <= 0) return;

    // The swap-chain texture can be resized out from under us by the browser (a DPR change, a
    // monitor switch); recreating the depth target lazily here keeps the two in lockstep.
    this.ensureDepthTexture(width, height);
    if (!this.depthTexture) return;

    this.writeFrameUniforms(camera);

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
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup!);
    passEncoder.setVertexBuffer(0, this.vertexBuffer!);
    passEncoder.setVertexBuffer(1, this.instanceBuffer!);
    passEncoder.setIndexBuffer(this.indexBuffer!, 'uint16');
    passEncoder.drawIndexed(CUBE_INDEX_COUNT, this.instanceCount);
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  private writeFrameUniforms(camera: Camera): void {
    const u = this.frameUniforms;
    u.set(camera.viewProjection, 0);

    u[16] = camera.eyeX;
    u[17] = camera.eyeY;
    u[18] = camera.eyeZ;
    u[19] = 0.0075; // fog density

    // A low sun grazing the field; steep light flattens brutalist masses into silhouettes.
    u[20] = 0.42;
    u[21] = 0.72;
    u[22] = 0.55;
    u[23] = 0;

    u[24] = 0.024;
    u[25] = 0.027;
    u[26] = 0.039;
    u[27] = 0;

    this.device!.queue.writeBuffer(this.uniformBuffer!, 0, u);
  }

  public getBackendName(): string {
    return 'WebGPU (Primary)';
  }

  public dispose(): void {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.instanceBuffer?.destroy();
    this.uniformBuffer?.destroy();
    this.depthTexture?.destroy();
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.instanceBuffer = null;
    this.uniformBuffer = null;
    this.depthTexture = null;
    this.pipeline = null;
    this.bindGroup = null;

    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.context = null;
    this.canvas = null;
  }
}
