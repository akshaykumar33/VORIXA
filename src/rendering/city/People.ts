import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterDef } from '../../city/Crew';

/**
 * Dresses the people of VORIXA City (ADR-0014): loads an Ultimate Modular outfit once, then makes
 * any number of animated people from it, each in its own palette.
 *
 * The flat-coloured outfits get a finish per material (skin with a soft sheen, matte cloth, glossy
 * leather, metal that reflects the sky, a glowing visor) and a subtle cool rim light, which
 * separates a character from the street behind them the way a film key-and-rim setup does.
 */

export const PERSON_HEIGHT = 1.8;

export interface Person {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  /** The right hand, for guns. */
  hand: THREE.Object3D | null;
  meshes: THREE.Mesh[];
  current: string;
  def: CharacterDef;
}

const RIM = /* glsl */ `
  {
    float rim = 1.0 - saturate( dot( normalize( geometryNormal ), normalize( geometryViewDir ) ) );
    outgoingLight += uRimColor * pow( rim, 3.0 ) * uRimStrength;
  }
  #include <opaque_fragment>
`;

type Finish = 'skin' | 'cloth' | 'leather' | 'metal' | 'glow' | 'hair';

function finishFor(name: string): Finish {
  const n = name.toLowerCase();
  if (n.includes('skin')) return 'skin';
  if (n.includes('visor')) return 'glow';
  if (n.includes('gold') || n.includes('earring')) return 'metal';
  if (n.includes('hair') || n.includes('eyebrow') || n.includes('moustache')) return 'hair';
  if (n === 'black' || n.includes('swat_black') || n.includes('tie')) return 'leather';
  return 'cloth';
}

export class People {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly outfits = new Map<string, Promise<GLTF>>();
  private readonly rimColor = { value: new THREE.Color(0x9fc4ff) };

  public load(model: string): Promise<GLTF> {
    let p = this.outfits.get(model);
    if (!p) {
      p = this.loader.loadAsync(`/city/people/${model}.glb`);
      this.outfits.set(model, p);
    }
    return p;
  }

  /** Makes one person, loading the outfit first if needed. */
  public async make(def: CharacterDef, rimStrength = 0.35): Promise<Person> {
    return this.makeFrom(await this.load(def.model), def, rimStrength);
  }

  /** Makes one person from an outfit already in hand (synchronous, for per-frame spawning). */
  public makeFrom(gltf: GLTF, def: CharacterDef, rimStrength = 0.35): Person {
    const model = cloneSkinned(gltf.scene);
    const box = new THREE.Box3().setFromObject(model);
    const scale = PERSON_HEIGHT / Math.max(0.01, box.max.y - box.min.y);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    const meshes: THREE.Mesh[] = [];
    const dressed = new Map<THREE.Material, THREE.Material>();
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      meshes.push(mesh);
      const dress = (m: THREE.Material) => {
        let out = dressed.get(m);
        if (!out) {
          out = this.dress(m as THREE.MeshStandardMaterial, def, rimStrength);
          dressed.set(m, out);
        }
        return out;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(dress) : dress(mesh.material);
    });
    const root = new THREE.Group();
    root.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    // Three.js strips the dot from the rig's "Wrist.R" when it loads.
    const hand = model.getObjectByName('WristR') ?? model.getObjectByName('Wrist_R') ?? model.getObjectByName('Wrist.R') ?? null;
    return { root, model, mixer, actions, hand, meshes, current: '', def };
  }

  private dress(source: THREE.MeshStandardMaterial, def: CharacterDef, rimStrength: number): THREE.Material {
    const m = source.clone();
    const colour = def.palette[source.name];
    if (colour !== undefined) m.color.setHex(colour);
    switch (finishFor(source.name)) {
      case 'skin':
        m.roughness = 0.52;
        m.metalness = 0;
        break;
      case 'leather':
        m.roughness = 0.38;
        m.metalness = 0.05;
        break;
      case 'metal':
        m.roughness = 0.25;
        m.metalness = 0.9;
        break;
      case 'glow':
        m.emissive.copy(m.color);
        m.emissiveIntensity = 2.2;
        m.roughness = 0.2;
        break;
      case 'hair':
        m.roughness = 0.62;
        m.metalness = 0;
        break;
      default:
        m.roughness = 0.82;
        m.metalness = 0;
    }
    m.envMapIntensity = 0.9;
    const rim = { value: rimStrength };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = this.rimColor;
      shader.uniforms.uRimStrength = rim;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
        .replace('#include <opaque_fragment>', RIM);
    };
    m.customProgramCacheKey = () => 'person-rim';
    return m;
  }

  /** Crossfades a person to a clip; replaying the current looping clip is a no-op. */
  public static play(p: Person, name: string, fade = 0.2, once = false, speed = 1): void {
    const action = p.actions.get(name);
    if (!action) return;
    action.timeScale = speed;
    if (p.current === name) return;
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    const previous = p.actions.get(p.current);
    if (previous) previous.crossFadeTo(action, fade, false);
    action.play();
    p.current = name;
  }
}
