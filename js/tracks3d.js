// 3D tracks: spline layouts, road/terrain geometry, scenery, sky and lighting.
// Track space: s = distance along the centreline (m), d = lateral offset (m, + is left).
const World = (() => {
  const T = THREE;
  const HW = 7.5;           // half road width (3 lanes of 5 m)
  const KERB = 1.0;
  const WALL = 10.5;        // barrier distance from centreline
  const TUNNEL_H = 7.5;
  const SPACING = 2;

  const THEMES = {
    city: {
      night: true, skyTop: '#05020f', skyHorizon: '#43155c', fog: '#26103b', fogNear: 60, fogFar: 700,
      hemi: ['#7a6ab8', '#20142a', 1.6], sun: { color: '#9fb0ff', intensity: 0.8, dir: [-0.4, 1, 0.3] },
      ground: '#1a1a22', shoulder: '#34343e', road: '#2e2e36', line: '#e8e8ee', wet: false,
      kerb: ['#ff2e88', '#e6e6ee'], wall: '#57545f', wallStripe: '#ff2e88', wallH: 1.1,
      lamp: '#ffcf70', windows: ['#ffd27a', '#ffe8a8', '#7fe7ff', '#ff9ad5', '#fff3d0'], facade: '#1d1b2b',
      neon: ['#ff2e88', '#00e5ff', '#b2ff59', '#ffea00', '#c77dff'],
      tunnelWall: '#3d3646', tunnelLight: '#ffb54a', headlights: true,
    },
    coast: {
      night: false, skyTop: '#2b2170', skyHorizon: '#ffa070', fog: '#ee9a76', fogNear: 250, fogFar: 1700,
      hemi: ['#ffd8c0', '#7a5040', 2.0], sun: { color: '#ffc090', intensity: 2.2, dir: [0.25, 0.32, -1] },
      ground: '#d9b97f', shoulder: '#c9ab78', road: '#56535c', line: '#f4f4f4', wet: false,
      kerb: ['#ffffff', '#e0262e'], wall: '#c9ccd2', wallStripe: '#7d8088', wallH: 0.85, rail: true,
      windows: ['#ffe2a8', '#5a4a60'], facade: '#d8a88a', neon: ['#ff4f81', '#ffd166'],
    },
    harbor: {
      night: true, rain: true, skyTop: '#03050a', skyHorizon: '#223250', fog: '#19212f', fogNear: 30, fogFar: 520,
      hemi: ['#6a7a9a', '#14181f', 1.3], sun: { color: '#9fb6d8', intensity: 0.6, dir: [0.3, 1, -0.2] },
      ground: '#1d2027', shoulder: '#2b2e35', road: '#23262d', line: '#c9ccd4', wet: true,
      kerb: ['#e8c21a', '#2a2a2e'], wall: '#8a8d93', wallStripe: '#e8c21a', wallH: 1.0,
      lamp: '#ffb54a', windows: ['#ffd27a', '#9fd8ff', '#ffe8a8'], facade: '#2a2f3a', neon: ['#00e5ff', '#ff9f1c'],
      tunnelWall: '#30353e', tunnelLight: '#9fd8ff', headlights: true,
    },
  };

  const DEFS = [
    {
      id: 'city', name: 'Downtown Midnight', desc: 'Neon city blocks, a long tunnel and an elevated section.',
      theme: 'city', seed: 1337, traffic: 26, scale: 0.75, tunnels: [[21, 22]],
      points: [[0, 0, 0], [0, 330, 0], [25, 410, 0], [110, 440, 0], [320, 440, 0], [385, 400, 0], [400, 310, 0], [435, 245, 0], [620, 230, 0],
        [685, 280, 4], [700, 510, 9], [660, 590, 6], [430, 630, 0], [365, 690, 0], [350, 820, 3], [300, 880, 6], [-60, 880, 6], [-120, 820, 3],
        [-130, 580, 0], [-180, 505, 0], [-300, 480, 0], [-360, 420, 0], [-360, 40, 0], [-300, -40, 0], [-130, -62, 0], [-35, -50, 0]],
    },
    {
      id: 'coast', name: 'Sunset Coast', desc: 'Fast sweeping coastal highway with big elevation changes.',
      theme: 'coast', seed: 4242, traffic: 18, scale: 1.0, tunnels: [],
      points: [[0, 0, 2], [40, 300, 6], [160, 520, 16], [380, 600, 22], [600, 560, 14], [760, 420, 6], [820, 200, 3], [760, 0, 9],
        [640, -120, 18], [480, -140, 22], [380, -60, 14], [260, -140, 8], [120, -260, 3], [-40, -240, 1], [-90, -120, 1]],
    },
    {
      id: 'harbor', name: 'Harbor Rain', desc: 'Rain-soaked docks, hairpins and a long underpass.',
      theme: 'harbor', seed: 9001, traffic: 20, scale: 0.85, tunnels: [[14, 15]],
      points: [[0, 0, 0], [0, 420, 0], [40, 470, 0], [240, 480, 0], [290, 440, 0], [300, 250, 0], [340, 200, 0], [520, 200, 0], [570, 250, 0],
        [580, 520, 0], [540, 580, 0], [420, 590, 0], [380, 640, 0], [380, 760, 0], [330, 810, 0], [-120, 810, 0], [-170, 760, 0], [-170, 80, 0],
        [-120, -30, 0], [-60, -58, 0], [-12, -40, 0]],
    },
  ];

  // ---------------------------------------------------------------- textures
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = 8;
    return t;
  }

  function noise(g, w, h, amount, rand) {
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * 255 * amount;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  }

  // Road texture covers the full road width (u) and 24 m of length (v)
  function roadTexture(th, rand) {
    return canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = th.road; g.fillRect(0, 0, w, h);
      noise(g, w, h, 0.08, rand);
      // tyre wear bands
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (const lane of [1 / 6, 3 / 6, 5 / 6]) {
        g.fillRect(w * lane - 26, 0, 14, h); g.fillRect(w * lane + 12, 0, 14, h);
      }
      g.fillStyle = th.line;
      g.fillRect(6, 0, 5, h); g.fillRect(w - 11, 0, 5, h);
      for (const u of [1 / 3, 2 / 3]) g.fillRect(w * u - 2, 0, 4, h * 0.42);
      if (th.wet) {
        g.fillStyle = 'rgba(140,170,210,0.06)';
        for (let i = 0; i < 40; i++) g.fillRect(rand() * w, rand() * h, 6 + rand() * 30, 2 + rand() * 60);
      }
    }, true);
  }

  function stripeTexture(a, b) {
    return canvasTex(16, 64, (g, w, h) => {
      g.fillStyle = a; g.fillRect(0, 0, w, h / 2);
      g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2);
    }, true);
  }

  function flatTexture(color, amount, rand) {
    return canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      noise(g, w, h, amount, rand);
    }, true);
  }

  // u runs from the bottom (0) to the top (1) of the barrier, v along the road
  function wallTexture(th) {
    return canvasTex(64, 64, (g, w, h) => {
      if (th.rail) {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#d9dce2'; g.fillRect(w * 0.55, 0, w * 0.4, h);
        g.fillStyle = '#9a9ea6'; g.fillRect(w * 0.7, 0, w * 0.06, h);
        g.fillStyle = th.wallStripe; g.fillRect(w * 0.93, 0, w * 0.04, h);
      } else {
        g.fillStyle = th.wall; g.fillRect(0, 0, w, h);
        noise(g, w, h, 0.06, Math.random);
        g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(w * 0.88, 0, w * 0.12, h);
        g.fillStyle = th.wallStripe; g.fillRect(w * 0.5, 0, w * 0.14, h * 0.55);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, h - 2, w, 2);
      }
    }, true);
  }

  function facadeTexture(th, rand) {
    // 16 m x 16 m of wall: 4 x 4 windows
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = th.facade; g.fillRect(0, 0, w, h);
      noise(g, w, h, 0.05, rand);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const lit = rand() < (th.night ? 0.5 : 0.25);
          g.fillStyle = lit ? th.windows[Math.floor(rand() * th.windows.length)] : (th.night ? '#0b0d16' : '#4a5c70');
          g.fillRect(c * 128 + 22, r * 128 + 30, 84, 70);
          if (!th.night) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(c * 128 + 22, r * 128 + 30, 84, 10); }
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let r = 0; r < 4; r++) g.fillRect(0, r * 128 + 112, w, 6);
    }, true);
  }

  function signAtlas(words, colors) {
    return canvasTex(512, 128 * words.length, (g, w) => {
      g.fillStyle = '#07070c'; g.fillRect(0, 0, w, 128 * words.length);
      words.forEach((word, i) => {
        const col = colors[i % colors.length];
        g.save();
        g.shadowColor = col; g.shadowBlur = 18;
        g.strokeStyle = col; g.lineWidth = 6;
        g.strokeRect(10, i * 128 + 10, w - 20, 108);
        g.fillStyle = col;
        g.font = 'italic 900 70px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(word, w / 2, i * 128 + 66);
        g.restore();
      });
    });
  }

  function checkerTexture() {
    return canvasTex(128, 32, (g, w, h) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#f2f2f2';
        g.fillRect(x * 8, y * 8, 8, 8);
      }
    });
  }

  function bannerTexture(text) {
    return canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = '#0d0d12'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 64; i++) {
        g.fillStyle = i % 2 ? '#fff' : '#111'; g.fillRect(i * 16, 0, 16, 12);
        g.fillStyle = i % 2 ? '#111' : '#fff'; g.fillRect(i * 16, h - 12, 16, 12);
      }
      g.save(); g.shadowColor = '#00e5ff'; g.shadowBlur = 20;
      g.fillStyle = '#9ff5ff'; g.font = 'italic 900 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2); g.restore();
    });
  }

  function containerTexture() {
    return canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) { g.fillStyle = '#a8a8a8'; g.fillRect(x, 0, 3, h); }
      g.fillStyle = '#efefef'; g.fillRect(0, 0, w, 3);
    }, true);
  }

  // ------------------------------------------------------- geometry builder
  class Builder {
    constructor(colors) { this.pos = []; this.uv = []; this.col = colors ? [] : null; this.idx = []; }
    vert(x, y, z, u, v, c) {
      this.pos.push(x, y, z); this.uv.push(u, v);
      if (this.col) this.col.push(c ? c.r : 1, c ? c.g : 1, c ? c.b : 1);
      return this.pos.length / 3 - 1;
    }
    quad(a, b, c, d) { this.idx.push(a, b, c, b, d, c); }
    // axis-aligned-in-local box: centre (x, z), base y, size w (local x), h, dpt (local z), yaw
    box(x, y, z, w, h, dpt, yaw, uvs, color, noTop) {
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const P = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
      const hw = w / 2, hd = dpt / 2;
      const faces = [
        [[-hw, 0, hd], [hw, 0, hd], [-hw, h, hd], [hw, h, hd], w],
        [[hw, 0, -hd], [-hw, 0, -hd], [hw, h, -hd], [-hw, h, -hd], w],
        [[hw, 0, hd], [hw, 0, -hd], [hw, h, hd], [hw, h, -hd], dpt],
        [[-hw, 0, -hd], [-hw, 0, hd], [-hw, h, -hd], [-hw, h, hd], dpt],
      ];
      const su = uvs ? uvs.su : 1, sv = uvs ? uvs.sv : 1, ou = uvs ? uvs.ou : 0, ov = uvs ? uvs.ov : 0;
      for (const [p0, p1, p2, p3, fw] of faces) {
        const a = this.vert(...P(...p0), ou, ov, color), b = this.vert(...P(...p1), ou + fw * su, ov, color);
        const c = this.vert(...P(...p2), ou, ov + h * sv, color), d = this.vert(...P(...p3), ou + fw * su, ov + h * sv, color);
        this.quad(a, b, c, d);
      }
      if (!noTop) {
        const a = this.vert(...P(-hw, h, hd), 0.01, 0.01, color), b = this.vert(...P(hw, h, hd), 0.02, 0.01, color);
        const c = this.vert(...P(-hw, h, -hd), 0.01, 0.02, color), d = this.vert(...P(hw, h, -hd), 0.02, 0.02, color);
        this.quad(a, b, c, d);
      }
    }
    geometry() {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
      if (this.col) g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
      g.setIndex(this.idx);
      g.computeVertexNormals();
      return g;
    }
  }

  // ------------------------------------------------------------------ build
  function build(def) {
    const th = THEMES[def.theme];
    const rand = Util.rng(def.seed);
    const group = new T.Group();
    const disposables = [];
    const track = { def, theme: th, group };

    // --- centreline samples
    const ctrl = def.points.map(p => new T.Vector3(p[0] * def.scale, p[2], p[1] * def.scale));
    const curve = new T.CatmullRomCurve3(ctrl, true, 'centripetal');
    const length = curve.getLength();
    const N = Math.round(length / SPACING);
    const sp = length / N;
    const pts = curve.getSpacedPoints(N);
    const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
    const tx = new Float32Array(N), tz = new Float32Array(N), nx = new Float32Array(N), nz = new Float32Array(N);
    const hd = new Float32Array(N), curv = new Float32Array(N), slope = new Float32Array(N);
    const tunnel = new Uint8Array(N);
    for (let i = 0; i < N; i++) { px[i] = pts[i].x; py[i] = pts[i].y; pz[i] = pts[i].z; }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = px[b] - px[a], dz = pz[b] - pz[a];
      const l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l; tz[i] = dz / l;
      nx[i] = tz[i]; nz[i] = -tx[i];
      hd[i] = Math.atan2(tx[i], tz[i]);
      slope[i] = (py[b] - py[a]) / (2 * sp);
    }
    const rawC = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let dh = hd[(i + 1) % N] - hd[(i - 1 + N) % N];
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      rawC[i] = dh / (2 * sp);
    }
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -4; k <= 4; k++) s += rawC[(i + k + N) % N];
      curv[i] = s / 9;
    }
    // tunnels by control-point ranges
    const nearest = p => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < N; i++) { const d = (px[i] - p.x) ** 2 + (pz[i] - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
      return best;
    };
    for (const [a, b] of def.tunnels) {
      const i0 = nearest(ctrl[a]), i1 = nearest(ctrl[b]);
      for (let i = i0 + 8; i !== (i1 - 8 + N) % N; i = (i + 1) % N) tunnel[i] = 1;
    }
    Object.assign(track, { N, length, spacing: sp, px, py, pz, tx, tz, nx, nz, hd, curv, slope, tunnel });

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
      minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
      minY = Math.min(minY, py[i]);
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const baseY = minY - 0.3;
    track.bounds = { minX, maxX, minZ, maxZ, cx, cz };

    // --- spatial hash for keeping scenery off the road
    const CELL = 25, hash = new Map();
    const key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    for (let i = 0; i < N; i++) {
      const k = key(px[i], pz[i]);
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push(i);
    }
    function clearOf(x, z, r) {
      const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL);
      const c0z = Math.floor((z - r) / CELL), c1z = Math.floor((z + r) / CELL);
      for (let a = c0x; a <= c1x; a++) for (let b = c0z; b <= c1z; b++) {
        const list = hash.get(a + ',' + b);
        if (!list) continue;
        for (const i of list) if ((px[i] - x) ** 2 + (pz[i] - z) ** 2 < r * r) return false;
      }
      return true;
    }

    // --- ribbons along the track
    function ribbon(offA, offB, yA, yB, vLen, include) {
      const bld = new Builder();
      for (let i = 0; i < N; i++) {
        if (include && !include(i)) continue;
        const j = (i + 1) % N;
        const oa0 = offA(i), ob0 = offB(i), oa1 = offA(j), ob1 = offB(j);
        const v0 = (i * sp) / vLen, v1 = ((i + 1) * sp) / vLen;
        const a = bld.vert(px[i] + nx[i] * oa0, py[i] + yA(i), pz[i] + nz[i] * oa0, 0, v0);
        const b = bld.vert(px[i] + nx[i] * ob0, py[i] + yB(i), pz[i] + nz[i] * ob0, 1, v0);
        const c = bld.vert(px[j] + nx[j] * oa1, py[j] + yA(j), pz[j] + nz[j] * oa1, 0, v1);
        const d = bld.vert(px[j] + nx[j] * ob1, py[j] + yB(j), pz[j] + nz[j] * ob1, 1, v1);
        bld.quad(a, b, c, d);
      }
      return bld.geometry();
    }
    const K = v => () => v;
    function add(geo, mat, opts) {
      const m = new T.Mesh(geo, mat);
      if (opts && opts.order !== undefined) m.renderOrder = opts.order;
      group.add(m);
      disposables.push(geo, mat);
      return m;
    }
    const lambert = (o) => new T.MeshLambertMaterial(o);

    // road surface
    const roadTex = roadTexture(th, rand);
    const roadMat = th.wet
      ? new T.MeshPhongMaterial({ map: roadTex, specular: 0x8899aa, shininess: 60 })
      : lambert({ map: roadTex });
    add(ribbon(K(HW), K(-HW), K(0.02), K(0.02), 24), roadMat);
    // kerbs
    const kerbMat = lambert({ map: stripeTexture(th.kerb[0], th.kerb[1]) });
    add(ribbon(K(HW + KERB), K(HW), K(0.03), K(0.03), 4), kerbMat);
    add(ribbon(K(-HW), K(-HW - KERB), K(0.03), K(0.03), 4), kerbMat);
    // shoulders up to the wall
    const shoulderMat = lambert({ map: flatTexture(th.shoulder, 0.1, rand) });
    add(ribbon(K(WALL + 0.3), K(HW + KERB), K(0.01), K(0.01), 8), shoulderMat);
    add(ribbon(K(-HW - KERB), K(-WALL - 0.3), K(0.01), K(0.01), 8), shoulderMat);

    // embankments from the wall down to the ground plane (narrower on the inside of bends)
    const groundTex = flatTexture(th.ground, 0.12, rand);
    const groundMat = lambert({ map: groundTex });
    const sideWidth = (i, side) => {
      const c = curv[i] * side;      // > 0: this side is the inside of the bend
      return c > 0.002 ? Util.limit(0.7 / c - WALL, 2, 70) : 70;
    };
    const smoothW = side => {
      const raw = new Float32Array(N);
      for (let i = 0; i < N; i++) raw[i] = sideWidth(i, side);
      const out = new Float32Array(N);
      for (let i = 0; i < N; i++) { let m = Infinity; for (let k = -10; k <= 10; k++) m = Math.min(m, raw[(i + k + N) % N]); out[i] = m; }
      return out;
    };
    const wl = smoothW(1), wr = smoothW(-1);
    add(ribbon(i => WALL + 0.3 + wl[i], K(WALL + 0.3), i => baseY - py[i] + 0.05, K(0.01), 30), groundMat);
    // terrain height beside the road at lateral offset `off`
    const groundY = (i, off) => {
      const w = off > 0 ? wl[i] : wr[i];
      const f = Util.limit((Math.abs(off) - WALL - 0.3) / w, 0, 1);
      return py[i] + (baseY - py[i]) * f;
    };
    add(ribbon(K(-WALL - 0.3), i => -WALL - 0.3 - wr[i], K(0.01), i => baseY - py[i] + 0.05, 30), groundMat);

    // ground plane (+ ocean for the coast)
    const ext = Math.max(maxX - minX, maxZ - minZ) / 2 + (th.rain || th.night ? 900 : 140);
    const gp = new T.PlaneGeometry(ext * 2, ext * 2);
    gp.rotateX(-Math.PI / 2);
    gp.translate(cx, baseY, cz);
    const gTex = groundTex.clone(); gTex.needsUpdate = true; gTex.repeat.set(ext / 15, ext / 15);
    add(gp, lambert({ map: gTex }));
    if (def.theme === 'coast') {
      const op = new T.PlaneGeometry(9000, 9000);
      op.rotateX(-Math.PI / 2);
      op.translate(cx, baseY - 1.2, cz);
      add(op, new T.MeshPhongMaterial({ color: 0x3a4f9a, specular: 0xffb080, shininess: 40, emissive: 0x1a1240 }));
    }

    // barriers (not in tunnels)
    const wallMat = lambert({ map: wallTexture(th), side: T.DoubleSide, transparent: !!th.rail, alphaTest: th.rail ? 0.5 : 0 });
    const notTunnel = i => !tunnel[i];
    add(ribbon(K(WALL), K(WALL), K(0), K(th.wallH), 4, notTunnel), wallMat);
    add(ribbon(K(-WALL), K(-WALL), K(0), K(th.wallH), 4, notTunnel), wallMat);
    if (th.rail) {
      // guardrail posts
      const bld = new Builder();
      for (let i = 0; i < N; i += 2) for (const side of [1, -1]) {
        bld.box(px[i] + nx[i] * side * (WALL + 0.1), py[i], pz[i] + nz[i] * side * (WALL + 0.1), 0.15, th.wallH - 0.1, 0.15, hd[i], null, null);
      }
      add(bld.geometry(), lambert({ color: 0x55585f }));
    } else {
      // top cap of the wall so it reads as solid
      add(ribbon(K(WALL + 0.35), K(WALL), K(th.wallH), K(th.wallH), 4, notTunnel), lambert({ color: th.wall }));
      add(ribbon(K(-WALL), K(-WALL - 0.35), K(th.wallH), K(th.wallH), 4, notTunnel), lambert({ color: th.wall }));
    }

    // tunnels
    if (def.tunnels.length) {
      const tw = lambert({ color: th.tunnelWall, side: T.DoubleSide });
      const isT = i => !!tunnel[i];
      add(ribbon(K(WALL), K(WALL), K(0), K(TUNNEL_H), 4, isT), tw);
      add(ribbon(K(-WALL), K(-WALL), K(TUNNEL_H), K(0), 4, isT), tw);
      add(ribbon(K(-WALL), K(WALL), K(TUNNEL_H), K(TUNNEL_H), 4, isT), lambert({ color: 0x1c1a22, side: T.DoubleSide }));
      // neon trim and ceiling light strips
      const trim = new T.MeshBasicMaterial({ color: th.wallStripe, side: T.DoubleSide });
      add(ribbon(K(WALL - 0.02), K(WALL - 0.02), K(2.0), K(2.2), 4, isT), trim);
      add(ribbon(K(-WALL + 0.02), K(-WALL + 0.02), K(2.2), K(2.0), 4, isT), trim);
      const lightMat = new T.MeshBasicMaterial({ color: th.tunnelLight, side: T.DoubleSide });
      add(ribbon(K(-1.2), K(1.2), K(TUNNEL_H - 0.05), K(TUNNEL_H - 0.05), 4, i => tunnel[i] && i % 5 < 2), lightMat);
      // portals: façade blocks around each tunnel mouth
      const fac = new Builder(true);
      for (let i = 0; i < N; i++) {
        const prev = tunnel[(i - 1 + N) % N], cur = tunnel[i];
        if (prev === cur) continue;
        const k = cur ? i : (i - 1 + N) % N;
        const yaw = hd[k];
        const col = new T.Color(th.tunnelWall);
        const P = off => [px[k] + nx[k] * off, pz[k] + nz[k] * off];
        const [lx, lz] = P(WALL + 12), [rx, rz] = P(-WALL - 12), [mx, mz] = P(0);
        fac.box(lx, py[k], lz, 24, 16, 4, yaw, null, col);
        fac.box(rx, py[k], rz, 24, 16, 4, yaw, null, col);
        fac.box(mx, py[k] + TUNNEL_H, mz, WALL * 2, 16 - TUNNEL_H, 4, yaw, null, col);
      }
      add(fac.geometry(), lambert({ vertexColors: true }));
    }

    // start line and gantry
    {
      const g = new T.PlaneGeometry(HW * 2, 2);
      g.rotateX(-Math.PI / 2);
      g.rotateY(hd[0]);
      g.translate(px[0], py[0] + 0.04, pz[0]);
      add(g, new T.MeshBasicMaterial({ map: checkerTexture(), polygonOffset: true, polygonOffsetFactor: -2 }));
      const bld = new Builder();
      for (const side of [1, -1]) bld.box(px[0] + nx[0] * side * (WALL + 0.6), py[0], pz[0] + nz[0] * side * (WALL + 0.6), 0.8, 8.5, 0.8, hd[0]);
      add(bld.geometry(), lambert({ color: 0x2c2c34 }));
      const bg = new T.PlaneGeometry(WALL * 2 + 2, 2.2);
      const bm = new T.MeshBasicMaterial({ map: bannerTexture('START  ·  FINISH') });
      for (const flip of [Math.PI, 0]) {
        const mesh = add(bg, bm);
        mesh.position.set(px[0] + tx[0] * (flip ? -0.05 : 0.05), py[0] + 7.6, pz[0] + tz[0] * (flip ? -0.05 : 0.05));
        mesh.rotation.y = hd[0] + flip;
      }
    }

    // ------------------------------------------------------- scenery
    const placeAlong = (step, fn) => {
      for (let i = 0; i < N; i += step) { if (!tunnel[i]) fn(i); }
    };
    const at = (i, d) => [px[i] + nx[i] * d, pz[i] + nz[i] * d];

    // street lamps with light pools
    if (th.lamp) {
      const poles = new Builder(), heads = new Builder(), pools = new Builder();
      const glowPos = [];
      placeAlong(Math.round(42 / sp), i => {
        for (const side of [1, -1]) {
          const [x, z] = at(i, side * (WALL + 0.7));
          const y = py[i];
          poles.box(x, y, z, 0.25, 9, 0.25, hd[i]);
          const [ax, az] = at(i, side * (WALL - 0.6));
          poles.box(ax, y + 8.8, az, 2.8, 0.18, 0.18, hd[i] + Math.PI / 2);
          const [hx, hz] = at(i, side * (WALL - 2.0));
          heads.box(hx, y + 8.55, hz, 0.5, 0.2, 1.1, hd[i]);
          glowPos.push(hx, y + 8.4, hz);
          // light pool on the road
          const r = th.wet ? 9 : 7;
          const a = pools.vert(hx - r, y + 0.06, hz - r, 0, 0), b = pools.vert(hx + r, y + 0.06, hz - r, 1, 0);
          const c = pools.vert(hx - r, y + 0.06, hz + r, 0, 1), d = pools.vert(hx + r, y + 0.06, hz + r, 1, 1);
          pools.quad(a, c, b, d);
        }
      });
      add(poles.geometry(), lambert({ color: 0x2b2b33 }));
      add(heads.geometry(), new T.MeshBasicMaterial({ color: th.lamp }));
      add(pools.geometry(), new T.MeshBasicMaterial({
        map: CarModels.glowTexture(), color: th.lamp, transparent: true, opacity: th.wet ? 0.5 : 0.38,
        blending: T.AdditiveBlending, depthWrite: false,
      }), { order: 2 });
      const gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.Float32BufferAttribute(glowPos, 3));
      const pm = new T.PointsMaterial({ map: CarModels.glowTexture(), color: th.lamp, size: 7, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
      const pts3 = new T.Points(gg, pm);
      group.add(pts3); disposables.push(gg, pm);
    }

    // buildings (city + harbor warehouses + coast hotels)
    {
      const bld = new Builder(true);
      const signs = new Builder();
      const facade = facadeTexture(th, rand);
      const words = def.theme === 'city' ? ['NITRO', 'CLUB', 'HOTEL', 'TURBO', 'DINER', 'PARTS'] : ['DOCK 7', 'CARGO', 'NITRO', 'GARAGE'];
      const signTex = signAtlas(words, th.neon);
      const step = def.theme === 'city' ? 9 : def.theme === 'harbor' ? 16 : 38;
      placeAlong(step, i => {
        for (const side of [1, -1]) {
          if (def.theme === 'coast' && rand() < 0.5) continue;
          const wdt = 14 + rand() * 16, dep = 12 + rand() * 18;
          const gap = def.theme === 'city' ? 5 + rand() * 6 : def.theme === 'harbor' ? 30 + rand() * 40 : 45 + rand() * 60;
          const off = side * (WALL + gap + dep / 2);
          const [x, z] = at(i, off);
          if (!clearOf(x, z, Math.max(wdt, dep) * 0.75 + WALL + 2)) continue;
          const hgt = def.theme === 'city' ? 18 + Math.pow(rand(), 1.6) * 90 : def.theme === 'harbor' ? 10 + rand() * 14 : 12 + rand() * 30;
          const tint = 0.6 + rand() * 0.5;
          const col = new T.Color(tint, tint * (0.9 + rand() * 0.15), tint * (0.95 + rand() * 0.1));
          bld.box(x, baseY, z, wdt, hgt + (py[i] - baseY), dep, hd[i], { su: 1 / 16, sv: 1 / 16, ou: Math.floor(rand() * 4) / 4, ov: Math.floor(rand() * 4) / 4 }, col);
          // neon sign facing the road
          if (th.night && rand() < 0.35) {
            const row = Math.floor(rand() * words.length);
            const sw = Math.min(wdt * 0.8, 10), sh = sw / 4;
            const facing = side > 0 ? -1 : 1;     // toward the road
            const [fx, fz] = at(i, off + facing * (dep / 2 + 0.15));
            const sy = py[i] + 6 + rand() * 8;
            const ux = tx[i] * sw / 2, uz = tz[i] * sw / 2;
            const v0 = 1 - (row + 1) / words.length, v1 = 1 - row / words.length;
            const s1 = side > 0 ? 1 : -1;
            const a = signs.vert(fx - ux * s1, sy, fz - uz * s1, 0, v0), b = signs.vert(fx + ux * s1, sy, fz + uz * s1, 1, v0);
            const c = signs.vert(fx - ux * s1, sy + sh, fz - uz * s1, 0, v1), d = signs.vert(fx + ux * s1, sy + sh, fz + uz * s1, 1, v1);
            signs.quad(a, b, c, d);
          }
        }
      });
      const facadeMat = th.night ? new T.MeshBasicMaterial({ map: facade, vertexColors: true }) : lambert({ map: facade, vertexColors: true });
      add(bld.geometry(), facadeMat);
      if (signs.idx.length) add(signs.geometry(), new T.MeshBasicMaterial({ map: signTex, side: T.DoubleSide }));
    }

    // distant skyline ring (city / harbor)
    if (th.night) {
      const bld = new Builder(true);
      const facade = facadeTexture(th, rand);
      const R0 = Math.max(maxX - minX, maxZ - minZ) / 2 + 500;
      for (let k = 0; k < 140; k++) {
        const a = rand() * Math.PI * 2, r = R0 + rand() * 600;
        const w = 30 + rand() * 50, h = 50 + Math.pow(rand(), 1.5) * (def.theme === 'city' ? 260 : 120);
        const t0 = 0.35 + rand() * 0.25;
        bld.box(cx + Math.sin(a) * r, baseY, cz + Math.cos(a) * r, w, h, w, a, { su: 1 / 16, sv: 1 / 16, ou: 0, ov: 0 }, new T.Color(t0, t0, t0 * 1.1));
      }
      add(bld.geometry(), new T.MeshBasicMaterial({ map: facade, vertexColors: true, fog: false }));
    }

    // coast: palms, rocks, mountains
    if (def.theme === 'coast') {
      const trunk = [], leaves = [];
      const tb = new Builder(), lb = new Builder();
      // template palm built at origin
      for (let k = 0; k < 6; k++) {
        const y0 = k * 1.5, lean = k * k * 0.04;
        tb.box(lean, y0, 0, 0.45 - k * 0.04, 1.55, 0.45 - k * 0.04, 0);
      }
      const topX = 25 * 0.04, topY = 9;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const cs = Math.cos(a), sn = Math.sin(a);
        for (let s = 0; s < 3; s++) {
          const r0 = s * 1.3, r1 = (s + 1) * 1.3;
          const y0 = topY - s * s * 0.35, y1 = topY - (s + 1) * (s + 1) * 0.35;
          const w0 = 0.55 - s * 0.15, w1 = 0.4 - s * 0.12;
          const P = (r, w, y) => [topX + cs * r - sn * w, y, sn * r + cs * w];
          const v = [P(r0, -w0, y0), P(r0, w0, y0), P(r1, -w1, y1), P(r1, w1, y1)].map(p => lb.vert(p[0], p[1], p[2], 0, 0));
          lb.quad(v[0], v[1], v[2], v[3]);
        }
      }
      const trunkGeo = tb.geometry(), leafGeo = lb.geometry();
      const spots = [];
      placeAlong(6, i => {
        for (const side of [1, -1]) {
          if (rand() < 0.45) continue;
          const off = side * (WALL + 3 + rand() * 30);
          const [x, z] = at(i, off);
          if (!clearOf(x, z, WALL + 2)) continue;
          spots.push([x, groundY(i, off) - 0.2, z, 0.8 + rand() * 0.6, rand() * Math.PI * 2]);
        }
      });
      const trunkMesh = new T.InstancedMesh(trunkGeo, lambert({ color: 0x7a5534 }), spots.length);
      const leafMesh = new T.InstancedMesh(leafGeo, lambert({ color: 0x2f7a35, side: T.DoubleSide }), spots.length);
      const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3();
      spots.forEach(([x, y, z, s, r], k) => {
        q.setFromAxisAngle(new T.Vector3(0, 1, 0), r);
        m4.compose(ps.set(x, y, z), q, sc.set(s, s, s));
        trunkMesh.setMatrixAt(k, m4); leafMesh.setMatrixAt(k, m4);
      });
      group.add(trunkMesh, leafMesh);
      disposables.push(trunkGeo, leafGeo, trunkMesh.material, leafMesh.material);

      const rockGeo = new T.DodecahedronGeometry(1, 0);
      const rocks = [];
      placeAlong(9, i => {
        const side = rand() < 0.5 ? 1 : -1;
        const off = side * (WALL + 2 + rand() * 40);
        const [x, z] = at(i, off);
        if (clearOf(x, z, WALL + 2)) rocks.push([x, groundY(i, off) + (rand() - 0.7) * 1.5, z, 0.8 + rand() * 2.5, rand() * 6]);
      });
      const rockMesh = new T.InstancedMesh(rockGeo, lambert({ color: 0x8a6e5c, flatShading: true }), rocks.length);
      rocks.forEach(([x, y, z, s, r], k) => {
        q.setFromAxisAngle(new T.Vector3(0.3, 1, 0.2).normalize(), r);
        m4.compose(ps.set(x, y, z), q, sc.set(s * 1.4, s, s * 1.2));
        rockMesh.setMatrixAt(k, m4);
      });
      group.add(rockMesh); disposables.push(rockGeo, rockMesh.material);

      // mountains on the horizon
      const mb = new Builder(true);
      const mg = [];
      for (let k = 0; k < 26; k++) {
        const a = (k / 26) * Math.PI * 2 + rand() * 0.2;
        const r = 2000 + rand() * 500, h = 150 + rand() * 300, rad = 250 + rand() * 300;
        const cone = new T.ConeGeometry(rad, h, 7);
        cone.translate(cx + Math.sin(a) * r, baseY + h / 2 - 10, cz + Math.cos(a) * r);
        mg.push(cone);
      }
      const mountains = CarModels.merge(mg);
      add(mountains, new T.MeshBasicMaterial({ color: 0x6a4078, fog: false }));
    }

    // harbor: containers and cranes
    if (def.theme === 'harbor') {
      const cb = new Builder(true);
      const cols = ['#b5422c', '#2c6bb5', '#2f8f5b', '#c9a227', '#7a3fb5', '#5d6670', '#d06a1f'].map(c => new T.Color(c));
      placeAlong(7, i => {
        for (const side of [1, -1]) {
          if (rand() < 0.35) continue;
          const off = side * (WALL + 4 + rand() * 26);
          const [x, z] = at(i, off);
          if (!clearOf(x, z, WALL + 8)) continue;
          const stack = 1 + Math.floor(rand() * 3);
          const yaw = hd[i] + (rand() < 0.3 ? Math.PI / 2 : 0);
          for (let s = 0; s < stack; s++) {
            cb.box(x, py[i] + s * 2.6, z, 2.45, 2.6, 12, yaw, { su: 1 / 3, sv: 1 / 2.6, ou: 0, ov: 0 }, cols[Math.floor(rand() * cols.length)]);
          }
        }
      });
      add(cb.geometry(), lambert({ map: containerTexture(), vertexColors: true }));

      const crane = new Builder(true);
      const lights = [];
      placeAlong(Math.round(160 / sp), i => {
        const side = rand() < 0.5 ? 1 : -1;
        const [x, z] = at(i, side * (WALL + 45 + rand() * 30));
        if (!clearOf(x, z, WALL + 30)) return;
        const col = new T.Color(rand() < 0.5 ? '#d8b22c' : '#c8402c');
        const yaw = hd[i];
        const cs = Math.cos(yaw), sn = Math.sin(yaw);
        const L = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
        for (const [lx, lz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
          const [qx, qz] = L(lx, lz);
          crane.box(qx, baseY, qz, 1.2, 38, 1.2, yaw, null, col);
        }
        const [bx, bz] = L(0, 0);
        crane.box(bx, baseY + 36, bz, 60, 3, 3, yaw + Math.PI / 2, null, col);
        crane.box(bx, baseY + 30, bz, 14, 2, 14, yaw, null, col);
        lights.push(bx, baseY + 40, bz);
      });
      add(crane.geometry(), lambert({ vertexColors: true }));
      if (lights.length) {
        const lg = new T.BufferGeometry();
        lg.setAttribute('position', new T.Float32BufferAttribute(lights, 3));
        const lm = new T.PointsMaterial({ map: CarModels.glowTexture(), color: 0xff2020, size: 10, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
        const p = new T.Points(lg, lm);
        group.add(p); disposables.push(lg, lm);
        track.blinkers = p;
      }
    }

    // ---------------------------------------------------------- sky
    {
      const R = 3200;
      const sg = new T.SphereGeometry(R, 32, 16);
      const top = new T.Color(th.skyTop), hor = new T.Color(th.skyHorizon);
      const colors = [];
      const pos = sg.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const t = Util.limit(pos.getY(i) / R, -1, 1);
        const c = t > 0 ? hor.clone().lerp(top, Math.pow(t, 0.55)) : hor.clone().multiplyScalar(0.7);
        colors.push(c.r, c.g, c.b);
      }
      sg.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      const sky = add(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }), { order: -10 });
      track.sky = sky;
      if (th.night && !th.rain) {
        const st = [];
        for (let i = 0; i < 900; i++) {
          const a = rand() * Math.PI * 2, e = Math.asin(0.08 + rand() * 0.9);
          st.push(Math.cos(e) * Math.sin(a) * 3000, Math.sin(e) * 3000, Math.cos(e) * Math.cos(a) * 3000);
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(st, 3));
        const m = new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 });
        const stars = new T.Points(g, m);
        sky.add(stars); disposables.push(g, m);
        const moon = new T.Sprite(new T.SpriteMaterial({ map: CarModels.glowTexture(), color: 0xf4ecd6, fog: false, depthWrite: false }));
        moon.position.set(-1400, 1100, 2200); moon.scale.set(260, 260, 1);
        sky.add(moon);
      }
      if (def.theme === 'coast') {
        const dir = new T.Vector3(...th.sun.dir).normalize();
        const glow = new T.Sprite(new T.SpriteMaterial({ map: CarModels.glowTexture(), color: 0xffb070, fog: false, depthWrite: false, blending: T.AdditiveBlending }));
        glow.position.copy(dir.clone().multiplyScalar(3000)); glow.scale.set(1800, 1800, 1);
        const disc = new T.Sprite(new T.SpriteMaterial({ map: CarModels.glowTexture(), color: 0xfff0c0, fog: false, depthWrite: false }));
        disc.position.copy(dir.clone().multiplyScalar(2950)); disc.scale.set(420, 420, 1);
        sky.add(glow, disc);
      }
    }

    // ---------------------------------------------------------- lighting
    const hemi = new T.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]);
    const sun = new T.DirectionalLight(th.sun.color, th.sun.intensity);
    sun.position.set(...th.sun.dir).multiplyScalar(100);
    group.add(hemi, sun);
    track.hemi = hemi;
    track.fog = new T.Fog(th.fog, th.fogNear, th.fogFar);

    // ---------------------------------------------------------- minimap
    const span = Math.max(maxX - minX, maxZ - minZ) || 1;
    track.map = [];
    for (let i = 0; i < N; i++) track.map.push({ x: (px[i] - cx) / span, y: -(pz[i] - cz) / span });

    // ---------------------------------------------------------- queries
    const wrap = s => ((s % length) + length) % length;
    track.wrap = wrap;
    track.sampleAt = (s, out) => {
      s = wrap(s);
      const f = s / sp, i = Math.floor(f) % N, j = (i + 1) % N, t = f - Math.floor(f);
      out = out || {};
      out.x = px[i] + (px[j] - px[i]) * t;
      out.y = py[i] + (py[j] - py[i]) * t;
      out.z = pz[i] + (pz[j] - pz[i]) * t;
      out.tx = tx[i] + (tx[j] - tx[i]) * t;
      out.tz = tz[i] + (tz[j] - tz[i]) * t;
      const l = Math.hypot(out.tx, out.tz) || 1;
      out.tx /= l; out.tz /= l;
      out.nx = out.tz; out.nz = -out.tx;
      out.h = Math.atan2(out.tx, out.tz);
      out.slope = slope[i];
      out.curv = curv[i];
      out.tunnel = !!tunnel[i];
      out.i = i;
      return out;
    };
    // nearest sample to a world point, searching around a hint index
    track.project = (x, z, hint, out) => {
      out = out || {};
      let best = -1, bd = Infinity;
      const scan = (a, b) => {
        for (let k = a; k <= b; k++) {
          const i = ((k % N) + N) % N;
          const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      };
      if (hint === undefined || hint < 0) scan(0, N - 1);
      else { scan(hint - 25, hint + 25); if (bd > 30 * 30) scan(0, N - 1); }
      const i = best;
      const dx = x - px[i], dz = z - pz[i];
      out.i = i;
      out.s = wrap(i * sp + dx * tx[i] + dz * tz[i]);
      out.d = dx * nx[i] + dz * nz[i];
      return out;
    };
    // tightest curvature over the next `dist` metres
    track.curvAhead = (s, dist) => {
      const i0 = Math.floor(wrap(s) / sp), n = Math.max(1, Math.round(dist / sp));
      let m = 0, sign = 0;
      for (let k = 0; k < n; k += 2) {
        const c = curv[(i0 + k) % N];
        if (Math.abs(c) > m) { m = Math.abs(c); sign = Math.sign(c); }
      }
      return { mag: m, sign };
    };
    track.isTunnel = s => !!tunnel[Math.floor(wrap(s) / sp) % N];

    track.dispose = () => {
      disposables.forEach(d => d.dispose && d.dispose());
      group.traverse(o => { if (o.material && o.material.map) o.material.map.dispose(); });
    };
    return track;
  }

  return { THEMES, DEFS, build, HW, WALL, KERB, TUNNEL_H };
})();
