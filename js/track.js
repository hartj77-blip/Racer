// Track geometry, visual themes and roadside scenery.
const Config = {
  SEG: 200,            // segment length (world units)
  RUMBLE: 3,           // segments per rumble strip
  ROAD_W: 2000,        // half road width
  LANES: 3,
  CAM_H: 1000,
  FOV: 100,
  DRAW_DIST: 300,
  FOG_DENSITY: 5,
  TUNNEL_H: 2700,      // tunnel ceiling height (world units)
  TUNNEL_X: 1.22,      // tunnel wall position (road-normalised)
  BARRIER_X: 1.18,     // roadside barrier position (road-normalised)
};

const ROAD = {
  LENGTH: { NONE: 0, SHORT: 15, MEDIUM: 30, LONG: 60 },
  HILL: { NONE: 0, LOW: 15, MEDIUM: 30, HIGH: 45 },
  CURVE: { NONE: 0, EASY: 2, MEDIUM: 4, HARD: 6 },
};

const THEMES = {
  city: {
    sky: [[0, '#04020d'], [0.55, '#1c0838'], [1, '#5a1a6b']],
    stars: true,
    night: true,
    fog: '#2a0d3f',
    ground: ['#15151d', '#111118'],
    rumble: ['#ff2e88', '#e6e6ee'],
    road: ['#2d2d36', '#292931'],
    lane: '#d9d9e0',
    buildings: ['#1d1a2e', '#24203a', '#1a2233', '#2a1f33', '#202028'],
    windows: ['#ffd27a', '#ffe8a8', '#7fe7ff', '#ff9ad5', '#fff3d0'],
    neon: ['#ff2e88', '#00e5ff', '#b2ff59', '#ffea00', '#c77dff'],
    skylineFar: '#1a0f2e',
    skylineNear: '#0e0a1a',
    lampGlow: '#ffcf70',
    tunnel: { wall: ['#3b3442', '#342e3b'], ceiling: ['#221e28', '#1e1a23'], light: '#ffb54a', trim: '#ff2e88' },
  },
  coast: {
    sky: [[0, '#241a5c'], [0.45, '#b23a6b'], [0.8, '#ff8a5c'], [1, '#ffc27a']],
    sun: true,
    fog: '#e58466',
    ground: ['#d8b77e', '#ccaa72'],
    rumble: ['#ffffff', '#e0262e'],
    road: ['#55525a', '#4f4c54'],
    lane: '#f2f2f2',
    buildings: ['#c98a6b', '#b8745a', '#d3a07c'],
    windows: ['#ffd27a', '#3b2c40'],
    neon: ['#ff4f81', '#ffd166'],
    lampGlow: '#ffe2a0',
    barrier: 'rail',
  },
  harbor: {
    sky: [[0, '#04060b'], [0.6, '#101827'], [1, '#22304a']],
    night: true,
    rain: true,
    fog: '#151d2b',
    ground: ['#1c1f25', '#191b21'],
    rumble: ['#e8c21a', '#2a2a2e'],
    road: ['#23262d', '#20232a'],
    lane: '#c9ccd4',
    wet: true,
    buildings: ['#2a2f3a', '#303643', '#262a33'],
    windows: ['#ffd27a', '#9fd8ff', '#ffe8a8'],
    neon: ['#00e5ff', '#ff9f1c'],
    skylineFar: '#121a28',
    skylineNear: '#0b1019',
    lampGlow: '#ffb54a',
    barrier: 'concrete',
    tunnel: { wall: ['#2f343c', '#2a2e36'], ceiling: ['#1b1e24', '#181a20'], light: '#9fd8ff', trim: '#e8c21a' },
  },
};

const TRACKS = [
  {
    id: 'city',
    name: 'Downtown Midnight',
    desc: 'Neon-lit streets, a downtown tunnel and heavy traffic.',
    theme: 'city',
    seed: 1337,
    traffic: 28,
    layout(b) {
      const L = ROAD.LENGTH, C = ROAD.CURVE, H = ROAD.HILL;
      b.straight(L.SHORT);
      b.curve(L.MEDIUM, C.MEDIUM, H.NONE);
      b.tunnel(() => { b.straight(L.SHORT); b.curve(L.MEDIUM, C.EASY, H.NONE); b.straight(L.SHORT); });
      b.sCurves();
      b.curve(L.LONG, C.EASY, H.LOW);
      b.hill(L.MEDIUM, H.MEDIUM);
      b.straight(L.MEDIUM);
      b.curve(L.MEDIUM, C.HARD, -H.LOW);
      b.bumps();
      b.curve(L.MEDIUM, -C.HARD, H.NONE);
      b.straight(L.LONG);
      b.curve(L.MEDIUM, C.MEDIUM, H.MEDIUM);
      b.sCurves();
      b.curve(L.LONG, C.MEDIUM, -H.LOW);
      b.straight(L.SHORT);
      b.downhillToEnd(100);
    },
  },
  {
    id: 'coast',
    name: 'Sunset Coast',
    desc: 'Fast sweeping highway with big hills along the ocean.',
    theme: 'coast',
    seed: 4242,
    traffic: 20,
    layout(b) {
      const L = ROAD.LENGTH, C = ROAD.CURVE, H = ROAD.HILL;
      b.straight(L.SHORT);
      b.lowRollingHills();
      b.curve(L.LONG, C.EASY, H.MEDIUM);
      b.hill(L.MEDIUM, H.HIGH);
      b.curve(L.LONG, C.MEDIUM, -H.MEDIUM);
      b.straight(L.LONG);
      b.sCurves();
      b.hill(L.LONG, -H.MEDIUM);
      b.curve(L.LONG, C.MEDIUM, H.HIGH);
      b.bumps();
      b.curve(L.LONG, -C.EASY, -H.LOW);
      b.lowRollingHills();
      b.curve(L.MEDIUM, C.HARD, H.NONE);
      b.straight(L.MEDIUM);
      b.downhillToEnd(100);
    },
  },
  {
    id: 'harbor',
    name: 'Harbor Rain',
    desc: 'Rain-soaked docks, hard corners and a long underpass.',
    theme: 'harbor',
    seed: 9001,
    traffic: 22,
    layout(b) {
      const L = ROAD.LENGTH, C = ROAD.CURVE, H = ROAD.HILL;
      b.straight(L.SHORT);
      b.curve(L.SHORT, C.HARD, H.NONE);
      b.straight(L.LONG);
      b.tunnel(() => { b.straight(L.SHORT); b.curve(L.MEDIUM, -C.MEDIUM, H.NONE); b.straight(L.MEDIUM); b.curve(L.SHORT, C.MEDIUM, H.NONE); });
      b.curve(L.MEDIUM, C.HARD, H.LOW);
      b.bumps();
      b.straight(L.MEDIUM);
      b.curve(L.SHORT, C.HARD, -H.LOW);
      b.straight(L.MEDIUM);
      b.sCurves();
      b.curve(L.MEDIUM, C.HARD, H.NONE);
      b.straight(L.SHORT);
      b.curve(L.MEDIUM, -C.MEDIUM, H.LOW);
      b.curve(L.MEDIUM, C.HARD, H.NONE);
      b.straight(L.MEDIUM);
      b.curve(L.LONG, -C.EASY, H.NONE);
      b.downhillToEnd(100);
    },
  },
];

const Track = (() => {
  const { SEG, RUMBLE } = Config;

  function build(def) {
    const theme = THEMES[def.theme];
    const segments = [];
    let inTunnel = false;

    const lastY = () => segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y;

    function addSegment(curve, y) {
      const n = segments.length;
      segments.push({
        index: n,
        p1: { world: { y: lastY(), z: n * SEG }, camera: {}, screen: {} },
        p2: { world: { y: y, z: (n + 1) * SEG }, camera: {}, screen: {} },
        curve: curve,
        sprites: [],
        cars: [],
        dark: Math.floor(n / RUMBLE) % 2 === 1,
        tunnel: inTunnel,
      });
    }

    function addRoad(enter, hold, leave, curve, y) {
      const startY = lastY();
      const endY = startY + (Util.toInt(y, 0) * SEG);
      const total = enter + hold + leave;
      for (let n = 0; n < enter; n++) addSegment(Util.easeIn(0, curve, n / enter), Util.easeInOut(startY, endY, n / total));
      for (let n = 0; n < hold; n++) addSegment(curve, Util.easeInOut(startY, endY, (enter + n) / total));
      for (let n = 0; n < leave; n++) addSegment(Util.easeInOut(curve, 0, n / leave), Util.easeInOut(startY, endY, (enter + hold + n) / total));
    }

    const L = ROAD.LENGTH, H = ROAD.HILL, C = ROAD.CURVE;
    const b = {
      straight(num) { num = num || L.MEDIUM; addRoad(num, num, num, 0, 0); },
      hill(num, height) { num = num || L.MEDIUM; addRoad(num, num, num, 0, height || H.MEDIUM); },
      curve(num, curve, height) { num = num || L.MEDIUM; addRoad(num, num, num, curve || C.MEDIUM, height || H.NONE); },
      tunnel(fn) { inTunnel = true; fn(); inTunnel = false; },
      lowRollingHills(num, height) {
        num = num || L.SHORT; height = height || H.LOW;
        addRoad(num, num, num, 0, height / 2);
        addRoad(num, num, num, 0, -height);
        addRoad(num, num, num, C.EASY, height);
        addRoad(num, num, num, 0, 0);
        addRoad(num, num, num, -C.EASY, height / 2);
        addRoad(num, num, num, 0, 0);
      },
      sCurves() {
        addRoad(L.MEDIUM, L.MEDIUM, L.MEDIUM, -C.EASY, H.NONE);
        addRoad(L.MEDIUM, L.MEDIUM, L.MEDIUM, C.MEDIUM, H.MEDIUM);
        addRoad(L.MEDIUM, L.MEDIUM, L.MEDIUM, C.EASY, -H.LOW);
        addRoad(L.MEDIUM, L.MEDIUM, L.MEDIUM, -C.EASY, H.MEDIUM);
        addRoad(L.MEDIUM, L.MEDIUM, L.MEDIUM, -C.MEDIUM, -H.MEDIUM);
      },
      bumps() {
        addRoad(10, 10, 10, 0, 5);
        addRoad(10, 10, 10, 0, -2);
        addRoad(10, 10, 10, 0, -5);
        addRoad(10, 10, 10, 0, 8);
        addRoad(10, 10, 10, 0, 5);
        addRoad(10, 10, 10, 0, -7);
        addRoad(10, 10, 10, 0, 5);
        addRoad(10, 10, 10, 0, -2);
      },
      downhillToEnd(num) { num = num || 200; addRoad(num, num, num, -C.EASY, -lastY() / SEG); },
    };

    def.layout(b);

    // flag tunnel portals for the façade
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (s.tunnel && !segments[(i - 1 + segments.length) % segments.length].tunnel) s.portal = true;
      if (s.tunnel) s.ceilingLight = i % 6 === 0;
    }

    const trackLength = segments.length * SEG;
    return { segments, trackLength, theme, map: buildMap(segments) };
  }

  // 2D outline for the minimap. Curvature is integrated into a heading using
  // the same scale the renderer bends the road with; the leftover turn is
  // spread evenly over the lap and the small position gap is closed so the
  // outline always forms a clean loop.
  function buildMap(segments) {
    const n = segments.length;
    const k = 1.15 / SEG;
    let turn = 0;
    for (const s of segments) turn += s.curve * k;
    const target = (turn >= 0 ? 1 : -1) * Math.PI * 2;
    const fix = (target - turn) / n;
    let hdg = 0, x = 0, y = 0;
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({ x, y });
      hdg += segments[i].curve * k + fix;
      x += Math.sin(hdg);
      y -= Math.cos(hdg);
    }
    const ex = x, ey = y;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach((p, i) => {
      p.x -= ex * i / n; p.y -= ey * i / n;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    return pts.map(p => ({ x: (p.x - (minX + maxX) / 2) / span, y: (p.y - (minY + maxY) / 2) / span }));
  }

  // Scenery is placed after build so the game can pass in the start index
  function decorate(track, def, sprites, startIndex) {
    const { segments, theme } = track;
    const rand = Util.rng(def.seed);
    const n = segments.length;
    const add = (i, src, offset, opts) => {
      if (i < 0 || i >= n || segments[i].tunnel) return;
      segments[i].sprites.push(Object.assign({ source: src, offset: offset }, opts || {}));
    };
    const pick = arr => arr[Math.floor(rand() * arr.length)];
    const side = () => (rand() < 0.5 ? -1 : 1);

    if (theme.barrier) {
      segments.forEach(s => { if (!s.tunnel) s.barrier = theme.barrier; });
    }

    // start/finish gantry & checkered line
    add(startIndex, sprites.banner, 0, { center: true, noHit: true });
    segments[startIndex].checker = true;
    segments[(startIndex + 1) % n].checker = true;

    // chevrons on the outside of sharp corners
    const chevX = theme.barrier ? 1.32 : 1.2;
    for (let i = 0; i < n; i += 7) {
      const c = segments[i].curve;
      if (Math.abs(c) >= 3.5) add(i, c > 0 ? sprites.chevronR : sprites.chevronL, c > 0 ? -chevX : chevX);
    }

    if (def.theme === 'city') {
      for (let i = 10; i < n; i += 14) {
        add(i, sprites.lampL, -1.12, { hitW: 0.08 });
        add(i, sprites.lampR, 1.12, { hitW: 0.08 });
        if (!segments[i].tunnel) segments[i].lamps = 1.0;
      }
      for (let i = 0; i < n; i += 4 + Math.floor(rand() * 4)) {
        add(i, pick(sprites.buildings), side() * (2.3 + rand() * 1.6), { noHit: true });
      }
      for (let i = 60; i < n; i += 90 + Math.floor(rand() * 60)) {
        add(i, pick(sprites.billboards), side() * 1.5);
      }
    } else if (def.theme === 'coast') {
      for (let i = 8; i < n; i += 5 + Math.floor(rand() * 5)) {
        add(i, pick(sprites.palms), side() * (1.35 + rand() * 1.6), { hitW: 0.12 });
      }
      for (let i = 0; i < n; i += 9 + Math.floor(rand() * 10)) {
        add(i, rand() < 0.5 ? sprites.rock : sprites.bush, side() * (1.3 + rand() * 2), { hitW: 0.3 });
      }
      for (let i = 40; i < n; i += 110 + Math.floor(rand() * 60)) {
        add(i, pick(sprites.billboards), side() * 1.5);
      }
      for (let i = 0; i < n; i += 30 + Math.floor(rand() * 30)) {
        add(i, pick(sprites.buildings), side() * (2.6 + rand() * 1.5), { noHit: true });
      }
    } else {
      for (let i = 6; i < n; i += 12) {
        add(i, sprites.lampL, -1.3, { hitW: 0.08 });
        add(i, sprites.lampR, 1.3, { hitW: 0.08 });
        if (!segments[i].tunnel) segments[i].lamps = 1.15;
      }
      for (let i = 0; i < n; i += 3 + Math.floor(rand() * 4)) {
        add(i, pick(sprites.containers), side() * (1.5 + rand() * 1.4), { noHit: true });
      }
      for (let i = 20; i < n; i += 40 + Math.floor(rand() * 40)) {
        add(i, pick(sprites.cranes), side() * (3 + rand() * 1.5), { noHit: true });
      }
      for (let i = 0; i < n; i += 10 + Math.floor(rand() * 10)) {
        add(i, pick(sprites.buildings), side() * (3.2 + rand() * 1.5), { noHit: true });
      }
      for (let i = 50; i < n; i += 120 + Math.floor(rand() * 60)) {
        add(i, pick(sprites.billboards), side() * 1.6);
      }
    }
  }

  return { build, decorate };
})();
