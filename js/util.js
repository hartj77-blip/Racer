// Small math / projection helpers shared by the game.
const Util = {
  toInt(v, def) {
    if (v !== null && v !== undefined) {
      const n = parseInt(v, 10);
      if (!isNaN(n)) return n;
    }
    return def;
  },
  limit(v, min, max) { return Math.max(min, Math.min(v, max)); },
  accelerate(v, accel, dt) { return v + accel * dt; },
  interpolate(a, b, p) { return a + (b - a) * p; },
  easeIn(a, b, p) { return a + (b - a) * Math.pow(p, 2); },
  easeInOut(a, b, p) { return a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5); },
  percentRemaining(n, total) { return (n % total) / total; },
  exponentialFog(distance, density) { return 1 / Math.pow(Math.E, distance * distance * density); },

  // Wrap start+inc into [0, max)
  increase(start, inc, max) {
    let r = start + inc;
    while (r >= max) r -= max;
    while (r < 0) r += max;
    return r;
  },

  // Signed shortest distance on a looping track, in [-max/2, max/2)
  wrapDelta(d, max) {
    d = ((d % max) + max) % max;
    return d >= max / 2 ? d - max : d;
  },

  project(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
    p.camera.x = (p.world.x || 0) - cameraX;
    p.camera.y = (p.world.y || 0) - cameraY;
    p.camera.z = (p.world.z || 0) - cameraZ;
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
    p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
    p.screen.w = Math.round(p.screen.scale * roadWidth * width / 2);
  },

  overlap(x1, w1, x2, w2, percent) {
    const half = (percent || 1) / 2;
    const min1 = x1 - w1 * half, max1 = x1 + w1 * half;
    const min2 = x2 - w2 * half, max2 = x2 + w2 * half;
    return !((max1 < min2) || (min1 > max2));
  },

  // Deterministic PRNG so tracks look the same every race
  rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  formatTime(t) {
    if (t === null || t === undefined || !isFinite(t)) return '--:--.--';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const cs = Math.floor((t * 100) % 100);
    return m + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
  },

  ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  },
};
