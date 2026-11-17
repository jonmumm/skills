// node --test ~/src/skills/imagegen/scripts/
// tileable.py on synthetic images: the output must wrap seamlessly and keep the input's size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TILE = join(here, 'tileable.py');
const py = (code) => spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8' });

// A noisy gradient: left edge dark, right edge bright, so wrapping is a hard seam.
const make = (p) => py(`
import numpy as np; from PIL import Image
rng=np.random.default_rng(1); w,h=256,192
x=np.linspace(0,255,w)[None,:,None].repeat(h,0).repeat(3,2)
img=np.clip(x+rng.normal(0,20,(h,w,3)),0,255).astype('uint8')
Image.fromarray(img).save('${p}')`);

// mean |edge-wrap difference| / mean |interior neighbour difference|, both axes. ≤ ~1.3 tiles cleanly.
const seam = (p) => Number(py(`
import numpy as np; from PIL import Image
a=np.asarray(Image.open('${p}').convert('RGB')).astype(float)
wx=np.abs(a[:,-1]-a[:,0]).mean(); ix=np.abs(a[:,1:]-a[:,:-1]).mean()
wy=np.abs(a[-1]-a[0]).mean(); iy=np.abs(a[1:]-a[:-1]).mean()
print(max(wx/ix, wy/iy))`).stdout);

const size = (p) => py(`from PIL import Image; print(*Image.open('${p}').size)`).stdout.trim();

test('makes a hard-seamed image wrap seamlessly at the same size', () => {
  const d = mkdtempSync(join(tmpdir(), 'tile-'));
  const src = join(d, 'in.png'), out = join(d, 'out.png');
  assert.equal(make(src).status, 0);
  assert.ok(seam(src) > 3, `fixture should have a hard seam, got ${seam(src)}`);
  const r = spawnSync('python3', ['-I', TILE, src, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(size(out), '256 192');
  assert.ok(seam(out) < 1.3, `seam ratio ${seam(out)}`);
});

test('--check reports the seam ratio and exits 1 on a seam, 0 when it tiles', () => {
  const d = mkdtempSync(join(tmpdir(), 'tile-'));
  const src = join(d, 'in.png'), out = join(d, 'out.png');
  make(src);
  const bad = spawnSync('python3', ['-I', TILE, '--check', src], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /seam/);
  spawnSync('python3', ['-I', TILE, src, out]);
  const good = spawnSync('python3', ['-I', TILE, '--check', out], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stdout);
});

test('--preview writes a 2x2 repeat for the critic', () => {
  const d = mkdtempSync(join(tmpdir(), 'tile-'));
  const src = join(d, 'in.png'), out = join(d, 'out.png');
  make(src);
  const r = spawnSync('python3', ['-I', TILE, src, out, '--preview', join(d, 'prev.png')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(d, 'prev.png')));
  assert.equal(size(join(d, 'prev.png')), '512 384');
});
