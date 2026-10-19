// Career progression: events, cash, car purchases and upgrades.
const Career = (() => {
  const KEY = 'nitro-rush:career';

  const UPGRADES = [
    { id: 'engine', name: 'Engine', desc: 'Top speed', costs: [1200, 2800, 5500] },
    { id: 'turbo', name: 'Turbo', desc: 'Acceleration', costs: [1000, 2400, 5000] },
    { id: 'tires', name: 'Tires', desc: 'Handling & grip', costs: [800, 2000, 4200] },
    { id: 'nitro', name: 'Nitrous', desc: 'Nitro capacity', costs: [900, 2200, 4800] },
  ];

  const CAR_PRICES = { vortex: 0, kestrel: 4000, raptor: 9000 };

  // type: circuit (win the race), drift (beat the score), pursuit (lose the cops)
  const EVENTS = [
    { id: 'e1', name: 'Street Initiation', type: 'circuit', track: 'city', laps: 2, cops: false, skill: 0.86, reward: [1500, 800, 400],
      desc: 'Win your first street race.' },
    { id: 'e2', name: 'Coastline Dash', type: 'circuit', track: 'coast', laps: 2, cops: false, skill: 0.9, reward: [2000, 1000, 500],
      desc: 'Beat the crew along the sunset highway.' },
    { id: 'e3', name: 'Sideways Downtown', type: 'drift', track: 'city', laps: 1, target: 9000, reward: [2500],
      desc: 'Score 9,000 drift points in one lap. Brake + steer at speed to drift.' },
    { id: 'e4', name: 'Harbor Heat', type: 'pursuit', track: 'harbor', laps: 3, copBoost: 0.96, reward: [3000],
      desc: 'The cops are already on you. Lose them before the third lap ends. Tunnels help.' },
    { id: 'e5', name: 'Dockside Grand Prix', type: 'circuit', track: 'harbor', laps: 3, cops: true, skill: 0.94, reward: [4000, 2000, 1000],
      desc: 'Three wet laps around the docks. Watch for police.' },
    { id: 'e6', name: 'Wet Drift', type: 'drift', track: 'harbor', laps: 1, target: 12000, reward: [4500],
      desc: 'Score 12,000 drift points on the slick harbor roads.' },
    { id: 'e7', name: 'Sunset Showdown', type: 'circuit', track: 'coast', laps: 3, cops: true, skill: 0.98, reward: [6000, 3000, 1500],
      desc: 'The coast crew brings their fastest cars.' },
    { id: 'e8', name: 'Most Wanted', type: 'pursuit', track: 'city', laps: 3, copBoost: 1.06, reward: [7000],
      desc: 'Downtown\'s fastest interceptor is hunting you. Escape it.' },
    { id: 'e9', name: 'Midnight Championship', type: 'circuit', track: 'city', laps: 4, cops: true, skill: 1.02, reward: [12000, 6000, 3000],
      desc: 'The final race. Beat Razor and own the city.' },
  ];

  function fresh() {
    return { v: 1, cash: 1500, owned: ['vortex'], car: 'vortex', upgrades: {}, done: {} };
  }

  // Repair anything odd in saved data instead of letting it crash the game.
  // A save that can't be read at all is kept under a backup key.
  function clean(d) {
    const f = fresh();
    const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    const out = { v: 1 };
    out.cash = Number.isFinite(d.cash) && d.cash >= 0 ? Math.floor(d.cash) : f.cash;
    out.owned = (Array.isArray(d.owned) ? d.owned : []).filter(id => id in CAR_PRICES);
    if (!out.owned.includes('vortex')) out.owned.unshift('vortex');
    out.car = out.owned.includes(d.car) ? d.car : out.owned[0];
    out.upgrades = {};
    for (const [car, ups] of Object.entries(obj(d.upgrades))) {
      if (!(car in CAR_PRICES)) continue;
      out.upgrades[car] = {};
      for (const u of UPGRADES) {
        const lvl = obj(ups)[u.id];
        if (Number.isInteger(lvl) && lvl > 0) out.upgrades[car][u.id] = Math.min(lvl, u.costs.length);
      }
    }
    out.done = {};
    for (const ev of EVENTS) if (obj(d.done)[ev.id]) out.done[ev.id] = true;
    return out;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return fresh(); }
    if (!raw) return fresh();
    try {
      const d = JSON.parse(raw);
      if (d && d.v === 1) return clean(d);
    } catch (e) { /* fall through */ }
    try { localStorage.setItem(KEY + ':backup', raw); } catch (e) { /* ignore */ }
    return fresh();
  }

  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
  }

  function level(d, carId, up) { return (d.upgrades[carId] || {})[up] || 0; }

  // Effective handling stats for a car with an upgrade set (or none)
  function stats(car, ups) {
    const u = id => (ups ? ups[id] || 0 : 0);
    return {
      top: car.top * (1 + 0.035 * u('engine')),
      accel: car.accel * (1 + 0.12 * u('turbo')),
      handling: car.handling * (1 + 0.08 * u('tires')),
      nitroCap: 1 + 0.25 * u('nitro'),
    };
  }

  function unlocked(d, i) { return i === 0 || !!d.done[EVENTS[i - 1].id]; }

  // Cash for a result. Replays of completed events pay 40%.
  function payout(d, ev, place) {
    const base = ev.reward[place - 1] || 0;
    return d.done[ev.id] ? Math.round(base * 0.4 / 50) * 50 : base;
  }

  return { UPGRADES, CAR_PRICES, EVENTS, load, save, fresh, level, stats, unlocked, payout };
})();
