// Synthesised sound effects via WebAudio. Everything fails silently if
// audio is unavailable.
const Sound = (() => {
  let ac = null, master = null;
  let engine = null, nitro = null, siren = null, rumble = null, skid = null, rain = null;
  let muted = false;

  function noiseBuffer() {
    const len = ac.sampleRate * 1;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function loopNoise(type, freq, q) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(); src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const gn = ac.createGain(); gn.gain.value = 0;
    src.connect(f); f.connect(gn); gn.connect(master);
    src.start();
    return { src, filter: f, gain: gn };
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { ac = null; return; }
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ac.destination);

    // engine: two detuned oscillators through a low-pass filter
    const o1 = ac.createOscillator(); o1.type = 'sawtooth';
    const o2 = ac.createOscillator(); o2.type = 'square';
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 4;
    const gn = ac.createGain(); gn.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(gn); gn.connect(master);
    o1.start(); o2.start();
    engine = { o1, o2, filter: f, gain: gn };

    nitro = loopNoise('bandpass', 1800, 0.8);
    rumble = loopNoise('lowpass', 220, 1);
    skid = loopNoise('bandpass', 1400, 4);
    rain = loopNoise('highpass', 3000, 0.5);

    const so = ac.createOscillator(); so.type = 'square';
    const sg = ac.createGain(); sg.gain.value = 0;
    const sf = ac.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2000;
    so.connect(sf); sf.connect(sg); sg.connect(master); so.start();
    siren = { osc: so, gain: sg };
  }

  function set(param, v) {
    param.setTargetAtTime(v, ac.currentTime, 0.05);
  }

  // rpm 0..1, throttle 0..1
  function update(s) {
    if (!ac) return;
    if (!isFinite(s.rpm)) s.rpm = 0;
    const base = 45 + s.rpm * 140 + (s.gear || 1) * 4;
    set(engine.o1.frequency, base);
    set(engine.o2.frequency, base * 0.5);
    set(engine.filter.frequency, 500 + s.rpm * 1400 + s.throttle * 600);
    set(engine.gain.gain, s.running ? 0.05 + s.throttle * 0.05 + s.rpm * 0.03 : 0);
    set(nitro.gain.gain, s.nitro ? 0.18 : 0);
    set(rumble.gain.gain, s.offroad ? 0.25 : 0);
    set(skid.gain.gain, (s.skid || 0) * 0.35);
    set(skid.filter.frequency, 1100 + (s.skid || 0) * 500);
    set(rain.gain.gain, s.rain ? 0.07 : 0);
    const t = ac.currentTime;
    set(siren.osc.frequency, 760 + 280 * Math.sin(t * Math.PI * 2 * 0.9));
    set(siren.gain.gain, s.siren * 0.06);
  }

  function blip(freq, dur, type, vol) {
    if (!ac) return;
    const o = ac.createOscillator(); o.type = type || 'square';
    o.frequency.value = freq;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(vol || 0.15, ac.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(gn); gn.connect(master);
    o.start(); o.stop(ac.currentTime + dur);
  }

  function crash(strength) {
    if (!ac) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuffer();
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.5 * (strength || 1), ac.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.45);
    src.connect(f); f.connect(gn); gn.connect(master);
    src.start(); src.stop(ac.currentTime + 0.5);
  }

  function whoosh() {
    if (!ac) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuffer();
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(3000, ac.currentTime);
    f.frequency.exponentialRampToValueAtTime(300, ac.currentTime + 0.35);
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.25, ac.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.4);
    src.connect(f); f.connect(gn); gn.connect(master);
    src.start(); src.stop(ac.currentTime + 0.45);
  }

  // exhaust backfire on upshift
  function pop() {
    if (!ac) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuffer();
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.4, ac.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
    src.connect(f); f.connect(gn); gn.connect(master);
    src.start(); src.stop(ac.currentTime + 0.15);
  }

  function chime(notes) {
    if (!ac) return;
    notes.forEach((n, i) => setTimeout(() => blip(n, 0.18, 'triangle', 0.18), i * 90));
  }

  function silence() {
    if (!ac) return;
    update({ rpm: 0, throttle: 0, running: false, nitro: false, offroad: false, siren: 0, skid: 0, rain: false });
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.6;
    return muted;
  }

  return { init, update, blip, crash, whoosh, pop, chime, silence, toggleMute, get muted() { return muted; } };
})();
