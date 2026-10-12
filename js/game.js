// Nitro Rush - a pseudo-3D street racer.
(() => {
  const { SEG, ROAD_W, CAM_H, DRAW_DIST, FOG_DENSITY, LANES } = Config;
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

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 1280, H = 720;
  canvas.width = W; canvas.height = H;

  const CARS = [
    { id: 'vortex', name: 'Vortex GT', color: '#1e7bff', stripe: '#ffffff', top: 0.95, accel: 1.0, handling: 1.0, desc: 'Balanced all-rounder' },
    { id: 'raptor', name: 'Raptor RS', color: '#e8202a', stripe: '#111111', top: 1.0, accel: 0.85, handling: 0.88, desc: 'Highest top speed' },
    { id: 'kestrel', name: 'Kestrel S', color: '#ffc400', stripe: '#1a1a1a', top: 0.91, accel: 1.25, handling: 1.2, desc: 'Quick & nimble' },
  ];

  const RIVALS = [
    { name: 'Razor', color: '#1b1b1f', stripe: '#39ff14', skill: 0.97 },
    { name: 'Nyx', color: '#7b2ff7', stripe: '#ffffff', skill: 0.94 },
    { name: 'Blaze', color: '#ff6a00', stripe: '#111111', skill: 0.91 },
  ];

  const TRAFFIC_COLORS = ['#c0c4cc', '#6d7480', '#2f4a7a', '#7a2f2f', '#e8e1d0', '#3d6b4a', '#d9c45c', '#4a4a52', '#8a5a9c'];

  // ------------------------------------------------------------ sprites
  const S = { players: {}, rivals: [], traffic: [], cop: [] };
  const themeCache = {};
  const bgCache = {};

  function withW(sprite, worldW) { sprite.worldW = worldW; return sprite; }

  function buildCarSprites() {
    CARS.forEach(c => {
      S.players[c.id] = {
        normal: withW(Sprites.car({ type: 'sport', color: c.color, stripe: c.stripe, spoiler: true }), CAR_W),
        brake: withW(Sprites.car({ type: 'sport', color: c.color, stripe: c.stripe, spoiler: true, brake: true }), CAR_W),
      };
    });
    S.rivals = RIVALS.map(r => ({
      normal: withW(Sprites.car({ type: 'sport', color: r.color, stripe: r.stripe, spoiler: true }), CAR_W),
      brake: withW(Sprites.car({ type: 'sport', color: r.color, stripe: r.stripe, spoiler: true, brake: true }), CAR_W),
    }));
    S.traffic = TRAFFIC_COLORS.map((col, i) => {
      const van = i % 3 === 2;
      return withW(Sprites.car({ type: van ? 'van' : 'sedan', color: col }), van ? 620 : CAR_W);
    });
    S.cop = [0, 1].map(f => withW(Sprites.car({ type: 'cop', color: '#f4f4f4', frame: f }), CAR_W));
  }

  function getThemeSprites(name) {
    if (themeCache[name]) return themeCache[name];
    const pal = THEMES[name];
    const rand = Util.rng(name === 'city' ? 7 : 11);
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
      palms: [],
      rock: withW(Sprites.rock(rand), 900),
      bush: withW(Sprites.bush(rand), 700),
    };
    for (let i = 0; i < 10; i++) t.buildings.push(withW(Sprites.building(rand, pal), 2400));
    for (let i = 0; i < 4; i++) t.palms.push(withW(Sprites.palm(rand), 1100));
    themeCache[name] = t;
    return t;
  }

  function getBackground(name) {
    if (bgCache[name]) return bgCache[name];
    const pal = THEMES[name];
    const rand = Util.rng(name === 'city' ? 21 : 33);
    const sky = Sprites.makeCanvas(W, H);
    const g = sky.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H / 2);
    pal.sky.forEach(([o, c]) => grd.addColorStop(o, c));
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    let far, near;
    if (pal.stars) {
      for (let i = 0; i < 220; i++) {
        g.fillStyle = 'rgba(255,255,255,' + (0.2 + rand() * 0.7) + ')';
        const s = rand() < 0.1 ? 2 : 1;
        g.fillRect(rand() * W, rand() * H * 0.42, s, s);
      }
      // moon
      g.fillStyle = '#f4ecd6';
      g.beginPath(); g.arc(W * 0.78, H * 0.13, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(244,236,214,0.08)';
      g.beginPath(); g.arc(W * 0.78, H * 0.13, 60, 0, Math.PI * 2); g.fill();
      far = Sprites.skyline(2048, 230, rand, pal, 0);
      near = Sprites.skyline(2048, 170, rand, pal, 1);
    } else {
      // sun + ocean
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
    }
    bgCache[name] = { sky, far, near };
    return bgCache[name];
  }

  // -------------------------------------------------------------- state
  let state = 'menu';            // menu | countdown | race | finished | busted
  let paused = false;
  let trackDef = TRACKS[0], carDef = CARS[0], lapsTotal = 3, copsOn = true;
  let segments = [], trackLength = 0, theme = null, bg = null;
  let cars = [], rivals = [], cop = null;
  let skyOffset = 0, hillOffset = 0;
  let countdown = 0, lastCount = 0;
  let particles = [];
  let clock = 0;
  const input = { left: false, right: false, up: false, down: false, nitro: false };
  let P = {};

  function findSegment(z) {
    return segments[Math.floor(z / SEG) % segments.length];
  }

  function playerDist() { return P.lap * trackLength + P.position; }

  function setupRace(attract) {
    const track = Track.build(trackDef);
    segments = track.segments;
    trackLength = track.trackLength;
    theme = track.theme;
    bg = getBackground(trackDef.theme);
    const startIndex = findSegment(PLAYER_Z).index;
    Track.decorate(track, trackDef, getThemeSprites(trackDef.theme), startIndex);

    P = {
      position: 0, x: attract ? 0 : 0.5, speed: 0, lap: 0, maxLap: 0,
      lapTime: 0, lastLap: null, bestLap: null, raceTime: 0,
      nitro: 0.6, nitroOn: false, heat: 0, place: 4, finished: false,
      finishTime: null, hitCooldown: 0, braking: false, lean: 0, offroad: false,
      bust: 0, evade: 0, copCooldown: 20, shake: 0, screen: null, nearMisses: 0,
      steer: 0,
    };
    cars = []; particles = []; cop = null;
    skyOffset = 0; hillOffset = 0;

    const grid = [[9, -0.5], [6, 0.5], [3, -0.5]];
    rivals = RIVALS.map((r, i) => ({
      kind: 'rival', name: r.name, idx: i, skill: r.skill,
      sprites: S.rivals[i], sprite: S.rivals[i].normal,
      offset: grid[i][1], dist: grid[i][0] * SEG, z: 0,
      speed: 0, w: CAR_NW, steer: 1.6, finished: false, finishTime: null,
      wobble: Math.random() * 10,
    }));
    rivals.forEach(r => { r.z = mod(PLAYER_Z + r.dist); cars.push(r); });

    const lanes = [-2 / 3, 0, 2 / 3];
    const laneSpeed = [0.44, 0.36, 0.28];
    for (let i = 0; i < trackDef.traffic; i++) {
      const lane = Math.floor(Math.random() * 3);
      const sprite = S.traffic[Math.floor(Math.random() * S.traffic.length)];
      const base = BASE_MAX * (laneSpeed[lane] + (Math.random() - 0.5) * 0.04);
      cars.push({
        kind: 'traffic', sprite, w: sprite.worldW / ROAD_W,
        offset: lanes[lane] + (Math.random() - 0.5) * 0.1,
        z: (40 + Math.random() * (segments.length - 60)) * SEG,
        speed: base, baseSpeed: base,
      });
    }
    cars.forEach(c => { c.seg = findSegment(c.z); c.seg.cars.push(c); });
  }

  function mod(z) { return ((z % trackLength) + trackLength) % trackLength; }

  // -------------------------------------------------------------- update
  function update(dt) {
    clock += dt;
    const playerSeg = findSegment(P.position + PLAYER_Z);
    const racing = state === 'race';
    const auto = state === 'menu' || state === 'finished' || state === 'busted';

    if (state === 'countdown') {
      countdown -= dt;
      const n = Math.ceil(countdown);
      if (n !== lastCount && n > 0) { lastCount = n; Sound.blip(440, 0.25, 'square', 0.2); centerMsg(String(n)); }
      if (countdown <= 0) {
        state = 'race';
        Sound.blip(880, 0.5, 'square', 0.25);
        centerMsg('GO!', 'go');
      }
      Sound.update({ rpm: input.up ? 0.8 : 0.15, throttle: input.up ? 1 : 0, running: true, nitro: false, offroad: false, siren: 0, gear: 1 });
      updateParticles(dt);
      return;
    }

    if (state === 'busted') { P.speed = Math.max(0, P.speed - BASE_MAX * dt); }

    const maxSpeed = BASE_MAX * carDef.top;
    const speedPct = P.speed / BASE_MAX;
    const dx = dt * 2 * speedPct * carDef.handling;

    updateCars(dt, playerSeg);

    let steer = 0, throttle = false, brake = false, nos = false;
    if (racing) {
      steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      throttle = input.up; brake = input.down; nos = input.nitro;
    } else if (auto && state !== 'busted') {
      // simple autopilot for the attract mode / cool-down lap
      const target = state === 'menu' ? 0 : 0.0;
      steer = Util.limit((target - P.x) * 3 + playerSeg.curve * 0.12, -1, 1);
      throttle = P.speed < BASE_MAX * (state === 'menu' ? 0.6 : 0.5);
    }
    P.steer = steer;

    movePlayer(Util.increase(P.position, dt * P.speed, trackLength));

    P.x += steer * dx;
    P.x -= dx * speedPct * playerSeg.curve * CENTRIFUGAL;

    // nitro
    P.nitroOn = nos && P.nitro > 0 && P.speed > BASE_MAX * 0.15;
    if (P.nitroOn) {
      if (!P.wasNitro) Sound.whoosh();
      P.nitro = Math.max(0, P.nitro - dt / 4.5);
    } else if (racing) {
      P.nitro = Math.min(1, P.nitro + dt * 0.012);
    }
    P.wasNitro = P.nitroOn;

    const topSpeed = maxSpeed * (P.nitroOn ? NITRO_MULT : 1);
    const accel = (maxSpeed / 5) * carDef.accel * (P.nitroOn ? 2.2 : 1);
    P.braking = brake;
    if (throttle || P.nitroOn) {
      if (P.speed < topSpeed) P.speed += accel * dt * (1 - 0.55 * Math.pow(P.speed / topSpeed, 2));
    } else if (brake) {
      P.speed -= BASE_MAX * dt;
    } else {
      P.speed -= (BASE_MAX / 5) * dt;
    }
    if (P.speed > topSpeed) P.speed = Math.max(topSpeed, P.speed - (BASE_MAX / 3) * dt);

    P.offroad = Math.abs(P.x) > 1;
    if (P.offroad && P.speed > BASE_MAX / 4) P.speed -= (BASE_MAX / 2) * dt;

    if (P.hitCooldown > 0) P.hitCooldown -= dt;
    if (racing) collide(playerSeg);

    P.x = Util.limit(P.x, -2, 2);
    P.speed = Util.limit(P.speed, 0, maxSpeed * NITRO_MULT);

    if (racing) {
      P.raceTime += dt;
      P.lapTime += dt;
      nearMisses();
      updatePlace();
      if (copsOn) updateHeat(dt);
    }

    const travelled = dt * P.speed / SEG;
    skyOffset = Util.increase(skyOffset, 0.001 * playerSeg.curve * travelled, 1);
    hillOffset = Util.increase(hillOffset, 0.002 * playerSeg.curve * travelled, 1);

    // visual flourishes
    P.lean = Util.interpolate(P.lean, steer * Math.min(1, speedPct * 1.5) * 0.05, 0.15);
    P.shake = Math.max(0, P.shake - dt * 2.5);
    spawnEffects(playerSeg, speedPct);
    updateParticles(dt);

    // audio
    const g = gearInfo();
    Sound.update({
      rpm: g.rpm, gear: g.gear, throttle: throttle || P.nitroOn ? 1 : 0,
      running: true, nitro: P.nitroOn, offroad: P.offroad && P.speed > 500,
      siren: cop ? Util.limit(1 - Math.abs(Util.wrapDelta(cop.z - (P.position + PLAYER_Z), trackLength)) / 20000, 0, 1) : 0,
    });
  }

  function movePlayer(newPos) {
    if (newPos < P.position - trackLength / 2) {
      P.lap++;
      if (P.lap > P.maxLap) { P.maxLap = P.lap; onLap(); }
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
    if (P.lap >= lapsTotal) { finishRace(); return; }
    if (P.lap === lapsTotal - 1) popup('FINAL LAP', 'big');
    else popup('LAP ' + (P.lap + 1) + '/' + lapsTotal, 'big');
    Sound.blip(660, 0.2, 'triangle', 0.2);
  }

  function updateCars(dt, playerSeg) {
    const pd = playerDist();
    for (const car of cars) {
      const prevSpeed = car.speed;
      if (car.kind === 'rival') updateRival(car, dt, pd, playerSeg);
      else if (car.kind === 'traffic') updateTraffic(car, dt);
      else if (car.kind === 'cop') updateCop(car, dt, playerSeg);
      if (car.kind === 'rival') car.sprite = car.speed < prevSpeed - BASE_MAX * dt * 0.4 ? car.sprites.brake : car.sprites.normal;
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
    if (state === 'menu') target = BASE_MAX * 0.6 * car.skill;
    else if (car.finished) target = BASE_MAX * 0.5;
    else {
      target = BASE_MAX * car.skill;
      const gap = car.dist - pd;   // rubber-banding keeps the pack close
      if (gap > 3000) target *= Math.max(0.84, 1 - (gap - 3000) / 50000);
      else if (gap < -3000) target *= Math.min(1.12, 1 + (-gap - 3000) / 50000);
      target *= 1 - Math.abs(car.seg.curve) * 0.01;
      // occasional nitro bursts from rivals
      if (Math.sin(clock * 0.37 + car.wobble) > 0.93) target *= 1.15;
    }
    approach(car, target, (BASE_MAX / 5) * 0.95, BASE_MAX / 3, dt);
    if (!steerAround(car, dt, 20, playerSeg, false)) {
      // wander gently between lanes
      car.offset += Math.sin(clock * 0.5 + car.wobble) * dt * 0.15;
    }
    car.offset = Util.limit(car.offset, -0.85, 0.85);
    car.dist += car.speed * dt;
    car.z = mod(PLAYER_Z + car.dist);
    if (state === 'race' && !car.finished && car.dist >= lapsTotal * trackLength) {
      car.finished = true;
      car.finishTime = P.raceTime;
    }
  }

  function updateTraffic(car, dt) {
    // brake for slower traffic directly ahead
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
      if (!ignorePlayer && state !== 'menu' && s === playerSeg && car.speed > P.speed &&
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
          if (P.hitCooldown <= 0) {
            P.shake = Math.min(1, impact * 1.5);
            Sound.crash(Math.max(0.4, impact));
            sparks(16);
            P.hitCooldown = 0.5;
          }
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
            P.shake = Math.min(1, impact * 3 + 0.2);
            Sound.crash(Math.min(1.5, impact * 3 + 0.3));
            sparks(10 + Math.floor(impact * 30));
            if (impact > 0.25) popup('CRASH!', 'bad');
            P.hitCooldown = 0.4;
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
          popup('NEAR MISS  +NOS', 'nos');
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
      P.heat = Math.max(0, P.heat - dt * 0.01);
      P.copCooldown -= dt;
      if (P.heat >= 1.5 && P.copCooldown <= 0) spawnCop();
    }
  }

  function spawnCop() {
    const pz = P.position + PLAYER_Z;
    cop = {
      kind: 'cop', sprite: S.cop[0], w: CAR_NW, offset: Util.limit(P.x, -0.8, 0.8),
      z: mod(pz - 45 * SEG), speed: P.speed, steer: 1.3, stun: 0,
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
    let target;
    if (state !== 'race') target = 0;
    else if (rel < -3000) target = BASE_MAX * 1.07;
    else if (rel < -250) target = Math.min(BASE_MAX * 1.07, P.speed + 1800);
    else if (rel < 700) target = P.speed * 0.9;   // alongside: box the player in
    else target = P.speed * 0.7;                   // ahead: brake-check
    if (c.stun > 0) { c.stun -= dt; target = Math.min(target, BASE_MAX * 0.15); }
    approach(c, target, BASE_MAX / 3, BASE_MAX / 2, dt);

    if (!steerAround(c, dt, 7, playerSeg, true)) {
      c.offset += Util.limit(P.x - c.offset, -1, 1) * dt * 1.4;
    }
    c.offset = Util.limit(c.offset, -0.9, 0.9);
    c.z = Util.increase(c.z, dt * c.speed, trackLength);
    c.sprite = S.cop[Math.floor(clock * 6) % 2];

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
        P.heat = 0.3;
        P.copCooldown = 25;
        P.nitro = Math.min(1, P.nitro + 0.5);
        popup('EVADED!  +NOS', 'good');
        Sound.blip(990, 0.3, 'triangle', 0.2);
      }
    } else {
      P.evade = Math.max(0, P.evade - dt * 0.5);
    }
  }

  // ------------------------------------------------------- effects
  function sparks(n) {
    if (!P.screen) return;
    for (let i = 0; i < n; i++) {
      particles.push({
        x: P.screen.x + (Math.random() - 0.5) * P.screen.w * 0.8,
        y: P.screen.y - P.screen.h * (0.2 + Math.random() * 0.4),
        vx: (Math.random() - 0.5) * 600, vy: -Math.random() * 400,
        life: 0.5 + Math.random() * 0.3, max: 0.8, color: Math.random() < 0.5 ? '#ffd23f' : '#ff8a00', size: 3, gravity: 900,
      });
    }
  }

  function spawnEffects(playerSeg, speedPct) {
    if (!P.screen || P.speed < 300) return;
    const { x, y, w } = P.screen;
    if (P.offroad && Math.random() < 0.8) {
      for (const side of [-1, 1]) {
        particles.push({
          x: x + side * w * 0.38, y: y - 8, vx: side * 60 + (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80,
          life: 0.7, max: 0.7, color: trackDef.theme === 'coast' ? 'rgba(215,180,120,' : 'rgba(150,150,160,', size: 14 + Math.random() * 10, smoke: true,
        });
      }
    }
    // tyre smoke when carving hard through a bend
    const carving = Math.abs(P.steer) > 0 && Math.abs(playerSeg.curve) > 2.5 && speedPct > 0.6 && Math.sign(P.steer) === Math.sign(playerSeg.curve);
    if (carving && Math.random() < 0.6) {
      for (const side of [-1, 1]) {
        particles.push({
          x: x + side * w * 0.36, y: y - 6, vx: -P.steer * 80 + (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40,
          life: 0.6, max: 0.6, color: 'rgba(230,230,240,', size: 10 + Math.random() * 10, smoke: true,
        });
      }
      if (state === 'race') P.nitro = Math.min(1, P.nitro + 0.0015);
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
    if (particles.length > 300) particles.splice(0, particles.length - 300);
  }

  function gearInfo() {
    const top = BASE_MAX * carDef.top;
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
    ctx.fillStyle = theme.ground[ci];
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

  function drawSprite(sprite, scale, destX, destY, offsetX, offsetY, clipY, fog) {
    const destW = sprite.worldW * scale * W / 2;
    const destH = destW * sprite.h / sprite.w;
    if (destW < 1 || destW > W * 4) return;
    destX += destW * offsetX;
    destY += destH * offsetY;
    const clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
    if (clipH < destH) {
      if (fog !== undefined && fog < 0.7) ctx.globalAlpha = Math.max(0.15, fog / 0.7);
      ctx.drawImage(sprite.canvas, 0, 0, sprite.w, sprite.h - (sprite.h * clipH / destH), destX, destY, destW, destH - clipH);
      ctx.globalAlpha = 1;
    }
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

    ctx.drawImage(bg.sky, 0, 0);
    drawLayer(bg.far, skyOffset, H / 2 + 12);
    drawLayer(bg.near, hillOffset, H / 2 + 14);
    ctx.fillStyle = theme.ground[1];
    ctx.fillRect(0, H / 2 + 14, W, H / 2);

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

    for (let i = DRAW_DIST - 1; i > 0; i--) {
      const seg = segments[(baseSeg.index + i) % n];
      for (const car of seg.cars) {
        const camZ = Util.wrapDelta(car.z - P.position, trackLength);
        if (camZ < PLAYER_Z * 0.9) continue;   // behind the player's car
        const pct = Util.percentRemaining(car.z, SEG);
        const scale = Util.interpolate(seg.p1.screen.scale, seg.p2.screen.scale, pct);
        const sx = Util.interpolate(seg.p1.screen.x, seg.p2.screen.x, pct) + scale * car.offset * ROAD_W * W / 2;
        const sy = Util.interpolate(seg.p1.screen.y, seg.p2.screen.y, pct);
        drawSprite(car.sprite, scale, sx, sy, -0.5, -1, seg.clip, seg.fog);
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
    drawScreenFx();
  }

  function drawPlayer(playerSeg, playerPct) {
    const scale = CAM_DEPTH / PLAYER_Z;
    const speedPct = P.speed / BASE_MAX;
    const bounce = (P.offroad ? 5 : 1.5) * Math.random() * speedPct * (Math.random() < 0.5 ? -1 : 1);
    const y = H / 2 - (scale * Util.interpolate(playerSeg.p1.camera.y, playerSeg.p2.camera.y, playerPct) * H / 2) - 6 + bounce;
    const set = S.players[carDef.id];
    const sprite = P.braking && P.speed > 0 ? set.brake : set.normal;
    const destW = sprite.worldW * scale * W / 2;
    const destH = destW * sprite.h / sprite.w;
    P.screen = { x: W / 2, y, w: destW, h: destH };

    ctx.save();
    ctx.translate(W / 2, y);
    ctx.rotate(P.lean);
    if (P.nitroOn) {
      // exhaust flames
      for (const fx of [-0.12, 0.12]) {
        const len = destH * (0.35 + Math.random() * 0.25);
        const fxp = fx * destW, fy = -destH * 0.1;
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
    ctx.drawImage(sprite.canvas, -destW / 2, -destH, destW, destH);
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

  function drawScreenFx() {
    if (P.nitroOn) {
      ctx.save();
      ctx.strokeStyle = 'rgba(200,230,255,0.35)';
      ctx.lineWidth = 2;
      const cx = W / 2, cy = H * 0.45;
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const r1 = 260 + Math.random() * 300, r2 = r1 + 80 + Math.random() * 200;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.6);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.6);
        ctx.stroke();
      }
      const vg = ctx.createRadialGradient(cx, cy, H * 0.3, cx, cy, W * 0.7);
      vg.addColorStop(0, 'rgba(0,120,255,0)');
      vg.addColorStop(1, 'rgba(0,140,255,0.28)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (cop && state === 'race') {
      const rel = Util.wrapDelta(cop.z - (P.position + PLAYER_Z), trackLength);
      const near = Util.limit(1 - Math.abs(rel) / 6000, 0, 1);
      if (near > 0) {
        const red = Math.floor(clock * 6) % 2 === 0;
        const col = red ? '255,30,40' : '40,90,255';
        const grd = ctx.createLinearGradient(0, 0, red ? W * 0.25 : W, 0);
        if (red) { grd.addColorStop(0, 'rgba(' + col + ',' + 0.4 * near + ')'); grd.addColorStop(1, 'rgba(' + col + ',0)'); ctx.fillStyle = grd; ctx.fillRect(0, 0, W * 0.25, H); }
        else {
          const g2 = ctx.createLinearGradient(W, 0, W * 0.75, 0);
          g2.addColorStop(0, 'rgba(' + col + ',' + 0.4 * near + ')'); g2.addColorStop(1, 'rgba(' + col + ',0)');
          ctx.fillStyle = g2; ctx.fillRect(W * 0.75, 0, W * 0.25, H);
        }
      }
    }
  }

  // ---------------------------------------------------------------- HUD
  const $ = id => document.getElementById(id);
  const hud = {
    root: $('hud'), pos: $('hud-pos'), lap: $('hud-lap'), time: $('hud-time'), lapTime: $('hud-laptime'),
    best: $('hud-best'), speed: $('hud-speed'), gear: $('hud-gear'), nitro: $('nitro-fill'),
    nitroBox: $('nitro'), heat: $('heat'), pursuit: $('pursuit'), gap: $('pursuit-gap'),
    bust: $('bust-fill'), evade: $('evade-fill'), board: $('board'), rpm: $('rpm-fill'),
  };
  const lastHud = {};
  function setText(el, key, v) { if (lastHud[key] !== v) { lastHud[key] = v; el.textContent = v; } }
  let boardTimer = 0;

  function updateHUD(dt) {
    const show = state === 'race' || state === 'countdown';
    hud.root.classList.toggle('hidden', !show);
    if (!show) return;
    setText(hud.pos, 'pos', String(P.place));
    setText(hud.lap, 'lap', Math.min(P.lap + 1, lapsTotal) + '/' + lapsTotal);
    setText(hud.time, 'time', Util.formatTime(P.raceTime));
    setText(hud.lapTime, 'laptime', Util.formatTime(P.lapTime));
    setText(hud.best, 'best', Util.formatTime(P.bestLap));
    setText(hud.speed, 'speed', String(Math.round(P.speed / BASE_MAX * KMH)));
    const g = gearInfo();
    setText(hud.gear, 'gear', g.label);
    hud.rpm.style.width = Math.min(100, g.rpm * 92) + '%';
    hud.nitro.style.width = (P.nitro * 100).toFixed(1) + '%';
    hud.nitroBox.classList.toggle('active', P.nitroOn);
    const stars = Math.floor(P.heat);
    setText(hud.heat, 'heat', '★'.repeat(stars) + '☆'.repeat(5 - stars));
    hud.heat.classList.toggle('hot', !!cop);
    hud.pursuit.classList.toggle('hidden', !cop);
    if (cop) {
      const rel = Util.wrapDelta(cop.z - (P.position + PLAYER_Z), trackLength);
      setText(hud.gap, 'gap', (rel > 0 ? 'AHEAD ' : '') + Math.round(Math.abs(rel) / METERS) + ' m');
      hud.bust.style.width = (P.bust * 100) + '%';
      hud.evade.style.width = (Math.min(1, P.evade / 4) * 100) + '%';
    }
    boardTimer -= dt;
    if (boardTimer <= 0) {
      boardTimer = 0.25;
      const pd = playerDist();
      const rows = rivals.map(r => ({ name: r.name, d: r.dist, color: RIVALS[r.idx].stripe === '#ffffff' ? RIVALS[r.idx].color : RIVALS[r.idx].stripe }))
        .concat([{ name: 'YOU', d: pd, you: true, color: carDef.color }])
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
  function recordKey() { return 'nitro-rush:' + trackDef.id + ':' + lapsTotal; }

  function show(id, on) { $(id).classList.toggle('hidden', !on); }

  function startRace() {
    Sound.init();
    setupRace(false);
    show('menu', false); show('results', false); show('busted', false); show('pause', false);
    paused = false;
    state = 'countdown';
    countdown = 3.5; lastCount = 0;
    boardTimer = 0;
    document.body.classList.add('racing');
  }

  function toMenu() {
    show('results', false); show('busted', false); show('pause', false);
    paused = false;
    state = 'menu';
    setupRace(true);
    renderMenu();
    show('menu', true);
    document.body.classList.remove('racing');
    Sound.silence();
  }

  function finishRace() {
    P.finished = true;
    P.finishTime = P.raceTime;
    state = 'finished';
    removeCop();
    const total = lapsTotal * trackLength;
    const rows = rivals.map(r => ({
      name: r.name,
      time: r.finished ? r.finishTime : P.raceTime + (total - r.dist) / Math.max(r.speed, BASE_MAX * 0.5),
    }));
    rows.push({ name: 'YOU', time: P.finishTime, you: true });
    rows.sort((a, b) => a.time - b.time);
    const place = rows.findIndex(r => r.you) + 1;

    const rec = storageGet(recordKey()) || {};
    let newRecord = false;
    if (!rec.time || P.finishTime < rec.time) { rec.time = P.finishTime; newRecord = true; }
    if (P.bestLap !== null && (!rec.lap || P.bestLap < rec.lap)) rec.lap = P.bestLap;
    if (place === 1) rec.wins = (rec.wins || 0) + 1;
    storageSet(recordKey(), rec);

    $('res-title').textContent = place === 1 ? 'YOU WIN!' : Util.ordinal(place).toUpperCase() + ' PLACE';
    $('res-title').className = place === 1 ? 'win' : '';
    $('res-table').innerHTML = rows.map((r, i) =>
      '<tr class="' + (r.you ? 'you' : '') + '"><td>' + Util.ordinal(i + 1) + '</td><td>' + r.name + '</td><td>' +
      (r.you || rivals.find(x => x.name === r.name).finished ? Util.formatTime(r.time) : '+' + Util.formatTime(r.time - P.finishTime)) + '</td></tr>').join('');
    $('res-stats').innerHTML =
      '<div><span>Best lap</span><b>' + Util.formatTime(P.bestLap) + '</b></div>' +
      '<div><span>Near misses</span><b>' + P.nearMisses + '</b></div>' +
      '<div><span>Record</span><b>' + Util.formatTime(rec.time) + (newRecord ? ' <em>NEW!</em>' : '') + '</b></div>';
    Sound.blip(place === 1 ? 1046 : 523, 0.6, 'triangle', 0.25);
    setTimeout(() => { if (state === 'finished') show('results', true); }, 1200);
  }

  function busted() {
    state = 'busted';
    Sound.crash(0.6);
    $('busted-info').textContent = 'Caught on lap ' + Math.min(P.lap + 1, lapsTotal) + ' of ' + lapsTotal + ' after ' + Util.formatTime(P.raceTime) + '.';
    setTimeout(() => { if (state === 'busted') show('busted', true); }, 900);
  }

  function setPaused(on) {
    if (state !== 'race' && state !== 'countdown') return;
    paused = on;
    show('pause', on);
    if (on) Sound.silence();
  }

  // menu rendering
  function renderMenu() {
    const carsEl = $('car-select');
    carsEl.innerHTML = '';
    CARS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'card car-card' + (c === carDef ? ' selected' : '');
      const img = S.players[c.id].normal.canvas.toDataURL();
      const bar = v => '<span class="bar"><span style="width:' + Math.round(v * 100) + '%"></span></span>';
      b.innerHTML = '<img alt="" src="' + img + '"><h3>' + c.name + '</h3><p>' + c.desc + '</p>' +
        '<div class="stats"><label>Speed</label>' + bar((c.top - 0.8) / 0.22) +
        '<label>Accel</label>' + bar((c.accel - 0.6) / 0.7) +
        '<label>Handling</label>' + bar((c.handling - 0.6) / 0.65) + '</div>';
      b.onclick = () => { carDef = c; renderMenu(); };
      carsEl.appendChild(b);
    });

    const trEl = $('track-select');
    trEl.innerHTML = '';
    TRACKS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'card track-card ' + t.theme + (t === trackDef ? ' selected' : '');
      const rec = storageGet('nitro-rush:' + t.id + ':' + lapsTotal);
      b.innerHTML = '<h3>' + t.name + '</h3><p>' + t.desc + '</p><p class="rec">Best (' + lapsTotal + ' laps): ' +
        (rec && rec.time ? Util.formatTime(rec.time) : '--') + (rec && rec.wins ? ' · Wins: ' + rec.wins : '') + '</p>';
      b.onclick = () => { if (trackDef !== t) { trackDef = t; setupRace(true); } renderMenu(); };
      trEl.appendChild(b);
    });

    document.querySelectorAll('#laps-select button').forEach(b => {
      b.classList.toggle('selected', Number(b.dataset.laps) === lapsTotal);
    });
    $('cops-toggle').textContent = copsOn ? 'ON' : 'OFF';
    $('cops-toggle').classList.toggle('selected', copsOn);
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
      if (state === 'menu') startRace();
      else if (state === 'finished' || state === 'busted') startRace();
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

  // touch controls
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

  $('start-btn').onclick = startRace;
  $('again-btn').onclick = startRace;
  $('busted-again-btn').onclick = startRace;
  $('menu-btn').onclick = toMenu;
  $('busted-menu-btn').onclick = toMenu;
  $('resume-btn').onclick = () => setPaused(false);
  $('quit-btn').onclick = toMenu;
  $('pause-btn').onclick = () => setPaused(true);
  $('mute-btn').onclick = () => { $('mute-btn').textContent = Sound.toggleMute() ? '🔇' : '🔊'; };
  $('cops-toggle').onclick = () => { copsOn = !copsOn; renderMenu(); };
  document.querySelectorAll('#laps-select button').forEach(b => {
    b.onclick = () => { lapsTotal = Number(b.dataset.laps); renderMenu(); };
  });

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
  toMenu();
  requestAnimationFrame(frame);

  // exposed for debugging / automated smoke tests
  window.NitroRush = { get state() { return state; }, get player() { return P; }, get cop() { return cop; }, startRace, toMenu, input };
})();
