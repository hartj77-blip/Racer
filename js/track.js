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
    fog: '#2a0d3f',
    ground: ['#15151d', '#111118'],
    rumble: ['#ff2e88', '#e6e6ee'],
    road: ['#2d2d36', '#292931'],
    lane: '#d9d9e0',
    edgeGlow: 'rgba(255,46,136,0.0)',
    buildings: ['#1d1a2e', '#24203a', '#1a2233', '#2a1f33', '#202028'],
    windows: ['#ffd27a', '#ffe8a8', '#7fe7ff', '#ff9ad5', '#fff3d0'],
    neon: ['#ff2e88', '#00e5ff', '#b2ff59', '#ffea00', '#c77dff'],
    skylineFar: '#1a0f2e',
    skylineNear: '#0e0a1a',
    lampGlow: '#ffcf70',
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
  },
};

const TRACKS = [
  {
    id: 'city',
    name: 'Downtown Midnight',
    desc: 'Neon-lit streets, tight corners and heavy traffic.',
    theme: 'city',
    seed: 1337,
    traffic: 28,
    layout(b) {
      b.straight(ROAD.LENGTH.SHORT);
      b.curve(ROAD.LENGTH.MEDIUM, ROAD.CURVE.MEDIUM, ROAD.HILL.NONE);
      b.straight(ROAD.LENGTH.MEDIUM);
      b.sCurves();
      b.curve(ROAD.LENGTH.LONG, -ROAD.CURVE.EASY, ROAD.HILL.LOW);
      b.hill(ROAD.LENGTH.MEDIUM, ROAD.HILL.MEDIUM);
      b.straight(ROAD.LENGTH.MEDIUM);
      b.curve(ROAD.LENGTH.MEDIUM, ROAD.CURVE.HARD, -ROAD.HILL.LOW);
      b.bumps();
      b.curve(ROAD.LENGTH.MEDIUM, -ROAD.CURVE.HARD, ROAD.HILL.NONE);
      b.straight(ROAD.LENGTH.LONG);
      b.curve(ROAD.LENGTH.MEDIUM, ROAD.CURVE.EASY, ROAD.HILL.MEDIUM);
      b.sCurves();
      b.curve(ROAD.LENGTH.LONG, -ROAD.CURVE.MEDIUM, -ROAD.HILL.LOW);
      b.straight(ROAD.LENGTH.SHORT);
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
      b.straight(ROAD.LENGTH.SHORT);
      b.lowRollingHills();
      b.curve(ROAD.LENGTH.LONG, ROAD.CURVE.EASY, ROAD.HILL.MEDIUM);
      b.hill(ROAD.LENGTH.MEDIUM, ROAD.HILL.HIGH);
      b.curve(ROAD.LENGTH.LONG, -ROAD.CURVE.MEDIUM, -ROAD.HILL.MEDIUM);
      b.straight(ROAD.LENGTH.LONG);
      b.sCurves();
      b.hill(ROAD.LENGTH.LONG, -ROAD.HILL.MEDIUM);
      b.curve(ROAD.LENGTH.LONG, ROAD.CURVE.MEDIUM, ROAD.HILL.HIGH);
      b.bumps();
      b.curve(ROAD.LENGTH.LONG, -ROAD.CURVE.EASY, -ROAD.HILL.LOW);
      b.lowRollingHills();
      b.curve(ROAD.LENGTH.MEDIUM, ROAD.CURVE.HARD, ROAD.HILL.NONE);
      b.straight(ROAD.LENGTH.MEDIUM);
      b.downhillToEnd(100);
    },
  },
];

const Track = (() => {
  const { SEG, RUMBLE, ROAD_W } = Config;

  function build(def) {
    const theme = THEMES[def.theme];
    const segments = [];

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

    const trackLength = segments.length * SEG;
    return { segments, trackLength, theme };
  }

  // Scenery is placed after build so the game can pass in the start index
  function decorate(track, def, sprites, startIndex) {
    const { segments, theme } = track;
    const rand = Util.rng(def.seed);
    const n = segments.length;
    const add = (i, src, offset, opts) => {
      if (i < 0 || i >= n) return;
      segments[i].sprites.push(Object.assign({ source: src, offset: offset }, opts || {}));
    };

    // start/finish gantry & checkered line
    add(startIndex, sprites.banner, 0, { center: true, noHit: true });
    segments[startIndex].checker = true;
    segments[(startIndex + 1) % n].checker = true;

    // chevrons on the outside of sharp corners
    for (let i = 0; i < n; i += 7) {
      const c = segments[i].curve;
      if (Math.abs(c) >= 3.5) add(i, c > 0 ? sprites.chevronR : sprites.chevronL, c > 0 ? -1.2 : 1.2);
    }

    if (def.theme === 'city') {
      for (let i = 10; i < n; i += 14) {
        add(i, sprites.lampL, -1.12, { hitW: 0.08 });
        add(i, sprites.lampR, 1.12, { hitW: 0.08 });
      }
      for (let i = 0; i < n; i += 4 + Math.floor(rand() * 4)) {
        const side = rand() < 0.5 ? -1 : 1;
        add(i, sprites.buildings[Math.floor(rand() * sprites.buildings.length)], side * (2.3 + rand() * 1.6), { noHit: true });
      }
      for (let i = 60; i < n; i += 90 + Math.floor(rand() * 60)) {
        const side = rand() < 0.5 ? -1 : 1;
        add(i, sprites.billboards[Math.floor(rand() * sprites.billboards.length)], side * 1.5);
      }
    } else {
      for (let i = 8; i < n; i += 5 + Math.floor(rand() * 5)) {
        const side = rand() < 0.5 ? -1 : 1;
        add(i, sprites.palms[Math.floor(rand() * sprites.palms.length)], side * (1.35 + rand() * 1.6), { hitW: 0.12 });
      }
      for (let i = 0; i < n; i += 9 + Math.floor(rand() * 10)) {
        const side = rand() < 0.5 ? -1 : 1;
        const src = rand() < 0.5 ? sprites.rock : sprites.bush;
        add(i, src, side * (1.3 + rand() * 2), { hitW: 0.3 });
      }
      for (let i = 40; i < n; i += 110 + Math.floor(rand() * 60)) {
        const side = rand() < 0.5 ? -1 : 1;
        add(i, sprites.billboards[Math.floor(rand() * sprites.billboards.length)], side * 1.5);
      }
      for (let i = 0; i < n; i += 30 + Math.floor(rand() * 30)) {
        const side = rand() < 0.5 ? -1 : 1;
        add(i, sprites.buildings[Math.floor(rand() * sprites.buildings.length)], side * (2.6 + rand() * 1.5), { noHit: true });
      }
    }
  }

  return { build, decorate };
})();
