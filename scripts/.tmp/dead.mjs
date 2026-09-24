import fs from 'node:fs';
import path from 'node:path';
const all = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f)) all.push(path.normalize(p)); } };
walk('src');
const resolve = (from, spec) => {
  if (!spec.startsWith('.')) return null;
  const base = path.normalize(path.join(path.dirname(from), spec));
  for (const c of [base, base + '.ts', path.join(base, 'index.ts')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
const closure = (roots) => { const s = new Set(); const v = (f) => { if (s.has(f)) return; s.add(f); const t = fs.readFileSync(f, 'utf8'); for (const m of t.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g)) { const r = resolve(f, m[1] ?? m[2] ?? m[3]); if (r) v(r); } }; roots.forEach((r) => v(path.normalize(r))); return s; };
const city = closure(['src/game/CityGame.ts', 'src/rendering/city/CityRenderer.ts']);
const keep = new Set([...city, path.normalize('src/main.ts'), path.normalize('src/vite-env.d.ts')]);
const dead = all.filter((f) => !keep.has(f));
fs.writeFileSync('scripts/.tmp/dead.txt', dead.join('\n'));
console.log('keep', keep.size, 'delete', dead.length);
console.log(dead.join('\n'));
// tests importing dead files
const tests = fs.readdirSync('tests').filter((f) => f.endsWith('.ts'));
const deadTests = tests.filter((t) => { const s = fs.readFileSync('tests/' + t, 'utf8'); return [...s.matchAll(/from\s+['"](\.\.\/src\/[^'"]+)['"]/g)].some((m) => { const r = resolve('tests/' + t, m[1]); return r && !keep.has(r); }); });
console.log('TESTS to delete:', deadTests.join(' '));
fs.writeFileSync('scripts/.tmp/deadtests.txt', deadTests.join('\n'));
