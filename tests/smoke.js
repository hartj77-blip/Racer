// Automated smoke test: races every career event and a few quick races on
// autopilot in a headless browser, using the window.NitroRush test hook.
// Checks each race finishes, the car never gets stuck or leaves the world,
// results and career cash are settled exactly once, and nothing logs errors.
//
//   npm i -g playwright && npx playwright install chromium   (once)
//   node tests/smoke.js
const path = require('path');
const http = require('http');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.log('Install Playwright first: npm i -g playwright && npx playwright install chromium');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// Runs in the page: drive one race to the end with the simulation hook.
function runRace({ kind, index, opts }) {
  const N = window.NitroRush;
  const problems = [];
  const cfg = kind === 'career' ? N.careerRace(N.events[index]) : Object.assign(N.quickRace(), opts);
  const cashBefore = N.career.cash;
  N.beginRace(cfg);
  N.player.autopilot = true;      // drive like a decent player
  N.player.apTop = 0.97; N.player.apLat = 34; N.player.apNitro = true;
  let lastS = null, stuckFor = 0, maxStuck = 0, t = 0, resets = 0;
  const limit = 60 * 12;          // 12 simulated minutes is far beyond any event
  while (t < limit && N.state !== 'finished' && N.state !== 'busted') {
    N.simulate(0.5);
    t += 0.5;
    const P = N.player;
    if (![P.x, P.z, P.speed, P.s].every(Number.isFinite)) { problems.push(`player state became NaN at ${t}s`); break; }
    if (N.state === 'race') {
      const moved = lastS === null ? 1 : Math.abs(P.s - lastS);
      stuckFor = moved < 0.5 ? stuckFor + 0.5 : 0;
      maxStuck = Math.max(maxStuck, stuckFor);
      if (P.resets) resets = P.resets;
    }
    lastS = P.s;
  }
  if (N.state === 'busted') {
    // Busted is a valid ending; let the results settle.
    N.simulate(4);
  }
  if (N.state !== 'finished') problems.push(`race did not finish (state ${N.state} after ${t}s)`);
  if (maxStuck > 8) problems.push(`car sat still for ${maxStuck}s`);
  // Running the sim past the end must not pay out twice.
  const cashAfter = N.career.cash;
  N.simulate(5);
  if (N.career.cash !== cashAfter) problems.push('cash changed after the race ended');
  if (kind === 'quick' && cashAfter !== cashBefore) problems.push('quick race changed career cash');
  return { problems, time: Math.round(t), place: N.player.place, cash: cashAfter - cashBefore, state: N.state, maxStuck, resets };
}

(async () => {
  await new Promise((ok) => server.listen(0, ok));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 404/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.NitroRush);
  await page.evaluate(() => localStorage.clear());
  let failed = 0;
  const report = (label, r) => {
    const all = r.problems.concat(errors.splice(0).map((e) => 'console: ' + e));
    if (all.length) { failed++; console.log(`  FAIL ${label}\n    ${all.join('\n    ')}`); }
    else console.log(`  ok  ${label}: ${r.state}${r.place ? ', P' + r.place : ''} in ${r.time}s${r.cash ? ', +$' + r.cash : ''}${r.resets ? `, ${r.resets} auto-resets` : ''}`);
  };
  const names = await page.evaluate(() => window.NitroRush.events.map((e) => e.name));
  for (let i = 0; i < names.length; i++) report(`career ${i + 1} ${names[i]}`, await page.evaluate(runRace, { kind: 'career', index: i }));
  for (const opts of [{ laps: 1, cops: true }, { laps: 3, cops: false }]) {
    report(`quick race ${JSON.stringify(opts)}`, await page.evaluate(runRace, { kind: 'quick', opts }));
  }

  // Wedge the car into the barrier sideways with the gas held down: it must recover.
  {
    const r = await page.evaluate(() => {
      const N = window.NitroRush;
      N.beginRace(Object.assign(N.quickRace(), { laps: 1, cops: false }));
      N.simulate(4); // countdown
      const P = N.player;
      P.autopilot = false;
      P.h += Math.PI / 2; P.vx = P.vz = 0; P.speed = 0;
      N.input.up = true;
      const s0 = P.s;
      N.simulate(12);
      N.input.up = false;
      return { resets: P.resets || 0, moved: Math.abs(P.s - s0), state: N.state };
    });
    const problems = r.resets || r.moved > 30 ? [] : [`car stayed wedged (moved ${r.moved.toFixed(1)} m, ${r.resets} resets)`];
    report('wedged car recovers', { problems, time: 12, state: r.state, resets: r.resets });
  }

  // A damaged save must not break the game.
  for (const bad of ['{"v":1}', '{"v":1,"cash":"lots","owned":null,"car":"tank","upgrades":5,"done":[]}', 'not json']) {
    await page.evaluate((b) => localStorage.setItem('nitro-rush:career', b), bad);
    await page.reload();
    await page.waitForFunction(() => window.NitroRush);
    const r = await page.evaluate(() => { const N = window.NitroRush; const c = N.career; N.openMenu('career'); return { cash: c.cash, car: c.car, owned: c.owned }; });
    const problems = [];
    if (!Number.isFinite(r.cash)) problems.push('cash is ' + r.cash);
    if (!Array.isArray(r.owned) || !r.owned.includes(r.car)) problems.push('current car not owned: ' + JSON.stringify(r));
    report(`damaged save ${bad.slice(0, 30)}`, { problems, time: 0, state: 'loaded' });
  }

  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exitCode = failed ? 1 : 0;
})();
