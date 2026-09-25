---
name: creative-webgl-shaders
description: 3D interactive graphics, WebGL/WebGPU shaders, Three.js creative coding, instanced particles, post-processing pipelines, DRACO/KTX2 optimization, and 60 FPS shader warming.
---

# Creative WebGL & Shaders Skill

Use this skill when designing or implementing 3D scenes, custom GLSL/WGSL shaders, particle simulations, post-processing effects, and GPU-accelerated visual moments for creative and award-winning web platforms.

---

## 1. Architectural Philosophy: Purpose-Driven Visuals

Never add an abstract spinning cube. In award-winning creative development, 3D graphics and shaders must **solve a communication goal**:
1. **Material Reality**: Revealing textures, physical finishes, and light interactions (transmission, roughness, iridescence).
2. **Spatial Atmosphere**: Conveying depth, scale, and mood through volumetric fog and reactive particles.
3. **Interactive Delight**: Warping or responding dynamically to user velocity, scroll progress, and pointer vector.

---

## 2. Production Shader Patterns (GLSL & WGSL)

### A. Simplex Noise Vertex Displacement
Displace geometry in the vertex shader along vertex normals to create breathing, liquid, or topographical terrains:

```glsl
// GLSL Vertex Shader snippet
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
varying float vDisplacement;

// Include standard 3D simplex noise function (snoise)
#pragma glslify: snoise = require('glsl-noise/simplex/3d')

void main() {
  vUv = uv;
  vec3 pos = position;
  float noise = snoise(vec3(position.xy * 1.5, uTime * 0.4));
  vDisplacement = noise;
  pos += normal * (noise * uIntensity);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

### B. Liquid Mouse Distortion (Fragment Shader)
Displace UV sampling coordinates based on mouse velocity for fluid ripple reveals:

```glsl
uniform sampler2D uTexture;
uniform vec2 uMouse;
uniform float uMouseSpeed;
varying vec2 vUv;

void main() {
  vec2 dir = vUv - uMouse;
  float dist = length(dir);
  float strength = smoothstep(0.4, 0.0, dist) * uMouseSpeed * 0.15;
  vec2 distortedUv = vUv + normalize(dir) * strength;
  
  // Chromatic aberration split on high distortion
  float r = texture2D(uTexture, distortedUv + vec2(strength * 0.02, 0.0)).r;
  float g = texture2D(uTexture, distortedUv).g;
  float b = texture2D(uTexture, distortedUv - vec2(strength * 0.02, 0.0)).b;
  
  gl_FragColor = vec4(r, g, b, 1.0);
}
```

---

## 3. High-Performance Particle Systems

Avoid creating thousands of individual `THREE.Mesh` instances. Use `THREE.Points` or `THREE.InstancedMesh` with typed attribute arrays:

```typescript
// 10,000 Instanced Particle Motes (Zero GC in loop)
export function createParticleMotes(count: number = 5000): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 50;
    positions[i * 3 + 1] = Math.random() * 30 - 5;
    positions[i * 3 + 2] = -Math.random() * 200 + 20;
    scales[i] = Math.random() * 0.8 + 0.2;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x00f0ff) }
    },
    vertexShader: `...`,
    fragmentShader: `...`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  return new THREE.Points(geometry, material);
}
```

---

## 4. The 60 FPS Performance Discipline

### A. Shader Pre-Warming (Zero First-Frame Jank)
Browsers compile GLSL programs on the very first frame an object enters the camera view. Pre-warm all shaders during initialization before fading in:

```typescript
export function prewarmShaders(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
  // Compiles all materials in the scene graph into GPU programs ahead of time
  renderer.compile(scene, camera);
}
```

### B. Asset Compression Standard
- **Meshes**: Always compress `.gltf` / `.glb` using DRACO or Meshopt compression (`gltf-pipeline -i model.glb -o model_draco.glb -d`).
- **Textures**: Use KTX2 / Basis Universal GPU textures (BC7/ASTC) that decompress directly on the GPU, avoiding CPU decode memory spikes.

### C. Dynamic Resolution Scaling (DRS)
On mobile or low-power hardware, dynamically scale pixel ratio rather than dropping frames:
```typescript
function getAdaptivePixelRatio(): number {
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  return isMobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2.0);
}
```
