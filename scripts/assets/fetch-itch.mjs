// Downloads free ("name your own price", minimum $0) CC0 asset packs from itch.io into
// assets-src/<dir>, using itch's own "No thanks, just take me to the downloads" flow.
// Usage: node scripts/assets/fetch-itch.mjs <creator> <game-slug> <dir> [fileNameFilter]
import fs from 'node:fs';
import path from 'node:path';

const [, , creator, slug, dir, filter = ''] = process.argv;
if (!creator || !slug || !dir) {
  console.error('usage: fetch-itch.mjs <creator> <game-slug> <dir> [fileNameFilter]');
  process.exit(1);
}
const base = `https://${creator}.itch.io/${slug}`;
let cookie = '';
const remember = (res) => {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) cookie += c.split(';')[0] + '; ';
};
const get = async (url) => {
  const res = await fetch(url, { headers: { cookie } });
  remember(res);
  return res;
};
const post = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' },
    body: new URLSearchParams(body)
  });
  remember(res);
  return res;
};

const page = await (await get(base)).text();
if (!/"min_price":0/.test(page)) throw new Error(`${slug} is not free to download; not fetching`);
const csrf = page.match(/name="csrf_token" value="([^"]+)"/)?.[1];
if (!csrf) throw new Error('no csrf token on the page');

const { url: downloadPage } = await (await post(`${base}/download_url`, { csrf_token: csrf })).json();
const html = await (await get(downloadPage)).text();
const uploads = [...html.matchAll(/data-upload_id="(\d+)"[\s\S]*?<strong[^>]*title="([^"]+)"/g)].map((m) => ({ id: m[1], name: m[2] }));
if (!uploads.length) throw new Error('no files listed on the download page');
console.log('files:', uploads.map((u) => u.name).join(', '));

const out = path.join('assets-src', dir);
fs.mkdirSync(out, { recursive: true });
const csrf2 = html.match(/name="csrf_token" value="([^"]+)"/)?.[1] ?? csrf;
for (const u of uploads) {
  if (filter && !u.name.toLowerCase().includes(filter.toLowerCase())) continue;
  const target = path.join(out, u.name);
  if (fs.existsSync(target)) {
    console.log('have', u.name);
    continue;
  }
  const reply = await (await post(`${base}/file/${u.id}?source=game_download`, { csrf_token: csrf2 })).json();
  const url = reply.url;
  if (!url) throw new Error(`no file url for ${u.name}: ${JSON.stringify(reply)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed for ${u.name}: ${res.status}`);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  console.log('got', u.name, fs.statSync(target).size);
}
