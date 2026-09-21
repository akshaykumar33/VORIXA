#!/usr/bin/env node
/**
 * Stages the hand-tracking assets into `public/`.
 *
 * These are binaries (a ~7.8 MB model and ~12 MB of WASM), so they are gitignored rather than
 * committed. That makes this script load-bearing: without it a fresh clone builds and runs fine
 * right up until someone presses G, and then fails with a 404 that looks like a code bug.
 * It is wired into `predev` and `prebuild` so the failure cannot reach anyone.
 *
 * Idempotent and offline-friendly: present files are left alone, and a failed download warns
 * rather than breaking the build for people who are not using gesture input.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, access, copyFile, readdir, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WASM_SRC = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const WASM_DEST = path.join(root, 'public', 'wasm');
const MODEL_DEST = path.join(root, 'public', 'models', 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  if (!(await exists(WASM_SRC))) {
    console.warn('[vision] @mediapipe/tasks-vision not installed; skipping WASM copy.');
    return;
  }
  await mkdir(WASM_DEST, { recursive: true });

  let copied = 0;
  for (const name of await readdir(WASM_SRC)) {
    const from = path.join(WASM_SRC, name);
    const to = path.join(WASM_DEST, name);
    // Re-copy when the sizes differ, so a dependency upgrade is picked up rather than ignored.
    if (await exists(to)) {
      const [a, b] = await Promise.all([stat(from), stat(to)]);
      if (a.size === b.size) continue;
    }
    await copyFile(from, to);
    copied++;
  }
  console.log(`[vision] WASM runtime ready (${copied} file(s) updated).`);
}

async function fetchModel() {
  if (await exists(MODEL_DEST)) {
    console.log('[vision] Hand model already present.');
    return;
  }
  await mkdir(path.dirname(MODEL_DEST), { recursive: true });
  console.log('[vision] Downloading hand landmarker model (~7.8 MB)...');

  try {
    const response = await fetch(MODEL_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(MODEL_DEST));
    console.log('[vision] Hand model ready.');
  } catch (err) {
    // Not fatal: everything except hand control works without it.
    console.warn(
      `[vision] Could not download the hand model (${err.message}). ` +
        'Keyboard and mouse play is unaffected; press G will report an error until this succeeds.'
    );
  }
}

await copyWasm();
await fetchModel();
