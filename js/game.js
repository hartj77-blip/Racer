// Nitro Rush - a pseudo-3D street racer.
(() => {
  const { SEG, ROAD_W, CAM_H, DRAW_DIST, FOG_DENSITY, LANES, TUNNEL_H, TUNNEL_X, BARRIER_X } = Config;
  const CAM_DEPTH = 1 / Math.tan((Config.FOV / 2) * Math.PI / 180);
  const PLAYER_Z = CAM_H * CAM_DEPTH;
  const STEP = 1 / 60;
  const BASE_MAX = (SEG / STEP) * 0.8;   // reference top speed (world units/s)
  const CENTRIFUGAL = 0.3;
  const NITRO_MULT = 1.35;
  const CAR_W = 560;
  const CAR_NW = CAR_W / ROAD_W;          // car width in road-normalised units
  const KMH = 260;                        // display km/h at BASE_MAX
  const METERS = 40;                      // world units per metre (for the HUD)
  const YAWS = [-1, -0.5, 0, 0.5, 1];     // pre-rendered car rotations

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 1280, H = 720;
  canvas.width = W; canvas.height = H;

  const CARS = [
    { id: 'vortex', name: 'Vortex GT', color: '#1e7bff', stripe: '#ffffff', top: 0.95, accel: 1.0, handling: 1.0, desc: 'Balanced all-rounder' },
    { id: 'kestrel', name: 'Kestrel S', color: '#ffc400', stripe: '#1a1a1a', top: 0.91, accel: 1.25, handling: 1.2, desc: 'Quick & nimble' },
    { id: 'raptor', name: 'Raptor RS', color: '#e8202a', stripe: '#111111', top: 1.0, accel: 0.85, handling: 0.88, desc: 'Highest top speed' },
  ];
  const carById = id => CARS.find(c => c.id === id) || CARS[0];

  const RIVALS = [
    { name: 'Razor', color: '#1b1b1f', stripe: '#39ff14', tag: '#39ff14', skill: 0.97 },
    { name: 'Nyx', color: '#7b2ff7', stripe: '#ffffff', tag: '#b98bff', skill: 0.94 },
    { name: 'Blaze', color: '#ff6a00', stripe: '#111111', tag: '#ff9a40', skill: 0.91 },
  ];

  const TRAFFIC_COLORS = ['#c0c4cc', '#6d7480', '#2f4a7a', '#7a2f2f', '#e8e1d0', '#3d6b4a', '#d9c45c', '#4a4a52', '#8a5a9c'];

  // ------------------------------------------------------------ sprites
  const S = { players: {}, rivals: [], traffic: [], cop: [] };
  const themeCache = {};
  const bgCache = {};

  function withW(sprite, worldW) { sprite.worldW = worldW; return sprite; }

  // Five yaw variants (and optional brake-light variants) of one car
  function carSet(opts, worldW, withBrake) {
    const make = extra => YAWS.map(yaw => {
      const sp = Sprites.car(Object.assign({}, opts, extra, { yaw }));
      sp.worldW = worldW * sp.w / 200;
      return sp;
    });
    const set = { normal: make({}) };
    if (withBrake) set.brake = make({ brake: true });
    return set;
  }

  function buildCarSprites() {
    CARS.forEach(c => {
      S.players[c.id] = carSet({ type: 'sport', color: c.color, stripe: c.stripe, spoiler: true }, CAR_W, true);
    });
    S.rivals = RIVALS.map(r => carSet({ type: 'sport', color: r.color, stripe: r.stripe, spoiler: true }, CAR_W, true));
    S.traffic = TRAFFIC_COLORS.map((col, i) => {
      const van = i % 3 === 2;
      const set = carSet({ type: van ? 'van' : 'sedan', color: col }, van ? 620 : CAR_W, false);
      set.width = (van ? 620 : CAR_W) / ROAD_W;
      return set;
    });
    S.cop = [0, 1].map(f => carSet({ type: 'cop', color: '#f4f4f4', frame: f }, CAR_W, false));
    S.glowRed = Sprites.glow('255,40,40');
    S.glowWarm = Sprites.glow('255,214,150');
    S.glowBlue = Sprites.glow('60,110,255');
    S.glowOrange = Sprites.glow('255,150,40');
  }

  function getThemeSprites(name) {
    if (themeCache[name]) return themeCache[name];
    const pal = THEMES[name];
    const rand = Util.rng(name.length * 7 + 3);
    const t = {
      lampL: withW(Sprites.lamp(-1, pal.lampGlow), 480),
      lampR: withW(Sprites.lamp(1, pal.lampGlow), 480),
      chevronL: withW(Sprites.chevron(-1), 420),
      chevronR: withW(Sprites.chevron(1), 420),
      banner: withW(Sprites.banner('START  ·  FINISH'), ROAD_W * 2.4),
      buildings: [],
      billboards: [
        withW(Sprites.billboard('NITRO', 'FUEL YOUR RUSH', '#00e5ff'), 1900),
        withW(Sprites.billboard('TURBO', 'PARTS & TUNING', '#ff2e88'), 1900),
        withW(Sprites.billboard('RACE', 'NIGHTLY · NO RULES', '#b2ff59'), 1900),
      ],
      palms: [], containers: [], cranes: [],
      rock: withW(Sprites.rock(rand), 900),
      bush: withW(Sprites.bush(rand), 700),
    };
    for (let i = 0; i < 10; i++) t.buildings.push(withW(Sprites.building(rand, pal), 2400));
    if (name === 'coast') for (let i = 0; i < 4; i++) t.palms.push(withW(Sprites.palm(rand), 1100));
    if (name === 'harbor') {
      for (let i = 0; i < 6; i++) t.containers.push(withW(Sprites.containers(rand), 2300));
      for (let i = 0; i < 3; i++) t.cranes.push(withW(Sprites.crane(rand), 3600));
    }
    themeCache[name] = t;
    return t;
  }

  function getBackground(name) {
    if (bgCache[name]) return bgCache[name];
    const pal = THEMES[name];
    const rand = Util.rng(name.length * 13 + 5);
    const sky = Sprites.makeCanvas(W, H);
    const g = sky.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H / 2);
    pal.sky.forEach(([o, c]) => grd.addColorStop(o, c));
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    let far, near;
    if (name === 'city') {
      for (let i = 0; i < 220; i++) {
        g.fillStyle = 'rgba(255,255,255,' + (0.2 + rand() * 0.7) + ')';
        const s = rand() < 0.1 ? 2 : 1;
        g.fillRect(rand() * W, rand() * H * 0.42, s, s);
      }
      g.fillStyle = '#f4ecd6';
      g.beginPath(); g.arc(W * 0.78, H * 0.13, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(244,236,214,0.08)';
      g.beginPath(); g.arc(W * 0.78, H * 0.13, 60, 0, Math.PI * 2); g.fill();
      far = Sprites.skyline(2048, 230, rand, pal, 0);
      near = Sprites.skyline(2048, 170, rand, pal, 1);
    } else if (name === 'coast') {
      const sx = W * 0.5, sy = H * 0.43;
      const sg = g.createRadialGradient(sx, sy, 10, sx, sy, 220);
      sg.addColorStop(0, 'rgba(255,240,180,0.9)');
      sg.addColorStop(0.3, 'rgba(255,170,90,0.35)');
      sg.addColorStop(1, 'rgba(255,120,80,0)');
      g.fillStyle = sg; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffe9a8';
      g.beginPath(); g.arc(sx, sy, 70, 0, Math.PI * 2); g.fill();
      const og = g.createLinearGradient(0, H * 0.46, 0, H * 0.56);
      og.addColorStop(0, '#5b3b78'); og.addColorStop(1, '#2a2050');
      g.fillStyle = og; g.fillRect(0, H * 0.46, W, H * 0.54);
      g.fillStyle = 'rgba(255,220,150,0.5)';
      for (let i = 0; i < 14; i++) {
        const y = H * 0.465 + i * 5;
        const w = 140 - i * 6 + rand() * 30;
        g.fillRect(sx - w / 2, y, w, 2);
      }
      far = Sprites.mountains(2048, 150, rand, '#7a3a7a', '#4a2a5e', 0.5);
      near = Sprites.mountains(2048, 110, rand, '#3e2a52', '#2a1d3a', 1);
    } else {
      // storm clouds
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(' + (40 + rand() * 30) + ',' + (50 + rand() * 30) + ',' + (70 + rand() * 30) + ',0.25)';
        g.beginPath();
        g.ellipse(rand() * W, rand() * H * 0.32, 120 + rand() * 200, 20 + rand() * 30, 0, 0, Math.PI * 2);
        g.fill();
      }
      far = Sprites.skyline(2048, 200, rand, pal, 0);
      near = Sprites.harborLayer(2048, 190, rand);
    }
    bgCache[name] = { sky, far, near };
    return bgCache[name];
  }

  // -------------------------------------------------------------- state
  let state = 'menu';            // menu | countdown | race | finished | busted
  let paused = false;
  let career = Career.load();
  const quick = { track: TRACKS[0], car: CARS[0], laps: 3, cops: true };
  let race = null;               // active race configuration
  let segments = [], trackLength = 0, theme = null, bg = null, trackMap = null;
  let cars = [], rivals = [], cop = null;
  let skyOffset = 0, hillOffset = 0;
  let countdown = 0, lastCount = 0;
  let particles = [];
  let clock = 0;
  let flash = 0, nextLightning = 8;
  let resultTimer = null;
  const input = { left: false, right: false, up: false, down: false, nitro: false };
  let P = {};

  function findSegment(z) {
    return segments[Math.floor(z / SEG) % segments.length];
  }

  function mod(z) { return ((z % trackLength) + trackLength) % trackLength; }

  function playerDist() { return P.lap * trackLength + P.position; }

  function quickRace() {
    return {
      mode: 'quick', type: 'circuit', trackDef: quick.track, carDef: quick.car,
      stats: Career.stats(quick.car, null), laps: quick.laps, cops: quick.cops,
      rivals: true, skillMul: 1, copBoost: 1, traffic: 1,
    };
  }

  function careerRace(ev) {
    const carDef = carById(career.car);
    return {
      mode: 'career', event: ev, type: ev.type, trackDef: TRACKS.find(t => t.id === ev.track), carDef,
      stats: Career.stats(carDef, career.upgrades[carDef.id]), laps: ev.laps,
      cops: ev.type === 'pursuit' || !!ev.cops, rivals: ev.type === 'circuit',
      skillMul: ev.skill ? ev.skill / 0.94 : 1, copBoost: ev.copBoost || 1,
      traffic: ev.type === 'drift' ? 0.5 : 1,
    };
  }

  function setupRace(cfg, attract) {
    race = cfg;
    const track = Track.build(cfg.trackDef);
    segments = track.segments;
    trackLength = track.trackLength;
    theme = track.theme;
    trackMap = track.map;
    bg = getBackground(cfg.trackDef.theme);
    const startIndex = findSegment(PLAYER_Z).index;
    Track.decorate(track, cfg.trackDef, getThemeSprites(cfg.trackDef.theme), startIndex);
    buildMinimap();

    P = {
      position: 0, x: attract ? 0 : 0.5, speed: 0, lap: 0, maxLap: 0,
      lapTime: 0, lastLap: null, bestLap: null, raceTime: 0,
      nitro: 0.6, nitroOn: false, heat: 0, place: cfg.rivals ? 4 : 1, finished: false,
      finishTime: null, hitCooldown: 0, braking: false, lean: 0, offroad: false,
      bust: 0, evade: 0, copCooldown: 20, shake: 0, screen: null, nearMisses: 0,
      steer: 0, steerSmooth: 0, yawVis: 0,
      drift: false, driftDir: 0, slip: 0, driftTime: 0, driftPts: 0, driftMult: 1, driftTotal: 0, driftBest: 0,
      launchRpm: 0.15, spin: 0, gear: 1, backfire: 0, scraping: false, maxSpeed: 0,
    };
    if (cfg.type === 'pursuit' && !attract) { P.heat = 3; P.copCooldown = 2.5; }
    cars = []; particles = []; cop = null;
    skyOffset = 0; hillOffset = 0;
    flash = 0; nextLightning = 6 + Math.random() * 6;

    rivals = [];
    if (cfg.rivals || attract) {
      const grid = [[9, -0.5], [6, 0.5], [3, -0.5]];
      rivals = RIVALS.map((r, i) => ({
        kind: 'rival', name: r.name, idx: i, skill: r.skill * cfg.skillMul,
        set: S.rivals[i], offset: grid[i][1], dist: grid[i][0] * SEG, z: 0,
        speed: 0, w: CAR_NW, steer: 1.6, finished: false, finishTime: null,
        wobble: Math.random() * 10, lat: 0, braking: false,
      }));
      rivals.forEach(r => { r.z = mod(PLAYER_Z + r.dist); cars.push(r); });
    }

    const lanes = [-2 / 3, 0, 2 / 3];
    const laneSpeed = [0.44, 0.36, 0.28];
    const count = Math.round(cfg.trackDef.traffic * cfg.traffic);
    for (let i = 0; i < count; i++) {
      const lane = Math.floor(Math.random() * 3);
      const set = S.traffic[Math.floor(Math.random() * S.traffic.length)];
      const base = BASE_MAX * (laneSpeed[lane] + (Math.random() - 0.5) * 0.04);
      cars.push({
        kind: 'traffic', set, w: set.width,
        offset: lanes[lane] + (Math.random() - 0.5) * 0.1,
        z: (40 + Math.random() * (segments.length - 60)) * SEG,
        speed: base, baseSpeed: base, lat: 0,
      });
    }
    cars.forEach(c => { c.seg = findSegment(c.z); c.seg.cars.push(c); });
  }

  // -------------------------------------------------------------- update
  function update(dt) {
    clock += dt;
    if (state === 'countdown') { updateCountdown(dt); return; }

    const playerSeg = findSegment(P.position + PLAYER_Z);
    const racing = state === 'race';
    const st = race.stats;

    if (state === 'busted') P.speed = Math.max(0, P.speed - BASE_MAX * dt);

    const maxSpeed = BASE_MAX * st.top;
    const speedPct = P.speed / BASE_MAX;
    const dx = dt * 2 * speedPct * st.handling;

    updateCars(dt, playerSeg);

    let steer = 0, throttle = false, brake = false, nos = false;
    if (racing) {
      steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      throttle = input.up; brake = input.down; nos = input.nitro;
    } else if (state !== 'busted') {
      // autopilot for the attract mode / cool-down lap
      steer = Util.limit(-P.x * 3 + playerSeg.curve * 0.12, -1, 1);
      throttle = P.speed < BASE_MAX * 0.6;
    }
    P.steer = steer;
    P.steerSmooth = Util.interpolate(P.steerSmooth, steer, 0.12);

    movePlayer(Util.increase(P.position, dt * P.speed, trackLength));
    if (state !== 'race' && racing) return;   // race just ended this frame

    if (racing) updateDrift(dt, steer, brake, speedPct, playerSeg);

    // steering + centrifugal drift through corners
    let cf = CENTRIFUGAL;
    if (P.drift && Math.sign(playerSeg.curve) === P.driftDir) cf *= 1 - 0.75 * P.slip;
    P.x += steer * dx * (P.drift ? 1.15 : 1);
    if (P.drift) P.x += P.driftDir * dx * 0.45 * P.slip;
    P.x -= dx * speedPct * playerSeg.curve * cf;

    // nitro
    P.nitroOn = nos && P.nitro > 0 && P.speed > BASE_MAX * 0.15;
    if (P.nitroOn) {
      if (!P.wasNitro) Sound.whoosh();
      P.nitro = Math.max(0, P.nitro - dt / (4.5 * st.nitroCap));
    } else if (racing) {
      P.nitro = Math.min(1, P.nitro + dt * 0.012);
    }
    P.wasNitro = P.nitroOn;

    const topSpeed = maxSpeed * (P.nitroOn ? NITRO_MULT : 1);
    let accel = (maxSpeed / 5) * st.accel * (P.nitroOn ? 2.2 : 1);
    if (P.spin > 0) { P.spin -= dt; accel *= 0.15; }
    P.braking = brake && !P.drift;
    if (P.drift) {
      if (throttle || P.nitroOn) { if (P.speed < topSpeed * 0.97) P.speed += accel * 0.7 * dt; }
      if (brake) P.speed -= BASE_MAX * 0.25 * dt;
      P.speed -= BASE_MAX * 0.07 * P.slip * dt;
    } else if (throttle || P.nitroOn) {
      if (P.speed < topSpeed) P.speed += accel * dt * (1 - 0.55 * Math.pow(P.speed / topSpeed, 2));
    } else if (brake) {
      P.speed -= BASE_MAX * dt;
    } else {
      P.speed -= (BASE_MAX / 5) * dt;
    }
    if (P.speed > topSpeed) P.speed = Math.max(topSpeed, P.speed - (BASE_MAX / 3) * dt);

    // tunnel walls and roadside barriers
    const wallX = playerSeg.tunnel ? TUNNEL_X : playerSeg.barrier ? BARRIER_X : 0;
    const wasScraping = P.scraping;
    P.scraping = false;
    if (wallX) {
      const lim = wallX - CAR_NW / 2 - 0.02;
      if (Math.abs(P.x) > lim) {
        const side = Math.sign(P.x);
        P.x = side * lim;
        if (P.speed > BASE_MAX * 0.15) {
          P.scraping = true;
          P.speed -= BASE_MAX * 0.45 * dt;
          if (Math.random() < 0.7) sparks(2, side);
          if (!wasScraping && racing) { Sound.crash(0.3); P.shake = Math.max(P.shake, 0.3); }
          if (P.drift) endDrift(false);
        }
      }
    }

    P.offroad = Math.abs(P.x) > 1;
    if (P.offroad && P.speed > BASE_MAX / 4) P.speed -= (BASE_MAX / 2) * dt;

    if (P.hitCooldown > 0) P.hitCooldown -= dt;
    if (racing) collide(playerSeg);

    P.x = Util.limit(P.x, -2, 2);
    P.speed = Util.limit(P.speed, 0, maxSpeed * NITRO_MULT);
    P.maxSpeed = Math.max(P.maxSpeed, P.speed);

    if (racing) {
      P.raceTime += dt;
      P.lapTime += dt;
      nearMisses();
      if (race.rivals) updatePlace();
      if (race.cops) updateHeat(dt);
    }

    const travelled = dt * P.speed / SEG;
    skyOffset = Util.increase(skyOffset, 0.001 * playerSeg.curve * travelled, 1);
    hillOffset = Util.increase(hillOffset, 0.002 * playerSeg.curve * travelled, 1);

    // gear changes: exhaust pops on upshift
    const g = gearInfo();
    if (g.gear > P.gear && (throttle || P.nitroOn) && racing) { Sound.pop(); P.backfire = 0.14; }
    P.gear = g.gear;
    if (P.backfire > 0) P.backfire -= dt;

    // weather
    if (theme.rain) {
      nextLightning -= dt;
      if (nextLightning <= 0) { flash = 1; nextLightning = 9 + Math.random() * 14; setTimeout(() => Sound.crash(0.5), 300 + Math.random() * 700); }
    }
    flash = Math.max(0, flash - dt * 2.5);

    // visual flourishes
    P.lean = Util.interpolate(P.lean, steer * Math.min(1, speedPct * 1.5) * 0.05, 0.15);
    P.shake = Math.max(0, P.shake - dt * 2.5);
    spawnEffects(playerSeg, speedPct);
    updateParticles(dt);

    const carving = Math.abs(steer) > 0 && Math.abs(playerSeg.curve) > 3 && speedPct > 0.7 && Math.sign(steer) === Math.sign(playerSeg.curve);
    Sound.update({
      rpm: g.rpm, gear: g.gear, throttle: throttle || P.nitroOn ? 1 : 0,
      running: true, nitro: P.nitroOn, offroad: P.offroad && P.speed > 500,
      skid: P.drift ? 0.5 + 0.5 * P.slip : P.scraping ? 0.6 : P.spin > 0 ? 0.7 : carving ? 0.15 : 0,
      rain: theme.rain && !playerSeg.tunnel,
      siren: cop ? Util.limit(1 - Math.abs(Util.wrapDelta(cop.z - (P.position + PLAYER_Z), trackLength)) / 20000, 0, 1) : 0,
    });
  }

  function updateCountdown(dt) {
    countdown -= dt;
    // launch control: hold the revs in the green zone when the lights go
    if (input.up) P.launchRpm = Math.min(1, P.launchRpm + dt * 0.9);
    else P.launchRpm = Math.max(0.12, P.launchRpm - dt * 1.4);
    if (P.launchRpm >= 1) P.launchRpm = 0.94 + Math.random() * 0.06;

    const n = Math.ceil(countdown);
    if (n !== lastCount && n > 0) { lastCount = n; Sound.blip(440, 0.25, 'square', 0.2); centerMsg(String(n)); }
    if (countdown <= 0) {
      state = 'race';
      Sound.blip(880, 0.5, 'square', 0.25);
      centerMsg('GO!', 'go');
      const r = P.launchRpm;
      if (r >= 0.6 && r <= 0.86) {
        P.speed = BASE_MAX * 0.3 * race.stats.top;
        P.nitro = Math.min(1, P.nitro + 0.15);
        popup('PERFECT START!', 'good');
      } else if (r > 0.9) {
        P.spin = 0.8;
        popup('WHEELSPIN!', 'bad');
      }
    }
    Sound.update({ rpm: P.launchRpm, throttle: input.up ? 1 : 0, running: true, nitro: false, offroad: false, siren: 0, gear: 1, skid: 0, rain: theme.rain });
    updateParticles(dt);
  }

  function updateDrift(dt, steer, brake, speedPct, seg) {
    if (!P.drift) {
      if (brake && steer !== 0 && speedPct > 0.5 && !P.offroad) {
        P.drift = true; P.driftDir = steer; P.slip = 0.35; P.driftTime = 0; P.driftPts = 0;
      }
      return;
    }
    P.driftTime += dt;
    const target = steer === P.driftDir ? 1 : steer === 0 ? 0.55 : 0.05;
    P.slip += Util.limit(target - P.slip, -2.2 * dt, 1.6 * dt);
    P.driftMult = Math.min(5, 1 + Math.floor(P.driftTime / 1.5));
    const curveBonus = Math.sign(seg.curve) === P.driftDir && Math.abs(seg.curve) > 1 ? 1.5 : 1;
    P.driftPts += dt * 900 * speedPct * P.slip * P.driftMult * curveBonus;
    if ((P.slip < 0.12 && P.driftTime > 0.3) || speedPct < 0.3) endDrift(true);
    else if (P.offroad) endDrift(false);
  }

  function endDrift(ok) {
    if (!P.drift) return;
    P.drift = false;
    const pts = Math.round(P.driftPts / 10) * 10;
    if (ok && pts >= 150) {
      P.driftTotal += pts;
      P.driftBest = Math.max(P.driftBest, pts);
      P.nitro = Math.min(1, P.nitro + Math.min(0.35, pts / 5000));
      popup('DRIFT  +' + pts.toLocaleString(), 'drift');
      Sound.chime([660, 880]);
    } else if (!ok && pts >= 150) {
      popup('DRIFT LOST', 'bad');
    }
    P.driftPts = 0;
    P.slip = 0;
  }

  function movePlayer(newPos) {
    if (newPos < P.position - trackLength / 2) {
      P.lap++;
      if (P.lap > P.maxLap) { P.maxLap = P.lap; P.position = newPos; onLap(); return; }
    } else if (newPos > P.position + trackLength / 2) {
      P.lap--;
    }
    P.position = newPos;
  }

  function onLap() {
    if (state !== 'race') return;
    P.lastLap = P.lapTime;
    if (P.bestLap === null || P.lapTime < P.bestLap) P.bestLap = P.lapTime;
    P.lapTime = 0;
    if (P.lap >= race.laps) {
      if (race.type === 'pursuit') endPursuit(false);
      else finishRace();
      return;
    }
    if (P.lap === race.laps - 1) popup('FINAL LAP', 'big');
    else popup('LAP ' + (P.lap + 1) + '/' + race.laps, 'big');
    Sound.blip(660, 0.2, 'triangle', 0.2);
  }

  function updateCars(dt, playerSeg) {
    const pd = playerDist();
    for (const car of cars) {
      const prevSpeed = car.speed, prevOffset = car.offset;
      if (car.kind === 'rival') updateRival(car, dt, pd, playerSeg);
      else if (car.kind === 'traffic') updateTraffic(car, dt);
      else if (car.kind === 'cop') updateCop(car, dt, playerSeg);
      car.braking = car.speed < prevSpeed - BASE_MAX * dt * 0.4;
      car.lat = Util.interpolate(car.lat || 0, (car.offset - prevOffset) / dt, 0.1);
      if (!cars.includes(car)) continue;   // removed (cop evaded)
      const seg = findSegment(car.z);
      if (seg !== car.seg) {
        const list = car.seg.cars;
        list.splice(list.indexOf(car), 1);
        seg.cars.push(car);
        car.seg = seg;
      }
    }
  }

  function approach(car, target, up, down, dt) {
    if (car.speed < target) car.speed = Math.min(target, car.speed + up * dt);
    else car.speed = Math.max(target, car.speed - down * dt);
  }

  function updateRival(car, dt, pd, playerSeg) {
    let target;
    if (state === 'menu' || state === 'countdown') target = BASE_MAX * 0.6 * car.skill;
    else if (car.finished) target = BASE_MAX * 0.5;
    else {
      target = BASE_MAX * car.skill;
      const gap = car.dist - pd;   // rubber-banding keeps the pack close
      if (gap > 3000) target *= Math.max(0.84, 1 - (gap - 3000) / 50000);
      else if (gap < -3000) target *= Math.min(1.12, 1 + (-gap - 3000) / 50000);
      target *= 1 - Math.abs(car.seg.curve) * 0.01;
      if (car.seg.tunnel || car.seg.barrier) target *= 0.99;
      // occasional nitro bursts from rivals
      if (Math.sin(clock * 0.37 + car.wobble) > 0.93) target *= 1.15;
    }
    approach(car, target, (BASE_MAX / 5) * 0.95, BASE_MAX / 3, dt);
    if (!steerAround(car, dt, 20, playerSeg, false)) {
      car.offset += Math.sin(clock * 0.5 + car.wobble) * dt * 0.15;
    }
    car.offset = Util.limit(car.offset, -0.85, 0.85);
    car.dist += car.speed * dt;
    car.z = mod(PLAYER_Z + car.dist);
    if (state === 'race' && !car.finished && car.dist >= race.laps * trackLength) {
      car.finished = true;
      car.finishTime = P.raceTime;
    }
  }

  function updateTraffic(car, dt) {
    let blocked = null;
    for (let i = 1; i < 4 && !blocked; i++) {
      const s = segments[(car.seg.index + i) % segments.length];
      for (const o of s.cars) {
        if (o !== car && o.kind === 'traffic' && o.speed < car.speed && Util.overlap(car.offset, car.w, o.offset, o.w, 1)) { blocked = o; break; }
      }
    }
    approach(car, blocked ? blocked.speed : car.baseSpeed, BASE_MAX / 10, BASE_MAX / 2, dt);
    car.z = Util.increase(car.z, dt * car.speed, trackLength);
  }

  // Look ahead and steer around slower cars. Returns true when avoiding.
  function steerAround(car, dt, lookahead, playerSeg, ignorePlayer) {
    const n = segments.length;
    for (let i = 1; i < lookahead; i++) {
      const s = segments[(car.seg.index + i) % n];
      let other = null;
      if (!ignorePlayer && state === 'race' && s === playerSeg && car.speed > P.speed &&
          Util.overlap(P.x, CAR_NW, car.offset, car.w, 1.3)) {
        other = { offset: P.x, speed: P.speed };
      } else {
        for (const o of s.cars) {
          if (o !== car && car.speed > o.speed && Util.overlap(car.offset, car.w, o.offset, o.w, 1.3)) { other = o; break; }
        }
      }
      if (other) {
        let dir;
        if (other.offset > 0.5) dir = -1;
        else if (other.offset < -0.5) dir = 1;
        else dir = car.offset >= other.offset ? 1 : -1;
        car.offset += dir * dt * car.steer * Math.min(1, 8 / i);
        if (i <= 3) car.speed = Math.max(other.speed, car.speed - BASE_MAX * dt * 0.9);
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------- collisions
  function crashFx(impact) {
    P.shake = Math.min(1, impact * 3 + 0.2);
    Sound.crash(Math.min(1.5, impact * 3 + 0.3));
    sparks(10 + Math.floor(impact * 30));
    P.hitCooldown = 0.4;
    if (P.drift) endDrift(false);
  }

  function collide(playerSeg) {
    const pz = P.position + PLAYER_Z;

    if (P.offroad) {
      for (const s of playerSeg.sprites) {
        if (s.noHit) continue;
        const sw = s.source.worldW / ROAD_W;
        const center = s.center ? s.offset : s.offset + (s.offset < 0 ? -0.5 : 0.5) * sw;
        if (Util.overlap(P.x, CAR_NW, center, s.hitW || sw, 1)) {
          const impact = P.speed / BASE_MAX;
          P.speed = BASE_MAX / 6;
          movePlayer(mod(playerSeg.p1.world.z - PLAYER_Z));
          if (P.hitCooldown <= 0) { crashFx(impact * 0.5); P.hitCooldown = 0.5; }
          break;
        }
      }
    }

    const prevSeg = segments[(playerSeg.index - 1 + segments.length) % segments.length];
    for (const seg of [playerSeg, prevSeg]) {
      for (const car of seg.cars) {
        const rel = Util.wrapDelta(car.z - pz, trackLength);
        if (rel < -SEG * 0.6 || rel > SEG * 1.2) continue;
        if (!Util.overlap(P.x, CAR_NW, car.offset, car.w, 0.8)) continue;
        if (P.speed > car.speed && rel > -SEG * 0.2) {
          // rear-ended a slower car
          const impact = (P.speed - car.speed) / BASE_MAX;
          P.speed = car.speed * (car.speed / P.speed) * 0.95;
          movePlayer(mod(car.z - PLAYER_Z - SEG * 0.4));
          if (car.kind === 'traffic') {
            P.heat = Math.min(5, P.heat + 0.5);
            car.offset += (car.offset >= P.x ? 1 : -1) * 0.08;
          } else if (car.kind === 'rival') {
            car.speed += impact * BASE_MAX * 0.25;
            car.offset += (car.offset >= P.x ? 1 : -1) * 0.1;
          }
          if (P.hitCooldown <= 0) {
            crashFx(impact);
            if (impact > 0.25) popup('CRASH!', 'bad');
          }
          return;
        } else if (car.kind !== 'traffic') {
          // side contact: trade paint
          const dir = Math.sign(P.x - car.offset) || 1;
          P.x += dir * 0.025;
          car.offset -= dir * 0.025;
          if (P.hitCooldown <= 0) { Sound.crash(0.25); sparks(5); P.hitCooldown = 0.3; }
        }
      }
    }
  }

  function nearMisses() {
    const pz = P.position + PLAYER_Z;
    for (const car of cars) {
      if (car.kind === 'cop') continue;
      const rel = Util.wrapDelta(car.z - pz, trackLength);
      if (car.prevRel !== undefined && car.prevRel > 0 && rel <= 0 && rel > -SEG * 4) {
        const lat = Math.abs(car.offset - P.x);
        const touch = (CAR_NW + car.w) / 2;
        if (lat > touch * 0.8 && lat < touch + 0.2 && P.speed > BASE_MAX * 0.5) {
          P.nitro = Math.min(1, P.nitro + 0.1);
          P.heat = Math.min(5, P.heat + 0.12);
          P.nearMisses++;
          if (P.drift) P.driftPts += 500;
          popup(P.drift ? 'DRIFT NEAR MISS  +500' : 'NEAR MISS  +NOS', 'nos');
          Sound.whoosh();
        }
      }
      car.prevRel = rel;
    }
  }

  function updatePlace() {
    const pd = playerDist();
    const place = 1 + rivals.filter(r => r.finished || r.dist > pd).length;
    if (place < P.place) {
      popup('OVERTAKE!  ' + Util.ordinal(place), 'good');
      P.nitro = Math.min(1, P.nitro + 0.06);
    }
    P.place = place;
  }

  // ------------------------------------------------------------- police
  function updateHeat(dt) {
    if (P.speed > BASE_MAX * 0.88) P.heat = Math.min(5, P.heat + dt * 0.03);
    if (!cop) {
      if (race.type !== 'pursuit') P.heat = Math.max(0, P.heat - dt * 0.01);
      P.copCooldown -= dt;
      if (P.heat >= 1.5 && P.copCooldown <= 0) spawnCop();
    }
  }

  function spawnCop() {
    const pz = P.position + PLAYER_Z;
    cop = {
      kind: 'cop', w: CAR_NW, offset: Util.limit(P.x, -0.8, 0.8),
      z: mod(pz - (race.type === 'pursuit' ? 25 : 45) * SEG), speed: P.speed, steer: 1.3, stun: 0, lat: 0,
    };
    cop.seg = findSegment(cop.z);
    cop.seg.cars.push(cop);
    cars.push(cop);
    P.bust = 0; P.evade = 0;
    popup('POLICE PURSUIT!', 'cop');
  }

  function removeCop() {
    if (!cop) return;
    const list = cop.seg.cars;
    list.splice(list.indexOf(cop), 1);
    cars.splice(cars.indexOf(cop), 1);
    cop = null;
    P.bust = 0; P.evade = 0;
  }

  function updateCop(c, dt, playerSeg) {
    const pz = P.position + PLAYER_Z;
    const rel = Util.wrapDelta(c.z - pz, trackLength);   // + means cop is ahead
    const top = BASE_MAX * 1.07 * race.copBoost;
    let target;
    if (state !== 'race') target = 0;
    else if (rel < -3000) target = top;
    else if (rel < -250) target = Math.min(top, P.speed + 1800);
    else if (rel < 700) target = P.speed * 0.9;   // alongside: box the player in
    else target = P.speed * 0.7;                   // ahead: brake-check
    if (c.stun > 0) { c.stun -= dt; target = Math.min(target, BASE_MAX * 0.15); }
    approach(c, target, BASE_MAX / 3, BASE_MAX / 2, dt);

    if (!steerAround(c, dt, 7, playerSeg, true)) {
      c.offset += Util.limit(P.x - c.offset, -1, 1) * dt * 1.4;
    }
    c.offset = Util.limit(c.offset, -0.9, 0.9);
    c.z = Util.increase(c.z, dt * c.speed, trackLength);

    if (state !== 'race') return;

    // cops are not great at threading traffic
    for (const o of c.seg.cars) {
      if (o.kind === 'traffic' && c.stun <= 0 && c.speed > o.speed && Util.overlap(c.offset, c.w, o.offset, o.w, 0.8) &&
          Math.abs(Util.wrapDelta(o.z - c.z, trackLength)) < SEG) {
        c.speed = o.speed * 0.4;
        c.stun = 1.8;
        if (Math.abs(rel) < 20000) { popup('COP CRASHED!', 'good'); Sound.crash(0.4); }
        break;
      }
    }

    // ramming
    if (rel < 0 && rel > -SEG * 1.5 && c.speed > P.speed && P.hitCooldown <= 0 &&
        Util.overlap(P.x, CAR_NW, c.offset, c.w, 0.9)) {
      P.speed *= 0.78;
      c.speed = P.speed * 0.95;
      P.shake = 0.7;
      P.hitCooldown = 1;
      Sound.crash(0.8);
      sparks(14);
      if (P.drift) endDrift(false);
      popup('RAMMED!', 'bad');
    }

    // busted when the cop is on you and you're crawling
    if (Math.abs(rel) < 1200 && P.speed < BASE_MAX * 0.3) P.bust = Math.min(1, P.bust + dt / 2.5);
    else P.bust = Math.max(0, P.bust - dt / 3);
    if (P.bust >= 1) { busted(); return; }

    if (rel < -14000) {
      P.evade += dt;
      if (P.evade > 4) {
        removeCop();
        Sound.chime([784, 988, 1175]);
        if (race.type === 'pursuit') { endPursuit(true); return; }
        P.heat = 0.3;
        P.copCooldown = 25;
        P.nitro = Math.min(1, P.nitro + 0.5);
        popup('EVADED!  +NOS', 'good');
      }
    } else {
      P.evade = Math.max(0, P.evade - dt * 0.5);
    }
  }

  // ------------------------------------------------------- effects
  function sparks(n, side) {
    if (!P.screen) return;
    for (let i = 0; i < n; i++) {
      const x = side ? P.screen.x + side * P.screen.w * 0.45 : P.screen.x + (Math.random() - 0.5) * P.screen.w * 0.8;
      particles.push({
        x, y: P.screen.y - P.screen.h * (0.15 + Math.random() * 0.35),
        vx: (side ? -side * 200 : 0) + (Math.random() - 0.5) * 600, vy: -Math.random() * 400,
        life: 0.5 + Math.random() * 0.3, max: 0.8, color: Math.random() < 0.5 ? '#ffd23f' : '#ff8a00', size: 3, gravity: 900,
      });
    }
  }

  function smoke(x, y, vx, vy, color, size, life) {
    particles.push({ x, y, vx, vy, life, max: life, color, size, smoke: true });
  }

  function spawnEffects(playerSeg, speedPct) {
    if (!P.screen) return;
    const { x, y, w } = P.screen;
    if (P.spin > 0) {
      for (const s of [-1, 1]) smoke(x + s * w * 0.34, y - 6, s * 80 * Math.random(), -40, 'rgba(235,235,240,', 16, 0.9);
    }
    if (P.speed < 300) return;
    if (P.offroad && Math.random() < 0.8) {
      const col = race.trackDef.theme === 'coast' ? 'rgba(215,180,120,' : 'rgba(150,150,160,';
      for (const s of [-1, 1]) smoke(x + s * w * 0.38, y - 8, s * 60 + (Math.random() - 0.5) * 120, -60 - Math.random() * 80, col, 14 + Math.random() * 10, 0.7);
    }
    if (P.drift) {
      for (const s of [-1, 1]) {
        smoke(x + s * w * 0.34 - P.driftDir * w * 0.1, y - 6, -P.driftDir * (120 + Math.random() * 120), -40 - Math.random() * 60,
          'rgba(235,235,240,', 14 + Math.random() * 12, 0.9 + Math.random() * 0.4);
      }
    } else {
      const carving = Math.abs(P.steer) > 0 && Math.abs(playerSeg.curve) > 2.5 && speedPct > 0.6 && Math.sign(P.steer) === Math.sign(playerSeg.curve);
      if (carving && Math.random() < 0.5) {
        for (const s of [-1, 1]) smoke(x + s * w * 0.36, y - 6, -P.steer * 80 + (Math.random() - 0.5) * 60, -30 - Math.random() * 40, 'rgba(230,230,240,', 10 + Math.random() * 10, 0.6);
        if (state === 'race') P.nitro = Math.min(1, P.nitro + 0.0015);
      }
    }
    if (theme.wet && !playerSeg.tunnel && speedPct > 0.3 && Math.random() < speedPct) {
      for (const s of [-1, 1]) smoke(x + s * w * 0.36, y - 4, s * 40 + (Math.random() - 0.5) * 80, -50 - Math.random() * 60, 'rgba(170,185,205,', 10 + Math.random() * 8, 0.45);
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.smoke) p.size += 40 * dt;
    }
    particles = particles.filter(p => p.life > 0);
    if (particles.length > 400) particles.splice(0, particles.length - 400);
  }

  function gearInfo() {
    const top = BASE_MAX * race.stats.top;
    const pct = P.speed / top;
    const bands = [0, 0.14, 0.3, 0.48, 0.66, 0.84, 1.0];
    let gear = 1;
    while (gear < 6 && pct > bands[gear]) gear++;
    const lo = bands[gear - 1], hi = bands[gear];
    const rpm = Util.limit(0.25 + 0.75 * (pct - lo) / (hi - lo), 0.2, 1.1);
    return { gear, label: P.speed < 50 ? 'N' : String(gear), rpm };
  }

  // ------------------------------------------------------------- render
  function polygon(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
    ctx.closePath(); ctx.fill();
  }

  function renderSegment(seg) {
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const ci = seg.dark ? 1 : 0;
    ctx.fillStyle = seg.tunnel ? theme.tunnel.wall[ci] : theme.ground[ci];
    ctx.fillRect(0, p2.y, W, p1.y - p2.y);

    const r1 = p1.w / 6, r2 = p2.w / 6;
    polygon(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, theme.rumble[ci]);
    polygon(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, theme.rumble[ci]);

    if (seg.checker) {
      const cols = 10;
      for (let k = 0; k < cols; k++) {
        const a1 = p1.x - p1.w + (2 * p1.w * k) / cols, b1 = p1.x - p1.w + (2 * p1.w * (k + 1)) / cols;
        const a2 = p2.x - p2.w + (2 * p2.w * k) / cols, b2 = p2.x - p2.w + (2 * p2.w * (k + 1)) / cols;
        polygon(a1, p1.y, b1, p1.y, b2, p2.y, a2, p2.y, (k + seg.index) % 2 ? '#f2f2f2' : '#111');
      }
    } else {
      polygon(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, theme.road[ci]);
      if (theme.wet) {
        // glossy centre sheen on wet tarmac
        ctx.globalAlpha = 0.05;
        polygon(p1.x - p1.w * 0.5, p1.y, p1.x + p1.w * 0.5, p1.y, p2.x + p2.w * 0.5, p2.y, p2.x - p2.w * 0.5, p2.y, '#9fb6d8');
        ctx.globalAlpha = 1;
      }
      if (!seg.dark) {
        const l1 = p1.w / 32, l2 = p2.w / 32;
        const lw1 = (p1.w * 2) / LANES, lw2 = (p2.w * 2) / LANES;
        let lx1 = p1.x - p1.w + lw1, lx2 = p2.x - p2.w + lw2;
        for (let lane = 1; lane < LANES; lane++, lx1 += lw1, lx2 += lw2) {
          polygon(lx1 - l1 / 2, p1.y, lx1 + l1 / 2, p1.y, lx2 + l2 / 2, p2.y, lx2 - l2 / 2, p2.y, theme.lane);
        }
      }
    }
    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog;
      ctx.fillStyle = theme.fog;
      ctx.fillRect(0, p2.y, W, p1.y - p2.y);
      ctx.globalAlpha = 1;
    }
  }

  // Walls, tunnels and lamp light pools, drawn back-to-front with the sprites
  function drawStructures(seg) {
    const s1 = seg.p1.screen, s2 = seg.p2.screen;
    const ci = seg.dark ? 1 : 0;
    const fogA = 1 - seg.fog;

    if (seg.lamps && theme.night && s1.y <= seg.clip) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.32 * seg.fog;
      for (const side of [-1, 1]) {
        const gx = s1.x + side * s1.w * (seg.lamps - 0.3);
        const gw = s1.w * 1.3, gh = gw * (theme.wet ? 0.6 : 0.28);
        ctx.drawImage(S.glowWarm, gx - gw / 2, s1.y - gh / 2, gw, gh);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (seg.barrier) {
      const concrete = seg.barrier === 'concrete';
      const bh = concrete ? 330 : 260;
      const h1 = s1.scale * bh * H / 2, h2 = s2.scale * bh * H / 2;
      for (const side of [-1, 1]) {
        const x1 = s1.x + side * s1.w * BARRIER_X, x2 = s2.x + side * s2.w * BARRIER_X;
        if (concrete) {
          polygon(x1, s1.y, x2, s2.y, x2, s2.y - h2, x1, s1.y - h1, ci ? '#7d8087' : '#868990');
          polygon(x1, s1.y - h1 * 0.85, x2, s2.y - h2 * 0.85, x2, s2.y - h2, x1, s1.y - h1, '#a3a6ad');
          if (seg.index % 4 < 2) polygon(x1, s1.y - h1 * 0.35, x2, s2.y - h2 * 0.35, x2, s2.y - h2 * 0.5, x1, s1.y - h1 * 0.5, '#e8c21a');
        } else {
          if (seg.index % 3 === 0) {
            const pw = Math.max(1, s1.w * 0.025);
            ctx.fillStyle = '#4a4d55';
            ctx.fillRect(x1 - pw / 2, s1.y - h1, pw, h1);
          }
          polygon(x1, s1.y - h1 * 0.55, x2, s2.y - h2 * 0.55, x2, s2.y - h2, x1, s1.y - h1, ci ? '#b9bcc4' : '#d2d5dc');
          polygon(x1, s1.y - h1 * 0.75, x2, s2.y - h2 * 0.75, x2, s2.y - h2 * 0.8, x1, s1.y - h1 * 0.8, '#7d8088');
        }
        if (fogA > 0.02) {
          ctx.globalAlpha = fogA;
          polygon(x1, s1.y, x2, s2.y, x2, s2.y - h2, x1, s1.y - h1, theme.fog);
          ctx.globalAlpha = 1;
        }
      }
    }

    if (seg.tunnel) {
      const t = theme.tunnel;
      const h1 = s1.scale * TUNNEL_H * H / 2, h2 = s2.scale * TUNNEL_H * H / 2;
      const l1 = s1.x - s1.w * TUNNEL_X, r1 = s1.x + s1.w * TUNNEL_X;
      const l2 = s2.x - s2.w * TUNNEL_X, r2 = s2.x + s2.w * TUNNEL_X;
      polygon(l1, s1.y, l2, s2.y, l2, s2.y - h2, l1, s1.y - h1, t.wall[ci]);
      polygon(r1, s1.y, r2, s2.y, r2, s2.y - h2, r1, s1.y - h1, t.wall[ci]);
      polygon(l1, s1.y - h1, l2, s2.y - h2, r2, s2.y - h2, r1, s1.y - h1, t.ceiling[ci]);
      // neon trim strips along both walls
      polygon(l1, s1.y - h1 * 0.3, l2, s2.y - h2 * 0.3, l2, s2.y - h2 * 0.33, l1, s1.y - h1 * 0.33, t.trim);
      polygon(r1, s1.y - h1 * 0.3, r2, s2.y - h2 * 0.3, r2, s2.y - h2 * 0.33, r1, s1.y - h1 * 0.33, t.trim);
      if (seg.ceilingLight) {
        polygon(s1.x - s1.w * 0.15, s1.y - h1 + 1, s2.x - s2.w * 0.15, s2.y - h2 + 1,
          s2.x + s2.w * 0.15, s2.y - h2 + 1, s1.x + s1.w * 0.15, s1.y - h1 + 1, t.light);
      }
      if (fogA > 0.02) {
        ctx.globalAlpha = fogA;
        ctx.fillStyle = theme.fog;
        ctx.beginPath();
        ctx.moveTo(l1, s1.y); ctx.lineTo(l2, s2.y); ctx.lineTo(l2, s2.y - h2); ctx.lineTo(r2, s2.y - h2);
        ctx.lineTo(r2, s2.y); ctx.lineTo(r1, s1.y); ctx.lineTo(r1, s1.y - h1); ctx.lineTo(l1, s1.y - h1);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (seg.portal) {
        // building façade around the tunnel mouth, with lit windows and a sign
        const fh = h1 * 1.5, fw = s1.w * 6;
        const top = s1.y - h1 - fh;
        ctx.fillStyle = Sprites.shade(t.wall[0], -0.35);
        ctx.beginPath();
        ctx.rect(s1.x - fw, top, fw * 2, h1 + fh);
        ctx.rect(l1, s1.y - h1, r1 - l1, h1);
        ctx.fill('evenodd');
        polygon(l1 - s1.w * 0.12, s1.y, l1, s1.y, l1, s1.y - h1, l1 - s1.w * 0.12, s1.y - h1 - s1.w * 0.1, t.wall[0]);
        polygon(r1 + s1.w * 0.12, s1.y, r1, s1.y, r1, s1.y - h1, r1 + s1.w * 0.12, s1.y - h1 - s1.w * 0.1, t.wall[0]);
        ctx.fillStyle = t.trim;
        ctx.fillRect(s1.x - fw, s1.y - h1 - h1 * 0.1, fw * 2, h1 * 0.06);
        if (s1.w > 30) {
          const cols = 14, rows = 3;
          const ww = (fw * 2) / cols;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if ((c * 7 + r * 3 + seg.index) % 5 === 0) continue;
              ctx.fillStyle = (c + r) % 3 ? 'rgba(255,210,120,0.75)' : 'rgba(120,220,255,0.6)';
              ctx.fillRect(s1.x - fw + c * ww + ww * 0.25, top + fh * (0.12 + r * 0.26), ww * 0.5, fh * 0.12);
            }
          }
          ctx.fillStyle = '#0c0c12';
          ctx.fillRect(s1.x - s1.w * 0.5, s1.y - h1 - h1 * 0.42, s1.w, h1 * 0.26);
          ctx.fillStyle = t.trim;
          ctx.font = 'italic 900 ' + Math.round(h1 * 0.18) + 'px "Segoe UI", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('TUNNEL', s1.x, s1.y - h1 - h1 * 0.23);
          ctx.textAlign = 'start';
        }
        if (fogA > 0.02) {
          ctx.globalAlpha = fogA;
          ctx.fillStyle = theme.fog;
          ctx.beginPath();
          ctx.rect(s1.x - fw, top, fw * 2, h1 + fh);
          ctx.rect(l1, s1.y - h1, r1 - l1, h1);
          ctx.fill('evenodd');
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function drawSprite(sprite, scale, destX, destY, offsetX, offsetY, clipY, fog) {
    const destW = sprite.worldW * scale * W / 2;
    const destH = destW * sprite.h / sprite.w;
    if (destW < 1 || destW > W * 4) return null;
    destX += destW * offsetX;
    destY += destH * offsetY;
    const clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
    if (clipH >= destH) return null;
    if (fog !== undefined && fog < 0.7) ctx.globalAlpha = Math.max(0.15, fog / 0.7);
    ctx.drawImage(sprite.canvas, 0, 0, sprite.w, sprite.h - (sprite.h * clipH / destH), destX, destY, destW, destH - clipH);
    ctx.globalAlpha = 1;
    return { x: destX, y: destY, w: destW, h: destH };
  }

  function carSprite(car, idx) {
    if (car.kind === 'cop') return S.cop[Math.floor(clock * 6) % 2].normal[idx];
    if (car.kind === 'rival' && car.braking) return car.set.brake[idx];
    return car.set.normal[idx];
  }

  function drawGlow(img, x, y, size, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  }

  function drawCarLights(car, sprite, r, seg) {
    const night = theme.night || seg.tunnel;
    if (!night && !car.braking && car.kind !== 'cop') return;
    ctx.globalCompositeOperation = 'lighter';
    const fade = Math.max(0.25, seg.fog);
    const l = sprite.lights;
    if (night || car.braking) {
      for (const p of l) {
        const ly = r.y + p.y * r.h;
        if (ly > seg.clip) continue;
        drawGlow(S.glowRed, r.x + p.x * r.w, ly, r.w * (car.braking ? 0.55 : 0.35), (car.braking ? 0.9 : 0.5) * fade);
      }
    }
    if (car.kind === 'cop') {
      const red = Math.floor(clock * 6) % 2 === 0;
      const t = red ? 0.34 : 0.66;
      const bx = r.x + (l[0].x + (l[1].x - l[0].x) * t) * r.w;
      drawGlow(red ? S.glowRed : S.glowBlue, bx, r.y + r.h * 0.04, r.w * 1.1, 0.8 * fade);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawNameTag(car, sprite, r) {
    const size = Math.round(Util.limit(9 + r.w / 22, 10, 18));
    const cx = r.x + r.w * sprite.ax, cy = r.y - size * 0.6;
    ctx.font = 'italic 800 ' + size + 'px "Segoe UI", system-ui, sans-serif';
    const tw = ctx.measureText(car.name).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(cx - tw / 2 - 6, cy - size, tw + 12, size + 6);
    ctx.fillStyle = RIVALS[car.idx].tag;
    ctx.textAlign = 'center';
    ctx.fillText(car.name, cx, cy);
    ctx.textAlign = 'start';
  }

  function drawLayer(img, offset, bottomY) {
    const x = -Math.floor(offset * img.width);
    const y = bottomY - img.height;
    ctx.drawImage(img, x, y);
    ctx.drawImage(img, x + img.width, y);
  }

  function render() {
    const baseSeg = findSegment(P.position);
    const basePct = Util.percentRemaining(P.position, SEG);
    const playerSeg = findSegment(P.position + PLAYER_Z);
    const playerPct = Util.percentRemaining(P.position + PLAYER_Z, SEG);
    const playerY = Util.interpolate(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);
    let maxy = H;
    let x = 0, dx = -(baseSeg.curve * basePct);

    ctx.save();
    if (P.shake > 0) ctx.translate((Math.random() - 0.5) * 18 * P.shake, (Math.random() - 0.5) * 12 * P.shake);

    if (baseSeg.tunnel) {
      ctx.fillStyle = theme.tunnel.ceiling[1];
      ctx.fillRect(-20, -20, W + 40, H + 40);
    } else {
      ctx.drawImage(bg.sky, 0, 0);
      drawLayer(bg.far, skyOffset, H / 2 + 12);
      drawLayer(bg.near, hillOffset, H / 2 + 14);
      ctx.fillStyle = theme.ground[1];
      ctx.fillRect(0, H / 2 + 14, W, H / 2);
    }

    const n = segments.length;
    for (let i = 0; i < DRAW_DIST; i++) {
      const seg = segments[(baseSeg.index + i) % n];
      seg.looped = seg.index < baseSeg.index;
      seg.fog = Util.exponentialFog(i / DRAW_DIST, FOG_DENSITY);
      seg.clip = maxy;
      const camZ = P.position - (seg.looped ? trackLength : 0);
      Util.project(seg.p1, P.x * ROAD_W - x, playerY + CAM_H, camZ, CAM_DEPTH, W, H, ROAD_W);
      Util.project(seg.p2, P.x * ROAD_W - x - dx, playerY + CAM_H, camZ, CAM_DEPTH, W, H, ROAD_W);
      x += dx;
      dx += seg.curve;
      if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      renderSegment(seg);
      maxy = seg.p2.screen.y;
    }

    const showTags = state === 'race' || state === 'countdown';
    for (let i = DRAW_DIST - 1; i > 0; i--) {
      const seg = segments[(baseSeg.index + i) % n];
      if (seg.p1.camera.z > 1 && (seg.tunnel || seg.barrier || seg.lamps)) {
        const clipped = seg.clip < seg.p1.screen.y;
        if (clipped) { ctx.save(); ctx.beginPath(); ctx.rect(-50, -50, W + 100, seg.clip + 50); ctx.clip(); }
        drawStructures(seg);
        if (clipped) ctx.restore();
      }
      for (const car of seg.cars) {
        const camZ = Util.wrapDelta(car.z - P.position, trackLength);
        if (camZ < PLAYER_Z * 0.9) continue;   // behind the player's car
        const pct = Util.percentRemaining(car.z, SEG);
        const scale = Util.interpolate(seg.p1.screen.scale, seg.p2.screen.scale, pct);
        const sx = Util.interpolate(seg.p1.screen.x, seg.p2.screen.x, pct) + scale * car.offset * ROAD_W * W / 2;
        const sy = Util.interpolate(seg.p1.screen.y, seg.p2.screen.y, pct);
        const yaw = Util.limit((sx - W / 2) / (W * 0.9) + seg.curve * 0.08 + car.lat * 1.5, -1, 1);
        const sprite = carSprite(car, Math.round((yaw + 1) * 2));
        const r = drawSprite(sprite, scale, sx, sy, -sprite.ax, -1, seg.clip, seg.fog);
        if (r) {
          drawCarLights(car, sprite, r, seg);
          if (showTags && car.kind === 'rival' && r.w > 45 && r.y < seg.clip) drawNameTag(car, sprite, r);
        }
      }
      for (const s of seg.sprites) {
        const scale = seg.p1.screen.scale;
        const sx = seg.p1.screen.x + scale * s.offset * ROAD_W * W / 2;
        const sy = seg.p1.screen.y;
        drawSprite(s.source, scale, sx, sy, s.center ? -0.5 : (s.offset < 0 ? -1 : 0), -1, seg.clip, seg.fog);
      }
      if (seg === playerSeg) drawPlayer(playerSeg, playerPct);
    }

    drawParticles();
    ctx.restore();
    drawScreenFx(playerSeg);
  }

  function drawPlayer(playerSeg, playerPct) {
    const scale = CAM_DEPTH / PLAYER_Z;
    const speedPct = P.speed / BASE_MAX;
    const bounce = (P.offroad ? 5 : 1.5) * Math.random() * speedPct * (Math.random() < 0.5 ? -1 : 1);
    const y = H / 2 - (scale * Util.interpolate(playerSeg.p1.camera.y, playerSeg.p2.camera.y, playerPct) * H / 2) - 6 + bounce;
    const yawTarget = P.drift ? P.driftDir * (0.3 + 0.4 * P.slip) : P.steerSmooth * 0.45 * Math.min(1, speedPct * 1.6);
    P.yawVis = Util.interpolate(P.yawVis, yawTarget, 0.2);
    const idx = Math.round((Util.limit(P.yawVis, -0.7, 0.7) + 1) * 2);
    const set = S.players[race.carDef.id];
    const sprite = (P.braking && P.speed > 0 ? set.brake : set.normal)[idx];
    const destW = sprite.worldW * scale * W / 2;
    const destH = destW * sprite.h / sprite.w;
    P.screen = { x: W / 2, y, w: destW, h: destH };
    const night = theme.night || playerSeg.tunnel;

    // headlight pool on the road ahead
    if (night) {
      ctx.globalCompositeOperation = 'lighter';
      const gw = destW * 2.8, gh = destH * 1.7;
      ctx.globalAlpha = 0.22;
      ctx.drawImage(S.glowWarm, W / 2 - gw / 2 + P.yawVis * destW * 0.5, y - destH * 0.55 - gh, gw, gh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.save();
    ctx.translate(W / 2, y);
    ctx.rotate(P.lean + (P.drift ? P.driftDir * P.slip * 0.03 : 0));
    const ox = -destW * sprite.ax;
    const l = sprite.lights;
    const exhaust = t => ox + (l[0].x + (l[1].x - l[0].x) * t) * destW;
    if (P.nitroOn) {
      for (const t of [0.32, 0.68]) {
        const len = destH * (0.35 + Math.random() * 0.25);
        const fxp = exhaust(t), fy = -destH * 0.1;
        const grd = ctx.createRadialGradient(fxp, fy, 2, fxp, fy, len);
        grd.addColorStop(0, 'rgba(255,255,255,0.95)');
        grd.addColorStop(0.25, 'rgba(120,200,255,0.9)');
        grd.addColorStop(1, 'rgba(40,80,255,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(fxp, fy + len * 0.15, destW * 0.045, len * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.drawImage(sprite.canvas, ox, -destH, destW, destH);
    ctx.globalCompositeOperation = 'lighter';
    if (P.backfire > 0 && !P.nitroOn) {
      for (const t of [0.32, 0.68]) drawGlow(S.glowOrange, exhaust(t), -destH * 0.1, destW * 0.22, 0.95);
    }
    if (night || P.braking) {
      for (const p of l) drawGlow(S.glowRed, ox + p.x * destW, -destH + p.y * destH, destW * (P.braking ? 0.5 : 0.3), P.braking ? 0.85 : 0.45);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.smoke) {
        ctx.fillStyle = p.color + (a * 0.35).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawScreenFx(playerSeg) {
    const speedPct = P.speed / BASE_MAX;
    const cx = W / 2, cy = H * 0.45;

    if (theme.rain && !playerSeg.tunnel) {
      ctx.save();
      ctx.strokeStyle = 'rgba(180,200,235,0.35)';
      ctx.lineWidth = 1.5;
      const slant = -P.steerSmooth * 6 + 3;
      const len = 18 + speedPct * 30;
      ctx.beginPath();
      for (let i = 0; i < 160; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        ctx.moveTo(x, y); ctx.lineTo(x + slant, y + len);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (P.nitroOn || speedPct > 0.9) {
      ctx.save();
      const strong = P.nitroOn;
      ctx.strokeStyle = strong ? 'rgba(200,230,255,0.35)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      for (let i = 0; i < (strong ? 26 : 12); i++) {
        const a = Math.random() * Math.PI * 2;
        const r1 = 300 + Math.random() * 300, r2 = r1 + 80 + Math.random() * 200;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.6);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.6);
        ctx.stroke();
      }
      if (strong) {
        const vg = ctx.createRadialGradient(cx, cy, H * 0.3, cx, cy, W * 0.7);
        vg.addColorStop(0, 'rgba(0,120,255,0)');
        vg.addColorStop(1, 'rgba(0,140,255,0.28)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    if (cop && state === 'race') {
      const rel = Util.wrapDelta(cop.z - (P.position + PLAYER_Z), trackLength);
      const near = Util.limit(1 - Math.abs(rel) / 6000, 0, 1);
      if (near > 0) {
        const red = Math.floor(clock * 6) % 2 === 0;
        const col = red ? '255,30,40' : '40,90,255';
        const g2 = red ? ctx.createLinearGradient(0, 0, W * 0.25, 0) : ctx.createLinearGradient(W, 0, W * 0.75, 0);
        g2.addColorStop(0, 'rgba(' + col + ',' + 0.4 * near + ')'); g2.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = g2;
        ctx.fillRect(red ? 0 : W * 0.75, 0, W * 0.25, H);
      }
    }

    if (flash > 0) {
      ctx.fillStyle = 'rgba(220,230,255,' + (flash * flash * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- HUD
  const $ = id => document.getElementById(id);
  const hud = {
    root: $('hud'), pos: $('hud-pos'), lap: $('hud-lap'), time: $('hud-time'), lapTime: $('hud-laptime'),
    best: $('hud-best'), nitro: $('nitro-fill'), nitroBox: $('nitro'), heat: $('heat'), pursuit: $('pursuit'),
    gap: $('pursuit-gap'), bust: $('bust-fill'), evade: $('evade-fill'), board: $('board'),
    drift: $('drift-meter'), driftPts: $('drift-pts'), driftMult: $('drift-mult'), objective: $('objective'),
  };
  const gaugeCtx = $('gauge').getContext('2d');
  const mapCtx = $('minimap').getContext('2d');
  let mapCache = null;
  const lastHud = {};
  function setText(el, key, v) { if (lastHud[key] !== v) { lastHud[key] = v; el.textContent = v; } }
  let boardTimer = 0;

  function buildMinimap() {
    const s = 180;
    mapCache = Sprites.makeCanvas(s, s);
    const g = mapCache.getContext('2d');
    const pts = trackMap.map(p => [s / 2 + p.x * (s - 30), s / 2 + p.y * (s - 30)]);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    path(); g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 9; g.stroke();
    path(); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 4; g.stroke();
    // tunnel sections
    g.strokeStyle = 'rgba(255,180,80,0.9)'; g.lineWidth = 4;
    g.beginPath();
    segments.forEach((sg, i) => {
      if (!sg.tunnel) return;
      const [x, y] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      g.moveTo(x, y); g.lineTo(x2, y2);
    });
    g.stroke();
    mapCache.pts = pts;
  }

  function drawMinimap() {
    const s = 180;
    mapCtx.clearRect(0, 0, s, s);
    mapCtx.drawImage(mapCache, 0, 0);
    const pts = mapCache.pts;
    const at = z => pts[Math.floor(mod(z) / SEG) % pts.length];
    const dot = (z, color, r, ring) => {
      const [x, y] = at(z);
      mapCtx.fillStyle = color;
      mapCtx.beginPath(); mapCtx.arc(x, y, r, 0, Math.PI * 2); mapCtx.fill();
      if (ring) { mapCtx.strokeStyle = ring; mapCtx.lineWidth = 2; mapCtx.stroke(); }
    };
    const [sx, sy] = pts[findSegment(PLAYER_Z).index];
    mapCtx.fillStyle = '#fff'; mapCtx.fillRect(sx - 5, sy - 2, 10, 4);
    rivals.forEach(r => dot(r.z, RIVALS[r.idx].tag, 4.5, 'rgba(0,0,0,0.6)'));
    if (cop) dot(cop.z, Math.floor(clock * 6) % 2 ? '#ff3030' : '#3a6bff', 5.5, '#fff');
    dot(P.position + PLAYER_Z, race.carDef.color, 6.5, '#fff');
  }

  function drawGauge(rpm, kmh, gear, launch) {
    const g = gaugeCtx, s = 220, cx = s / 2, cy = s / 2, R = 92;
    g.clearRect(0, 0, s, s);
    g.fillStyle = 'rgba(8,6,18,0.72)';
    g.beginPath(); g.arc(cx, cy, R + 12, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2; g.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const ang = v => a0 + (a1 - a0) * v;
    const rv = r => (1000 + r * 7000) / 9000;
    g.lineWidth = 8;
    if (launch) {
      g.strokeStyle = 'rgba(178,255,89,0.85)';
      g.beginPath(); g.arc(cx, cy, R - 4, ang(rv(0.6)), ang(rv(0.86))); g.stroke();
    }
    g.strokeStyle = 'rgba(255,46,80,0.85)';
    g.beginPath(); g.arc(cx, cy, R - 4, ang(7.6 / 9), ang(1)); g.stroke();
    g.fillStyle = '#d9d9e8'; g.strokeStyle = '#d9d9e8';
    g.font = 'italic 700 13px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i <= 18; i++) {
      const a = ang(i / 18), major = i % 2 === 0;
      const r1 = R - (major ? 16 : 11), r2 = R - 2;
      g.lineWidth = major ? 3 : 1.5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke();
      if (major) g.fillText(String(i / 2), cx + Math.cos(a) * (R - 28), cy + Math.sin(a) * (R - 28));
    }
    const na = ang(Util.limit(rv(rpm), 0, 1.02));
    g.strokeStyle = '#ff2e88'; g.lineWidth = 4; g.shadowColor = '#ff2e88'; g.shadowBlur = 10;
    g.beginPath(); g.moveTo(cx - Math.cos(na) * 10, cy - Math.sin(na) * 10); g.lineTo(cx + Math.cos(na) * (R - 10), cy + Math.sin(na) * (R - 10)); g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.font = 'italic 900 40px "Segoe UI", system-ui, sans-serif';
    g.fillText(String(kmh), cx, cy + 34);
    g.font = '700 10px "Segoe UI", system-ui, sans-serif';
    g.fillStyle = '#a9a6c4';
    g.fillText('KM/H', cx, cy + 58);
    g.fillText('x1000 RPM', cx, cy - 30);
    g.fillStyle = '#00e5ff';
    g.font = 'italic 900 22px "Segoe UI", system-ui, sans-serif';
    g.fillText(gear, cx + 52, cy + 6);
  }

  function updateHUD(dt) {
    const show = state === 'race' || state === 'countdown';
    hud.root.classList.toggle('hidden', !show);
    if (!show) return;
    hud.root.classList.toggle('no-rivals', !race.rivals);
    setText(hud.pos, 'pos', String(P.place));
    setText(hud.lap, 'lap', Math.min(P.lap + 1, race.laps) + '/' + race.laps);
    setText(hud.time, 'time', Util.formatTime(P.raceTime));
    setText(hud.lapTime, 'laptime', Util.formatTime(P.lapTime));
    setText(hud.best, 'best', Util.formatTime(P.bestLap));
    const g = gearInfo();
    drawGauge(state === 'countdown' ? P.launchRpm : g.rpm, Math.round(P.speed / BASE_MAX * KMH), state === 'countdown' ? 'N' : g.label, state === 'countdown');
    drawMinimap();
    hud.nitro.style.width = (P.nitro * 100).toFixed(1) + '%';
    hud.nitroBox.classList.toggle('active', P.nitroOn);
    const stars = Math.floor(P.heat);
    setText(hud.heat, 'heat', '★'.repeat(stars) + '☆'.repeat(5 - stars));
    hud.heat.classList.toggle('hot', !!cop);
    hud.heat.classList.toggle('hidden', !race.cops);
    hud.pursuit.classList.toggle('hidden', !cop);
    if (cop) {
      const rel = Util.wrapDelta(cop.z - (P.position + PLAYER_Z), trackLength);
      setText(hud.gap, 'gap', (rel > 0 ? 'AHEAD ' : '') + Math.round(Math.abs(rel) / METERS) + ' m');
      hud.bust.style.width = (P.bust * 100) + '%';
      hud.evade.style.width = (Math.min(1, P.evade / 4) * 100) + '%';
    }
    hud.drift.classList.toggle('hidden', !P.drift || P.driftPts < 50);
    if (P.drift) {
      setText(hud.driftPts, 'driftpts', (Math.round(P.driftPts / 10) * 10).toLocaleString());
      setText(hud.driftMult, 'driftmult', 'x' + P.driftMult);
    }
    let obj = '';
    if (race.type === 'drift') obj = 'DRIFT POINTS  ' + P.driftTotal.toLocaleString() + ' / ' + race.event.target.toLocaleString();
    else if (race.type === 'pursuit') obj = cop ? 'LOSE THE COPS' : 'GET READY…';
    setText(hud.objective, 'objective', obj);
    hud.objective.classList.toggle('hidden', !obj);

    boardTimer -= dt;
    if (boardTimer <= 0 && race.rivals) {
      boardTimer = 0.25;
      const pd = playerDist();
      const rows = rivals.map(r => ({ name: r.name, d: r.dist, color: RIVALS[r.idx].tag }))
        .concat([{ name: 'YOU', d: pd, you: true, color: race.carDef.color }])
        .sort((a, b) => b.d - a.d);
      const html = rows.map((r, i) => '<li class="' + (r.you ? 'you' : '') + '"><span class="b-pos">' + (i + 1) +
        '</span><i style="background:' + r.color + '"></i>' + r.name + '</li>').join('');
      if (lastHud.board !== html) { lastHud.board = html; hud.board.innerHTML = html; }
    }
  }

  function popup(text, cls) {
    const el = document.createElement('div');
    el.className = 'popup ' + (cls || '');
    el.textContent = text;
    $('popups').appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  function centerMsg(text, cls) {
    const el = $('center-msg');
    el.textContent = text;
    el.className = 'show ' + (cls || '');
    void el.offsetWidth;
    el.classList.add('anim');
    clearTimeout(centerMsg.t);
    centerMsg.t = setTimeout(() => { el.className = ''; }, cls === 'go' ? 900 : 950);
  }

  // ------------------------------------------------------- flow / menus
  function storageGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function storageSet(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }
  const money = v => '$' + Math.round(v).toLocaleString();

  function show(id, on) { $(id).classList.toggle('hidden', !on); }

  function hideOverlays() {
    ['results', 'busted', 'pause'].forEach(id => show(id, false));
    clearTimeout(resultTimer);
  }

  function beginRace(cfg) {
    Sound.init();
    hideOverlays();
    setupRace(cfg, false);
    show('menu', false);
    paused = false;
    state = 'countdown';
    countdown = 3.5; lastCount = 0;
    boardTimer = 0;
    document.body.classList.add('racing');
    if (cfg.type === 'drift') popup('DRIFT EVENT: BRAKE + STEER TO SLIDE', 'drift');
    if (cfg.type === 'pursuit') popup('PURSUIT: LOSE THE COPS', 'cop');
  }

  function retry() { beginRace(race.mode === 'career' ? careerRace(race.event) : quickRace()); }

  function openMenu(screen) {
    hideOverlays();
    paused = false;
    state = 'menu';
    setupRace(quickRace(), true);
    show('menu', true);
    showScreen(screen || 'main');
    document.body.classList.remove('racing');
    Sound.silence();
  }

  function leaveResults() { openMenu(race.mode === 'career' ? 'career' : 'main'); }

  // Settle career cash/progress and return the summary line
  function settleCareer(place, success) {
    const ev = race.event;
    const cash = success || (ev.type === 'circuit' && place <= 3) ? Career.payout(career, ev, place) : 0;
    const first = !career.done[ev.id];
    career.cash += cash;
    if (success) career.done[ev.id] = true;
    Career.save(career);
    let msg = cash ? 'EARNED ' + money(cash) : 'NO PRIZE MONEY';
    if (success && first) {
      const i = Career.EVENTS.indexOf(ev);
      msg += Career.EVENTS[i + 1] ? '  ·  NEW EVENT UNLOCKED' : '  ·  CAREER COMPLETE!';
    }
    return msg;
  }

  function showResults(o) {
    $('res-title').textContent = o.title;
    $('res-title').className = o.win ? 'win' : 'lose';
    $('res-sub').textContent = o.sub || '';
    $('res-table').innerHTML = o.table || '';
    $('res-stats').innerHTML = o.stats.map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('');
    $('res-cash').textContent = o.cash || '';
    $('res-cash').classList.toggle('hidden', !o.cash);
    $('again-btn').textContent = race.mode === 'career' ? 'RETRY' : 'RACE AGAIN';
    $('menu-btn').textContent = race.mode === 'career' ? 'CONTINUE' : 'MAIN MENU';
    Sound.blip(o.win ? 1046 : 523, 0.6, 'triangle', 0.25);
    if (o.win) Sound.chime([523, 659, 784, 1046]);
    resultTimer = setTimeout(() => { if (state === 'finished') show('results', true); }, 1200);
  }

  function finishRace() {
    endDrift(true);
    P.finished = true;
    P.finishTime = P.raceTime;
    state = 'finished';
    removeCop();
    const common = [['Best lap', Util.formatTime(P.bestLap)], ['Top speed', Math.round(P.maxSpeed / BASE_MAX * KMH) + ' km/h']];

    if (race.type === 'drift') {
      const target = race.event.target;
      const win = P.driftTotal >= target;
      const cash = settleCareer(1, win);
      showResults({
        title: win ? 'DRIFT KING!' : 'NOT ENOUGH STYLE',
        win, sub: 'Drift score ' + P.driftTotal.toLocaleString() + ' / ' + target.toLocaleString(),
        stats: [['Best drift', P.driftBest.toLocaleString()], ['Near misses', P.nearMisses]].concat(common), cash,
      });
      return;
    }

    const total = race.laps * trackLength;
    const rows = rivals.map(r => ({
      name: r.name, finished: r.finished,
      time: r.finished ? r.finishTime : P.raceTime + (total - r.dist) / Math.max(r.speed, BASE_MAX * 0.5),
    }));
    rows.push({ name: 'YOU', time: P.finishTime, you: true, finished: true });
    rows.sort((a, b) => a.time - b.time);
    const place = rows.findIndex(r => r.you) + 1;
    const table = rows.map((r, i) =>
      '<tr class="' + (r.you ? 'you' : '') + '"><td>' + Util.ordinal(i + 1) + '</td><td>' + r.name + '</td><td>' +
      (r.finished ? Util.formatTime(r.time) : '+' + Util.formatTime(r.time - P.finishTime)) + '</td></tr>').join('');

    let cash = '', stats = [['Near misses', P.nearMisses], ['Drift pts', P.driftTotal.toLocaleString()]].concat(common);
    if (race.mode === 'career') {
      cash = settleCareer(place, place === 1);
    } else {
      const key = 'nitro-rush:' + race.trackDef.id + ':' + race.laps;
      const rec = storageGet(key) || {};
      let newRecord = false;
      if (!rec.time || P.finishTime < rec.time) { rec.time = P.finishTime; newRecord = true; }
      if (P.bestLap !== null && (!rec.lap || P.bestLap < rec.lap)) rec.lap = P.bestLap;
      if (place === 1) rec.wins = (rec.wins || 0) + 1;
      storageSet(key, rec);
      stats.push(['Record', Util.formatTime(rec.time) + (newRecord ? ' <em>NEW!</em>' : '')]);
    }
    showResults({ title: place === 1 ? 'YOU WIN!' : Util.ordinal(place).toUpperCase() + ' PLACE', win: place === 1, table, stats, cash });
  }

  function endPursuit(success) {
    endDrift(true);
    state = 'finished';
    const cash = settleCareer(1, success);
    showResults({
      title: success ? 'ESCAPED!' : 'TOO HOT TO SHAKE',
      win: success,
      sub: success ? 'You lost the police in ' + Util.formatTime(P.raceTime) + '.' : 'The cops kept you in sight for ' + race.laps + ' laps.',
      stats: [['Near misses', P.nearMisses], ['Top speed', Math.round(P.maxSpeed / BASE_MAX * KMH) + ' km/h']],
      cash,
    });
  }

  function busted() {
    endDrift(false);
    state = 'busted';
    Sound.crash(0.6);
    $('busted-info').textContent = 'Caught on lap ' + Math.min(P.lap + 1, race.laps) + ' of ' + race.laps + ' after ' + Util.formatTime(P.raceTime) + '.';
    $('busted-menu-btn').textContent = race.mode === 'career' ? 'CONTINUE' : 'MAIN MENU';
    resultTimer = setTimeout(() => { if (state === 'busted') show('busted', true); }, 900);
  }

  function setPaused(on) {
    if (state !== 'race' && state !== 'countdown') return;
    paused = on;
    show('pause', on);
    if (on) Sound.silence();
  }

  // ---------------------------------------------------------- screens
  const carImg = {};
  function carThumb(id) {
    if (!carImg[id]) carImg[id] = S.players[id].normal[2].canvas.toDataURL();
    return carImg[id];
  }
  const bar = v => '<span class="bar"><span style="width:' + Math.round(Util.limit(v, 0.04, 1) * 100) + '%"></span></span>';
  function statBars(st) {
    return '<div class="stats"><label>Speed</label>' + bar((st.top - 0.8) / 0.32) +
      '<label>Accel</label>' + bar((st.accel - 0.6) / 1.1) +
      '<label>Handling</label>' + bar((st.handling - 0.6) / 0.9) +
      '<label>Nitro</label>' + bar(st.nitroCap / 1.75) + '</div>';
  }

  function showScreen(name) {
    ['main', 'quick', 'career', 'garage'].forEach(n => show('screen-' + n, n === name));
    $('menu').scrollTop = 0;
    if (name === 'main') renderMain();
    if (name === 'quick') renderQuick();
    if (name === 'career') renderCareer();
    if (name === 'garage') renderGarage();
  }

  function renderMain() {
    const done = Career.EVENTS.filter(e => career.done[e.id]).length;
    $('main-career-sub').textContent = money(career.cash) + '  ·  ' + done + '/' + Career.EVENTS.length + ' events';
  }

  function renderQuick() {
    const carsEl = $('car-select');
    carsEl.innerHTML = '';
    CARS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'card car-card' + (c === quick.car ? ' selected' : '');
      b.innerHTML = '<img alt="" src="' + carThumb(c.id) + '"><h3>' + c.name + '</h3><p>' + c.desc + '</p>' + statBars(Career.stats(c, null));
      b.onclick = () => { quick.car = c; renderQuick(); };
      carsEl.appendChild(b);
    });

    const trEl = $('track-select');
    trEl.innerHTML = '';
    TRACKS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'card track-card ' + t.theme + (t === quick.track ? ' selected' : '');
      const rec = storageGet('nitro-rush:' + t.id + ':' + quick.laps);
      b.innerHTML = '<h3>' + t.name + '</h3><p>' + t.desc + '</p><p class="rec">Best (' + quick.laps + ' laps): ' +
        (rec && rec.time ? Util.formatTime(rec.time) : '--') + (rec && rec.wins ? ' · Wins: ' + rec.wins : '') + '</p>';
      b.onclick = () => { if (quick.track !== t) { quick.track = t; setupRace(quickRace(), true); } renderQuick(); };
      trEl.appendChild(b);
    });

    document.querySelectorAll('#laps-select button').forEach(b => {
      b.classList.toggle('selected', Number(b.dataset.laps) === quick.laps);
    });
    $('cops-toggle').textContent = quick.cops ? 'ON' : 'OFF';
    $('cops-toggle').classList.toggle('selected', quick.cops);
  }

  const TYPE_LABEL = { circuit: 'CIRCUIT', drift: 'DRIFT', pursuit: 'PURSUIT' };

  function renderCareer() {
    $('career-cash').textContent = money(career.cash);
    const c = carById(career.car);
    $('career-car').innerHTML = '<img alt="" src="' + carThumb(c.id) + '"><div><small>YOUR RIDE</small><b>' + c.name + '</b></div>';
    const list = $('event-list');
    list.innerHTML = '';
    Career.EVENTS.forEach((ev, i) => {
      const open = Career.unlocked(career, i);
      const done = !!career.done[ev.id];
      const tr = TRACKS.find(t => t.id === ev.track);
      const b = document.createElement('button');
      b.className = 'event ' + ev.type + (open ? '' : ' locked') + (done ? ' done' : '');
      b.disabled = !open;
      const reward = ev.type === 'circuit' ? money(ev.reward[0]) + ' / ' + money(ev.reward[1]) + ' / ' + money(ev.reward[2]) : money(ev.reward[0]);
      b.innerHTML = '<span class="ev-num">' + (done ? '✓' : open ? i + 1 : '🔒') + '</span>' +
        '<span class="ev-body"><span class="ev-type">' + TYPE_LABEL[ev.type] + ' · ' + tr.name + ' · ' + ev.laps + (ev.laps > 1 ? ' laps' : ' lap') + '</span>' +
        '<b>' + ev.name + '</b><small>' + ev.desc + '</small></span>' +
        '<span class="ev-reward">' + (done ? 'REPLAY 40%<br>' : '') + reward + '</span>';
      if (open) b.onclick = () => beginRace(careerRace(ev));
      list.appendChild(b);
    });
  }

  function renderGarage() {
    $('garage-cash').textContent = money(career.cash);
    const carsEl = $('garage-cars');
    carsEl.innerHTML = '';
    CARS.forEach(c => {
      const owned = career.owned.includes(c.id);
      const price = Career.CAR_PRICES[c.id];
      const b = document.createElement('div');
      b.className = 'card car-card' + (career.car === c.id ? ' selected' : '');
      let action;
      if (career.car === c.id) action = '<button class="small on" disabled>SELECTED</button>';
      else if (owned) action = '<button class="small" data-act="select">SELECT</button>';
      else action = '<button class="small buy" data-act="buy"' + (career.cash < price ? ' disabled' : '') + '>BUY ' + money(price) + '</button>';
      b.innerHTML = '<img alt="" src="' + carThumb(c.id) + '"><h3>' + c.name + '</h3><p>' + c.desc + '</p>' +
        statBars(Career.stats(c, career.upgrades[c.id])) + '<div class="card-act">' + action + '</div>';
      const btn = b.querySelector('[data-act]');
      if (btn) btn.onclick = () => {
        if (btn.dataset.act === 'buy') {
          if (career.cash < price) return;
          career.cash -= price;
          career.owned.push(c.id);
          Sound.chime([523, 784]);
        }
        career.car = c.id;
        Career.save(career);
        renderGarage();
      };
      carsEl.appendChild(b);
    });

    const c = carById(career.car);
    $('upgrade-title').textContent = 'Upgrades: ' + c.name;
    const ups = $('upgrade-list');
    ups.innerHTML = '';
    Career.UPGRADES.forEach(u => {
      const lvl = Career.level(career, c.id, u.id);
      const cost = u.costs[lvl];
      const row = document.createElement('div');
      row.className = 'upgrade';
      row.innerHTML = '<div><b>' + u.name + '</b><small>' + u.desc + '</small></div>' +
        '<div class="pips">' + [0, 1, 2].map(i => '<i class="' + (i < lvl ? 'on' : '') + '"></i>').join('') + '</div>' +
        (cost === undefined ? '<button class="small on" disabled>MAX</button>'
          : '<button class="small buy"' + (career.cash < cost ? ' disabled' : '') + '>' + money(cost) + '</button>');
      const btn = row.querySelector('button.buy');
      if (btn) btn.onclick = () => {
        if (career.cash < cost) return;
        career.cash -= cost;
        career.upgrades[c.id] = Object.assign({}, career.upgrades[c.id], { [u.id]: lvl + 1 });
        Career.save(career);
        Sound.chime([659, 988]);
        renderGarage();
      };
      ups.appendChild(row);
    });
  }

  // -------------------------------------------------------------- input
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'nitro', ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro',
  };

  document.addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (k) { input[k] = true; if (state !== 'menu') e.preventDefault(); }
    if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
    if (e.code === 'KeyM') { $('mute-btn').textContent = Sound.toggleMute() ? '🔇' : '🔊'; }
    if (e.code === 'Enter') {
      if (state === 'menu' && !$('screen-quick').classList.contains('hidden')) beginRace(quickRace());
      else if (state === 'finished' || state === 'busted') retry();
    }
  });
  document.addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (k) input[k] = false;
  });
  window.addEventListener('blur', () => {
    Object.keys(input).forEach(k => { input[k] = false; });
    setPaused(true);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  document.querySelectorAll('[data-key]').forEach(btn => {
    const k = btn.dataset.key;
    const on = e => { e.preventDefault(); input[k] = true; btn.classList.add('down'); Sound.init(); };
    const off = e => { e.preventDefault(); input[k] = false; btn.classList.remove('down'); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');

  document.querySelectorAll('[data-screen]').forEach(b => {
    b.onclick = () => { Sound.init(); showScreen(b.dataset.screen); };
  });
  $('start-btn').onclick = () => beginRace(quickRace());
  $('again-btn').onclick = retry;
  $('busted-again-btn').onclick = retry;
  $('menu-btn').onclick = leaveResults;
  $('busted-menu-btn').onclick = leaveResults;
  $('resume-btn').onclick = () => setPaused(false);
  $('quit-btn').onclick = () => openMenu(race.mode === 'career' ? 'career' : 'main');
  $('pause-btn').onclick = () => setPaused(true);
  $('mute-btn').onclick = () => { $('mute-btn').textContent = Sound.toggleMute() ? '🔇' : '🔊'; };
  $('cops-toggle').onclick = () => { quick.cops = !quick.cops; renderQuick(); };
  document.querySelectorAll('#laps-select button').forEach(b => {
    b.onclick = () => { quick.laps = Number(b.dataset.laps); renderQuick(); };
  });
  $('reset-career').onclick = () => {
    if (!confirm('Reset your career? Cash, cars and upgrades will be lost.')) return;
    career = Career.fresh();
    Career.save(career);
    renderCareer();
  };

  // --------------------------------------------------------------- loop
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) {
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
    } else {
      acc = 0;
    }
    render();
    updateHUD(dt);
    requestAnimationFrame(frame);
  }

  buildCarSprites();
  openMenu('main');
  requestAnimationFrame(frame);

  // exposed for debugging / automated smoke tests
  window.NitroRush = {
    get state() { return state; }, get player() { return P; }, get cop() { return cop; }, get race() { return race; },
    get career() { return career; }, input,
    curveAhead: n => findSegment(P.position + PLAYER_Z + (n || 0) * SEG).curve, BASE_MAX, quickRace, careerRace, beginRace, openMenu, events: Career.EVENTS,
  };
})();
