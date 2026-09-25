// Builds VORIXA City's runtime assets (ADR-0014) from the CC0 Quaternius packs in assets-src/.
//
//   public/city/district/    every Downtown City MegaKit piece (.gltf, .bin, .webp), one named root node per piece
//   public/city/people/mh-*   the realistic cast (MakeHuman, from scripts/assets/blender/make-cast.py)
//   public/city/wilds/        the wild country: nature kit pieces (.gltf, split per mesh) and four animals
//
// Textures become WebP at game resolution, meshes are meshopt-compressed, and duplicate
// textures and materials across pieces are merged, so the game downloads a fraction of the packs.
// Fetch the packs first: see docs/plans/VORIXA_CITY_PLAN.md.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, textureCompress, meshopt, unpartition, partition, resample, weld } from '@gltf-transform/functions';

const SRC = 'assets-src/quaternius';
const OUT = 'public/city';
fs.mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const size = (f) => `${(fs.statSync(f).size / 1e6).toFixed(1)} MB`;

/** @param split One buffer per mesh (for a .gltf whose geometry would pass the 2 MB file cap as one). */
async function finish(doc, file, resize, split = false) {
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [resize, resize], quality: 82 }),
    split ? partition({ meshes: true }) : unpartition(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' })
  );
  await io.write(file, doc);
  console.log('wrote', file, size(file));
}

// ─── The city ─────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes('--force') || !fs.existsSync(path.join(OUT, 'district', 'city.gltf'))) {
  const dir = path.join(SRC, 'city/Exports/glTF (Godot)');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.gltf'));
  const doc = new Document();
  const root = doc.getRoot();
  const scene = doc.createScene('city');
  for (const f of files) {
    const piece = await io.read(path.join(dir, f));
    const map = mergeDocuments(doc, piece);
    const name = path.basename(f, '.gltf');
    const holder = doc.createNode(name);
    for (const s of piece.getRoot().listScenes()) {
      for (const child of s.listChildren()) holder.addChild(map.get(child));
    }
    scene.addChild(holder);
  }
  // Every merged document brought its own scene along; only ours remains.
  for (const s of root.listScenes()) if (s !== scene) s.dispose();
  root.setDefaultScene(scene);
  console.log('city pieces:', files.length);
  // Written as .gltf with external files: the repo caps any one file at 2 MB, and separate
  // textures also download in parallel.
  fs.mkdirSync(path.join(OUT, 'district'), { recursive: true });
  await finish(doc, path.join(OUT, 'district', 'city.gltf'), 1024);
}

// ─── The realistic cast (MakeHuman + Universal Animation Library) ─────────────────────────────
// Made in Blender by scripts/assets/blender/make-cast.py into assets-src/cast: one GLB per person
// (no clips) and anims.glb, the shared skeleton with every retargeted clip.
{
  const dir = 'assets-src/cast';
  const people = path.join(OUT, 'people');
  if (fs.existsSync(dir)) {
    fs.mkdirSync(people, { recursive: true });
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
      const id = path.basename(file, '.glb');
      const out = path.join(people, id === 'anims' ? 'mh-anims.glb' : `mh-${id}.glb`);
      if (fs.existsSync(out) && !process.argv.includes('--force')) continue;
      const doc = await io.read(path.join(dir, file));
      if (id === 'anims') await doc.transform(resample());
      await finish(doc, out, 1024);
      // The repo takes no file over 2 MB: halve the textures until it fits.
      for (let px = 512; fs.statSync(out).size > 1.9e6 && px >= 256; px /= 2) {
        await finish(await io.read(path.join(dir, file)), out, px);
      }
    }
  }
}

// ─── The wilds (Stylized Nature MegaKit, Ultimate Animated Animal Pack) ─────────────────────────
// The trees, rocks and undergrowth the wild country uses, one named root node per piece (as the
// district is), and the four wild animals with their clips.
{
  const dir = path.join(SRC, 'nature/glTF');
  const out = path.join(OUT, 'wilds', 'nature.gltf');
  const used = /^(Pine|CommonTree|TwistedTree|DeadTree)_\d|^Rock_Medium|^Grass_|^Flower_[34]_Group|^Fern_1|^Bush_Common|^Plant_(1|7)$|^Clover_1|^Mushroom_Common|^Pebble_Round_2/;
  if (fs.existsSync(dir) && (process.argv.includes('--force') || !fs.existsSync(out))) {
    const doc = new Document();
    const scene = doc.createScene('nature');
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.gltf') && used.test(path.basename(f, '.gltf')))) {
      const piece = await io.read(path.join(dir, f));
      const map = mergeDocuments(doc, piece);
      const holder = doc.createNode(path.basename(f, '.gltf'));
      for (const s of piece.getRoot().listScenes()) for (const child of s.listChildren()) holder.addChild(map.get(child));
      scene.addChild(holder);
    }
    for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
    doc.getRoot().setDefaultScene(scene);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await finish(doc, out, 1024, true);
  }
  const animals = path.join(SRC, 'wildlife');
  if (fs.existsSync(animals)) {
    fs.mkdirSync(path.join(OUT, 'wilds'), { recursive: true });
    for (const kind of ['Wolf', 'Deer', 'Stag', 'Fox']) {
      const target = path.join(OUT, 'wilds', `${kind.toLowerCase()}.glb`);
      if (fs.existsSync(target) && !process.argv.includes('--force')) continue;
      const doc = await io.read(path.join(animals, `${kind}.gltf`));
      await doc.transform(resample());
      await finish(doc, target, 512);
    }
  }
}

// ─── Guns (Ultimate Gun Pack) ─────────────────────────────────────────────────────────────────
// The pack ships FBX, OBJ and .blend; the OBJs are converted with obj2gltf (Cesium, Apache-2.0):
//   npx obj2gltf -i assets-src/quaternius/guns/OBJ/<Gun>.obj -o assets-src/quaternius/guns/glb/<Gun>.glb
// and merged here into one file, one named root node per gun.
{
  const dir = path.join(SRC, 'guns/glb');
  const out = path.join(OUT, 'guns.glb');
  if (fs.existsSync(dir) && (process.argv.includes('--force') || !fs.existsSync(out))) {
    const doc = new Document();
    const scene = doc.createScene('guns');
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
      const piece = await io.read(path.join(dir, f));
      const map = mergeDocuments(doc, piece);
      const holder = doc.createNode(path.basename(f, '.glb'));
      for (const s of piece.getRoot().listScenes()) for (const child of s.listChildren()) holder.addChild(map.get(child));
      scene.addChild(holder);
    }
    for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
    doc.getRoot().setDefaultScene(scene);
    await finish(doc, out, 512);
  }
}

// ─── Cars (Realistic Car Pack) ────────────────────────────────────────────────────────────────
// OBJ converted like the guns (obj2gltf), into assets-src/quaternius/cars/glb. Each car keeps its
// body and its wheel groups (BackWheels, FrontLeftWheel, FrontRightWheel) as separate nodes, so
// the wheels can spin and the front ones steer.
{
  const dir = path.join(SRC, 'cars/glb');
  const out = path.join(OUT, 'cars.glb');
  if (fs.existsSync(dir) && (process.argv.includes('--force') || !fs.existsSync(out))) {
    const doc = new Document();
    const scene = doc.createScene('cars');
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
      const piece = await io.read(path.join(dir, f));
      const map = mergeDocuments(doc, piece);
      const holder = doc.createNode(path.basename(f, '.glb'));
      for (const s of piece.getRoot().listScenes()) for (const child of s.listChildren()) holder.addChild(map.get(child));
      scene.addChild(holder);
    }
    for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
    doc.getRoot().setDefaultScene(scene);
    // Keep the wheel nodes apart: no flattening or joining of the car's parts.
    await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }), unpartition(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await io.write(out, doc);
    console.log('wrote', out, size(out));
  }
}
