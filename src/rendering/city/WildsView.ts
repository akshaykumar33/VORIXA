import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WATER_LEVEL, type Prop, type Wilds } from '../../city/Wilds';

/**
 * The wild country drawn (ADR-0014, Far Cry layer): the hills as one terrain mesh coloured by what
 * grows there (meadow, forest floor, the worn trail, mud at the lake, bare rock on steep ground),
 * the lake with drifting ripples, and the Stylized Nature MegaKit's trees, rocks and undergrowth
 * as instanced meshes.
 *
 * Instances are grouped by piece and by 64 m tile, so the camera culls whole tiles it cannot see,
 * far tiles are dropped, and only near trees cast shadows. Leaves and grass sway in the wind
 * (a vertex offset that grows with height above the ground).
 */

const TILE = 64;
/** Beyond this, a tile of trees is not drawn (the fog has it anyway). */
const TREE_RANGE = 260;
const PLANT_RANGE = 90;
const SHADOW_RANGE = 70;

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Fine grain for the ground up close: speckle, tufts and pebbles, tiled every few metres. */
function groundDetail(): THREE.CanvasTexture {
  const t = canvasTexture(256, (g) => {
    g.fillStyle = '#b8b8b8';
    g.fillRect(0, 0, 256, 256);
    let s = 17;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5000; i++) {
      const v = 120 + Math.floor(rnd() * 130);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 3);
    }
  });
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A normal map of soft ripples for the lake, scrolled over time. */
function rippleNormals(): THREE.CanvasTexture {
  return canvasTexture(256, (g) => {
    const img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const a = Math.sin((x / 256) * Math.PI * 8 + Math.sin((y / 256) * Math.PI * 6) * 1.5);
        const b = Math.sin((y / 256) * Math.PI * 10 + Math.cos((x / 256) * Math.PI * 4) * 1.2);
        const i = (y * 256 + x) * 4;
        img.data[i] = 128 + a * 40;
        img.data[i + 1] = 128 + b * 40;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

/** Adds wind to a material: vertices sway with their height above the instance's base. */
function addWind(m: THREE.Material, time: { value: number }, strength: number): void {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uWindTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wBase = instanceMatrix[3].xyz;
          float wPhase = wBase.x * 0.21 + wBase.z * 0.17;
          float wSway = max(0.0, position.y) * ${strength.toFixed(3)};
          transformed.x += sin(uWindTime * 1.3 + wPhase) * wSway;
          transformed.z += cos(uWindTime * 1.1 + wPhase * 1.3) * wSway * 0.6;
        #endif`
      );
  };
  m.customProgramCacheKey = () => `wind-${strength}`;
}

interface Tile {
  meshes: THREE.InstancedMesh[];
  x: number;
  z: number;
  plant: boolean;
}

export class WildsView {
  public readonly group = new THREE.Group();
  private readonly tiles: Tile[] = [];
  private readonly wind = { value: 0 };
  private readonly water: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
  private readonly matrix = new THREE.Matrix4();

  public constructor(wilds: Wilds, nature: GLTF) {
    this.group.add(this.buildTerrain(wilds));

    const water = new THREE.MeshStandardMaterial({
      color: 0x24505c, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.86,
      normalMap: rippleNormals(), normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3
    });
    water.normalMap!.repeat.set(10, 10);
    this.water = new THREE.Mesh(new THREE.CircleGeometry(wilds.lake.radius * 1.45, 64).rotateX(-Math.PI / 2), water);
    this.water.position.set(wilds.lake.x, WATER_LEVEL, wilds.lake.z);
    this.water.receiveShadow = true;
    this.group.add(this.water);

    // The kit's pieces, by name: each a list of (geometry, material, local matrix).
    const parts = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }[]>();
    nature.scene.updateMatrixWorld(true);
    for (const root of nature.scene.children) {
      const list: { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }[] = [];
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material, i) => {
          const m = material as THREE.MeshStandardMaterial;
          if (m.alphaTest === 0 && m.transparent) {
            m.transparent = false;
            m.alphaTest = 0.5;
          }
          const leafy = /leaf|leaves|grass|flower|fern|bush|clover|plant/i.test(m.name);
          if (leafy) m.side = THREE.DoubleSide;
          if (!m.userData.windy && (leafy || /Grass|Flower|Fern|Bush|Plant|Clover/.test(root.name))) {
            m.userData.windy = true;
            addWind(m, this.wind, /Grass|Flower|Fern|Clover/.test(root.name) ? 0.08 : 0.018);
          }
          const geometry = materials.length > 1 && mesh.geometry.groups.length ? subset(mesh.geometry, i) : mesh.geometry;
          list.push({ geometry, material: m, local });
        });
      });
      parts.set(root.name, list);
    }

    this.place(wilds.trees, parts, false);
    this.place(wilds.rocks, parts, false);
    this.place(wilds.plants, parts, true);
  }

  /** Instanced meshes per piece and tile, for every prop that uses that piece. */
  private place(props: readonly Prop[], parts: Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }[]>, plant: boolean): void {
    const buckets = new Map<string, Prop[]>();
    for (const p of props) {
      const key = `${p.piece}|${Math.floor(p.x / TILE)},${Math.floor(p.z / TILE)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = []));
      b.push(p);
    }
    const tiles = new Map<string, Tile>();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [key, list] of buckets) {
      const [piece, tileKey] = key.split('|');
      const pieceParts = parts.get(piece);
      if (!pieceParts) continue;
      const [tx, tz] = tileKey.split(',').map(Number);
      let tile = tiles.get(tileKey + plant);
      if (!tile) {
        tile = { meshes: [], x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE, plant };
        tiles.set(tileKey + plant, tile);
        this.tiles.push(tile);
      }
      for (const part of pieceParts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        list.forEach((p, i) => {
          q.setFromAxisAngle(up, p.rot);
          m.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
          mesh.setMatrixAt(i, this.matrix.multiplyMatrices(m, part.local));
        });
        mesh.computeBoundingSphere();
        mesh.castShadow = !plant;
        mesh.receiveShadow = true;
        tile.meshes.push(mesh);
        this.group.add(mesh);
      }
    }
  }

  private buildTerrain(w: Wilds): THREE.Mesh {
    // A margin of hills beyond the walkable edge, so the world does not end at a line.
    const x0 = w.minX - 90;
    const x1 = w.maxX + 90;
    const z0 = w.z0 - 6;
    const z1 = w.z1 + 110;
    const step = 2;
    const nx = Math.round((x1 - x0) / step);
    const nz = Math.round((z1 - z0) / step);
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz).rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const uv = g.getAttribute('uv');
    const meadow = new THREE.Color(0x5f7d3a);
    const forest = new THREE.Color(0x3e5428);
    const dirt = new THREE.Color(0x7a6448);
    const mud = new THREE.Color(0x4a4032);
    const rock = new THREE.Color(0x77736b);
    const c = new THREE.Color();
    // Beyond the walkable edge, fade the hills up a little so the edge reads as a ridge.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const outside = Math.max(0, w.minX - x, x - w.maxX, z - w.z1);
      const y = w.ground(Math.min(Math.max(x, w.minX), w.maxX), Math.min(z, w.z1)) + Math.min(28, outside * 0.35);
      pos.setY(i, y);
      uv.setXY(i, x / 4, z / 4);
    }
    g.computeVertexNormals();
    const nor = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const slope = 1 - nor.getY(i);
      const patch = 0.5 + 0.5 * Math.sin(x * 0.07 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.06);
      c.copy(meadow).lerp(forest, patch * 0.7);
      let trail = Infinity;
      for (let k = 0; k < w.trail.length - 1; k++) {
        const a = w.trail[k];
        const b = w.trail[k + 1];
        if (Math.abs(a.z - z) > 14 && Math.abs(b.z - z) > 14) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        trail = Math.min(trail, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
      }
      if (trail < 3.2) c.lerp(dirt, 1 - Math.max(0, (trail - 1.6) / 1.6));
      if (y < WATER_LEVEL + 0.5) c.lerp(mud, Math.min(1, (WATER_LEVEL + 0.5 - y) * 1.2));
      if (slope > 0.22) c.lerp(rock, Math.min(1, (slope - 0.22) * 4));
      // Meet the city's grey ground at the edge.
      if (z < w.z0 + 3) c.lerp(new THREE.Color(0x6f6c64), (w.z0 + 3 - z) / 9);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundDetail(), roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Wind, ripples, and which tiles are near enough to draw (and to cast shadows). */
  public update(dt: number, camera: THREE.Vector3): void {
    this.wind.value += dt;
    const n = this.water.material.normalMap!;
    n.offset.x = (n.offset.x + dt * 0.012) % 1;
    n.offset.y = (n.offset.y + dt * 0.007) % 1;
    for (const t of this.tiles) {
      const d = Math.hypot(t.x - camera.x, t.z - camera.z) - TILE * 0.7;
      const visible = d < (t.plant ? PLANT_RANGE : TREE_RANGE);
      const shadow = !t.plant && d < SHADOW_RANGE;
      for (const m of t.meshes) {
        m.visible = visible;
        m.castShadow = shadow;
      }
    }
  }
}

/** One material group of a multi-material geometry, as its own geometry. */
function subset(g: THREE.BufferGeometry, group: number): THREE.BufferGeometry {
  const gr = g.groups[group];
  const out = g.clone();
  if (out.index) {
    const idx = out.index.array.slice(gr.start, gr.start + gr.count);
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  out.clearGroups();
  return out;
}
