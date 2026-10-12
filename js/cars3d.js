// Low-poly 3D car models built from extruded side profiles.
// Models face +Z, sit on y = 0 and are roughly 4.5 m long.
const CarModels = (() => {
  const T = THREE;

  // Glow sprite texture shared by car lights
  let glowTex = null;
  function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    glowTex = new T.CanvasTexture(c);
    glowTex.colorSpace = T.SRGBColorSpace;
    return glowTex;
  }

  let shadowTex = null;
  function shadowTexture() {
    if (shadowTex) return shadowTex;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 64, 4, 32, 64, 62);
    grd.addColorStop(0, 'rgba(0,0,0,0.7)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.4)');
    grd.addColorStop(0.85, 'rgba(0,0,0,0)');
    g.save(); g.scale(1, 2); g.translate(0, -32);
    g.fillStyle = grd; g.fillRect(0, 0, 64, 128);
    g.restore();
    shadowTex = new T.CanvasTexture(c);
    return shadowTex;
  }

  const shared = {};
  function mats() {
    if (shared.glass) return shared;
    shared.glass = new T.MeshPhongMaterial({ color: 0x10141c, specular: 0x8899bb, shininess: 120 });
    shared.black = new T.MeshLambertMaterial({ color: 0x111114 });
    shared.tire = new T.MeshLambertMaterial({ color: 0x0c0c0e });
    shared.chrome = new T.MeshPhongMaterial({ color: 0x9aa0aa, specular: 0xffffff, shininess: 90 });
    shared.head = new T.MeshBasicMaterial({ color: 0xfff2cc });
    shared.tailStatic = new T.MeshBasicMaterial({ color: 0x7a0a10 });
    shared.shadow = new T.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.75 });
    shared.flame = new T.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
    shared.flameCore = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
    shared.backfire = new T.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
    return shared;
  }

  // Extrude a side profile (x = length axis, +x is the nose) across the car's width
  function profile(points, width, bevel) {
    const shape = new T.Shape();
    points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    const b = bevel === undefined ? 0.06 : bevel;
    const geo = new T.ExtrudeGeometry(shape, {
      depth: width - b * 2, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 2,
    });
    geo.rotateY(-Math.PI / 2);
    geo.translate((width - b * 2) / 2, 0, 0);
    return geo;
  }

  function box(w, h, d, x, y, z) {
    const g = new T.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  }

  // Merge geometries (all converted to non-indexed, position/normal/uv)
  function merge(list) {
    let count = 0;
    const parts = list.map(g => {
      const ng = g.index ? g.toNonIndexed() : g;
      if (!ng.attributes.normal) ng.computeVertexNormals();
      count += ng.attributes.position.count;
      return ng;
    });
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    return out;
  }

  const SPECS = {
    sport: {
      body: [[-2.2, 0.26], [2.0, 0.26], [2.28, 0.42], [2.22, 0.6], [1.1, 0.76], [-1.55, 0.83], [-2.25, 0.82], [-2.3, 0.5]],
      cabin: [[-1.6, 0.8], [1.05, 0.76], [0.2, 1.17], [-1.0, 1.2]],
      width: 1.9, cabinW: 1.5, wheelR: 0.36, wheelZ: 1.4, wheelX: 0.84, tailY: 0.64, tailZ: -2.31, headY: 0.52, headZ: 2.27,
      roofY: 1.2, spoiler: true,
    },
    sedan: {
      body: [[-2.25, 0.3], [2.12, 0.3], [2.3, 0.48], [2.22, 0.74], [1.0, 0.84], [-1.85, 0.88], [-2.3, 0.86], [-2.33, 0.55]],
      cabin: [[-1.8, 0.86], [0.95, 0.83], [0.3, 1.4], [-1.45, 1.42]],
      width: 1.86, cabinW: 1.56, wheelR: 0.36, wheelZ: 1.45, wheelX: 0.82, tailY: 0.72, tailZ: -2.34, headY: 0.6, headZ: 2.28,
      roofY: 1.42,
    },
    van: {
      body: [[-2.45, 0.34], [2.3, 0.34], [2.45, 0.6], [2.4, 1.1], [1.65, 1.4], [1.45, 2.25], [-2.45, 2.3]],
      width: 2.0, wheelR: 0.42, wheelZ: 1.6, wheelX: 0.88, tailY: 0.95, tailZ: -2.46, headY: 0.75, headZ: 2.42,
      roofY: 2.3,
    },
  };

  // opts: { type, color, stripe, cop, player, spinWheels, underglow }
  function build(opts) {
    const m = mats();
    const spec = SPECS[opts.type === 'cop' ? 'sedan' : opts.type];
    const group = new T.Group();
    const body = new T.Group();          // rolls/pitches on top of the chassis
    group.add(body);

    const paint = new T.MeshPhongMaterial({
      color: new T.Color(opts.cop ? '#f2f2f2' : opts.color), specular: 0x3a3a3a, shininess: 60,
    });
    const bodyGeo = profile(spec.body, spec.width);
    body.add(new T.Mesh(bodyGeo, paint));

    if (spec.cabin) {
      body.add(new T.Mesh(profile(spec.cabin, spec.cabinW, 0.05), m.glass));
      // roof panel in body colour
      const roof = new T.Mesh(box(spec.cabinW - 0.2, 0.05, 1.0, 0, spec.roofY + 0.01, -0.4), opts.cop ? m.black : paint);
      body.add(roof);
    } else {
      // van side windows
      body.add(new T.Mesh(merge([
        box(0.02, 0.5, 1.2, spec.width / 2 + 0.01, 1.7, 0.9), box(0.02, 0.5, 1.2, -spec.width / 2 - 0.01, 1.7, 0.9),
        box(1.6, 0.6, 0.02, 0, 1.85, 1.62),
      ]), m.glass));
    }

    // black trim: bumpers, diffuser, grille, mirrors
    const trim = [
      box(spec.width - 0.3, 0.16, 0.12, 0, 0.32, spec.tailZ + 0.04),
      box(spec.width - 0.5, 0.14, 0.1, 0, 0.36, spec.headZ - 0.02),
    ];
    if (spec.cabin) {
      trim.push(box(0.12, 0.08, 0.18, spec.width / 2 + 0.02, 0.92, 0.75), box(0.12, 0.08, 0.18, -spec.width / 2 - 0.02, 0.92, 0.75));
    }
    if (opts.cop) {
      trim.push(box(spec.width + 0.02, 0.28, 2.4, 0, 0.62, 0.1));   // black doors
    }
    if (spec.spoiler) {
      trim.push(box(0.08, 0.2, 0.12, 0.55, 0.92, -1.98), box(0.08, 0.2, 0.12, -0.55, 0.92, -1.98));
    }
    body.add(new T.Mesh(merge(trim), m.black));

    if (spec.spoiler) {
      const wing = new T.Mesh(box(1.75, 0.05, 0.36, 0, 1.04, -2.02), new T.MeshPhongMaterial({ color: opts.stripe || opts.color, shininess: 60 }));
      body.add(wing);
    }
    if (opts.stripe && spec.cabin) {
      const sm = new T.MeshPhongMaterial({ color: opts.stripe, shininess: 60 });
      body.add(new T.Mesh(merge([
        box(0.16, 0.02, 0.9, 0.14, spec.roofY + 0.04, -0.4), box(0.16, 0.02, 0.9, -0.14, spec.roofY + 0.04, -0.4),
      ]), sm));
    }

    // lights
    const hw = spec.width / 2 - 0.32;
    body.add(new T.Mesh(merge([
      box(0.42, 0.1, 0.05, hw, spec.headY, spec.headZ), box(0.42, 0.1, 0.05, -hw, spec.headY, spec.headZ),
    ]), m.head));
    const tailMat = opts.ownTail ? new T.MeshBasicMaterial({ color: 0x8a0c14 }) : m.tailStatic;
    const tailH = spec.cabin ? 0.12 : 0.36;
    body.add(new T.Mesh(merge([
      box(0.5, tailH, 0.05, hw, spec.tailY, spec.tailZ), box(0.5, tailH, 0.05, -hw, spec.tailY, spec.tailZ),
    ]), tailMat));

    // light glow sprites (taillights)
    const glows = [];
    for (const sx of [hw, -hw]) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: 0xff2020, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
      sp.position.set(sx, spec.tailY, spec.tailZ - 0.1);
      sp.scale.set(1.0, 1.0, 1);
      body.add(sp);
      glows.push(sp);
    }

    // police light bar
    let copLights = null;
    if (opts.cop) {
      const red = new T.MeshBasicMaterial({ color: 0xff2020 });
      const blue = new T.MeshBasicMaterial({ color: 0x2050ff });
      body.add(new T.Mesh(box(1.2, 0.1, 0.3, 0, spec.roofY + 0.06, -0.3), m.black));
      body.add(new T.Mesh(box(0.5, 0.12, 0.26, 0.3, spec.roofY + 0.14, -0.3), red));
      body.add(new T.Mesh(box(0.5, 0.12, 0.26, -0.3, spec.roofY + 0.14, -0.3), blue));
      const mk = col => {
        const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: col, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
        sp.scale.set(4, 4, 1);
        body.add(sp);
        return sp;
      };
      const rs = mk(0xff2020), bs = mk(0x3060ff);
      rs.position.set(0.3, spec.roofY + 0.2, -0.3);
      bs.position.set(-0.3, spec.roofY + 0.2, -0.3);
      copLights = { red, blue, rs, bs };
    }

    // wheels
    const wheels = [];
    const tireGeo = new T.CylinderGeometry(spec.wheelR, spec.wheelR, 0.3, 14);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new T.CylinderGeometry(spec.wheelR * 0.62, spec.wheelR * 0.62, 0.31, 10);
    rimGeo.rotateZ(Math.PI / 2);
    if (opts.spinWheels) {
      for (const [x, z] of [[spec.wheelX, spec.wheelZ], [-spec.wheelX, spec.wheelZ], [spec.wheelX, -spec.wheelZ], [-spec.wheelX, -spec.wheelZ]]) {
        const steer = new T.Group();
        steer.position.set(x, spec.wheelR, z);
        const spin = new T.Group();
        spin.add(new T.Mesh(tireGeo, m.tire));
        spin.add(new T.Mesh(rimGeo, m.chrome));
        // a spoke so rotation is visible
        spin.add(new T.Mesh(box(0.32, spec.wheelR * 1.1, 0.08, 0, 0, 0), m.black));
        steer.add(spin);
        group.add(steer);
        wheels.push({ steer, spin, front: z > 0 });
      }
    } else {
      const tires = [], rims = [];
      for (const [x, z] of [[spec.wheelX, spec.wheelZ], [-spec.wheelX, spec.wheelZ], [spec.wheelX, -spec.wheelZ], [-spec.wheelX, -spec.wheelZ]]) {
        tires.push(tireGeo.clone().translate(x, spec.wheelR, z));
        rims.push(rimGeo.clone().translate(x, spec.wheelR, z));
      }
      group.add(new T.Mesh(merge(tires), m.tire));
      group.add(new T.Mesh(merge(rims), m.chrome));
    }

    // blob shadow
    const sh = new T.Mesh(new T.PlaneGeometry(spec.width + 0.8, 5.0), m.shadow);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.04;
    sh.renderOrder = 1;
    group.add(sh);

    // nitro flames + backfire (player/rivals)
    const flames = [];
    if (opts.flames) {
      const cone = new T.ConeGeometry(0.13, 1.0, 10);
      cone.rotateX(-Math.PI / 2);
      cone.translate(0, 0, -0.5);
      const core = new T.ConeGeometry(0.06, 0.6, 8);
      core.rotateX(-Math.PI / 2);
      core.translate(0, 0, -0.3);
      for (const x of [0.38, -0.38]) {
        const f = new T.Group();
        f.position.set(x, 0.33, spec.tailZ - 0.02);
        f.add(new T.Mesh(cone, m.flame));
        f.add(new T.Mesh(core, m.flameCore));
        const bf = new T.Mesh(cone, m.backfire);
        bf.scale.set(1.4, 1.4, 0.5);
        f.add(bf);
        f.visible = false;
        body.add(f);
        flames.push({ group: f, backfire: bf });
      }
      // exhaust tips
      body.add(new T.Mesh(merge([
        new T.CylinderGeometry(0.07, 0.07, 0.16, 8).rotateX(Math.PI / 2).translate(0.38, 0.33, spec.tailZ),
        new T.CylinderGeometry(0.07, 0.07, 0.16, 8).rotateX(Math.PI / 2).translate(-0.38, 0.33, spec.tailZ),
      ]), m.chrome));
    }

    // neon underglow
    let underglow = null;
    if (opts.underglow) {
      underglow = new T.Mesh(new T.PlaneGeometry(3.4, 6.2), new T.MeshBasicMaterial({
        map: glowTexture(), color: new T.Color(opts.underglow), transparent: true, opacity: 0.55,
        blending: T.AdditiveBlending, depthWrite: false,
      }));
      underglow.rotation.x = -Math.PI / 2;
      underglow.position.y = 0.06;
      underglow.renderOrder = 2;
      underglow.visible = false;
      group.add(underglow);
    }

    return {
      group, body, wheels, glows, tailMat, copLights, flames, underglow, spec, paint,
      length: spec.body[1][0] - spec.body[0][0] + 0.5, width: spec.width,
      setBrake(on, night) {
        if (opts.ownTail) tailMat.color.setHex(on ? 0xff2a2a : 0x8a0c14);
        const o = on ? 0.95 : night ? 0.55 : 0.0;
        const s = on ? 1.5 : 1.0;
        for (const g of glows) { g.material.opacity = o; g.scale.set(s, s, 1); g.visible = o > 0; }
      },
      setCop(t) {
        if (!copLights) return;
        const red = Math.floor(t * 6) % 2 === 0;
        copLights.red.color.setHex(red ? 0xff3030 : 0x400808);
        copLights.blue.color.setHex(red ? 0x0a1440 : 0x3a6bff);
        copLights.rs.visible = red;
        copLights.bs.visible = !red;
      },
      dispose() {
        group.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material && o.material !== m.glass && !Object.values(m).includes(o.material)) o.material.dispose();
        });
      },
    };
  }

  return { build, glowTexture, merge, box };
})();
