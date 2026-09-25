import * as THREE from 'three';
import type { CharacterDef } from '../../city/Crew';
import { People, type Person } from './People';

/**
 * The Safehouse (ADR-0014): the crew member you are choosing, on a turntable in a small studio
 * set. A warm key light, two coloured rim lights (cyan and magenta) and a glossy floor: the look
 * of a character-select screen, which is where a cast earns its first impression.
 */
export class Showroom {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  private person: Person | null = null;
  private showing = '';
  private readonly stand = new THREE.Group();
  private spin = 0;
  private sinceShown = 0;
  private waved = false;

  public constructor(private readonly people: People) {
    this.scene.background = new THREE.Color(0x07080d);
    this.scene.fog = new THREE.Fog(0x07080d, 8, 18);
    const key = new THREE.SpotLight(0xffe2c4, 22, 20, 0.45, 0.6, 1.4);
    key.position.set(-2.5, 4.2, 4);
    key.target.position.set(0, 1, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const rimA = new THREE.SpotLight(0x3fd8ff, 26, 20, 0.35, 0.5, 1.4);
    rimA.position.set(2.6, 3, -3);
    rimA.target.position.set(0, 1.2, 0);
    const rimB = new THREE.SpotLight(0xff3fb4, 20, 20, 0.3, 0.5, 1.4);
    rimB.position.set(-2.4, 3.2, -2.8);
    rimB.target.position.set(0, 1.2, 0);
    const fill = new THREE.HemisphereLight(0x8090b0, 0x101018, 0.18);
    this.scene.add(key, key.target, rimA, rimA.target, rimB, rimB.target, fill);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0b0c11, roughness: 0.3, metalness: 0.5, envMapIntensity: 0.12 })
    );
    floor.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.0, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fd8ff).multiplyScalar(2.5), toneMapped: false })
    );
    ring.position.y = 0.005;
    this.scene.add(floor, ring, this.stand);
    this.camera.position.set(0.9, 1.3, 5.4);
    this.camera.lookAt(-0.35, 1.0, 0);
  }

  /** Puts a crew member on the stand (loads their outfit if needed). */
  public async show(def: CharacterDef): Promise<void> {
    if (this.showing === def.id) return;
    this.showing = def.id;
    const person = await this.people.make(def, 0.55);
    if (this.showing !== def.id) return;
    if (this.person) this.stand.remove(this.person.root);
    this.person = person;
    this.stand.add(person.root);
    People.play(person, 'Idle_Gun', 0);
    this.sinceShown = 0;
    this.waved = false;
  }

  private readonly portraits = new Map<string, string>();
  private readonly portraitCamera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);

  /**
   * A head-and-shoulders portrait of a character in the studio's light, as an image URL, for the
   * storyboards. Rendered once per character and cached.
   */
  public async portrait(def: CharacterDef, renderer: THREE.WebGLRenderer, environment: THREE.Texture | null): Promise<string> {
    const cached = this.portraits.get(def.id);
    if (cached) return cached;
    const person = await this.people.make(def, 0.6);
    People.play(person, 'Idle', 0);
    person.mixer.update(0.6);
    const hold = new THREE.Group();
    hold.add(person.root);
    hold.rotation.y = 0.35;
    // Stand them where the turntable stands, and hide whoever is on it for the moment.
    const onStand = this.stand.visible;
    this.stand.visible = false;
    this.scene.add(hold);
    // Framed on their own head: the cast keep their real heights.
    hold.updateMatrixWorld(true);
    const face = person.head ? person.head.getWorldPosition(new THREE.Vector3()).y + 0.08 : 1.6;
    this.portraitCamera.position.set(0.25, face + 0.1, 1.45);
    this.portraitCamera.lookAt(0, face - 0.08, 0);
    const size = 256;
    const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, samples: 4 });
    const tone = renderer.toneMapping;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.environment = environment;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.portraitCamera);
    const pixels = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    renderer.setRenderTarget(null);
    renderer.toneMapping = tone;
    this.scene.remove(hold);
    this.stand.visible = onStand;
    target.dispose();
    // Render targets read bottom-up; flip into a canvas.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    const image = g.createImageData(size, size);
    for (let y = 0; y < size; y++) image.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g.putImageData(image, 0, 0);
    const url = canvas.toDataURL('image/png');
    this.portraits.set(def.id, url);
    return url;
  }

  public resize(aspect: number): void {
    this.camera.aspect = aspect;
    // Framing: the character stands left of centre, the crew panel takes the right.
    this.camera.setViewOffset(1000, 1000, aspect < 1 ? 0 : 140, 0, 1000, 1000);
    this.camera.updateProjectionMatrix();
  }

  public render(renderer: THREE.WebGLRenderer, dt: number, environment: THREE.Texture | null): void {
    this.spin += dt * 0.35;
    this.stand.rotation.y = Math.sin(this.spin) * 0.6 + 0.25;
    this.sinceShown += dt;
    const p = this.person;
    if (p) {
      // A wave hello, then back to a ready stance.
      if (!this.waved && this.sinceShown > 0.4) {
        People.play(p, 'Wave', 0.2, true);
        this.waved = true;
      }
      if (this.waved && this.sinceShown > 2.6 && p.current === 'Wave') People.play(p, 'Idle_Gun', 0.4);
      p.mixer.update(dt);
    }
    this.scene.environment = environment;
    this.scene.environmentIntensity = 0.35;
    const tone = renderer.toneMapping;
    const exposure = renderer.toneMappingExposure;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.render(this.scene, this.camera);
    renderer.toneMapping = tone;
    renderer.toneMappingExposure = exposure;
  }
}
