// Fetches the Akhada fighter's arena assets from Poly Haven (all CC0) and prepares them for the web.
//
//   node scripts/assets/fetch-akhada.mjs
//
// Into public/akhada/:
//   sky/<id>.hdr            1k HDR, for lighting and reflections
//   sky/<id>.jpg            the tone-mapped image, 2048 wide, for the backdrop
//   tex/<id>_{diff,nor,rough}.webp   1k PBR maps
//   models/<id>.glb         glTF models in one binary each, textures as 512 px WebP
// Originals stay in assets-src/akhada/ (gitignored). Re-running skips what is already there.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';

// Sky-only versions: the full panoramas have land in them, which shows behind the river.
const SKIES = ['qwantani_dusk_2_puresky', 'kloofendal_overcast_puresky'];
const TEXTURES = [
  'large_sandstone_blocks', 'mossy_sandstone', 'red_sandstone_wall', 'patterned_clay_plaster',
  // Kurukshetra, Rameswaram, Jaisalmer (ADR-0017).
  'mud_cracked_dry_03', 'aerial_beach_01', 'white_sandstone_bricks', 'sandstone_blocks_08', 'rock_wall_08'
];
const MODELS = ['brass_diya_lantern', 'brass_pot_01', 'brass_pot_02', 'ceramic_pot'];

const SRC = path.resolve('assets-src/akhada');
const OUT = path.resolve('public/akhada');
for (const d of ['sky', 'tex', 'models']) {
  fs.mkdirSync(path.join(SRC, d), { recursive: true });
  fs.mkdirSync(path.join(OUT, d), { recursive: true });
}

async function download(url, file) {
  if (fs.existsSync(file)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const api = async (route) => (await fetch(`https://api.polyhaven.com/${route}`)).json();
const credits = [];

for (const id of SKIES) {
  const files = await api(`files/${id}`);
  const hdr = path.join(SRC, 'sky', `${id}_1k.hdr`);
  const jpg = path.join(SRC, 'sky', `${id}.jpg`);
  await download(files.hdri['1k'].hdr.url, hdr);
  await download(files.tonemapped.url, jpg);
  fs.copyFileSync(hdr, path.join(OUT, 'sky', `${id}.hdr`));
  await sharp(jpg, { limitInputPixels: false }).resize(2048, 1024, { fit: 'fill' }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, 'sky', `${id}.jpg`));
  credits.push({ id, kind: 'hdri', ...(await api(`info/${id}`)) });
}

for (const id of TEXTURES) {
  const files = await api(`files/${id}`);
  const maps = { diff: files.Diffuse ?? files.diffuse, nor: files.nor_gl, rough: files.Rough ?? files.rough };
  for (const [key, entry] of Object.entries(maps)) {
    if (!entry) throw new Error(`${id} has no ${key} map`);
    const src = path.join(SRC, 'tex', `${id}_${key}.jpg`);
    await download(entry['1k'].jpg.url, src);
    const out = path.join(OUT, 'tex', `${id}_${key}.webp`);
    // Normal maps at high quality rather than lossless: lossless is 1.7 MB a map for no visible gain.
    await sharp(src).webp({ quality: key === 'nor' ? 92 : 86 }).toFile(out);
  }
  credits.push({ id, kind: 'texture', ...(await api(`info/${id}`)) });
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const id of MODELS) {
  const files = await api(`files/${id}`);
  const gltf = files.gltf['1k'].gltf;
  const dir = path.join(SRC, 'models', id);
  const main = path.join(dir, `${id}.gltf`);
  await download(gltf.url, main);
  for (const [rel, inc] of Object.entries(gltf.include ?? {})) await download(inc.url, path.join(dir, rel));
  const doc = await io.read(main);
  // Props are small on screen: 512 px WebP textures.
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 85 }));
  await io.write(path.join(OUT, 'models', `${id}.glb`), doc);
  credits.push({ id, kind: 'model', ...(await api(`info/${id}`)) });
}

fs.writeFileSync(path.join(SRC, 'credits.json'), JSON.stringify(credits.map((c) => ({ id: c.id, kind: c.kind, name: c.name, authors: Object.keys(c.authors ?? {}) })), null, 2));
for (const c of credits) console.log(`${c.kind.padEnd(8)} ${c.id}: ${c.name} by ${Object.keys(c.authors ?? {}).join(', ')}`);
