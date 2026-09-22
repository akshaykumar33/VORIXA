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
/**
 * Vision models staged into `public/models`.
 *
 * The face model carries the iris refinement that gaze steering depends on — without it the
 * landmark set stops at 468 points and there are no iris landmarks to read at all.
 */
const MODELS = [
  {
    label: 'hand landmarker',
    size: '~7.8 MB',
    dest: path.join(root, 'public', 'models', 'hand_landmarker.task'),
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    feature: 'press G will report an error until this succeeds'
  },
  {
    label: 'face landmarker',
    size: '~3.7 MB',
    dest: path.join(root, 'public', 'models', 'face_landmarker.task'),
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    feature: 'press E will report an error until this succeeds'
  }
];

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

async function fetchModel(model) {
  if (await exists(model.dest)) {
    console.log(`[vision] ${model.label} model already present.`);
    return;
  }
  await mkdir(path.dirname(model.dest), { recursive: true });
  console.log(`[vision] Downloading ${model.label} model (${model.size})...`);

  try {
    const response = await fetch(model.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(model.dest));
    console.log(`[vision] ${model.label} model ready.`);
  } catch (err) {
    // Not fatal: everything except this one input mode works without it.
    console.warn(
      `[vision] Could not download the ${model.label} model (${err.message}). ` +
        `Keyboard and mouse play is unaffected; ${model.feature}.`
    );
  }
}

await copyWasm();
// Sequential rather than parallel: these are large downloads on what may be a modest connection,
// and racing them makes both slow instead of making either arrive sooner.
for (const model of MODELS) await fetchModel(model);
