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

/**
 * The fallback path renders the *same* scene as WebGPU, not a reduced one. Two conventions have to
 * be reconciled to make that true, and both are handled here rather than by forking the camera:
 *
 *   1. **Clip depth range.** `mat4Perspective` targets WebGPU's [0, w] depth. OpenGL expects
 *      [-w, w], so the vertex shader remaps it in one line. One projection matrix, two backends.
 *   2. **Facing.** The cube's outward faces wind counter-clockwise, which is front-facing under
 *      GL's default `CCW` rule — the same rule the WebGPU pipeline uses, so one mesh serves both.
 */
const VERTEX_SHADER = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aTranslation;
layout(location = 3) in vec3 aScale;
layout(location = 4) in vec3 aAlbedo;
layout(location = 5) in vec2 aMaterial; // [emissive, grid]

uniform mat4 uViewProj;

out vec3 vNormal;
out vec3 vAlbedo;
out vec2 vMaterial;
out vec3 vWorldPosition;

void main() {
  vec3 worldPosition = aPosition * aScale + aTranslation;

  vNormal = aNormal;
  vAlbedo = aAlbedo;
  vMaterial = aMaterial;
  vWorldPosition = worldPosition;

  vec4 clip = uViewProj * vec4(worldPosition, 1.0);
  // Remap WebGPU's [0, w] depth into OpenGL's [-w, w] so both backends can share one projection.
  clip.z = 2.0 * clip.z - clip.w;
  gl_Position = clip;
}
`;

const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vAlbedo;
in vec2 vMaterial;
in vec3 vWorldPosition;

uniform vec3 uCameraPosition;
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
uniform float uFogDensity;

out vec4 fragColor;

// Mirrors the WGSL gridFactor exactly; the two backends must agree pixel for pixel.
float gridFactor(vec2 worldXZ, float spacing) {
  vec2 coord = worldXZ / spacing;
  vec2 derivative = max(fwidth(coord), vec2(1e-5));
  vec2 line = abs(fract(coord - 0.5) - 0.5) / derivative;
  return 1.0 - min(min(line.x, line.y), 1.0);
}

void main() {
  vec3 n = normalize(vNormal);

  float hemisphere = 0.5 + 0.5 * n.y;
  vec3 ambient = mix(vec3(0.05, 0.055, 0.075), vec3(0.24, 0.31, 0.44), hemisphere);

  float lambert = max(dot(n, uSunDirection), 0.0);
  vec3 shaded = vAlbedo * (ambient + vec3(0.95, 0.93, 1.0) * lambert * 1.15);
  shaded += vAlbedo * vMaterial.x;

  float minor = gridFactor(vWorldPosition.xz, 4.0);
  float major = gridFactor(vWorldPosition.xz, 20.0);
  float dist = length(vWorldPosition - uCameraPosition);
  float gridMask = vMaterial.y * step(0.5, n.y) * exp(-dist * 0.018);
  shaded += vec3(0.0, 0.94, 1.0) * (minor * 0.05 + major * 0.22) * gridMask;

  float fog = clamp(1.0 - exp(-dist * uFogDensity), 0.0, 1.0);

  fragColor = vec4(mix(shaded, uFogColor, fog), 1.0);
}
`;

export class WebGL2Renderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;

  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private instanceBuffer: WebGLBuffer | null = null;

  private uViewProj: WebGLUniformLocation | null = null;
  private uCameraPosition: WebGLUniformLocation | null = null;
  private uSunDirection: WebGLUniformLocation | null = null;
  private uFogColor: WebGLUniformLocation | null = null;
  private uFogDensity: WebGLUniformLocation | null = null;

  private instanceCount = 0;

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
    gl.clearColor(0.024, 0.027, 0.039, 1.0); // #06070a
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    this.createSceneResources();
  }

  private createSceneResources(): void {
    const gl = this.gl!;
    this.program = this.linkProgram(VERTEX_SHADER, FRAGMENT_SHADER);

    this.uViewProj = gl.getUniformLocation(this.program, 'uViewProj');
    this.uCameraPosition = gl.getUniformLocation(this.program, 'uCameraPosition');
    this.uSunDirection = gl.getUniformLocation(this.program, 'uSunDirection');
    this.uFogColor = gl.getUniformLocation(this.program, 'uFogColor');
    this.uFogDensity = gl.getUniformLocation(this.program, 'uFogDensity');

    const scene = buildScene();
    this.instanceCount = scene.instanceCount;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, CUBE_VERTICES, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VERTEX_STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, VERTEX_STRIDE, 12);

    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, scene.instances, gl.STATIC_DRAW);
    // Divisor 1 advances these once per instance instead of once per vertex — the whole field is
    // one draw call.
    const instanceAttribs: [number, number, number][] = [
      [2, 3, 0], // translation
      [3, 3, 12], // scale
      [4, 3, 24], // albedo
      [5, 2, 36] // material: [emissive, grid]
    ];
    for (const [location, size, offset] of instanceAttribs) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, INSTANCE_STRIDE, offset);
      gl.vertexAttribDivisor(location, 1);
    }

    // The element array binding is captured by the VAO, so it must be bound while the VAO is.
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, CUBE_INDICES, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  private linkProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl!;
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to allocate a WebGL2 program.');

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`WebGL2 program link failed: ${log}`);
    }

    // The shaders are baked into the program once linked; keeping them alive leaks driver objects.
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return program;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to allocate a WebGL2 shader.');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`WebGL2 shader compile failed: ${log}`);
    }
    return shader;
  }

  public resize(width: number, height: number): void {
    if (!this.canvas || !this.gl) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  public render(_world: World, _alpha: number, camera: Camera): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao) return;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uViewProj, false, camera.viewProjection);
    gl.uniform3f(this.uCameraPosition, camera.eyeX, camera.eyeY, camera.eyeZ);
    gl.uniform3f(this.uSunDirection, 0.42, 0.72, 0.55);
    gl.uniform3f(this.uFogColor, 0.024, 0.027, 0.039);
    gl.uniform1f(this.uFogDensity, 0.0075);

    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(
      gl.TRIANGLES,
      CUBE_INDEX_COUNT,
      gl.UNSIGNED_SHORT,
      0,
      this.instanceCount
    );
    gl.bindVertexArray(null);
  }

  public getBackendName(): string {
    return 'WebGL2 (Fallback)';
  }

  public dispose(): void {
    const gl = this.gl;
    if (gl) {
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
      if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
      if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.vao = null;
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.instanceBuffer = null;
    this.program = null;
    this.gl = null;
    this.canvas = null;
  }
}
