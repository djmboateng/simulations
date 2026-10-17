// Top-down 2D test drive. The car laps the track on auto-drive (or under your control),
// using the same performance model as the garage, so every upgrade shows up here.
import { createDrive, stepDrive, lateralG, G, RHO, MPH, KMH } from './physics.js';
import { drawCar } from './carIcon.js';

const DS = 2; // meters between track samples
const WHEELBASE = 2.62;

function oval() {
  const pts = [], R = 115, S = 520;
  for (let x = 0; x < S; x += 130) pts.push([x, 0]);
  for (let a = -Math.PI / 2; a < Math.PI / 2; a += Math.PI / 6) pts.push([S + Math.cos(a) * R, R + Math.sin(a) * R]);
  for (let x = S; x > 0; x -= 130) pts.push([x, 2 * R]);
  for (let a = Math.PI / 2; a < Math.PI * 1.5; a += Math.PI / 6) pts.push([Math.cos(a) * R, R + Math.sin(a) * R]);
  return pts;
}

export const TRACKS = [
  { id: 'oval', name: 'Sunset Speedway', tag: 'Top speed', width: 18, bg: '#2f6b3a', blurb: 'Two long straights and fast sweepers. Power, gearing and the jet shine here.', points: oval(), deco: 'stands' },
  { id: 'harbor', name: 'Harbor Circuit', tag: 'Balanced', width: 13, bg: '#3a6b45', blurb: 'A mix of fast and slow corners by the docks. Tests the whole build.', deco: 'harbor',
    points: [[0, 0], [260, -20], [480, -30], [590, 0], [640, 80], [600, 160], [520, 170], [470, 220], [500, 290], [600, 320], [640, 400], [600, 470], [470, 480], [420, 540], [460, 600], [400, 645], [260, 625], [140, 600], [60, 520], [-40, 470], [-120, 380], [-140, 240], [-90, 100]] },
  { id: 'mountain', name: 'Mountain Pass', tag: 'Handling', width: 10, bg: '#27432d', blurb: 'A narrow touge full of hairpins. Grip, brakes and suspension matter most.', deco: 'forest',
    points: [[0, 0], [110, -50], [200, -10], [250, -80], [350, -90], [420, -20], [390, 70], [460, 140], [570, 120], [640, 200], [590, 300], [470, 310], [400, 380], [280, 400], [220, 330], [130, 360], [40, 320], [-30, 240], [20, 160], [-40, 80]] },
  { id: 'airfield', name: 'Airfield Sprint', tag: 'Accel & brakes', width: 16, bg: '#55603f', blurb: 'Runway straights joined by tight hairpins. Launch, power and braking.', deco: 'airfield',
    points: [[0, 0], [400, 0], [800, 0], [870, 40], [850, 110], [520, 120], [470, 160], [520, 200], [850, 215], [880, 285], [810, 330], [400, 330], [0, 330], [-70, 290], [-90, 165], [-70, 40]] },
];

function catmullRom(pts, perSeg = 24) {
  const out = [], n = pts.length, d = (a, b) => Math.max(1e-3, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let j = 0; j < perSeg; j++) {
      const t = t1 + (t2 - t1) * j / perSeg;
      const L = (a, b, ta, tb) => [a[0] * (tb - t) / (tb - ta) + b[0] * (t - ta) / (tb - ta), a[1] * (tb - t) / (tb - ta) + b[1] * (t - ta) / (tb - ta)];
      const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  return out;
}

function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

function buildTrack(def) {
  const dense = catmullRom(def.points);
  // resample at even spacing
  const xs = [], ys = [];
  let carry = 0;
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i], b = dense[(i + 1) % dense.length];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = carry;
    while (t < seg) { xs.push(a[0] + (b[0] - a[0]) * t / seg); ys.push(a[1] + (b[1] - a[1]) * t / seg); t += DS; }
    carry = t - seg;
  }
  const N = xs.length, nx = [], ny = [], heading = [];
  for (let i = 0; i < N; i++) {
    const dx = xs[(i + 1) % N] - xs[(i - 1 + N) % N], dy = ys[(i + 1) % N] - ys[(i - 1 + N) % N];
    const l = Math.hypot(dx, dy); nx.push(-dy / l); ny.push(dx / l); heading.push(Math.atan2(dy, dx));
  }
  let k = heading.map((h, i) => { let d = heading[(i + 1) % N] - heading[(i - 1 + N) % N]; d = Math.atan2(Math.sin(d), Math.cos(d)); return d / (2 * DS); });
  for (let pass = 0; pass < 3; pass++) k = k.map((_, i) => { let s = 0; for (let j = -3; j <= 3; j++) s += k[(i + j + N) % N]; return s / 7; });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]); minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]); }
  const path = new Path2D();
  path.moveTo(xs[0], ys[0]); for (let i = 1; i < N; i++) path.lineTo(xs[i], ys[i]); path.closePath();
  const T = { ...def, N, xs, ys, nx, ny, heading, k, length: N * DS, path, bounds: { minX, minY, maxX, maxY } };
  T.deco = makeDeco(T);
  return T;
}

function distToTrack(T, x, y) {
  let best = Infinity;
  for (let i = 0; i < T.N; i += 3) best = Math.min(best, Math.hypot(T.xs[i] - x, T.ys[i] - y));
  return best;
}

function makeDeco(T) {
  const r = rng(T.id.length * 7919 + T.N), out = [];
  const { minX, minY, maxX, maxY } = T.bounds, pad = 80;
  const place = (count, minD, maxD, make) => {
    for (let tries = 0; out.length < 4000 && count > 0 && tries < count * 20; tries++) {
      const x = minX - pad + r() * (maxX - minX + 2 * pad), y = minY - pad + r() * (maxY - minY + 2 * pad);
      const d = distToTrack(T, x, y);
      if (d > T.width / 2 + minD && d < maxD) { out.push(make(x, y)); count--; }
    }
  };
  if (T.deco === 'forest') place(420, 4, 999, (x, y) => ({ t: 'tree', x, y, r: 3 + r() * 4 }));
  if (T.deco === 'stands') {
    out.push({ t: 'rect', x: 60, y: -48, w: 400, h: 18, c: '#9aa3b2' }, { t: 'rect', x: 60, y: -26, w: 400, h: 4, c: '#ff5a00' });
    out.push({ t: 'rect', x: 60, y: 30, w: 460, h: 170, c: '#357544' });
    place(60, 12, 140, (x, y) => ({ t: 'tree', x, y, r: 4 + r() * 3 }));
  }
  if (T.deco === 'harbor') {
    out.push({ t: 'rect', x: 790, y: -260, w: 500, h: 1100, c: '#1f5f8a' }, { t: 'rect', x: 680, y: -260, w: 110, h: 1100, c: '#8b8f96' });
    const cols = ['#c2410c', '#1d4ed8', '#15803d', '#ca8a04', '#9f1239'];
    for (let i = 0; i < 90; i++) { const x = 690 + (i % 6) * 15, y = -120 + Math.floor(i / 6) * 8 + (i % 6 > 2 ? 380 : 0); out.push({ t: 'rect', x, y, w: 12, h: 5, c: cols[Math.floor(r() * cols.length)] }); }
    place(80, 8, 999, (x, y) => ({ t: 'tree', x, y, r: 3 + r() * 3 }));
  }
  if (T.deco === 'airfield') {
    out.push({ t: 'rect', x: -60, y: 140, w: 860, h: 45, c: '#4b5563' });
    for (let x = -40; x < 780; x += 60) out.push({ t: 'rect', x, y: 160, w: 30, h: 4, c: '#e5e7eb' });
    place(40, 14, 999, (x, y) => ({ t: 'tree', x, y, r: 3 + r() * 3 }));
  }
  return out;
}

function speedProfile(T, s) {
  const mu = s.latMu * 0.95, v = new Array(T.N);
  for (let i = 0; i < T.N; i++) {
    const R = 1 / Math.max(Math.abs(T.k[i]), 1e-4);
    const denom = 1 - mu * 0.5 * RHO * Math.max(s.cla, 0) * R / s.kg;
    v[i] = denom <= 0.05 ? 150 : Math.min(150, Math.sqrt(mu * G * R / denom));
  }
  const ab = s.brakeG * G * 0.9;
  for (let pass = 0; pass < 2; pass++) for (let i = T.N - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[(i + 1) % T.N] ** 2 + 2 * ab * DS));
  return v;
}

const fmtTime = t => t == null ? '--' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

export function createTrackMode({ canvas, stage, onLap }) {
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const built = {};
  const getTrack = id => built[id] ||= buildTrack(TRACKS.find(t => t.id === id));
  const opts = { auto: true, ghost: true, chase: false, kmh: false, speed: 3 };
  const input = { left: false, right: false, gas: false, brake: false, boost: false };
  let T = null, cfg = null, specs = null, stockSpecs = null, player = null, ghost = null, running = false, raf = 0, last = 0, acc = 0;
  let skids = [], smoke = [], toastTimer = 0, trackId = 'harbor', simTime = 0;

  // ----- side panel -----
  const list = $('trackList');
  list.innerHTML = TRACKS.map(t => `<button class="track-card${t.id === trackId ? ' on' : ''}" data-id="${t.id}"><canvas width="112" height="84"></canvas><span><b>${t.name}</b><small>${t.blurb}</small><span class="tag">${t.tag}</span></span></button>`).join('');
  list.querySelectorAll('.track-card').forEach(btn => {
    const tr = getTrack(btn.dataset.id), c = btn.querySelector('canvas'), g = c.getContext('2d');
    const { minX, minY, maxX, maxY } = tr.bounds, sc = Math.min(96 / (maxX - minX), 68 / (maxY - minY));
    g.translate(56 - (minX + maxX) / 2 * sc, 42 - (minY + maxY) / 2 * sc); g.scale(sc, sc);
    g.strokeStyle = '#ff5a00'; g.lineWidth = 3 / sc; g.lineJoin = 'round'; g.stroke(tr.path);
    btn.querySelector('small').insertAdjacentHTML('beforeend', ` · ${(tr.length / 1000).toFixed(2)} km`);
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('.track-card'); if (!b) return;
    trackId = b.dataset.id;
    list.querySelectorAll('.track-card').forEach(x => x.classList.toggle('on', x === b));
    if (running) reset();
  });
  const bindToggle = (id, key, after) => $(id).addEventListener('change', e => { opts[key] = e.target.checked; e.target.blur(); after?.(); });
  bindToggle('optAuto', 'auto', () => toast(opts.auto ? 'Auto-drive on' : 'Manual: use the arrow keys'));
  bindToggle('optGhost', 'ghost', () => { if (opts.ghost && running) ghost = spawn(stockSpecs); });
  bindToggle('optChase', 'chase');
  bindToggle('optKmh', 'kmh');
  // simulation speed: runs the physics faster than real time so laps fly by (lap times stay real-world)
  $('simSpeed').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    opts.speed = +b.dataset.speed;
    $('simSpeed').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  });

  // ----- input -----
  const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', Space: 'boost', ShiftLeft: 'boost' };
  window.addEventListener('keydown', e => {
    const typing = e.target.matches?.('input:not([type=checkbox]):not([type=range]), textarea, select');
    if (!running || typing) return;
    if (keyMap[e.code] && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const k = keyMap[e.code];
    if (k) {
      input[k] = true; e.preventDefault();
      // touching the steering or pedals takes over from auto-drive
      if (opts.auto && k !== 'boost') { opts.auto = false; $('optAuto').checked = false; toast('Manual control (M for auto-drive)'); }
    }
    if (e.code === 'KeyM') { opts.auto = !opts.auto; $('optAuto').checked = opts.auto; toast(opts.auto ? 'Auto-drive on' : 'Manual: use the arrow keys'); }
    if (e.code === 'KeyC') { opts.chase = !opts.chase; $('optChase').checked = opts.chase; }
    if (e.code === 'KeyR') reset();
  });
  window.addEventListener('keyup', e => { if (keyMap[e.code]) { input[keyMap[e.code]] = false; if (running) e.preventDefault(); } });
  $('touchDrive').querySelectorAll('button').forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); input[k] = true; b.classList.add('held'); if (opts.auto && k !== 'boost') { opts.auto = false; $('optAuto').checked = false; toast('Manual control'); } };
    const off = () => { input[k] = false; b.classList.remove('held'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  });

  function toast(msg, ms = 1600) {
    const el = $('driveToast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function spawn(s, laneOffset = 0) {
    const i = T.N - 6;
    return { s, d: createDrive(s), x: T.xs[i] + T.nx[i] * laneOffset, y: T.ys[i] + T.ny[i] * laneOffset, h: T.heading[i], steer: 0, idx: i, rev: 0,
      lap: 0, lapStart: null, best: null, last: null, half: false, sliding: false, off: false, stuck: 0, profile: speedProfile(T, s), boosting: false, throttle: 0 };
  }

  function reset() {
    T = getTrack(trackId);
    player = spawn(specs, opts.ghost ? -T.width * 0.2 : 0);
    ghost = opts.ghost ? spawn(stockSpecs, T.width * 0.2) : null;
    skids = []; smoke = []; simTime = 0;
    $('hudBest').textContent = '--'; $('hudLast').textContent = '--'; $('hudGhost').textContent = '--';
    toast(T.name, 1400);
  }

  function nearest(car) {
    let best = Infinity, bi = car.idx;
    for (let j = -12; j <= 40; j++) {
      const i = (car.idx + j + T.N) % T.N, d = (T.xs[i] - car.x) ** 2 + (T.ys[i] - car.y) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    if (best > 900) for (let i = 0; i < T.N; i++) { const d = (T.xs[i] - car.x) ** 2 + (T.ys[i] - car.y) ** 2; if (d < best) { best = d; bi = i; } }
    return bi;
  }

  function stepCar(car, dt, isPlayer) {
    const prevIdx = car.idx;
    car.idx = nearest(car);
    const lat = (car.x - T.xs[car.idx]) * T.nx[car.idx] + (car.y - T.ys[car.idx]) * T.ny[car.idx];
    car.off = Math.abs(lat) > T.width / 2 + 0.4;
    const v = car.d.v;
    const auto = !isPlayer || opts.auto;
    let throttle = 0, brake = 0, steerTarget = 0;
    if (auto) {
      const look = Math.max(4, Math.round(v * 0.25 / DS));
      const vt = car.profile[(car.idx + look) % T.N];
      if (v < vt - 0.4) throttle = 1; else if (v > vt + 0.6) brake = Math.min(1, (v - vt) / 2.5); else throttle = 0.35;
      const Ld = 5 + 0.32 * v, ti = (car.idx + Math.round(Ld / DS)) % T.N;
      const dx = T.xs[ti] - car.x, dy = T.ys[ti] - car.y;
      const alpha = Math.atan2(dy, dx) - car.h, a = Math.atan2(Math.sin(alpha), Math.cos(alpha));
      steerTarget = Math.max(-0.6, Math.min(0.6, Math.atan(2 * WHEELBASE * Math.sin(a) / Math.hypot(dx, dy))));
      if (car.off) throttle = Math.min(throttle, 0.6);
    } else {
      throttle = input.gas ? 1 : 0; brake = input.brake ? 1 : 0;
      steerTarget = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 0.5 / (1 + v / 16);
    }
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * (auto ? 14 : 8));
    const boost = isPlayer && input.boost;
    const res = stepDrive(car.d, dt, throttle, brake, boost, car.off ? 0.22 * car.s.kg * G : 0, car.off ? 0.55 : 1);
    car.boosting = res.boosting; car.throttle = throttle;
    // refill the boost bottle slowly
    if (!res.boosting && car.s.boostCapacity) car.d.boostLeft = Math.min(car.s.boostCapacity, car.d.boostLeft + dt * 0.12);
    // reverse when stopped and holding brake in manual
    if (!auto && input.brake && car.d.v < 0.3) car.rev = Math.min(car.rev + dt * 3, 4); else car.rev = Math.max(0, car.rev - dt * 6);
    const speed = car.d.v - car.rev;
    let yaw = speed * Math.tan(car.steer) / WHEELBASE;
    const limit = lateralG(car.s, car.d.v) * G * (car.off ? 0.55 : 1);
    car.sliding = false;
    if (Math.abs(yaw * car.d.v) > limit && car.d.v > 3) {
      const excess = Math.abs(yaw * car.d.v) / limit;
      yaw = Math.sign(yaw) * limit / car.d.v;
      car.d.v = Math.max(0, car.d.v - (excess - 1) * 3 * dt);
      car.sliding = car.d.v > 8;
    }
    car.h += yaw * dt;
    car.x += Math.cos(car.h) * speed * dt; car.y += Math.sin(car.h) * speed * dt;
    // effects
    if (isPlayer && (car.sliding || (res.wheelspin && car.d.v > 0.5 && car.d.v < 25))) {
      const c = Math.cos(car.h), s = Math.sin(car.h);
      for (const side of [-0.8, 0.8]) {
        const rx = car.x - c * (res.wheelspin ? -1.3 : 1.3) - s * side, ry = car.y - s * (res.wheelspin ? -1.3 : 1.3) + c * side;
        const prev = car[`sk${side}`];
        if (prev && Math.hypot(prev[0] - rx, prev[1] - ry) < 4) skids.push([prev[0], prev[1], rx, ry]);
        car[`sk${side}`] = [rx, ry];
        if (Math.random() < 0.35) smoke.push({ x: rx, y: ry, r: 0.8, life: 1 });
      }
      if (skids.length > 1600) skids.splice(0, skids.length - 1600);
    } else if (isPlayer) { car['sk-0.8'] = car['sk0.8'] = null; }
    if (car.off && car.d.v > 6 && Math.random() < 0.25) smoke.push({ x: car.x - Math.cos(car.h) * 2, y: car.y - Math.sin(car.h) * 2, r: 1, life: 0.7, dirt: true });
    // recover if far away or stuck
    if (Math.abs(lat) > T.width / 2 + 30) placeOnTrack(car, isPlayer);
    car.stuck = auto && car.d.v < 1 ? car.stuck + dt : 0;
    if (car.stuck > 2.5) placeOnTrack(car, isPlayer);
    // laps
    if (car.idx > T.N * 0.45 && car.idx < T.N * 0.55) car.half = true;
    if (prevIdx > T.N * 0.9 && car.idx < T.N * 0.1) {
      if (car.lapStart == null) { car.lapStart = simTime; car.lap = 1; }
      else if (car.half) {
        const t = simTime - car.lapStart; car.last = t; car.lapStart = simTime; car.lap++;
        const isBest = car.best == null || t < car.best;
        if (isBest) car.best = t;
        if (isPlayer) { $('hudLast').textContent = fmtTime(t); $('hudBest').textContent = fmtTime(car.best); toast(isBest ? `New best lap! ${fmtTime(t)}` : `Lap ${fmtTime(t)}`, 2000); onLap?.(T.name, t); }
        else $('hudGhost').textContent = fmtTime(car.best);
      }
      car.half = false;
    }
  }

  function placeOnTrack(car, isPlayer) {
    const i = car.idx;
    car.x = T.xs[i]; car.y = T.ys[i]; car.h = T.heading[i]; car.d.v = 0; car.d.gear = 0; car.steer = 0; car.stuck = 0;
    if (isPlayer) toast('Back on track');
  }

  // ----- drawing -----
  function resize() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
  }
  new ResizeObserver(() => { if (running) resize(); }).observe(stage);

  function draw() {
    const W = canvas.width, H = canvas.height, dpr = Math.min(window.devicePixelRatio, 2);
    const { minX, minY, maxX, maxY } = T.bounds;
    let scale, cx, cy;
    if (opts.chase) { scale = (W < 700 * dpr ? 8 : 11) * dpr; cx = player.x; cy = player.y; }
    else { const pad = 40 * dpr, topPad = 70 * dpr; scale = Math.min((W - 2 * pad) / (maxX - minX + T.width), (H - topPad - pad) / (maxY - minY + T.width)); cx = (minX + maxX) / 2; cy = (minY + maxY) / 2 - (topPad - pad) / 2 / scale; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, W / 2 - cx * scale, H / 2 - cy * scale);
    for (const d of T.deco) {
      if (d.t === 'rect') { ctx.fillStyle = d.c; if (d.rot) { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h); ctx.restore(); } else ctx.fillRect(d.x, d.y, d.w, d.h); }
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const vw = opts.chase ? T.width : Math.max(T.width, (20 * dpr) / scale);
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = vw * 1.17; ctx.setLineDash([]); ctx.stroke(T.path);
    ctx.strokeStyle = '#e11d2a'; ctx.setLineDash([4, 4]); ctx.stroke(T.path);
    ctx.setLineDash([]); ctx.strokeStyle = '#3a3f47'; ctx.lineWidth = vw; ctx.stroke(T.path);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(0.3, 1 / scale); ctx.setLineDash([6, 8]); ctx.stroke(T.path); ctx.setLineDash([]);
    // start / finish checkers
    { const i = 0, n = 8, sq = vw / n; ctx.save(); ctx.translate(T.xs[i], T.ys[i]); ctx.rotate(T.heading[i]);
      for (let a = 0; a < n; a++) for (let b = 0; b < 2; b++) { ctx.fillStyle = (a + b) % 2 ? '#111' : '#fff'; ctx.fillRect(b * sq - sq, -vw / 2 + a * sq, sq, sq); }
      ctx.restore(); }
    // skid marks
    ctx.strokeStyle = 'rgba(15,15,18,.45)'; ctx.lineWidth = 0.28; ctx.beginPath();
    for (const s of skids) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
    ctx.stroke();
    for (const d of T.deco) if (d.t === 'tree') { ctx.fillStyle = '#1d3a24'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill(); ctx.fillStyle = '#2f5d38'; ctx.beginPath(); ctx.arc(d.x - d.r * 0.2, d.y - d.r * 0.2, d.r * 0.6, 0, 7); ctx.fill(); }
    // smoke
    for (const p of smoke) { ctx.fillStyle = p.dirt ? `rgba(120,95,60,${p.life * 0.35})` : `rgba(235,235,240,${p.life * 0.4})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    // cars (exaggerated in full view so they read at small scale)
    const iconScale = opts.chase ? 1 : Math.max(1, (32 * dpr) / (4.18 * scale));
    const drawAt = (car, isGhost) => { ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.h); ctx.scale(iconScale, iconScale); drawCar(ctx, cfg, { boosting: car.boosting, throttle: car.throttle, ghost: isGhost, t: simTime }); ctx.restore(); };
    if (ghost) drawAt(ghost, true);
    drawAt(player, false);
  }

  function updateHud() {
    const v = player.d.v, k = opts.kmh ? KMH : MPH;
    $('hudSpeed').textContent = Math.round(v * k);
    $('hudUnit').textContent = opts.kmh ? 'KM/H' : 'MPH';
    $('hudGear').textContent = player.rev > 0.2 ? 'R' : player.d.gear + 1;
    $('hudRpm').style.width = `${Math.min(100, player.d.rpm / player.s.redline * 100)}%`;
    $('hudLap').textContent = Math.max(1, player.lap);
    $('hudTime').textContent = player.lapStart == null ? fmtTime(0) : fmtTime(simTime - player.lapStart);
    const m = $('hudMode'); m.textContent = opts.auto ? 'AUTO' : 'MANUAL'; m.classList.toggle('manual', !opts.auto);
    const bw = $('hudBoostWrap'); bw.classList.toggle('show', !!player.s.boostCapacity);
    if (player.s.boostCapacity) $('hudBoost').style.width = `${player.d.boostLeft / player.s.boostCapacity * 100}%`;
    document.querySelector('.ghost-best').style.display = ghost ? '' : 'none';
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000) * opts.speed; last = now; acc += dt;
    const h = 1 / 120;
    while (acc >= h) { stepCar(player, h, true); if (ghost) stepCar(ghost, h, false); simTime += h; acc -= h; }
    for (const p of smoke) { p.life -= dt * 0.9; p.r += dt * 2.2; }
    smoke = smoke.filter(p => p.life > 0);
    draw(); updateHud();
    raf = requestAnimationFrame(frame);
  }

  function describeChanges(full, stock) {
    const s = full.s, s0 = stock.s, out = [];
    const dhp = Math.round(s.hp - s0.hp); if (dhp) out.push(`<b>${dhp > 0 ? '+' : ''}${dhp} hp</b> (${Math.round(s.hp)} hp total)`);
    if (s.cfg.jet) out.push('<b>Jet engine</b>: Space lights the afterburner');
    if (s.nitrousHp) out.push(`<b>Nitrous</b>: +${s.nitrousHp} hp on Space`);
    const dg = lateralG(s, 30) - lateralG(s0, 30); if (Math.abs(dg) >= 0.01) out.push(`<b>Grip ${dg > 0 ? '+' : ''}${dg.toFixed(2)} g</b>: ${dg > 0 ? 'faster' : 'slower'} through corners`);
    if (s.cla > 0.1) out.push('<b>Downforce</b>: extra grip in fast corners');
    const dkg = s.kg - s0.kg; if (dkg) out.push(`<b>${dkg > 0 ? '+' : ''}${dkg} kg</b>`);
    if (s.brakeG > s0.brakeG + 0.01) out.push('<b>Better brakes</b>: brakes later into corners');
    const dv = Math.round((full.run.vmax - stock.run.vmax) * MPH); if (dv) out.push(`<b>Top speed ${dv > 0 ? '+' : ''}${dv} mph</b>`);
    $('driveChanges').innerHTML = out.length ? `Your build vs. stock:<ul>${out.map(x => `<li>${x}</li>`).join('')}</ul>` : 'This is the <b>stock EK9</b>. Tune it in the garage and the changes show up here.';
  }

  return {
    start(c, full, stock) {
      cfg = c; specs = full.s; stockSpecs = stock.s;
      describeChanges(full, stock);
      running = true; resize(); reset();
      last = performance.now(); acc = 0; raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); Object.keys(input).forEach(k => input[k] = false); },
  };
}
