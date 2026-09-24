// Fetches the city's sky from Poly Haven (CC0) and prepares it for the web.
//
//   node scripts/assets/fetch-skies.mjs
//
// For every world it downloads:
//   - the 1k HDR, used for image-based lighting and reflections  -> public/sky/<world>.hdr
//   - the tone-mapped JPEG, resized to 2048 wide for the backdrop  -> public/sky/<world>.jpg
// Originals are kept in assets-src/sky/ (gitignored). Re-running skips files already present.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// The city's sky (the noon sky it is lit by).
const SKIES = {
  beach: 'qwantani_noon_puresky'
};

const SRC = path.resolve('assets-src/sky');
const OUT = path.resolve('public/sky');
fs.mkdirSync(SRC, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

async function download(url, file) {
  if (fs.existsSync(file)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const credits = [];
for (const [world, id] of Object.entries(SKIES)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const info = await (await fetch(`https://api.polyhaven.com/info/${id}`)).json();
  const hdr = path.join(SRC, `${id}_1k.hdr`);
  const jpg = path.join(SRC, `${id}_tonemapped.jpg`);
  await download(files.hdri['1k'].hdr.url, hdr);
  await download(files.tonemapped.url, jpg);
  fs.copyFileSync(hdr, path.join(OUT, `${world}.hdr`));
  await sharp(jpg, { limitInputPixels: false })
    .resize(2048, 1024, { fit: 'fill' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(OUT, `${world}.jpg`));
  const sizes = ['hdr', 'jpg'].map((ext) => `${(fs.statSync(path.join(OUT, `${world}.${ext}`)).size / 1024).toFixed(0)} KB`);
  credits.push({ world, id, name: info.name, authors: Object.keys(info.authors).join(', '), sizes });
  console.log(`${world}: ${info.name} by ${Object.keys(info.authors).join(', ')} (${sizes.join(', ')})`);
}
fs.writeFileSync(path.join(SRC, 'credits.json'), JSON.stringify(credits, null, 2));
