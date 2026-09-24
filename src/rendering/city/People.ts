import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterDef } from '../../city/Crew';

/**
 * Dresses the people of VORIXA City (ADR-0014): loads a person once, then makes any number of
 * animated copies, each in its own palette.
 *
 * The cast (`mh-*`) are realistic MakeHuman people with no clips of their own: they share one
 * skeleton, and `mh-anims.glb` carries every clip for it (the Universal Animation Library,
 * retargeted). Those clips are renamed here into the game's vocabulary (`Idle_Gun`, `Run_Shoot`…)
 * and the hips' travel is scaled to each body's leg length, so short and tall people both keep
 * their feet on the ground.
 *
 * Every material gets a finish (skin with a soft sheen, matte cloth, glossy leather and eyes, hair
 * cut out with hashed alpha so it sorts itself) and a subtle cool rim light, which separates a
 * character from the street behind them the way a film key-and-rim setup does.
 */

/** Height the older low-poly outfits are scaled to; the cast keep their own. */
export const PERSON_HEIGHT = 1.8;

/** Game clip → cast clip. `Run_Shoot` and `Run_Back` are composed below. */
const CAST_CLIPS: Record<string, string> = {
  Idle: 'Idle_Loop',
  Walk: 'Walk_Loop',
  Run: 'Jog_Fwd_Loop',
  Sprint: 'Sprint_Loop',
  Run_Left: 'Jog_Fwd_Loop',
  Run_Right: 'Jog_Fwd_Loop',
  Idle_Gun: 'Pistol_Idle_Loop',
  Idle_Gun_Pointing: 'Pistol_Aim_Neutral',
  Idle_Gun_Shoot: 'Pistol_Shoot',
  Gun_Shoot: 'Pistol_Shoot',
  Interact: 'Pistol_Reload',
  Roll: 'Roll',
  Wave: 'Yes',
  Death: 'Death01',
  HitRecieve: 'Hit_Chest',
  Drive: 'Driving_Loop',
  Sit: 'Sitting_Idle_Loop',
  Phone: 'Idle_TalkingPhone_Loop',
  Talk: 'Idle_Talking_Loop',
  FoldArms: 'Idle_FoldArms_Loop',
  Takedown: 'Punch_Cross'
};

const LEGS = /^(pelvis|thigh|calf|foot|ball)/;
const boneOf = (t: THREE.KeyframeTrack) => t.name.split('.')[0];

type TrackType = new (name: string, times: ArrayLike<number>, values: ArrayLike<number>) => THREE.KeyframeTrack;

/** A clip played backwards (running backwards, from a forward run). */
export function reversedClip(clip: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const tracks = clip.tracks.map((t) => {
    const size = t.getValueSize();
    const n = t.times.length;
    const times = new Float32Array(n);
    const values = new Float32Array(t.values.length);
    for (let i = 0; i < n; i++) {
      times[i] = clip.duration - t.times[n - 1 - i];
      values.set(t.values.subarray((n - 1 - i) * size, (n - i) * size), i * size);
    }
    return new (t.constructor as TrackType)(t.name, times, values);
  });
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

/** Legs from one clip; everything above the hips held in the first pose of another. */
export function upperBodyClip(legs: THREE.AnimationClip, upper: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const tracks = legs.tracks.filter((t) => LEGS.test(boneOf(t)));
  for (const t of upper.tracks) {
    if (LEGS.test(boneOf(t))) continue;
    const size = t.getValueSize();
    const values = new Float32Array(size * 2);
    values.set(t.values.subarray(0, size), 0);
    values.set(t.values.subarray(0, size), size);
    tracks.push(new (t.constructor as TrackType)(t.name, [0, legs.duration], values));
  }
  return new THREE.AnimationClip(name, legs.duration, tracks);
}

/** The cast's clips, plus the same under the game's names, with the hips' travel scaled by `hips`. */
export function castClips(source: THREE.AnimationClip[], hips: number): THREE.AnimationClip[] {
  const scaled = new Map<string, THREE.AnimationClip>();
  for (const c of source) {
    const tracks = c.tracks.map((t) => {
      if (t.name !== 'pelvis.position' || Math.abs(hips - 1) < 0.005) return t;
      const copy = t.clone();
      for (let i = 0; i < copy.values.length; i++) copy.values[i] *= hips;
      return copy;
    });
    scaled.set(c.name, new THREE.AnimationClip(c.name, c.duration, tracks));
  }
  const out = [...scaled.values()];
  for (const [game, cast] of Object.entries(CAST_CLIPS)) {
    const c = scaled.get(cast);
    if (c) out.push(new THREE.AnimationClip(game, c.duration, c.tracks));
  }
  const jog = scaled.get('Jog_Fwd_Loop');
  const aim = scaled.get('Pistol_Aim_Neutral');
  if (jog) out.push(reversedClip(jog, 'Run_Back'));
  if (jog && aim) out.push(upperBodyClip(jog, aim, 'Run_Shoot'));
  return out;
}

/** Where a gun sits in the right hand, in the hand bone's own space. */
export interface Grip {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface Person {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  /** The right hand, for guns. */
  hand: THREE.Object3D | null;
  /** How a gun sits in that hand, when known (the cast); otherwise the caller's own fit. */
  grip: Grip | null;
  /** The head bone: hidden in first person, and where the eyes are. */
  head: THREE.Object3D | null;
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

type Finish = 'skin' | 'cloth' | 'leather' | 'metal' | 'glow' | 'hair' | 'eyes';

function finishFor(name: string): Finish {
  const n = name.toLowerCase();
  if (n.includes('skin')) return 'skin';
  if (n.includes('visor')) return 'glow';
  if (n.includes('gold') || n.includes('earring')) return 'metal';
  if (n.includes('hair') || n.includes('eyebrow') || n.includes('eyelash') || n.includes('moustache')) return 'hair';
  if (n === 'eyes') return 'eyes';
  if (n === 'black' || n.includes('swat_black') || n.includes('tie')) return 'leather';
  if (/shoes|boots|booties|flats/.test(n)) return 'leather';
  return 'cloth';
}

const isCast = (model: string) => model.startsWith('mh-');

export class People {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly outfits = new Map<string, Promise<GLTF>>();
  private readonly rimColor = { value: new THREE.Color(0x9fc4ff) };

  private anims: Promise<GLTF> | null = null;

  public load(model: string): Promise<GLTF> {
    let p = this.outfits.get(model);
    if (!p) {
      p = this.loader.loadAsync(`/city/people/${model}.glb`);
      if (isCast(model)) {
        this.anims ??= this.loader.loadAsync('/city/people/mh-anims.glb');
        p = Promise.all([p, this.anims]).then(([gltf, a]) => {
          // Hips travel in proportion to the body: this person's hip height over the clips'.
          const mine = gltf.scene.getObjectByName('pelvis');
          const theirs = a.scene.getObjectByName('pelvis');
          const hips = mine && theirs ? mine.position.length() / Math.max(0.01, theirs.position.length()) : 1;
          gltf.animations = castClips(a.animations, hips);
          return gltf;
        });
      }
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
    const cast = isCast(def.model);
    if (!cast) {
      const box = new THREE.Box3().setFromObject(model);
      const scale = PERSON_HEIGHT / Math.max(0.01, box.max.y - box.min.y);
      model.scale.setScalar(scale);
      model.position.y = -box.min.y * scale;
    }
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
    // Three.js strips the dot from the older rig's "Wrist.R" when it loads.
    const hand = model.getObjectByName('hand_r') ?? model.getObjectByName('WristR') ?? model.getObjectByName('Wrist_R') ?? null;
    const head = model.getObjectByName('head') ?? model.getObjectByName('Head') ?? null;
    const grip = cast && hand ? gripOf(model, hand, actions.get('Idle_Gun_Pointing')) : null;
    return { root, model, mixer, actions, hand, grip, head, meshes, current: '', def };
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
      case 'eyes':
        m.roughness = 0.12;
        m.metalness = 0;
        break;
      default:
        m.roughness = 0.82;
        m.metalness = 0;
    }
    m.envMapIntensity = 0.9;
    // The cast arrive with every material alpha-blended. Only hair needs its alpha, and hashed
    // alpha lets it sort itself; everything else is opaque.
    if (m.transparent) {
      m.transparent = false;
      m.depthWrite = true;
      m.alphaHash = finishFor(source.name) === 'hair';
    }
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

/**
 * Fits a gun to the hand by posing the person in the pistol aim once: in that pose the barrel
 * points where the body faces (+z) with its top up, and the grip sits in the palm, between the
 * wrist and the knuckles and a little below them. Kept in the hand bone's space, that fit holds
 * in every other clip.
 */
export function gripOf(model: THREE.Object3D, hand: THREE.Object3D, aim: THREE.AnimationAction | undefined): Grip | null {
  if (!aim) return null;
  aim.play();
  aim.getMixer().update(0);
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const inModel = (o: THREE.Object3D) => new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
  const at = (name: string) => {
    const o = model.getObjectByName(name);
    return o ? new THREE.Vector3().setFromMatrixPosition(inModel(o)) : null;
  };
  const index = at('index_01_r');
  const pinky = at('pinky_01_r');
  const handM = inModel(hand);
  aim.stop();
  aim.getMixer().update(0);
  if (!index || !pinky) return null;
  const wrist = new THREE.Vector3().setFromMatrixPosition(handM);
  const palm = wrist.add(index).add(pinky).divideScalar(3).add(new THREE.Vector3(0, -0.025, 0));
  // The gun's own frame: barrel down -z, top up +y. Facing +z is half a turn about y.
  const gun = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const handQ = new THREE.Quaternion().setFromRotationMatrix(handM);
  return {
    position: palm.applyMatrix4(handM.clone().invert()),
    quaternion: handQ.invert().multiply(gun)
  };
}
