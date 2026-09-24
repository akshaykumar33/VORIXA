// Builds VORIXA City's runtime assets (ADR-0014) from the CC0 Quaternius packs in assets-src/.
//
//   public/city/district/    every Downtown City MegaKit piece (.gltf, .bin, .webp), one named root node per piece
//   public/city/people/*.glb clothed people (Ultimate Modular Characters and Women), with their clips
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
import { mergeDocuments, dedup, prune, textureCompress, meshopt, unpartition, resample, weld } from '@gltf-transform/functions';

const SRC = 'assets-src/quaternius';
const OUT = 'public/city';
fs.mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const size = (f) => `${(fs.statSync(f).size / 1e6).toFixed(1)} MB`;

async function finish(doc, file, resize) {
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [resize, resize], quality: 82 }),
    unpartition(),
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

// ─── Clothed people (Ultimate Modular Characters / Women) ────────────────────────────────────
// Modern outfits with their own rig and 24 clips (idle, walk, run, strafe, gun idle and shoot,
// hits, death, punches), which the Universal Animation Library cannot drive (different skeleton).
{
  const people = path.join(OUT, 'people');
  fs.mkdirSync(people, { recursive: true });
  for (const [folder, prefix] of [['modular-men', 'm'], ['modular-women', 'f']]) {
    const dir = path.join(SRC, folder);
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.gltf'))) {
      const out = path.join(people, `${prefix}-${path.basename(file, '.gltf').toLowerCase()}.glb`);
      if (fs.existsSync(out) && !process.argv.includes('--force')) continue;
      const doc = await io.read(path.join(dir, file));
      await doc.transform(resample());
      await finish(doc, out, 512);
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
