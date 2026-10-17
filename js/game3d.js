// Nitro Rush 3D - main game: physics, AI, police, camera, HUD and menus.
(() => {
  const T = THREE;
  const $ = id => document.getElementById(id);
  const { HW, WALL } = World;
  const STEP = 1 / 60;
  const TOP = 78;                 // reference top speed (m/s, ~280 km/h)
  const CAR_LEN = 4.5, CAR_WID = 1.95;
  const NITRO_MULT = 1.3;

  const CARS = [
    { id: 'vortex', name: 'Vortex GT', color: '#1e7bff', stripe: '#ffffff', glow: '#00c8ff', top: 0.95, accel: 1.0, handling: 1.0, desc: 'Balanced all-rounder' },
    { id: 'kestrel', name: 'Kestrel S', color: '#ffc400', stripe: '#1a1a1a', glow: '#b2ff59', top: 0.91, accel: 1.25, handling: 1.2, desc: 'Quick & nimble' },
    { id: 'raptor', name: 'Raptor RS', color: '#e8202a', stripe: '#111111', glow: '#ff2e88', top: 1.0, accel: 0.85, handling: 0.88, desc: 'Highest top speed' },
  ];
  const carById = id => CARS.find(c => c.id === id) || CARS[0];
  const RIVALS = [
    { name: 'Razor', color: '#1b1b1f', stripe: '#39ff14', tag: '#39ff14', skill: 0.97 },
    { name: 'Nyx', color: '#7b2ff7', stripe: '#ffffff', tag: '#b98bff', skill: 0.94 },
    { name: 'Blaze', color: '#ff6a00', stripe: '#111111', tag: '#ff9a40', skill: 0.91 },
  ];
  const TRAFFIC = ['#c0c4cc', '#6d7480', '#2f4a7a', '#7a2f2f', '#e8e1d0', '#3d6b4a', '#d9c45c', '#4a4a52', '#8a5a9c'];
  const TRACKS = World.DEFS;

  // ------------------------------------------------------------ renderer
  const canvas = $('game');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    $('nogl').classList.remove('hidden');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(62, 16 / 9, 0.1, 4500);
  const fxCanvas = $('fx'), fx = fxCanvas.getContext('2d');
  let VW = 1280, VH = 720;
  function resize() {
    VW = window.innerWidth; VH = window.innerHeight;
    renderer.setSize(VW, VH, false);
    camera.aspect = VW / VH;
    camera.updateProjectionMatrix();
    fxCanvas.width = VW; fxCanvas.height = VH;
  }
  window.addEventListener('resize', resize);
  resize();

  // headlight for the player car
  const headlight = new T.SpotLight(0xfff0d8, 0, 140, 0.55, 0.6, 1.1);
  const headTarget = new T.Object3D();
  headlight.target = headTarget;

  // ------------------------------------------------------------ state
  let state = 'menu';            // menu | countdown | race | finished | busted
  let paused = false;
  let career = Career.load();
  const quick = { track: TRACKS[0], car: CARS[0], laps: 3, cops: true };
  let race = null, track = null, trackId = null;
  let P = {};
  let rivals = [], traffic = [], ai = [], cop = null;
  let countdown = 0, lastCount = 0, clock = 0;
  let flash = 0, nextLightning = 8;
  let camMode = 0;
  let resultTimer = null;
  const input = { left: false, right: false, up: false, down: false, nitro: false };
  const tmp = {}, tmp2 = {};

  // ------------------------------------------------------------ models
  const models = { players: {}, rivals: [], traffic: [], cop: null };
  function playerModel(id) {
    if (!models.players[id]) {
      const c = carById(id);
      const m = CarModels.build({ type: 'sport', color: c.color, stripe: c.stripe, spinWheels: true, ownTail: true, flames: true, underglow: c.glow });
      scene.add(m.group);
      models.players[id] = m;
    }
    return models.players[id];
  }
  function rivalModel(i) {
    if (!models.rivals[i]) {
      const r = RIVALS[i];
      const m = CarModels.build({ type: 'sport', color: r.color, stripe: r.stripe, spinWheels: true, ownTail: true, flames: true, underglow: r.tag });
      scene.add(m.group);
      models.rivals[i] = m;
    }
    return models.rivals[i];
  }
  function trafficModel(i) {
    if (!models.traffic[i]) {
      const col = TRAFFIC[i % TRAFFIC.length];
      const type = i % 4 === 3 ? 'van' : 'sedan';
      const m = CarModels.build({ type, color: col });
      scene.add(m.group);
      models.traffic[i] = m;
    }
    return models.traffic[i];
  }
  function copModel() {
    if (!models.cop) {
      models.cop = CarModels.build({ type: 'cop', cop: true, spinWheels: true, ownTail: true });
      scene.add(models.cop.group);
    }
    return models.cop;
  }
  function hideAllModels() {
    Object.values(models.players).forEach(m => { m.group.visible = false; });
    models.rivals.forEach(m => { m.group.visible = false; });
    models.traffic.forEach(m => { m.group.visible = false; });
    if (models.cop) models.cop.group.visible = false;
  }

  // ------------------------------------------------------------ particles
  const smokeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  })();
  const smokePool = [];
  for (let i = 0; i < 140; i++) {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.visible = false;
    scene.add(sp);
    smokePool.push({ sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1 });
  }
  let smokeNext = 0;
  function smoke(x, y, z, color, size, life, vx, vy, vz, alpha) {
    const p = smokePool[smokeNext];
    smokeNext = (smokeNext + 1) % smokePool.length;
    p.sp.position.set(x, y, z);
    p.sp.material.color.set(color);
    p.sp.scale.set(size, size, 1);
    p.alpha = alpha || 0.5;
    p.life = p.max = life; p.vx = vx; p.vy = vy; p.vz = vz; p.grow = size * 1.4;
    p.sp.visible = true;
  }
  const SPARKS = 220;
  const sparkGeo = new T.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3).fill(-9999);
  sparkGeo.setAttribute('position', new T.BufferAttribute(sparkPos, 3));
  const sparkPts = new T.Points(sparkGeo, new T.PointsMaterial({ map: CarModels.glowTexture(), color: 0xffb040, size: 0.35, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  sparkPts.frustumCulled = false;
  scene.add(sparkPts);
  const sparkData = Array.from({ length: SPARKS }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
  let sparkNext = 0;
  function sparks(x, y, z, n, dirx, dirz) {
    for (let k = 0; k < n; k++) {
      const i = sparkNext; sparkNext = (sparkNext + 1) % SPARKS;
      sparkPos[i * 3] = x; sparkPos[i * 3 + 1] = y; sparkPos[i * 3 + 2] = z;
      const d = sparkData[i];
      d.life = 0.4 + Math.random() * 0.4;
      d.vx = (dirx || 0) * 6 + (Math.random() - 0.5) * 10;
      d.vz = (dirz || 0) * 6 + (Math.random() - 0.5) * 10;
      d.vy = 2 + Math.random() * 5;
    }
  }

  // rain
  const RAIN = 1600;
  const rainPos = new Float32Array(RAIN * 6);
  const rainGeo = new T.BufferGeometry();
  rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3));
  const rain = new T.LineSegments(rainGeo, new T.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.45 }));
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);
  const drops = Array.from({ length: RAIN }, () => ({ x: 0, y: -999, z: 0 }));

  // ------------------------------------------------------------ setup
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

  function loadTrack(def) {
    if (trackId === def.id) return;
    if (track) { scene.remove(track.group); track.dispose(); }
    track = World.build(def);
    trackId = def.id;
    scene.add(track.group);
    scene.fog = track.fog;
    renderer.setClearColor(track.theme.fog);
    rain.visible = !!track.theme.rain;
    buildMinimap();
  }

  function setupRace(cfg, attract) {
    race = cfg;
    loadTrack(cfg.trackDef);
    hideAllModels();
    const L = track.length;

    const startS = L - (attract ? 30 : 26);
    track.sampleAt(startS, tmp);
    const d0 = attract ? 0 : -2.6;
    P = {
      model: playerModel(cfg.carDef.id),
      x: tmp.x + tmp.nx * d0, z: tmp.z + tmp.nz * d0, y: tmp.y, h: tmp.h, vx: 0, vz: 0,
      speed: 0, steer: 0, s: startS, d: d0, i: tmp.i, prevI: tmp.i,
      lap: -1, maxLap: -1, lapTime: 0, lastLap: null, bestLap: null, raceTime: 0,
      nitro: 0.6, nitroOn: false, heat: 0, place: cfg.rivals ? 4 : 1, finished: false, finishTime: null,
      hitCooldown: 0, braking: false, shoulder: false, scraping: false,
      bust: 0, evade: 0, copCooldown: 20, shake: 0, nearMisses: 0,
      drift: false, driftDir: 0, driftTime: 0, driftCalm: 0, driftPts: 0, driftMult: 1, driftTotal: 0, driftBest: 0, slip: 0,
      launchRpm: 0.15, spin: 0, gear: 1, backfire: 0, maxSpeed: 0, wrong: 0,
      camH: tmp.h, camPos: new T.Vector3(), roll: 0, pitch: 0, wheelSpin: 0, autopilot: attract,
    };
    P.model.group.visible = true;
    P.model.group.add(headlight); P.model.group.add(headTarget);
    headlight.position.set(0, 0.8, 2.0);
    headTarget.position.set(0, 0, 40);
    if (cfg.type === 'pursuit' && !attract) { P.heat = 3; P.copCooldown = 2.5; }
    flash = 0; nextLightning = 6 + Math.random() * 6;

    rivals = []; traffic = []; ai = []; cop = null;
    if (cfg.rivals || attract) {
      const grid = [[-8, 2.6], [-14, -2.6], [-20, 2.6]];
      rivals = RIVALS.map((r, k) => ({
        kind: 'rival', name: r.name, idx: k, skill: r.skill * cfg.skillMul, model: rivalModel(k),
        dist: grid[k][0] - (attract ? 0 : 0), d: grid[k][1], targetD: grid[k][1], speed: 0, s: 0,
        len: CAR_LEN, wid: CAR_WID, finished: false, finishTime: null, wobble: Math.random() * 10, lat: 0, braking: false,
      }));
      rivals.forEach(r => { r.s = track.wrap(r.dist); r.model.group.visible = true; });
    }
    const lanes = [-5, 0, 5];
    const count = Math.round(cfg.trackDef.traffic * cfg.traffic);
    for (let k = 0; k < count; k++) {
      const lane = Math.floor(Math.random() * 3);
      const m = trafficModel(k);
      m.group.visible = true;
      const base = 17 + Math.random() * 9 + (lane === 0 ? 4 : lane === 2 ? -2 : 0);
      traffic.push({
        kind: 'traffic', model: m, s: 150 + Math.random() * (L - 450), d: lanes[lane], speed: base, base,
        len: m.length - 0.2, wid: m.width + 0.05, lat: 0,
      });
    }
    ai = rivals.concat(traffic);
  }

  // ------------------------------------------------------------ helpers
  const wrapD = d => { const L = track.length; d = ((d % L) + L) % L; return d > L / 2 ? d - L : d; };
  const angleWrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const playerProgress = () => P.lap * track.length + P.s;
  const topSpeed = () => TOP * race.stats.top;

  // ------------------------------------------------------------ update
  function update(dt) {
    clock += dt;
    if (state === 'countdown') { updateCountdown(dt); updateEffects(dt); return; }
    const racing = state === 'race';

    let ctrl = { steer: 0, throttle: false, brake: false, nitro: false };
    if (racing && !P.autopilot) {
      ctrl = { steer: (input.right ? 1 : 0) - (input.left ? 1 : 0), throttle: input.up, brake: input.down, nitro: input.nitro };
    } else if (state !== 'busted') {
      ctrl = autopilot();
    } else {
      ctrl.brake = true;
    }

    updateAI(dt);
    drivePlayer(dt, ctrl, racing);
    if (racing) {
      collideCars();
      P.raceTime += dt;
      P.lapTime += dt;
      nearMisses();
      if (race.rivals) updatePlace();
      if (race.cops) updateHeat(dt);
    }
    if (P.hitCooldown > 0) P.hitCooldown -= dt;

    // gears and exhaust pops
    const g = gearInfo();
    if (g.gear > P.gear && (ctrl.throttle || P.nitroOn) && racing) { Sound.pop(); P.backfire = 0.14; }
    P.gear = g.gear;
    if (P.backfire > 0) P.backfire -= dt;

    if (track.theme.rain) {
      nextLightning -= dt;
      if (nextLightning <= 0) { flash = 1; nextLightning = 9 + Math.random() * 14; setTimeout(() => Sound.crash(0.5), 300 + Math.random() * 700); }
    }
    flash = Math.max(0, flash - dt * 2.5);
    P.shake = Math.max(0, P.shake - dt * 2.5);
    updateEffects(dt);

    const top = topSpeed();
    const carving = Math.abs(P.steer) > 0.6 && P.speed > top * 0.6;
    Sound.update({
      rpm: g.rpm, gear: g.gear, throttle: ctrl.throttle || P.nitroOn ? 1 : 0,
      running: true, nitro: P.nitroOn, offroad: P.shoulder && P.speed > 5,
      skid: P.drift ? 0.5 + Math.min(0.5, Math.abs(P.slip)) : P.scraping ? 0.6 : P.spin > 0 ? 0.7 : carving ? 0.12 : 0,
      rain: track.theme.rain && !track.isTunnel(P.s),
      siren: cop ? Util.limit(1 - Math.abs(wrapD(cop.s - P.s)) / 400, 0, 1) : 0,
    });
  }

  function updateCountdown(dt) {
    countdown -= dt;
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
      const fx0 = Math.sin(P.h), fz0 = Math.cos(P.h);
      if (r >= 0.6 && r <= 0.86) {
        const v = 14 * race.stats.top;
        P.vx = fx0 * v; P.vz = fz0 * v;
        P.nitro = Math.min(1, P.nitro + 0.15);
        popup('PERFECT START!', 'good');
      } else if (r > 0.9) {
        P.spin = 0.9;
        popup('WHEELSPIN!', 'bad');
      }
    }
    Sound.update({ rpm: P.launchRpm, throttle: input.up ? 1 : 0, running: true, nitro: false, offroad: false, siren: 0, gear: 1, skid: 0, rain: track.theme.rain });
  }

  // simple pure-pursuit driver used for the attract mode and cool-down laps
  function autopilot() {
    const v = Math.max(0, P.speed);
    // pick the lane with the most room ahead
    const ahead = 35 + v;
    const gapAt = d => {
      let g = ahead;
      for (const o of ai) {
        const ds = wrapD(o.s - P.s);
        if (ds > -2 && ds < g && Math.abs(o.d - d) < 2.4) g = Math.max(0, ds);
      }
      return g;
    };
    if (P.apD === undefined) P.apD = 0;
    const cur = gapAt(P.apD);
    if (cur < ahead) {
      let best = P.apD, bg = cur;
      for (const d of [-5, -2.5, 0, 2.5, 5]) { const g = gapAt(d) - Math.abs(d - P.d) * 0.5; if (g > bg + 3) { bg = g; best = d; } }
      P.apD = best;
    }
    track.sampleAt(P.s + 10 + v * 0.45, tmp);
    tmp.x += tmp.nx * P.apD; tmp.z += tmp.nz * P.apD;
    const dx = tmp.x - P.x, dz = tmp.z - P.z;
    const want = Math.atan2(dx, dz);
    const diff = angleWrap(want - P.h);
    const look = track.curvAhead(P.s, 30 + v * 1.4);
    // apTop / apLat let tests drive like a stronger player
    const topV = P.apTop ? topSpeed() * P.apTop : TOP * 0.8 * (state === 'menu' ? 0.7 : 1);
    const target = Math.min(topV, Math.sqrt((P.apLat || 30) / Math.max(look.mag, 1e-4)));
    const straight = look.mag < 0.004 && Math.abs(diff) < 0.05;
    return { steer: Util.limit(-diff * 3, -1, 1), throttle: v < target, brake: v > target + 6, nitro: !!P.apNitro && straight && P.nitro > 0.3 };
  }

  function drivePlayer(dt, c, racing) {
    const st = race.stats;
    const top = topSpeed();
    let fx = Math.sin(P.h), fz = Math.cos(P.h), lx = fz, lz = -fx;
    let vf = P.vx * fx + P.vz * fz, vl = P.vx * lx + P.vz * lz;
    const spd = Math.abs(vf);

    P.nitroOn = racing && c.nitro && P.nitro > 0 && vf > 4;
    if (P.nitroOn) {
      if (!P.wasNitro) Sound.whoosh();
      P.nitro = Math.max(0, P.nitro - dt / (4.5 * st.nitroCap));
    } else if (racing) {
      P.nitro = Math.min(1, P.nitro + dt * 0.012);
    }
    P.wasNitro = P.nitroOn;
    const topCur = top * (P.nitroOn ? NITRO_MULT : 1);

    // steering input eases in like an analogue stick
    const rate = c.steer === 0 ? 7 : 3.6;
    P.steer += Util.limit(c.steer - P.steer, -rate * dt, rate * dt);

    // drift entry: brake + steer at speed
    if (!P.drift && racing && c.brake && c.steer !== 0 && vf > 20) {
      P.drift = true; P.driftDir = c.steer; P.driftTime = 0; P.driftPts = 0; P.driftCalm = 0;
      P.h -= c.steer * 0.07;
    }

    // longitudinal forces
    let acc = 0;
    const A = 11 * st.accel * (P.nitroOn ? 1.7 : 1) * (P.spin > 0 ? 0.2 : 1);
    if (P.spin > 0) P.spin -= dt;
    if ((c.throttle || P.nitroOn) && vf < topCur) acc += A * Math.max(0.1, 1 - Math.pow(Math.max(vf, 0) / topCur, 2));
    if (c.brake) {
      if (P.drift) acc -= 4;
      else if (vf > 0.5) acc -= 26;
      else if (!c.throttle) acc -= 7;
    }
    if (!c.throttle && !c.brake && !P.nitroOn) acc -= Math.sign(vf) * (1.2 + 0.0007 * vf * vf);
    if (vf > topCur) acc -= 9;
    vf += acc * dt;
    if (!c.throttle && !c.brake && Math.abs(vf) < 0.3) vf = 0;
    vf = Math.max(vf, -12);
    P.braking = c.brake && vf > 0.5 && !P.drift;

    // yaw
    const sp01 = Math.min(1, spd / top);
    let yawMax = st.handling * Util.interpolate(2.0, 0.9, sp01) * Math.min(1, spd / 7);
    if (P.drift) yawMax *= 1.45;
    P.h -= P.steer * yawMax * (vf >= 0 ? 1 : -1) * dt;
    if (P.drift) P.h -= P.driftDir * 0.3 * dt * Math.min(1, spd / 30);
    P.h = angleWrap(P.h);

    // velocity stays in the world frame; grip pulls it back in line with the nose
    let wx = fx * vf + lx * vl, wz = fz * vf + lz * vl;
    fx = Math.sin(P.h); fz = Math.cos(P.h); lx = fz; lz = -fx;
    vf = wx * fx + wz * fz; vl = wx * lx + wz * lz;
    const grip = (P.drift ? 2.0 : 9) * (track.theme.wet ? 0.8 : 1) * (P.shoulder ? 0.85 : 1);
    vl *= Math.exp(-grip * dt);
    vf -= Math.sign(vf) * Math.abs(vl) * (P.drift ? 0.12 : 0.35) * dt;
    if (P.shoulder) vf -= Math.sign(vf) * 3 * dt;
    P.vx = fx * vf + lx * vl; P.vz = fz * vf + lz * vl;
    P.x += P.vx * dt; P.z += P.vz * dt;
    P.speed = vf;
    P.slip = Math.atan2(vl, Math.max(1, Math.abs(vf)));

    // track position, laps, walls
    track.project(P.x, P.z, P.i, tmp2);
    const prevI = P.i;
    P.i = tmp2.i; P.s = tmp2.s; P.d = tmp2.d;
    const N = track.N;
    if (prevI > N * 0.8 && P.i < N * 0.2) { P.lap++; if (P.lap > P.maxLap) { P.maxLap = P.lap; if (P.lap >= 1) onLap(); } }
    else if (prevI < N * 0.2 && P.i > N * 0.8) P.lap--;

    const smp = track.sampleAt(P.s, tmp);
    P.y = smp.y;
    P.slope = smp.slope;
    P.shoulder = Math.abs(P.d) > HW + World.KERB;
    const wasScraping = P.scraping;
    P.scraping = false;
    const lim = WALL - 1.0;
    if (Math.abs(P.d) > lim) {
      const side = Math.sign(P.d), pen = Math.abs(P.d) - lim;
      P.x -= smp.nx * side * pen; P.z -= smp.nz * side * pen;
      P.d = side * lim;
      const vn = (P.vx * smp.nx + P.vz * smp.nz) * side;
      if (vn > 0) {
        P.vx -= smp.nx * side * vn * 1.3; P.vz -= smp.nz * side * vn * 1.3;
        const k = Math.max(0.55, 1 - vn * 0.03);
        P.vx *= k; P.vz *= k;
        // nudge the nose back along the wall
        P.h = angleWrap(P.h + angleWrap(smp.h - P.h) * Math.min(0.5, vn * 0.04));
        if (racing && vn > 4 && P.hitCooldown <= 0) {
          Sound.crash(Math.min(1.4, vn / 12));
          P.shake = Math.min(1, vn / 15);
          P.hitCooldown = 0.35;
          if (P.drift) endDrift(false);
        }
      }
      if (Math.abs(P.speed) > 6) {
        P.scraping = true;
        if (Math.random() < 0.8) sparks(P.x + smp.nx * side * 0.9, P.y + 0.4, P.z + smp.nz * side * 0.9, 2, -smp.tx, -smp.tz);
        if (!wasScraping && racing) Sound.crash(0.25);
      }
    }

    // drift scoring
    if (P.drift) {
      P.driftTime += dt;
      if (Math.abs(P.slip) < 0.09) P.driftCalm += dt; else P.driftCalm = 0;
      P.driftMult = Math.min(5, 1 + Math.floor(P.driftTime / 1.5));
      P.driftPts += dt * Math.min(0.9, Math.abs(P.slip)) * Math.max(0, vf) * 30 * P.driftMult;
      if (P.driftCalm > 0.3 || vf < 12) endDrift(true);
    }

    // wrong way
    if (racing) {
      const along = fx * smp.tx + fz * smp.tz;
      P.wrong = along < -0.3 && Math.abs(vf) > 3 ? P.wrong + dt : 0;
      // Wedged against a wall or car: pressing gas or brake but going nowhere.
      // Warn, then put the car back on the road so nobody is stuck (phones have no R key).
      P.stuck = Math.abs(vf) < 2 && (c.throttle || c.brake) ? (P.stuck || 0) + dt : 0;
      if (P.stuck > 2 && !P.stuckWarned) { P.stuckWarned = true; popup('STUCK? RESETTING…', 'bad'); }
      if (P.stuck > 4 || P.wrong > 8) { resetPlayer(); P.resets = (P.resets || 0) + 1; }
      if (P.stuck === 0) P.stuckWarned = false;
    }
    P.maxSpeed = Math.max(P.maxSpeed, vf);
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
  }

  function resetPlayer() {
    track.sampleAt(P.s, tmp);
    P.x = tmp.x; P.z = tmp.z; P.h = tmp.h; P.vx = P.vz = 0; P.speed = 0; P.d = 0;
    P.drift = false; P.wrong = 0; P.stuck = 0; P.camH = tmp.h;
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

  // ------------------------------------------------------------ AI
  function laneClear(self, s, d, ahead) {
    let gap = ahead;
    for (const o of ai) {
      if (o === self) continue;
      const ds = wrapD(o.s - s);
      if (ds > -3 && ds < gap && Math.abs(o.d - d) < 2.3) gap = Math.max(0, ds);
    }
    if (cop && self !== cop) {
      const ds = wrapD(cop.s - s);
      if (ds > -3 && ds < gap && Math.abs(cop.d - d) < 2.3) gap = Math.max(0, ds);
    }
    if (state === 'race' && self.kind !== 'cop') {
      const ds = wrapD(P.s - s);
      if (ds > -3 && ds < gap && Math.abs(P.d - d) < 2.3) gap = Math.max(0, ds);
    }
    return gap;
  }

  function steerAI(c, dt, look, preferred) {
    const ahead = 30 + c.speed * 0.8;
    const cur = laneClear(c, c.s, c.d, ahead);
    if (cur < ahead) {
      let best = c.d, bestGap = cur;
      for (const d of [-5, -2.5, 0, 2.5, 5]) {
        const g = laneClear(c, c.s, d, ahead) - Math.abs(d - c.d) * 0.8;
        if (g > bestGap + 2) { bestGap = g; best = d; }
      }
      c.targetD = best;
      if (cur < 12) {
        // stuck behind someone: match their speed
        for (const o of ai) {
          const ds = wrapD(o.s - c.s);
          if (o !== c && ds > 0 && ds < 12 && Math.abs(o.d - c.d) < 2.2) c.speed = Math.min(c.speed, o.speed);
        }
      }
    } else {
      c.targetD = preferred;
    }
    const prev = c.d;
    c.d += Util.limit(c.targetD - c.d, -5 * dt, 5 * dt);
    c.d = Util.limit(c.d, -6.2, 6.2);
    c.lat = (c.d - prev) / dt;
  }

  function updateAI(dt) {
    const pd = playerProgress();
    for (const r of rivals) {
      const prevSpeed = r.speed;
      const look = track.curvAhead(r.s, 25 + r.speed * 1.5);
      let top = TOP * 0.95 * r.skill;
      if (state === 'menu') top *= 0.7;
      else if (r.finished || state === 'finished' || state === 'busted') top *= 0.6;
      else if (state === 'race') {
        const gap = r.dist - pd;
        if (gap > 60) top *= Math.max(0.84, 1 - (gap - 60) / 1500);
        else if (gap < -60) top *= Math.min(1.12, 1 + (-gap - 60) / 1500);
        if (Math.sin(clock * 0.37 + r.wobble) > 0.93) top *= 1.15;   // nitro burst
      }
      if (state === 'countdown') top = 0;
      const vCorner = Math.sqrt(40 * r.skill / Math.max(look.mag, 1e-4));
      const target = Math.min(top, vCorner);
      if (r.speed < target) r.speed = Math.min(target, r.speed + 9 * Math.max(0.15, 1 - Math.pow(r.speed / (TOP * 1.1), 2)) * dt);
      else r.speed = Math.max(target, r.speed - 22 * dt);
      const racing = look.mag > 0.006 ? look.sign * 3.5 : Math.sin(clock * 0.2 + r.wobble) * 3;
      steerAI(r, dt, look, racing);
      r.braking = r.speed < prevSpeed - 8 * dt;
      r.dist += r.speed * dt;
      r.s = track.wrap(r.dist);
      if (state === 'race' && !r.finished && r.dist >= race.laps * track.length) { r.finished = true; r.finishTime = P.raceTime; }
    }
    for (const c of traffic) {
      const look = track.curvAhead(c.s, 40);
      let target = Math.min(c.base, Math.sqrt(16 / Math.max(look.mag, 1e-4)));
      for (const o of ai) {
        if (o === c) continue;
        const ds = wrapD(o.s - c.s);
        if (ds > 0 && ds < 22 && Math.abs(o.d - c.d) < 2.3) target = Math.min(target, o.speed - 1);
      }
      if (c.speed < target) c.speed = Math.min(target, c.speed + 3 * dt);
      else c.speed = Math.max(Math.max(0, target), c.speed - 12 * dt);
      c.s = track.wrap(c.s + c.speed * dt);
      const prev = c.d;
      const lane = Math.round(c.d / 5) * 5;
      c.d += Util.limit(lane - c.d, -1.5 * dt, 1.5 * dt);
      c.lat = (c.d - prev) / dt;
    }
    if (cop) updateCop(cop, dt);
  }

  // ------------------------------------------------------------ collisions
  function collideCars() {
    const smp = track.sampleAt(P.s, tmp);
    const list = cop ? ai.concat([cop]) : ai;
    for (const c of list) {
      const ds = wrapD(c.s - P.s), dd = c.d - P.d;
      const ovS = (CAR_LEN + c.len) / 2 - Math.abs(ds), ovD = (CAR_WID + c.wid) / 2 - Math.abs(dd);
      if (ovS <= 0 || ovD <= 0) continue;
      let vt = P.vx * smp.tx + P.vz * smp.tz, vn = P.vx * smp.nx + P.vz * smp.nz;
      let impact = 0;
      if (Math.abs(ds) > 2.3) {
        const dir = Math.sign(ds);
        const rel = (vt - c.speed) * dir;      // closing speed
        P.x -= smp.tx * dir * ovS; P.z -= smp.tz * dir * ovS;
        if (rel > 0) {
          impact = rel;
          const newVt = c.speed - dir * Math.min(3, rel * 0.2);
          c.speed = Math.max(0, c.speed + dir * rel * (c.kind === 'traffic' ? 0.35 : 0.2));
          vt = newVt;
        }
      } else {
        const dir = Math.sign(dd) || 1;
        P.x -= smp.nx * dir * ovD * 0.6; P.z -= smp.nz * dir * ovD * 0.6;
        c.d += dir * ovD * 0.4;
        if (vn * dir > 0) { impact = Math.abs(vn); vn = -vn * 0.3; }
        if (c.kind !== 'traffic') { c.speed *= 0.98; vt *= 0.99; }
      }
      P.vx = smp.tx * vt + smp.nx * vn; P.vz = smp.tz * vt + smp.nz * vn;
      if (impact > 2.5 && P.hitCooldown <= 0) {
        P.hitCooldown = 0.4;
        P.shake = Math.min(1, impact / 14);
        Sound.crash(Math.min(1.5, impact / 10));
        sparks(P.x, P.y + 0.6, P.z, 8 + Math.floor(impact), 0, 0);
        if (impact > 6 && P.drift) endDrift(false);
        if (c.kind === 'traffic') P.heat = Math.min(5, P.heat + 0.5);
        if (impact > 14) popup('CRASH!', 'bad');
      }
    }
  }

  function nearMisses() {
    for (const c of ai) {
      const rel = wrapD(c.s - P.s);
      if (c.prevRel !== undefined && c.prevRel > 0 && rel <= 0 && rel > -8) {
        const lat = Math.abs(c.d - P.d);
        if (lat > 2.0 && lat < 3.6 && P.speed > 30) {
          P.nitro = Math.min(1, P.nitro + 0.1);
          P.heat = Math.min(5, P.heat + 0.12);
          P.nearMisses++;
          if (P.drift) P.driftPts += 500;
          popup(P.drift ? 'DRIFT NEAR MISS  +500' : 'NEAR MISS  +NOS', 'nos');
          Sound.whoosh();
        }
      }
      c.prevRel = rel;
    }
  }

  function updatePlace() {
    const pd = playerProgress();
    const place = 1 + rivals.filter(r => r.finished || r.dist > pd).length;
    if (place < P.place) {
      popup('OVERTAKE!  ' + Util.ordinal(place), 'good');
      P.nitro = Math.min(1, P.nitro + 0.06);
    }
    P.place = place;
  }

  // ------------------------------------------------------------ police
  function updateHeat(dt) {
    if (P.speed > topSpeed() * 0.9) P.heat = Math.min(5, P.heat + dt * 0.03);
    if (!cop) {
      if (race.type !== 'pursuit') P.heat = Math.max(0, P.heat - dt * 0.01);
      P.copCooldown -= dt;
      if (P.heat >= 1.5 && P.copCooldown <= 0) spawnCop();
    }
  }

  function spawnCop() {
    const m = copModel();
    m.group.visible = true;
    cop = { kind: 'cop', model: m, s: track.wrap(P.s - (race.type === 'pursuit' ? 70 : 260)), d: P.d, targetD: P.d, speed: Math.max(20, P.speed), stun: 0, len: CAR_LEN, wid: CAR_WID, lat: 0 };
    P.bust = 0; P.evade = 0;
    popup('POLICE PURSUIT!', 'cop');
  }

  function removeCop() {
    if (!cop) return;
    cop.model.group.visible = false;
    cop = null;
    P.bust = 0; P.evade = 0;
  }

  function updateCop(c, dt) {
    const rel = wrapD(c.s - P.s);
    const top = TOP * 0.97 * race.copBoost;
    const look = track.curvAhead(c.s, 25 + c.speed * 1.4);
    let target;
    if (state !== 'race') target = 0;
    else if (rel < -150) target = top;
    else if (rel < -10) target = Math.min(top, P.speed + 14);
    else if (rel < 12) target = P.speed * 0.92;
    else target = P.speed * 0.7;
    target = Math.min(target, Math.sqrt(44 / Math.max(look.mag, 1e-4)));
    if (c.stun > 0) { c.stun -= dt; target = Math.min(target, 6); }
    if (c.speed < target) c.speed = Math.min(target, c.speed + 14 * dt);
    else c.speed = Math.max(target, c.speed - 24 * dt);
    // chase the player's line unless traffic is in the way
    // cops react late to traffic, which is how you shake them
    const ahead = 13;
    const prev = c.d;
    if (laneClear(c, c.s, c.d, ahead) < ahead && rel < -15) steerAI(c, dt, look, P.d);
    else { c.d += Util.limit(P.d - c.d, -5.5 * dt, 5.5 * dt); c.lat = (c.d - prev) / dt; }
    c.s = track.wrap(c.s + c.speed * dt);

    if (state !== 'race') return;

    for (const o of traffic) {
      const ds = wrapD(o.s - c.s);
      if (c.stun <= 0 && ds > 0 && ds < 4.6 && Math.abs(o.d - c.d) < 1.9 && c.speed > o.speed + 3) {
        c.speed = o.speed * 0.3;
        c.stun = 1.8;
        if (Math.abs(rel) < 300) { popup('COP CRASHED!', 'good'); Sound.crash(0.4); }
        break;
      }
    }

    // ramming from behind
    if (rel < 0 && rel > -5.2 && Math.abs(c.d - P.d) < 2.0 && c.speed > P.speed + 1 && P.hitCooldown <= 0) {
      const fx0 = Math.sin(P.h), fz0 = Math.cos(P.h);
      P.vx += fx0 * 3; P.vz += fz0 * 3;
      P.h += (Math.random() - 0.5) * 0.35;
      P.vx *= 0.82; P.vz *= 0.82;
      c.speed = Math.max(0, P.speed * 0.85);
      P.shake = 0.8; P.hitCooldown = 1;
      Sound.crash(0.8);
      sparks(P.x, P.y + 0.5, P.z, 14, 0, 0);
      if (P.drift) endDrift(false);
      popup('RAMMED!', 'bad');
    }

    if (Math.abs(rel) < 16 && P.speed < 10) P.bust = Math.min(1, P.bust + dt / 2.5);
    else P.bust = Math.max(0, P.bust - dt / 3);
    if (P.bust >= 1) { busted(); return; }

    // out of sight: far enough back, or less if you've ducked into a tunnel
    if (rel < -220 || (rel < -120 && track.isTunnel(P.s))) {
      P.evade += dt;
      if (P.evade > 3.5) {
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

  // ------------------------------------------------------------ effects
  function wheelWorld(m, side, back, out) {
    const fx0 = Math.sin(P.h), fz0 = Math.cos(P.h);
    out.x = P.x + fz0 * side * 0.85 - fx0 * back;
    out.z = P.z - fx0 * side * 0.85 - fz0 * back;
    out.y = P.y + 0.2;
    return out;
  }

  const wheelTmp = {};
  function updateEffects(dt) {
    // spawn
    if (P.model) {
      const theme = track.theme;
      const v = Math.abs(P.speed);
      const heavy = P.drift || P.spin > 0 || (state === 'countdown' && P.launchRpm > 0.9);
      if (heavy && Math.random() < 0.9) {
        for (const side of [1, -1]) {
          wheelWorld(P.model, side, 1.4, wheelTmp);
          smoke(wheelTmp.x, wheelTmp.y + 0.3, wheelTmp.z, '#e8e8f0', 1.6, 1.3 + Math.random() * 0.6, -P.vx * 0.15 + (Math.random() - 0.5), 0.8, -P.vz * 0.15 + (Math.random() - 0.5), 0.45);
        }
      }
      if (P.shoulder && v > 8 && Math.random() < 0.6) {
        wheelWorld(P.model, Math.sign(P.d) || 1, 1.4, wheelTmp);
        smoke(wheelTmp.x, wheelTmp.y + 0.2, wheelTmp.z, theme.ground, 1.2, 0.8, 0, 0.6, 0, 0.4);
      }
      if (theme.wet && v > 15 && !track.isTunnel(P.s) && Math.random() < v / 60) {
        for (const side of [1, -1]) {
          wheelWorld(P.model, side, 1.6, wheelTmp);
          smoke(wheelTmp.x, wheelTmp.y + 0.1, wheelTmp.z, '#9fb0c8', 1.0, 0.5, -P.vx * 0.1, 1.2, -P.vz * 0.1, 0.3);
        }
      }
    }
    // update smoke
    for (const p of smokePool) {
      if (!p.sp.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; continue; }
      p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt;
      const s = p.sp.scale.x + p.grow * dt;
      p.sp.scale.set(s, s, 1);
      p.sp.material.opacity = p.alpha * (p.life / p.max);
    }
    // sparks
    for (let i = 0; i < SPARKS; i++) {
      const d = sparkData[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { sparkPos[i * 3 + 1] = -9999; continue; }
      d.vy -= 18 * dt;
      sparkPos[i * 3] += d.vx * dt; sparkPos[i * 3 + 1] += d.vy * dt; sparkPos[i * 3 + 2] += d.vz * dt;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function updateRain(dt) {
    if (!rain.visible) return;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const inTunnel = track.isTunnel(P.s);
    for (let k = 0; k < RAIN; k++) {
      const d = drops[k];
      d.y -= 30 * dt;
      if (d.y < cy - 12 || Math.abs(d.x - cx) > 45 || Math.abs(d.z - cz) > 45) {
        d.x = cx + (Math.random() - 0.5) * 90;
        d.z = cz + (Math.random() - 0.5) * 90;
        d.y = cy + Math.random() * 25 + (d.y < -900 ? -10 : 0);
      }
      const o = k * 6;
      const hide = inTunnel ? -9999 : 0;
      rainPos[o] = d.x; rainPos[o + 1] = d.y + hide; rainPos[o + 2] = d.z;
      rainPos[o + 3] = d.x - P.vx * 0.012; rainPos[o + 4] = d.y + 0.9 + hide; rainPos[o + 5] = d.z - P.vz * 0.012;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------ render
  function placeAI(c, night) {
    const m = c.model;
    track.sampleAt(c.s, tmp);
    const x = tmp.x + tmp.nx * c.d, z = tmp.z + tmp.nz * c.d;
    const dist2 = (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2;
    m.group.visible = dist2 < 750 * 750;
    if (!m.group.visible) return;
    const yaw = Math.atan2(c.lat || 0, Math.max(5, c.speed));
    m.group.position.set(x, tmp.y, z);
    m.group.rotation.set(-Math.atan(tmp.slope), tmp.h + yaw, 0, 'YXZ');
    m.setBrake(!!c.braking, night);
    if (m.wheels.length) {
      for (const w of m.wheels) {
        w.spin.rotation.x += c.speed * STEP / 0.36;
        if (w.front) w.steer.rotation.y = yaw * 2;
      }
    }
    if (m.underglow) m.underglow.visible = night;
    if (m.flames.length) {
      const boost = c.kind === 'rival' && state === 'race' && Math.sin(clock * 0.37 + c.wobble) > 0.93;
      m.flames.forEach(f => { f.group.visible = boost; f.backfire.visible = false; if (boost) f.group.scale.set(1, 1, 0.7 + Math.random() * 0.6); });
    }
  }

  function render(dt) {
    const theme = track.theme;
    const inTunnel = track.isTunnel(P.s);
    const night = theme.night || inTunnel;

    // player car
    const m = P.model;
    m.group.position.set(P.x, P.y, P.z);
    m.group.rotation.set(-Math.atan(P.slope || 0), P.h, 0, 'YXZ');
    const top = topSpeed();
    const latG = -P.steer * Math.min(1, Math.abs(P.speed) / top);
    P.roll = Util.interpolate(P.roll, latG * 0.06 + (P.drift ? P.driftDir * 0.03 : 0), 0.1);
    const accelPitch = P.braking ? 0.025 : (input.up && state === 'race' ? -0.015 : 0);
    P.pitch = Util.interpolate(P.pitch, accelPitch, 0.1);
    m.body.rotation.set(P.pitch, 0, P.roll);
    P.wheelSpin += P.speed * dt / 0.36 + (P.spin > 0 ? 0.6 : 0);
    for (const w of m.wheels) {
      w.spin.rotation.x = P.wheelSpin;
      if (w.front) w.steer.rotation.y = -P.steer * 0.42 + (P.drift ? P.driftDir * 0.25 : 0);
    }
    m.setBrake(P.braking, night);
    m.underglow.visible = night;
    for (const f of m.flames) {
      f.group.visible = P.nitroOn || P.backfire > 0;
      f.group.children[0].visible = f.group.children[1].visible = P.nitroOn;
      f.backfire.visible = P.backfire > 0 && !P.nitroOn;
      if (P.nitroOn) f.group.scale.set(1, 1, 0.8 + Math.random() * 0.7);
      else f.group.scale.set(1, 1, 1);
    }
    m.group.visible = camMode !== 2 || state === 'menu';
    headlight.intensity = (theme.headlights || inTunnel) ? 900 : 0;

    for (const c of ai) placeAI(c, night);
    if (cop) { placeAI(cop, night); cop.model.setCop(clock); }

    updateCamera(dt);
    updateRain(dt);
    if (track.blinkers) track.blinkers.visible = Math.floor(clock * 1.5) % 2 === 0;
    track.hemi.intensity = theme.hemi[2] * (1 + flash * 3) * (inTunnel ? 0.6 : 1);
    if (track.sky) track.sky.position.copy(camera.position);
    renderer.render(scene, camera);
    drawFx();
  }

  function updateCamera(dt) {
    const v = Math.abs(P.speed);
    const top = topSpeed();
    const sp = Math.min(1.3, v / top);
    let dist, height, lookAhead;
    let target;
    if (state === 'menu') {
      target = P.h + Math.PI * 0.75 + Math.sin(clock * 0.12) * 0.7;
      dist = 11; height = 3.6; lookAhead = 0;
    } else if (state === 'countdown') {
      target = P.h + Math.max(0, countdown / 3.5) * Math.PI * 0.9;
      dist = 6.5 + Math.max(0, countdown) * 0.6; height = 2.0; lookAhead = 1;
    } else {
      // in a drift the camera follows the direction of travel, so the car swings sideways
      const velH = Math.atan2(P.vx, P.vz);
      target = v > 5 ? P.h + angleWrap(velH - P.h) * (P.drift ? 0.65 : 0.35) : P.h;
      if (P.speed < -1) target = P.h;
      dist = camMode === 1 ? 8.5 + sp * 1.5 : 5.6 + sp * 1.3;
      height = camMode === 1 ? 3.0 : 1.85;
      lookAhead = 4;
    }
    P.camH += angleWrap(target - P.camH) * (1 - Math.exp(-(state === 'race' ? 5 : 2.5) * dt));
    const fx0 = Math.sin(P.camH), fz0 = Math.cos(P.camH);
    if (camMode === 2 && state !== 'menu' && state !== 'countdown') {
      const hx = Math.sin(P.h), hz = Math.cos(P.h);
      camera.position.set(P.x + hx * 0.6, P.y + 1.05, P.z + hz * 0.6);
      camera.lookAt(P.x + hx * 30, P.y + 1.0 - (P.slope || 0) * 0, P.z + hz * 30);
    } else {
      const want = new T.Vector3(P.x - fx0 * dist, P.y + height, P.z - fz0 * dist);
      // keep the camera inside the barriers, above the road and under tunnel roofs
      const cp = track.project(want.x, want.z, P.i, tmp2);
      const camLim = WALL - 0.6;
      if (Math.abs(cp.d) > camLim) {
        const k = track.sampleAt(cp.s, tmp);
        const push = (Math.abs(cp.d) - camLim) * Math.sign(cp.d);
        want.x -= k.nx * push; want.z -= k.nz * push;
      }
      track.sampleAt(cp.s, tmp);
      want.y = Math.max(want.y, tmp.y + 1.0);
      if (tmp.tunnel) want.y = Math.min(want.y, tmp.y + World.TUNNEL_H - 1.2);
      camera.position.copy(want);
      camera.lookAt(P.x + fx0 * lookAhead, P.y + 1.0, P.z + fz0 * lookAhead);
    }
    if (P.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * P.shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * P.shake * 0.35;
    }
    const fov = 60 + sp * 14 + (P.nitroOn ? 9 : 0);
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt));
    camera.updateProjectionMatrix();
  }

  function drawFx() {
    fx.clearRect(0, 0, VW, VH);
    const v = Math.abs(P.speed), top = topSpeed();
    const cx = VW / 2, cy = VH * 0.45;
    if (state === 'race' && (P.nitroOn || v > top * 0.92)) {
      const strong = P.nitroOn;
      fx.strokeStyle = strong ? 'rgba(200,230,255,0.4)' : 'rgba(255,255,255,0.14)';
      fx.lineWidth = 2;
      fx.beginPath();
      const R = Math.max(VW, VH);
      for (let i = 0; i < (strong ? 30 : 14); i++) {
        const a = Math.random() * Math.PI * 2;
        const r1 = R * (0.32 + Math.random() * 0.25), r2 = r1 + R * (0.08 + Math.random() * 0.15);
        fx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.6);
        fx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.6);
      }
      fx.stroke();
      if (strong) {
        const vg = fx.createRadialGradient(cx, cy, VH * 0.3, cx, cy, VW * 0.7);
        vg.addColorStop(0, 'rgba(0,120,255,0)'); vg.addColorStop(1, 'rgba(0,140,255,0.25)');
        fx.fillStyle = vg; fx.fillRect(0, 0, VW, VH);
      }
    }
    if (cop && state === 'race') {
      const near = Util.limit(1 - Math.abs(wrapD(cop.s - P.s)) / 120, 0, 1);
      if (near > 0) {
        const red = Math.floor(clock * 6) % 2 === 0;
        const col = red ? '255,30,40' : '40,90,255';
        const g2 = red ? fx.createLinearGradient(0, 0, VW * 0.25, 0) : fx.createLinearGradient(VW, 0, VW * 0.75, 0);
        g2.addColorStop(0, 'rgba(' + col + ',' + 0.4 * near + ')'); g2.addColorStop(1, 'rgba(' + col + ',0)');
        fx.fillStyle = g2; fx.fillRect(red ? 0 : VW * 0.75, 0, VW * 0.25, VH);
      }
    }
    if (flash > 0) {
      fx.fillStyle = 'rgba(220,230,255,' + (flash * flash * 0.5).toFixed(3) + ')';
      fx.fillRect(0, 0, VW, VH);
    }
  }

  function gearInfo() {
    const pct = Math.max(0, P.speed) / topSpeed();
    const bands = [0, 0.14, 0.3, 0.48, 0.66, 0.84, 1.0];
    let gear = 1;
    while (gear < 6 && pct > bands[gear]) gear++;
    const lo = bands[gear - 1], hi = bands[gear];
    const rpm = Util.limit(0.25 + 0.75 * (pct - lo) / (hi - lo), 0.2, 1.1);
    return { gear, label: P.speed < -0.5 ? 'R' : P.speed < 1 ? 'N' : String(gear), rpm };
  }

  // ------------------------------------------------------------ HUD
  const hud = {
    root: $('hud'), pos: $('hud-pos'), lap: $('hud-lap'), time: $('hud-time'), lapTime: $('hud-laptime'),
    best: $('hud-best'), nitro: $('nitro-fill'), nitroBox: $('nitro'), heat: $('heat'), pursuit: $('pursuit'),
    gap: $('pursuit-gap'), bust: $('bust-fill'), evade: $('evade-fill'), board: $('board'),
    drift: $('drift-meter'), driftPts: $('drift-pts'), driftMult: $('drift-mult'), objective: $('objective'), wrong: $('wrong-way'),
  };
  const gaugeCtx = $('gauge').getContext('2d');
  const mapCtx = $('minimap').getContext('2d');
  let mapCache = null;
  const lastHud = {};
  function setText(el, key, v) { if (lastHud[key] !== v) { lastHud[key] = v; el.textContent = v; } }
  let boardTimer = 0;

  function buildMinimap() {
    const s = 180;
    mapCache = document.createElement('canvas');
    mapCache.width = mapCache.height = s;
    const g = mapCache.getContext('2d');
    const pts = track.map.map(p => [s / 2 + p.x * (s - 30), s / 2 + p.y * (s - 30)]);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    path(); g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 9; g.stroke();
    path(); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 4; g.stroke();
    g.strokeStyle = 'rgba(255,180,80,0.9)'; g.lineWidth = 4; g.beginPath();
    for (let i = 0; i < track.N; i++) {
      if (!track.tunnel[i]) continue;
      const [x, y] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      g.moveTo(x, y); g.lineTo(x2, y2);
    }
    g.stroke();
    mapCache.pts = pts;
  }

  function drawMinimap() {
    const s = 180;
    mapCtx.clearRect(0, 0, s, s);
    mapCtx.drawImage(mapCache, 0, 0);
    const pts = mapCache.pts;
    const at = sv => pts[Math.floor(track.wrap(sv) / track.spacing) % pts.length];
    const dot = (sv, color, r, ring) => {
      const [x, y] = at(sv);
      mapCtx.fillStyle = color;
      mapCtx.beginPath(); mapCtx.arc(x, y, r, 0, Math.PI * 2); mapCtx.fill();
      if (ring) { mapCtx.strokeStyle = ring; mapCtx.lineWidth = 2; mapCtx.stroke(); }
    };
    const [sx, sy] = pts[0];
    mapCtx.fillStyle = '#fff'; mapCtx.fillRect(sx - 5, sy - 2, 10, 4);
    rivals.forEach(r => dot(r.s, RIVALS[r.idx].tag, 4.5, 'rgba(0,0,0,0.6)'));
    if (cop) dot(cop.s, Math.floor(clock * 6) % 2 ? '#ff3030' : '#3a6bff', 5.5, '#fff');
    dot(P.s, race.carDef.color, 6.5, '#fff');
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
    setText(hud.lap, 'lap', Util.limit(P.lap + 1, 1, race.laps) + '/' + race.laps);
    setText(hud.time, 'time', Util.formatTime(P.raceTime));
    setText(hud.lapTime, 'laptime', Util.formatTime(P.lapTime));
    setText(hud.best, 'best', Util.formatTime(P.bestLap));
    const g = gearInfo();
    drawGauge(state === 'countdown' ? P.launchRpm : g.rpm, Math.round(Math.abs(P.speed) * 3.6), state === 'countdown' ? 'N' : g.label, state === 'countdown');
    drawMinimap();
    hud.nitro.style.width = (P.nitro * 100).toFixed(1) + '%';
    hud.nitroBox.classList.toggle('active', P.nitroOn);
    const stars = Math.floor(P.heat);
    setText(hud.heat, 'heat', '★'.repeat(stars) + '☆'.repeat(5 - stars));
    hud.heat.classList.toggle('hot', !!cop);
    hud.heat.classList.toggle('hidden', !race.cops);
    hud.pursuit.classList.toggle('hidden', !cop);
    if (cop) {
      const rel = wrapD(cop.s - P.s);
      setText(hud.gap, 'gap', (rel > 0 ? 'AHEAD ' : '') + Math.round(Math.abs(rel)) + ' m');
      hud.bust.style.width = (P.bust * 100) + '%';
      hud.evade.style.width = (Math.min(1, P.evade / 3.5) * 100) + '%';
    }
    hud.drift.classList.toggle('hidden', !P.drift || P.driftPts < 50);
    if (P.drift) {
      setText(hud.driftPts, 'driftpts', (Math.round(P.driftPts / 10) * 10).toLocaleString());
      setText(hud.driftMult, 'driftmult', 'x' + P.driftMult);
    }
    hud.wrong.classList.toggle('hidden', P.wrong < 1.5);
    let obj = '';
    if (race.type === 'drift') obj = 'DRIFT POINTS  ' + P.driftTotal.toLocaleString() + ' / ' + race.event.target.toLocaleString();
    else if (race.type === 'pursuit') obj = cop ? 'LOSE THE COPS' : 'GET READY…';
    setText(hud.objective, 'objective', obj);
    hud.objective.classList.toggle('hidden', !obj);

    boardTimer -= dt;
    if (boardTimer <= 0 && race.rivals) {
      boardTimer = 0.25;
      const pd = playerProgress();
      const rows = rivals.map(r => ({ name: r.name, d: r.dist, color: RIVALS[r.idx].tag }))
        .concat([{ name: 'YOU', d: pd, you: true, color: race.carDef.color }])
        .sort((a, b) => b.d - a.d);
      const html = rows.map((r, i) => '<li class="' + (r.you ? 'you' : '') + '"><span class="b-pos">' + (i + 1) +
        '</span><i style="background:' + r.color + '"></i>' + r.name + '</li>').join('');
      if (lastHud.board !== html) { lastHud.board = html; hud.board.innerHTML = html; }
    }
  }

  // rival name tags projected into screen space
  const tagEls = RIVALS.map(r => {
    const el = document.createElement('div');
    el.className = 'name-tag';
    el.textContent = r.name;
    el.style.color = r.tag;
    $('tags').appendChild(el);
    return el;
  });
  const tagV = new T.Vector3();
  function updateTags() {
    tagEls.forEach((el, k) => {
      const r = rivals[k];
      let showTag = false;
      if (r && (state === 'race' || state === 'countdown') && r.model.group.visible) {
        tagV.copy(r.model.group.position); tagV.y += 2.0;
        const dist = tagV.distanceTo(camera.position);
        tagV.project(camera);
        if (tagV.z < 1 && dist < 140 && dist > 4) {
          showTag = true;
          el.style.transform = 'translate(-50%,-100%) translate(' + ((tagV.x + 1) / 2 * VW).toFixed(0) + 'px,' + ((1 - tagV.y) / 2 * VH).toFixed(0) + 'px)';
          el.style.opacity = Util.limit(1.4 - dist / 120, 0.3, 1).toFixed(2);
        }
      }
      el.style.display = showTag ? 'block' : 'none';
    });
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

  // ------------------------------------------------------------ flow
  function storageGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function storageSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  const money = v => '$' + Math.round(v).toLocaleString();
  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function hideOverlays() { ['results', 'busted', 'pause'].forEach(id => show(id, false)); clearTimeout(resultTimer); }

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

  const kmhStr = v => Math.round(v * 3.6) + ' km/h';

  function finishRace() {
    endDrift(true);
    P.finished = true;
    P.finishTime = P.raceTime;
    P.autopilot = true;
    state = 'finished';
    removeCop();
    const common = [['Best lap', Util.formatTime(P.bestLap)], ['Top speed', kmhStr(P.maxSpeed)]];

    if (race.type === 'drift') {
      const target = race.event.target;
      const win = P.driftTotal >= target;
      const cash = settleCareer(1, win);
      showResults({
        title: win ? 'DRIFT KING!' : 'NOT ENOUGH STYLE', win,
        sub: 'Drift score ' + P.driftTotal.toLocaleString() + ' / ' + target.toLocaleString(),
        stats: [['Best drift', P.driftBest.toLocaleString()], ['Near misses', P.nearMisses]].concat(common), cash,
      });
      return;
    }

    const total = race.laps * track.length;
    const rows = rivals.map(r => ({
      name: r.name, finished: r.finished,
      time: r.finished ? r.finishTime : P.raceTime + (total - r.dist) / Math.max(r.speed, 25),
    }));
    rows.push({ name: 'YOU', time: P.finishTime, you: true, finished: true });
    rows.sort((a, b) => a.time - b.time);
    const place = rows.findIndex(r => r.you) + 1;
    const table = rows.map((r, i) =>
      '<tr class="' + (r.you ? 'you' : '') + '"><td>' + Util.ordinal(i + 1) + '</td><td>' + r.name + '</td><td>' +
      (r.finished ? Util.formatTime(r.time) : '+' + Util.formatTime(r.time - P.finishTime)) + '</td></tr>').join('');

    let cash = '';
    const stats = [['Near misses', P.nearMisses], ['Drift pts', P.driftTotal.toLocaleString()]].concat(common);
    if (race.mode === 'career') {
      cash = settleCareer(place, place === 1);
    } else {
      const key = 'nitro-rush-3d:' + race.trackDef.id + ':' + race.laps;
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
    P.autopilot = true;
    const cash = settleCareer(1, success);
    showResults({
      title: success ? 'ESCAPED!' : 'TOO HOT TO SHAKE', win: success,
      sub: success ? 'You lost the police in ' + Util.formatTime(P.raceTime) + '.' : 'The cops kept you in sight for ' + race.laps + ' laps.',
      stats: [['Near misses', P.nearMisses], ['Top speed', kmhStr(P.maxSpeed)]], cash,
    });
  }

  function busted() {
    endDrift(false);
    state = 'busted';
    Sound.crash(0.6);
    $('busted-info').textContent = 'Caught on lap ' + Util.limit(P.lap + 1, 1, race.laps) + ' of ' + race.laps + ' after ' + Util.formatTime(P.raceTime) + '.';
    $('busted-menu-btn').textContent = race.mode === 'career' ? 'CONTINUE' : 'MAIN MENU';
    resultTimer = setTimeout(() => { if (state === 'busted') show('busted', true); }, 900);
  }

  function setPaused(on) {
    if (state !== 'race' && state !== 'countdown') return;
    paused = on;
    show('pause', on);
    if (on) Sound.silence();
  }

  // ------------------------------------------------------------ screens
  const thumbs = {};
  function renderThumbs() {
    let r2;
    try {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 180;
      r2 = new T.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
      const sc = new T.Scene();
      sc.add(new T.HemisphereLight(0xffffff, 0x444466, 2.2));
      const dl = new T.DirectionalLight(0xffffff, 2.5); dl.position.set(4, 6, -3); sc.add(dl);
      const cam = new T.PerspectiveCamera(34, 16 / 9, 0.1, 100);
      cam.position.set(3.1, 1.55, -4.3); cam.lookAt(0, 0.5, 0.25);
      CARS.forEach(car => {
        const m = CarModels.build({ type: 'sport', color: car.color, stripe: car.stripe, spinWheels: true, ownTail: true });
        m.group.rotation.y = 0.35;
        sc.add(m.group);
        r2.render(sc, cam);
        thumbs[car.id] = c.toDataURL();
        sc.remove(m.group);
        m.dispose();
      });
    } catch (e) { /* thumbnails are optional */ }
    if (r2) { r2.dispose(); r2.forceContextLoss(); }
  }
  const carThumb = id => thumbs[id] || '';

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
      b.onclick = () => { quick.car = c; renderQuick(); setupRace(quickRace(), true); };
      carsEl.appendChild(b);
    });
    const trEl = $('track-select');
    trEl.innerHTML = '';
    TRACKS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'card track-card ' + t.theme + (t === quick.track ? ' selected' : '');
      const rec = storageGet('nitro-rush-3d:' + t.id + ':' + quick.laps);
      b.innerHTML = '<h3>' + t.name + '</h3><p>' + t.desc + '</p><p class="rec">Best (' + quick.laps + ' laps): ' +
        (rec && rec.time ? Util.formatTime(rec.time) : '--') + (rec && rec.wins ? ' · Wins: ' + rec.wins : '') + '</p>';
      b.onclick = () => { if (quick.track !== t) { quick.track = t; setupRace(quickRace(), true); } renderQuick(); };
      trEl.appendChild(b);
    });
    document.querySelectorAll('#laps-select button').forEach(b => b.classList.toggle('selected', Number(b.dataset.laps) === quick.laps));
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

  // ------------------------------------------------------------ input
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'nitro', ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro',
  };
  const cycleCam = () => { camMode = (camMode + 1) % 3; popup(['CHASE CAM', 'FAR CAM', 'BUMPER CAM'][camMode]); };
  document.addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (k) { input[k] = true; if (state !== 'menu') e.preventDefault(); }
    if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
    if (e.code === 'KeyM') { $('mute-btn').textContent = Sound.toggleMute() ? '🔇' : '🔊'; }
    if (e.code === 'KeyC' && !e.repeat && state !== 'menu') cycleCam();
    if (e.code === 'KeyR' && !e.repeat && state === 'race') resetPlayer();
    if (e.code === 'Enter') {
      if (state === 'menu' && !$('screen-quick').classList.contains('hidden')) beginRace(quickRace());
      else if (state === 'finished' || state === 'busted') retry();
    }
  });
  document.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) input[k] = false; });
  window.addEventListener('blur', () => { Object.keys(input).forEach(k => { input[k] = false; }); setPaused(true); });
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

  document.querySelectorAll('[data-screen]').forEach(b => { b.onclick = () => { Sound.init(); showScreen(b.dataset.screen); }; });
  $('start-btn').onclick = () => beginRace(quickRace());
  $('again-btn').onclick = retry;
  $('busted-again-btn').onclick = retry;
  $('menu-btn').onclick = leaveResults;
  $('busted-menu-btn').onclick = leaveResults;
  $('resume-btn').onclick = () => setPaused(false);
  $('quit-btn').onclick = () => openMenu(race.mode === 'career' ? 'career' : 'main');
  $('pause-btn').onclick = () => setPaused(true);
  $('cam-btn').onclick = cycleCam;
  $('reset-btn').onclick = () => { if (state === 'race') resetPlayer(); };
  $('mute-btn').onclick = () => { $('mute-btn').textContent = Sound.toggleMute() ? '🔇' : '🔊'; };
  $('cops-toggle').onclick = () => { quick.cops = !quick.cops; renderQuick(); };
  document.querySelectorAll('#laps-select button').forEach(b => { b.onclick = () => { quick.laps = Number(b.dataset.laps); renderQuick(); }; });
  $('reset-career').onclick = () => {
    if (!confirm('Reset your career? Cash, cars and upgrades will be lost.')) return;
    career = Career.fresh();
    Career.save(career);
    renderCareer();
  };

  // ------------------------------------------------------------ loop
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 6) { update(STEP); acc -= STEP; steps++; }
      if (steps === 6) acc = 0;
    } else acc = 0;
    render(paused ? 0 : dt);
    updateHUD(dt);
    updateTags();
    requestAnimationFrame(frame);
  }

  renderThumbs();
  openMenu('main');
  requestAnimationFrame(frame);

  // exposed for debugging / automated smoke tests
  window.NitroRush = {
    get state() { return state; }, get player() { return P; }, get cop() { return cop; }, get race() { return race; },
    get career() { return career; }, input, quickRace, careerRace, beginRace, openMenu, events: Career.EVENTS,
    setCam(m) { camMode = m; }, TOP, renderer, get track() { return track; },
    // run the simulation without rendering (for automated tests)
    simulate(sec, fn) { for (let k = 0; k < sec / STEP; k++) { if (fn) fn(); update(STEP); } },
  };
})();
