// Seeded randomness. Every random choice in the game goes through ctx.rng (or a fork of it),
// so the same ?seed= gives the same world and screenshots are comparable between runs.
export function mulberry32(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    fork: (salt) => mulberry32((seed * 2654435761 + hashString(String(salt))) >>> 0),
  };
}

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

// Seeded 2D value noise + fBm. Pure functions of (x, z), so CPU queries such as
// terrain.heightAt() always agree with the generated mesh.
export function makeNoise2D(seed) {
  const perm = new Uint16Array(512);
  const r = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = (ix, iz) => perm[(perm[ix & 255] + iz) & 511] / 255;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = fade(x - ix), fz = fade(z - iz);
    const a = val(ix, iz), b = val(ix + 1, iz), c = val(ix, iz + 1), d = val(ix + 1, iz + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz; // 0..1
  };
  const fbm = (x, z, octaves = 5, lac = 2.0, gain = 0.5) => {
    let amp = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += amp * noise(x * f, z * f); norm += amp; amp *= gain; f *= lac; }
    return sum / norm; // 0..1
  };
  const ridged = (x, z, octaves = 5) => {
    let amp = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) { const n = 1 - Math.abs(noise(x * f, z * f) * 2 - 1); sum += amp * n * n; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  };
  return { noise, fbm, ridged };
}
