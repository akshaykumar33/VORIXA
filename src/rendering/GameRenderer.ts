import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Box, CourseData } from '../game/Course';
import type { RigOutput } from '../game/CameraRig';

/**
 * Presentation layer, built on Three.js.
 *
 * This replaces the hand-rolled WebGPU/WebGL2 renderers. That code was correct in the end, but
 * everything it spent effort on — colour space, winding order, depth conventions, shadow setup —
 * is solved infrastructure that contributes nothing to whether the game is fun. The library
 * handles it so the effort can go into the course and the movement instead.
 *
 * Visual language is functional, not decorative. Surfaces are coloured by what they want you to
 * do, so the course is readable at running speed without a tutorial:
 *   slate = stand on it · amber = slide under it · cyan = run along it · green = finish
 */

const COLOR_VOID = 0x06070a;
const COLOR_ACCENT = 0x00f0ff;
const COLOR_WARN = 0xffb703;
const COLOR_GOAL = 0x00f59b;

/** Shadows follow the player rather than covering 200 m of course at unusable resolution. */
const SHADOW_EXTENT = 34;

export class GameRenderer {
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;

  private sun!: THREE.DirectionalLight;
  private ghost!: THREE.Group;
  private gates: THREE.Mesh[] = [];
  private gateMaterials: THREE.MeshBasicMaterial[] = [];

  private disposables: { dispose(): void }[] = [];

  public initialize(canvas: HTMLCanvasElement, course: CourseData): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLOR_VOID);
    // Fog distance is tuned so the far end of the course dissolves rather than popping in, while
    // the next two obstacles are always fully readable.
    this.scene.fog = new THREE.Fog(COLOR_VOID, 45, 230);

    this.camera = new THREE.PerspectiveCamera(88, 1, 0.1, 400);
    // YXZ is the first-person order: yaw, then pitch, then roll about the view axis.
    this.camera.rotation.order = 'YXZ';

    this.buildLighting();
    this.buildCourse(course);
    this.buildGates(course);
    this.buildGhost();

    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom is what makes the neon read as light rather than as paint. Kept restrained: a high
    // threshold means only the emissive accents bloom, not the whole scene.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.5, 0.72);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private buildLighting(): void {
    const hemi = new THREE.HemisphereLight(0x6f8ec0, 0x0a0c10, 1.1);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xdfe9ff, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 1;
    cam.far = 140;
    this.sun.shadow.bias = -0.0009;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  private materialFor(kind: Box['kind']): THREE.Material {
    switch (kind) {
      case 'ceiling':
        return new THREE.MeshStandardMaterial({
          color: 0x2a2114,
          emissive: COLOR_WARN,
          emissiveIntensity: 0.22,
          roughness: 0.7
        });
      case 'wall':
        return new THREE.MeshStandardMaterial({
          color: 0x0d1f28,
          emissive: COLOR_ACCENT,
          emissiveIntensity: 0.3,
          roughness: 0.55
        });
      case 'goal':
        return new THREE.MeshBasicMaterial({
          color: COLOR_GOAL,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false
        });
      default:
        return new THREE.MeshStandardMaterial({
          color: 0x1b2230,
          roughness: 0.88,
          metalness: 0.04
        });
    }
  }

  private edgeColorFor(kind: Box['kind']): number {
    if (kind === 'ceiling') return COLOR_WARN;
    if (kind === 'goal') return COLOR_GOAL;
    return COLOR_ACCENT;
  }

  private buildCourse(course: CourseData): void {
    for (const box of course.boxes) {
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      const d = box.maxZ - box.minZ;

      const geometry = new THREE.BoxGeometry(w, h, d);
      const material = this.materialFor(box.kind);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(box.minX + w / 2, box.minY + h / 2, box.minZ + d / 2);

      if (box.kind !== 'goal') {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      this.scene.add(mesh);
      this.disposables.push(geometry, material);

      // Outlined edges are not decoration: at speed, an unlit platform lip is invisible, and
      // players fall off things they never saw the boundary of.
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: this.edgeColorFor(box.kind),
        transparent: true,
        opacity: box.kind === 'platform' ? 0.32 : 0.75
      });
      const line = new THREE.LineSegments(edges, lineMaterial);
      line.position.copy(mesh.position);
      this.scene.add(line);
      this.disposables.push(edges, lineMaterial);
    }
  }

  private buildGates(course: CourseData): void {
    for (const cp of course.checkpoints) {
      if (cp.index === 0) continue;
      const geometry = new THREE.PlaneGeometry(cp.halfWidth * 2, 5);
      const material = new THREE.MeshBasicMaterial({
        color: COLOR_ACCENT,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const gate = new THREE.Mesh(geometry, material);
      gate.position.set(cp.spawnX, cp.spawnY + 2.5, cp.triggerZ);
      this.scene.add(gate);
      this.gates.push(gate);
      this.gateMaterials.push(material);
      this.disposables.push(geometry, material);
    }
  }

  private buildGhost(): void {
    this.ghost = new THREE.Group();
    const geometry = new THREE.CapsuleGeometry(0.34, 1.05, 4, 12);
    const material = new THREE.MeshBasicMaterial({
      color: COLOR_ACCENT,
      transparent: true,
      opacity: 0.3,
      // No depth write, so the ghost never hides the geometry you are trying to land on.
      depthWrite: false
    });
    const body = new THREE.Mesh(geometry, material);
    body.position.y = 0.9;
    this.ghost.add(body);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.disposables.push(geometry, material);
  }

  public setGhostPose(x: number, y: number, z: number, yaw: number): void {
    this.ghost.visible = true;
    this.ghost.position.set(x, y, z);
    this.ghost.rotation.y = yaw;
  }

  public hideGhost(): void {
    this.ghost.visible = false;
  }

  /** Lights up gates the player has already banked. */
  public setCheckpointProgress(passedIndex: number): void {
    for (let i = 0; i < this.gateMaterials.length; i++) {
      const passed = i + 1 <= passedIndex;
      this.gateMaterials[i].color.setHex(passed ? COLOR_GOAL : COLOR_ACCENT);
      this.gateMaterials[i].opacity = passed ? 0.08 : 0.14;
    }
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = height > 0 ? width / height : 1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
  }

  public render(rig: RigOutput): void {
    this.camera.position.set(rig.x, rig.y, rig.z);
    this.camera.rotation.set(rig.pitch, rig.yaw, rig.roll);
    if (this.camera.fov !== rig.fov) {
      this.camera.fov = rig.fov;
      this.camera.updateProjectionMatrix();
    }

    // Keep the shadow frustum centred on the action.
    this.sun.position.set(rig.x + 26, rig.y + 46, rig.z + 20);
    this.sun.target.position.set(rig.x, rig.y, rig.z);
    this.sun.target.updateMatrixWorld();

    this.composer.render();
  }

  public dispose(): void {
    for (const item of this.disposables) item.dispose();
    this.disposables = [];
    this.composer?.dispose();
    this.renderer?.dispose();
  }
}
