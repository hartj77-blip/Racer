// Procedurally drawn sprites. Everything is painted once onto offscreen
// canvases at startup, so the game needs no image assets.
const Sprites = (() => {
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Lighten (amt > 0) or darken (amt < 0) a hex colour
  function shade(hex, amt) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p) + r;
    g = Math.round((t - g) * p) + g;
    b = Math.round((t - b) * p) + b;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ---------------------------------------------------------------- cars
  // Rear view of a car. type: 'sport' | 'sedan' | 'van' | 'cop'
  function car(opts) {
    const type = opts.type || 'sport';
    const w = 200;
    const h = type === 'van' ? 160 : 118;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const body = opts.color;

    // shadow
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath(); g.ellipse(w / 2, h - 6, w * 0.5, 7, 0, 0, Math.PI * 2); g.fill();

    // tyres
    g.fillStyle = '#0d0d0f';
    rr(g, 10, h - 34, 32, 30, 6); g.fill();
    rr(g, w - 42, h - 34, 32, 30, 6); g.fill();

    const bodyTop = type === 'van' ? h * 0.1 : h * 0.44;
    const bodyBot = h - 12;

    if (type !== 'van') {
      const roofY = type === 'sedan' || type === 'cop' ? h * 0.08 : h * 0.14;
      // cabin
      g.fillStyle = type === 'cop' ? '#15151a' : shade(body, -0.3);
      g.beginPath();
      g.moveTo(w * 0.18, bodyTop + 4); g.lineTo(w * 0.29, roofY);
      g.lineTo(w * 0.71, roofY); g.lineTo(w * 0.82, bodyTop + 4);
      g.closePath(); g.fill();
      // rear window
      const wg = g.createLinearGradient(0, roofY, 0, bodyTop);
      wg.addColorStop(0, '#2a3550'); wg.addColorStop(1, '#07090f');
      g.fillStyle = wg;
      g.beginPath();
      g.moveTo(w * 0.25, bodyTop); g.lineTo(w * 0.33, roofY + 6);
      g.lineTo(w * 0.67, roofY + 6); g.lineTo(w * 0.75, bodyTop);
      g.closePath(); g.fill();
      // window glare
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.moveTo(w * 0.36, bodyTop); g.lineTo(w * 0.42, roofY + 6);
      g.lineTo(w * 0.48, roofY + 6); g.lineTo(w * 0.44, bodyTop);
      g.closePath(); g.fill();
    }

    // main body
    const bg = g.createLinearGradient(0, bodyTop, 0, bodyBot);
    const lower = type === 'cop' ? '#f4f4f4' : body;
    bg.addColorStop(0, shade(lower, 0.3));
    bg.addColorStop(0.45, lower);
    bg.addColorStop(1, shade(lower, -0.5));
    g.fillStyle = bg;
    rr(g, 4, bodyTop, w - 8, bodyBot - bodyTop, type === 'van' ? 10 : 16); g.fill();

    if (type === 'van') {
      // rear doors + windows
      g.strokeStyle = shade(body, -0.35); g.lineWidth = 2;
      g.beginPath(); g.moveTo(w / 2, bodyTop + 6); g.lineTo(w / 2, bodyBot - 22); g.stroke();
      g.fillStyle = '#121620';
      rr(g, 22, bodyTop + 12, w / 2 - 30, 34, 4); g.fill();
      rr(g, w / 2 + 8, bodyTop + 12, w / 2 - 30, 34, 4); g.fill();
    }

    if (type === 'cop') {
      // black upper band like a police cruiser
      g.fillStyle = '#16161a';
      rr(g, 4, bodyTop, w - 8, 18, 10); g.fill();
      g.fillStyle = '#1b3fa8';
      g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
      g.fillText('POLICE', w / 2, bodyTop + 58);
    }

    if (opts.stripe) {
      g.fillStyle = opts.stripe;
      g.fillRect(w / 2 - 15, bodyTop + 2, 10, bodyBot - bodyTop - 20);
      g.fillRect(w / 2 + 5, bodyTop + 2, 10, bodyBot - bodyTop - 20);
    }

    // diffuser / bumper
    g.fillStyle = '#141417';
    rr(g, 28, bodyBot - 17, w - 56, 15, 4); g.fill();

    // tail lights
    const ty = type === 'van' ? bodyBot - 50 : bodyTop + 12;
    g.save();
    if (opts.brake) { g.shadowColor = '#ff1a1a'; g.shadowBlur = 22; }
    g.fillStyle = opts.brake ? '#ff3030' : '#a0141c';
    rr(g, 12, ty, 46, 12, 4); g.fill();
    rr(g, w - 58, ty, 46, 12, 4); g.fill();
    if (type === 'sport') {
      g.fillStyle = opts.brake ? 'rgba(255,70,70,0.95)' : 'rgba(150,20,30,0.9)';
      g.fillRect(58, ty + 4, w - 116, 3);
    }
    g.restore();

    // licence plate
    g.fillStyle = '#e9e9dc';
    rr(g, w / 2 - 22, ty + 24, 44, 13, 2); g.fill();
    g.fillStyle = '#333';
    g.fillRect(w / 2 - 16, ty + 29, 32, 3);

    // exhausts
    if (type === 'sport') {
      for (const ex of [w * 0.38, w * 0.62]) {
        g.fillStyle = '#555';
        g.beginPath(); g.arc(ex, bodyBot - 9, 7, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#0a0a0a';
        g.beginPath(); g.arc(ex, bodyBot - 9, 4, 0, Math.PI * 2); g.fill();
      }
    }

    // spoiler
    if (opts.spoiler) {
      g.fillStyle = shade(body, -0.4);
      g.fillRect(14, bodyTop - 4, 10, 10);
      g.fillRect(w - 24, bodyTop - 4, 10, 10);
      rr(g, 4, bodyTop - 14, w - 8, 10, 3);
      g.fillStyle = shade(body, -0.2); g.fill();
    }

    // police light bar
    if (type === 'cop') {
      const lit = opts.frame === 0;
      const ly = h * 0.08 - 10;
      g.save();
      g.shadowBlur = lit ? 25 : 0;
      g.shadowColor = '#ff2020';
      g.fillStyle = lit ? '#ff3030' : '#5a0d10';
      rr(g, w * 0.3, ly, w * 0.19, 11, 3); g.fill();
      g.shadowBlur = lit ? 0 : 25;
      g.shadowColor = '#2050ff';
      g.fillStyle = lit ? '#0e1a5a' : '#3a6bff';
      rr(g, w * 0.51, ly, w * 0.19, 11, 3); g.fill();
      g.restore();
    }

    return { canvas: c, w: w, h: h };
  }

  // ------------------------------------------------------- roadside props
  function lamp(side, glow) {
    // side: -1 left of road (sprite extends left, arm reaches right towards road)
    const w = 130, h = 440;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    g.save();
    if (side > 0) { g.translate(w, 0); g.scale(-1, 1); }
    g.fillStyle = '#2b2b33';
    g.fillRect(18, 40, 9, h - 40);
    g.fillRect(12, h - 18, 22, 18);
    g.beginPath();
    g.moveTo(22, 44); g.quadraticCurveTo(30, 18, 70, 20); g.lineTo(108, 20);
    g.lineTo(108, 27); g.lineTo(70, 27); g.quadraticCurveTo(36, 26, 27, 50);
    g.closePath(); g.fill();
    g.fillStyle = '#3a3a44';
    rr(g, 92, 18, 32, 12, 3); g.fill();
    g.shadowColor = glow; g.shadowBlur = 30;
    g.fillStyle = '#fff6d8';
    rr(g, 95, 28, 26, 5, 2); g.fill();
    g.restore();
    // light cone
    const lg = g.createRadialGradient(side > 0 ? w - 108 : 108, 32, 2, side > 0 ? w - 108 : 108, 32, 60);
    lg.addColorStop(0, 'rgba(255,240,200,0.55)');
    lg.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, w, 100);
    return { canvas: c, w: w, h: h };
  }

  function palm(rand) {
    const w = 220, h = 440;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const lean = (rand() - 0.5) * 50;
    const topX = w / 2 + lean, topY = 70;
    // trunk
    g.strokeStyle = '#6b4a2b'; g.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const t0 = i / 18, t1 = (i + 1) / 18;
      const x0 = Util.interpolate(w / 2, topX, t0 * t0), y0 = Util.interpolate(h - 4, topY, t0);
      const x1 = Util.interpolate(w / 2, topX, t1 * t1), y1 = Util.interpolate(h - 4, topY, t1);
      g.lineWidth = 16 - t0 * 7;
      g.strokeStyle = i % 2 ? '#5e4024' : '#76532f';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    // fronds
    const fronds = 8;
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + rand() * 0.4;
      const len = 80 + rand() * 30;
      const ex = topX + Math.cos(a) * len;
      const ey = topY + Math.sin(a) * len * 0.45 + 30;
      g.strokeStyle = i % 2 ? '#1f5a2a' : '#2a7436';
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(topX, topY);
      g.quadraticCurveTo((topX + ex) / 2, topY - 30, ex, ey);
      g.stroke();
    }
    g.fillStyle = '#3d2a16';
    g.beginPath(); g.arc(topX, topY + 4, 9, 0, Math.PI * 2); g.fill();
    return { canvas: c, w: w, h: h };
  }

  function building(rand, palette) {
    const w = 260;
    const h = 420 + Math.floor(rand() * 520);
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const base = palette.buildings[Math.floor(rand() * palette.buildings.length)];
    const bg = g.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, shade(base, 0.08));
    bg.addColorStop(1, shade(base, -0.35));
    g.fillStyle = bg;
    g.fillRect(0, 12, w, h - 12);
    g.fillStyle = shade(base, -0.4);
    g.fillRect(10, 0, w - 20, 14);
    // windows
    const cols = 5, rows = Math.floor((h - 60) / 34);
    const lit = palette.windows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const on = rand() < 0.45;
        g.fillStyle = on ? lit[Math.floor(rand() * lit.length)] : 'rgba(0,0,0,0.35)';
        g.fillRect(18 + col * 47, 34 + r * 34, 30, 18);
      }
    }
    // neon sign on some buildings
    if (rand() < 0.4) {
      const neon = palette.neon[Math.floor(rand() * palette.neon.length)];
      g.save();
      g.shadowColor = neon; g.shadowBlur = 16;
      g.strokeStyle = neon; g.lineWidth = 5;
      g.strokeRect(30, h - 120, w - 60, 46);
      g.fillStyle = neon;
      g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
      const words = ['HOTEL', 'BAR', 'DINER', 'MOTEL', 'CLUB', 'GARAGE', 'PARTS'];
      g.fillText(words[Math.floor(rand() * words.length)], w / 2, h - 86);
      g.restore();
    }
    // door
    g.fillStyle = '#0a0a0e';
    g.fillRect(w / 2 - 22, h - 46, 44, 46);
    return { canvas: c, w: w, h: h };
  }

  function billboard(text, sub, color) {
    const w = 420, h = 280;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#26262c';
    g.fillRect(70, 150, 16, h - 150);
    g.fillRect(w - 86, 150, 16, h - 150);
    g.fillStyle = '#0d0d12';
    rr(g, 6, 6, w - 12, 160, 8); g.fill();
    g.save();
    g.shadowColor = color; g.shadowBlur = 24;
    g.strokeStyle = color; g.lineWidth = 6;
    rr(g, 14, 14, w - 28, 144, 6); g.stroke();
    g.fillStyle = color;
    g.font = 'italic 900 62px sans-serif'; g.textAlign = 'center';
    g.fillText(text, w / 2, 94);
    g.restore();
    g.fillStyle = '#ffffff';
    g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
    g.fillText(sub, w / 2, 136);
    return { canvas: c, w: w, h: h };
  }

  function chevron(dir) {
    // dir 1 = arrow points right
    const w = 140, h = 190;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#333';
    g.fillRect(w / 2 - 5, 90, 10, h - 90);
    g.fillStyle = '#d8131b';
    rr(g, 4, 4, w - 8, 96, 6); g.fill();
    g.fillStyle = '#fff';
    g.save();
    g.translate(w / 2, 52);
    if (dir < 0) g.scale(-1, 1);
    for (const off of [-24, 14]) {
      g.beginPath();
      g.moveTo(off - 14, -34); g.lineTo(off + 6, -34); g.lineTo(off + 30, 0);
      g.lineTo(off + 6, 34); g.lineTo(off - 14, 34); g.lineTo(off + 10, 0);
      g.closePath(); g.fill();
    }
    g.restore();
    return { canvas: c, w: w, h: h };
  }

  function rock(rand) {
    const w = 220, h = 130;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#6b5a4c';
    g.beginPath();
    g.moveTo(6, h);
    const pts = 7;
    for (let i = 0; i <= pts; i++) {
      const x = 6 + (i / pts) * (w - 12);
      const y = h - Math.sin((i / pts) * Math.PI) * (h - 10) * (0.6 + rand() * 0.4);
      g.lineTo(x, y);
    }
    g.lineTo(w - 6, h);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.ellipse(w * 0.4, h * 0.45, 40, 16, -0.3, 0, Math.PI * 2); g.fill();
    return { canvas: c, w: w, h: h };
  }

  function bush(rand) {
    const w = 200, h = 110;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      g.fillStyle = i % 2 ? '#2f6b2a' : '#3e8735';
      g.beginPath();
      g.arc(30 + rand() * (w - 60), 50 + rand() * 40, 26 + rand() * 18, 0, Math.PI * 2);
      g.fill();
    }
    return { canvas: c, w: w, h: h };
  }

  function banner(text) {
    const w = 640, h = 260;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#2c2c34';
    g.fillRect(0, 40, 22, h - 40);
    g.fillRect(w - 22, 40, 22, h - 40);
    g.fillStyle = '#111';
    g.fillRect(0, 30, w, 70);
    // checker strip
    for (let i = 0; i < 40; i++) {
      g.fillStyle = i % 2 ? '#fff' : '#111';
      g.fillRect(i * 16, 30, 16, 10);
      g.fillStyle = i % 2 ? '#111' : '#fff';
      g.fillRect(i * 16, 90, 16, 10);
    }
    g.save();
    g.shadowColor = '#00e5ff'; g.shadowBlur = 16;
    g.fillStyle = '#7ff3ff';
    g.font = 'italic 900 40px sans-serif'; g.textAlign = 'center';
    g.fillText(text, w / 2, 82);
    g.restore();
    return { canvas: c, w: w, h: h };
  }

  // -------------------------------------------------------- backgrounds
  function skyline(width, height, rand, palette, layer) {
    const c = makeCanvas(width, height), g = c.getContext('2d');
    let x = 0;
    while (x < width) {
      const bw = 40 + rand() * (layer ? 110 : 70);
      const bh = height * (layer ? 0.35 + rand() * 0.6 : 0.25 + rand() * 0.55);
      g.fillStyle = layer ? palette.skylineNear : palette.skylineFar;
      g.fillRect(x, height - bh, bw, bh);
      if (rand() < 0.3) g.fillRect(x + bw / 2 - 2, height - bh - 20, 4, 20);
      for (let wy = height - bh + 8; wy < height - 6; wy += 9) {
        for (let wx = x + 5; wx < x + bw - 6; wx += 8) {
          if (rand() < (layer ? 0.18 : 0.1)) {
            g.fillStyle = palette.windows[Math.floor(rand() * palette.windows.length)];
            g.globalAlpha = layer ? 0.85 : 0.5;
            g.fillRect(wx, wy, 3, 4);
            g.globalAlpha = 1;
          }
        }
      }
      x += bw + (rand() < 0.2 ? rand() * 20 : 0);
    }
    return c;
  }

  function mountains(width, height, rand, colorA, colorB, rough) {
    const c = makeCanvas(width, height), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, height);
    grd.addColorStop(0, colorA); grd.addColorStop(1, colorB);
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, height);
    const steps = 64;
    const phase1 = rand() * 10, phase2 = rand() * 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // periodic so the layer tiles seamlessly
      const y = height * (0.45 + 0.25 * Math.sin(t * Math.PI * 4 + phase1) +
        0.15 * Math.sin(t * Math.PI * 10 + phase2) * rough);
      g.lineTo(t * width, Math.max(4, y));
    }
    g.lineTo(width, height); g.closePath(); g.fill();
    return c;
  }

  return { car, lamp, palm, building, billboard, chevron, rock, bush, banner, skyline, mountains, shade, makeCanvas };
})();
