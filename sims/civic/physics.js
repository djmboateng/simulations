// Performance model for the EK9 tuning simulator.
// Every number shown in the garage, on the track and on the drag strip comes from here,
// so the stock car is calibrated once against the real 2000 Civic Type R figures.

export const G = 9.81, RHO = 1.225, MPH = 2.23694, KMH = 3.6;

// Real EK9 gear ratios -> the fraction of top-gear speed each gear reaches at redline.
const RATIOS = [3.230, 2.105, 1.458, 1.107, 0.848];
const GEAR_FRAC = RATIOS.map(r => RATIOS[4] / r);
const SHIFT_TIME = 0.22;

export const ENGINES = {
  b16b: { name: 'B16B 1.6L VTEC (stock)', hp: 182, peak: 8200, rt: 0.915, redline: 8400, kg: 0, cost: 0 },
  b18c: { name: 'B18C 1.8L VTEC', hp: 195, peak: 8000, rt: 0.9, redline: 8400, kg: 18, cost: 6500 },
  k20a: { name: 'K20A 2.0L i-VTEC', hp: 217, peak: 8000, rt: 0.875, redline: 8600, kg: 24, cost: 12000 },
};
export const TIRES = {
  street: { name: 'Street', lat: 0.88, long: 1.00, cost: 0 },
  sport: { name: 'Sport', lat: 0.97, long: 1.08, cost: 1200 },
  slick: { name: 'Semi-Slick', lat: 1.10, long: 1.20, cost: 2600 },
  drag: { name: 'Drag Radial', lat: 0.80, long: 1.55, cost: 2200 },
};
export const PAINTS = [
  { name: 'Championship White', hex: '#ebe9e9', factory: true },
  { name: 'Sparkle Silver Metallic', hex: '#b9bcc0', factory: true },
  { name: 'Starlight Black Pearl', hex: '#16181d', factory: true },
  { name: 'Sunlight Yellow', hex: '#f4c51e', factory: true },
  { name: 'Milano Red', hex: '#c8102e' },
  { name: 'Hot Orange', hex: '#ff5a00' },
  { name: 'Phoenix Yellow', hex: '#ffd800' },
  { name: 'Electron Blue', hex: '#1b4fd8' },
  { name: 'Nighthawk Purple', hex: '#5b2a86' },
  { name: 'Mint Green', hex: '#5fd3a5' },
];
export const RIM_COLORS = [
  { name: 'Type R White', hex: '#f4f4f4' }, { name: 'Gunmetal', hex: '#3b3f45' }, { name: 'Gloss Black', hex: '#111111' },
  { name: 'Bronze', hex: '#a8742c' }, { name: 'Gold', hex: '#d4af37' }, { name: 'Hot Orange', hex: '#ff5a00' },
];

export const DEFAULT_CONFIG = Object.freeze({
  engine: 'b16b', intake: 0, ecu: 0,
  induction: 'na', nitrous: 0, jet: false,
  brakes: 0,
  springs: 0, rideHeight: 0,
  tire: 'street', wheelSize: 15, stance: 0, rimColor: '#f4f4f4',
  wing: 'stock', weight: 0,
  gearing: 0, diff: 0,
  paint: '#ebe9e9', tint: 0,
});

// Prices are only for fun, like a game's upgrade shop.
const COST = {
  intake: [0, 900, 2400], ecu: [0, 600, 1500], induction: { na: 0, turbo: 9500, super: 8000 },
  nitrous: [0, 2000, 3500], jet: 75000, brakes: [0, 1400, 4200], springs: [0, 1600, 3800],
  wing: { stock: 0, street: 900, gt: 2800 }, weight: [0, 1500, 6000], diff: [0, 1800],
};

// Normalized power vs rpm/peak-power-rpm (peaks at exactly 1.0 when r = 1).
// Torque is a lopsided parabola: gentle below its peak (rt), falling hard above it like a VTEC motor.
function powerShape(r, rt) {
  r = Math.max(0, Math.min(r, 1.12));
  const b = 1 / ((1 - rt) ** 2 + 2 * (1 - rt));
  const torque = x => x < rt ? 1 - 0.73 * (rt - x) ** 2 : 1 - b * (x - rt) ** 2;
  return Math.max(0, r * torque(r) / torque(1));
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

let EFF = 0.85, BASE_CDA = 0.73; // calibrated below

export function computeSpecs(cfg) {
  const e = ENGINES[cfg.engine], t = TIRES[cfg.tire];
  const naHp = e.hp * [1, 1.05, 1.10][cfg.intake] * [1, 1.04, 1.08][cfg.ecu];
  const redline = e.redline + cfg.ecu * 300;
  const peak = e.peak + cfg.ecu * 100;
  const boostGain = { na: 0, turbo: 0.6, super: 0.38 }[cfg.induction];
  const kg = 1070 + e.kg + { na: 0, turbo: 28, super: 24 }[cfg.induction] + (cfg.nitrous ? 12 : 0) + (cfg.jet ? 95 : 0)
    + { stock: 0, street: 5, gt: 11 }[cfg.wing] - [0, 45, 110][cfg.weight] + (cfg.wheelSize - 15) * 2.5 + [0, 4, 9][cfg.brakes];
  const cda = BASE_CDA + { stock: 0, street: 0.02, gt: 0.06 }[cfg.wing] + (cfg.jet ? 0.07 : 0) + cfg.rideHeight * 0.0003 + cfg.stance * 0.0002;
  const cla = { stock: 0.02, street: 0.16, gt: 0.44 }[cfg.wing] - cfg.rideHeight * 0.0008;
  const latMu = t.lat + [0, 0.03, 0.06][cfg.springs] - cfg.rideHeight * 0.0004 + cfg.stance * 0.0006 + (cfg.wheelSize - 15) * 0.008 + cfg.diff * 0.01;
  const longMu = t.long + cfg.diff * 0.06;
  const vGearTop = 64 * (1 + 0.065 * cfg.gearing) * (redline / 8400);
  const nitrousHp = [0, 50, 100][cfg.nitrous];
  const nitrousSec = [0, 10, 8][cfg.nitrous];
  const jetThrust = cfg.jet ? 3200 : 0;
  const s = { cfg, engine: e, tire: t, naHp, redline, peak, boostGain, induction: cfg.induction, kg, cda, cla, latMu, longMu, vGearTop, nitrousHp, nitrousSec, jetThrust };
  // peak figures for display (sweep rpm)
  let hp = 0, tq = 0, hpRpm = 0, tqRpm = 0;
  for (let rpm = 1500; rpm <= redline; rpm += 50) {
    const p = enginePowerW(s, rpm, false) / 745.7;
    const nm = p * 745.7 / (rpm * Math.PI / 30);
    if (p > hp) { hp = p; hpRpm = rpm; }
    if (nm > tq) { tq = nm; tqRpm = rpm; }
  }
  Object.assign(s, { hp, hpRpm, tq, tqRpm, lbft: tq * 0.7376 });
  s.brakeG = Math.min(latMu * 1.05, [1.0, 1.12, 1.25][cfg.brakes]);
  s.boostCapacity = Math.max(nitrousSec, cfg.jet ? 8 : 0);
  return s;
}

// Crank power (W) at a given rpm, with turbo lag shaping and optional nitrous.
export function enginePowerW(s, rpm, nitrous) {
  const r = rpm / s.peak;
  let mult = 1;
  if (s.induction === 'turbo') mult += s.boostGain * smooth(0.42, 0.72, r);
  if (s.induction === 'super') mult += s.boostGain * (0.55 + 0.45 * Math.min(r, 1));
  let w = s.naHp * 745.7 * powerShape(r, s.engine.rt) * mult;
  if (rpm > s.redline) w = 0;
  if (nitrous && s.nitrousHp) w += s.nitrousHp * 745.7 * smooth(0.25, 0.45, r);
  return w;
}

export const gearTopSpeed = (s, gear) => s.vGearTop * GEAR_FRAC[gear];
export const rpmAt = (s, v, gear) => Math.max(1100, s.redline * v / gearTopSpeed(s, gear));

// A drivetrain that can be stepped forward in time. Used by the track, the drag strip and the stat sim.
export function createDrive(s) {
  return { v: 0, gear: 0, shift: 0, rpm: 1100, boostLeft: s.boostCapacity, s };
}

// Advances longitudinal motion by dt. throttle/brake in 0..1, boost boolean.
// extraResist lets the track add grass drag; returns the forward force breakdown for effects.
export function stepDrive(d, dt, throttle, brake, boost, extraResist = 0, tractionScale = 1) {
  const s = d.s;
  const boosting = boost && throttle > 0.1 && d.boostLeft > 0 && (s.nitrousHp || s.jetThrust);
  if (boosting) d.boostLeft = Math.max(0, d.boostLeft - dt);
  // auto gearbox: upshift at redline, downshift when rpm drops low
  if (d.shift > 0) d.shift -= dt;
  const topSpeedNow = gearTopSpeed(s, d.gear);
  if (d.v > topSpeedNow * 0.995 && d.gear < 4 && throttle > 0.1 && d.shift <= 0) { d.gear++; d.shift = SHIFT_TIME; }
  while (d.gear > 0 && d.v < gearTopSpeed(s, d.gear - 1) * 0.62) d.gear--;
  const launchRpm = s.induction === 'turbo' ? 5600 : 4800;
  d.rpm = d.gear === 0 ? Math.max(rpmAt(s, d.v, 0), throttle > 0.1 ? launchRpm : 1100) : rpmAt(s, d.v, d.gear);
  const vel = Math.max(d.v, 0.5);
  let drive = 0;
  if (d.shift <= 0 && throttle > 0) {
    const p = enginePowerW(s, Math.min(d.rpm, s.redline), boosting && s.nitrousHp) * EFF * throttle;
    const limiter = d.v >= topSpeedNow && d.gear === 4 ? 0 : 1;
    drive = (p / vel) * limiter;
  }
  const down = 0.5 * RHO * s.cla * d.v * d.v;
  const traction = s.longMu * (s.kg * G * 0.6 + down * 0.4) * tractionScale;
  const wheelspin = drive > traction;
  drive = Math.min(drive, traction);
  let thrust = 0;
  if (s.jetThrust && throttle > 0.1) thrust = s.jetThrust * (boosting ? 2.1 : 1);
  const aero = 0.5 * RHO * s.cda * d.v * d.v;
  const roll = 0.012 * s.kg * G;
  const brakeF = brake * s.brakeG * (s.kg * G + down * 0.5);
  let F = drive + thrust - aero - roll * (d.v > 0.1 ? 1 : 0) - extraResist * (d.v > 0.1 ? 1 : 0);
  let a = F / s.kg;
  if (brake > 0 && d.v > 0) a -= brakeF / s.kg;
  d.v = Math.max(0, d.v + a * dt);
  return { a, boosting, wheelspin, thrust };
}

// Straight-line test: 0-60, 0-100 km/h, quarter mile, top speed.
export function runStraightLine(s) {
  const d = createDrive(s);
  const dt = 0.005;
  let t = 0, x = 0, t060 = null, t0100 = null, eighth = null, qm = null, trap = 0, vmax = 0, flatTime = 0;
  while (t < 160) {
    const v0 = d.v;
    stepDrive(d, dt, 1, 0, false);
    t += dt; x += (v0 + d.v) / 2 * dt;
    if (!t060 && d.v >= 60 / MPH) t060 = t;
    if (!t0100 && d.v >= 100 / KMH) t0100 = t;
    if (!eighth && x >= 201.17) eighth = t;
    if (!qm && x >= 402.34) { qm = t; trap = d.v; }
    if (d.v > vmax + 0.002) { vmax = d.v; flatTime = 0; } else flatTime += dt;
    if (qm && flatTime > 6) break;
  }
  return { t060, t0100, eighth, qm, trap, vmax };
}

export const lateralG = (s, v) => s.latMu * (1 + 0.5 * RHO * s.cla * v * v / (s.kg * G));

// Performance index and class, loosely like a racing game's PI.
export function performanceIndex(s, run) {
  const a = 6.3 / run.t060, sp = run.vmax / 62.2, g = lateralG(s, 30) / 0.88, b = s.brakeG / 0.924;
  const pi = Math.round(Math.min(999, Math.max(100, 520 * Math.pow(a, 0.45) * Math.pow(sp, 0.3) * Math.pow(g, 1.1) * Math.pow(b, 0.15))));
  const cls = pi >= 999 ? 'X' : pi > 900 ? 'S2' : pi > 800 ? 'S1' : pi > 700 ? 'A' : pi > 600 ? 'B' : pi > 500 ? 'C' : 'D';
  return { pi, cls };
}
export const CLASS_COLORS = { D: '#3fb8e8', C: '#f3c614', B: '#ff8a1c', A: '#ff3d3d', S1: '#a64dff', S2: '#2c5cff', X: '#16c96b' };

export function buildCost(cfg) {
  let c = ENGINES[cfg.engine].cost + TIRES[cfg.tire].cost + COST.intake[cfg.intake] + COST.ecu[cfg.ecu] + COST.induction[cfg.induction]
    + COST.nitrous[cfg.nitrous] + (cfg.jet ? COST.jet : 0) + COST.brakes[cfg.brakes] + COST.springs[cfg.springs]
    + COST.wing[cfg.wing] + COST.weight[cfg.weight] + COST.diff[cfg.diff] + (cfg.wheelSize - 15) * 700
    + (cfg.rideHeight !== 0 && !cfg.springs ? 400 : 0) + (cfg.stance ? 450 : 0) + (cfg.gearing ? 1100 : 0)
    + (cfg.paint !== DEFAULT_CONFIG.paint ? 2500 : 0) + (cfg.rimColor !== DEFAULT_CONFIG.rimColor ? 600 : 0) + (cfg.tint ? 250 : 0);
  return c;
}
export function upgradeCount(cfg) {
  return Object.keys(DEFAULT_CONFIG).filter(k => cfg[k] !== DEFAULT_CONFIG[k]).length;
}

export function fullSpecs(cfg) {
  const s = computeSpecs(cfg);
  const run = runStraightLine(s);
  return { s, run, ...performanceIndex(s, run) };
}

// --- calibration: stock car hits ~6.3 s 0-60 and ~139 mph ---
(function calibrate() {
  const stock = { ...DEFAULT_CONFIG };
  for (let i = 0; i < 4; i++) {
    let lo = 0.5, hi = 1.4;
    for (let k = 0; k < 22; k++) { EFF = (lo + hi) / 2; const r = runStraightLine(computeSpecs(stock)); if (r.t060 > 6.3) lo = EFF; else hi = EFF; }
    let clo = 0.4, chi = 1.2;
    for (let k = 0; k < 22; k++) { BASE_CDA = (clo + chi) / 2; const r = runStraightLine(computeSpecs(stock)); if (r.vmax > 139 / MPH) clo = BASE_CDA; else chi = BASE_CDA; }
  }
})();
