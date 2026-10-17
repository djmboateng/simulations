// Quarter-mile drag race against preset EK9 rivals, with a Christmas tree start and timing slips.
import { DEFAULT_CONFIG, computeSpecs, runStraightLine, createDrive, stepDrive, MPH } from './physics.js';
import { drawCar } from './carIcon.js';

const QUARTER = 402.34;
const SPLITS = [['60 ft', 18.29], ['330 ft', 100.58], ['⅛ mile', 201.17], ['1000 ft', 304.8], ['¼ mile', QUARTER]];

export const OPPONENTS = [
  { id: 'stock', name: 'Stock EK9', cfg: { ...DEFAULT_CONFIG, paint: '#b9bcc0' } },
  { id: 'street', name: 'Street EK9', cfg: { ...DEFAULT_CONFIG, engine: 'k20a', intake: 2, ecu: 1, tire: 'sport', weight: 1, paint: '#1b4fd8', wheelSize: 17 } },
  { id: 'turbo', name: 'Turbo EK9', cfg: { ...DEFAULT_CONFIG, engine: 'k20a', induction: 'turbo', intake: 2, ecu: 2, tire: 'drag', weight: 2, diff: 1, gearing: 1, paint: '#c8102e', wing: 'gt', rideHeight: -50, stance: 30 } },
  { id: 'jet', name: 'Jet EK9', cfg: { ...DEFAULT_CONFIG, jet: true, tire: 'drag', weight: 1, gearing: 2, nitrous: 2, paint: '#16181d', rimColor: '#d4af37' } },
];
OPPONENTS.forEach(o => { o.specs = computeSpecs(o.cfg); o.qm = runStraightLine(o.specs).qm; });

const fmt = (t, d = 3) => t == null ? '--' : t.toFixed(d);

export function createDragMode({ canvas, stage, onResult }) {
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const lights = [...$('tree').children];
  const input = { gas: false, boost: false };
  let running = false, raf = 0, last = 0, acc = 0, oppId = 'stock', cfg = null, specs = null;
  let phase = 'idle', clock = 0, greenAt = 0, cars = [], toastTimer = 0, stageTimer = null;

  const list = $('opponentList');
  list.innerHTML = OPPONENTS.map(o => `<button class="opp-card${o.id === oppId ? ' on' : ''}" data-id="${o.id}" style="--c:${o.cfg.paint}"><i></i><span><b>${o.name}</b><small>${Math.round(o.specs.hp)} hp · ¼ mile ≈ ${o.qm.toFixed(2)} s</small></span></button>`).join('');
  list.addEventListener('click', e => {
    const b = e.target.closest('.opp-card'); if (!b || phase === 'staging' || phase === 'racing') return;
    oppId = b.dataset.id; list.querySelectorAll('.opp-card').forEach(x => x.classList.toggle('on', x === b)); setup();
  });
  $('stageBtn').addEventListener('click', () => stageRace());

  const keyMap = { ArrowUp: 'gas', KeyW: 'gas', Space: 'boost', ShiftLeft: 'boost' };
  window.addEventListener('keydown', e => {
    const typing = e.target.matches?.('input:not([type=checkbox]):not([type=range]), textarea, select');
    if (!running || typing) return;
    if (keyMap[e.code] && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (keyMap[e.code]) { e.preventDefault(); press(keyMap[e.code]); }
    if (e.code === 'Enter' && (phase === 'idle' || phase === 'done')) stageRace();
  });
  window.addEventListener('keyup', e => { if (keyMap[e.code]) { input[keyMap[e.code]] = false; if (running) e.preventDefault(); } });
  $('touchDrag').querySelectorAll('button').forEach(b => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); press(k); b.classList.add('held'); });
    const off = () => { input[k] = false; b.classList.remove('held'); };
    b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  });

  function press(k) {
    if (input[k]) return;
    input[k] = true;
    const me = cars[0];
    if (k === 'gas' && me && me.launchAt == null) {
      if (phase === 'staging') { me.foul = true; lights[4].className = 'red'; toast('RED LIGHT! Too early'); }
      if (phase === 'staging' || phase === 'racing') me.launchAt = clock;
    }
  }

  function toast(msg, ms = 1800) {
    const el = $('dragToast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  const makeCar = (s, c, lane, name) => ({ s, cfg: c, lane, name, d: createDrive(s), x: 0, t0: null, launchAt: null, splits: {}, splitV: {}, finish: null, foul: false, boosting: false, throttle: 0, smoke: [] });

  function setup() {
    const opp = OPPONENTS.find(o => o.id === oppId);
    cars = [makeCar(specs, cfg, -3.1, 'You'), makeCar(opp.specs, opp.cfg, 3.1, opp.name)];
    phase = 'idle'; clock = 0;
    lights.forEach(l => l.className = '');
    $('stageBtn').disabled = false; $('stageBtn').textContent = 'Stage the cars';
  }

  function stageRace() {
    if (phase === 'staging' || phase === 'racing') return;
    setup();
    phase = 'staging'; clock = 0; $('stageBtn').disabled = true;
    const delay = 0.8 + Math.random() * 0.9;
    greenAt = delay + 1.2;
    cars[1].launchAt = greenAt + 0.17 + Math.random() * 0.16; // rival's reaction time
    toast('Get ready… hold ↑ on green', 1500);
  }

  function updateTree() {
    if (phase !== 'staging' && phase !== 'racing') return;
    const t = clock - (greenAt - 1.2); // three ambers 0.4 s apart, then green
    for (let i = 0; i < 3; i++) lights[i].className = clock < greenAt && t >= i * 0.4 ? 'amber' : '';
    if (clock >= greenAt && !cars[0].foul) lights[3].className = 'green';
  }

  function step(dt) {
    clock += dt;
    if (phase === 'staging' && clock >= greenAt) { phase = 'racing'; if (!cars[0].foul) toast('GO!', 700); }
    updateTree();
    if (phase !== 'racing' && phase !== 'done') return;
    for (const [i, c] of cars.entries()) {
      const launched = c.launchAt != null && clock >= Math.max(c.launchAt, greenAt);
      const finished = c.finish != null;
      const throttle = finished ? 0 : launched ? (i === 0 ? (input.gas ? 1 : 0) : 1) : 0;
      const boost = !finished && launched && (i === 0 ? input.boost : true);
      const v0 = c.d.v;
      const res = stepDrive(c.d, dt, throttle, finished ? 0.7 : 0, boost);
      c.boosting = res.boosting; c.throttle = throttle;
      if (c.t0 == null && c.d.v > 0) c.t0 = clock;
      c.x += (v0 + c.d.v) / 2 * dt;
      if (res.wheelspin && c.d.v < 30 && Math.random() < 0.08) c.smoke.push({ x: c.x - 1.4, y: c.lane + (Math.random() - 0.5) * 2, r: 0.7, life: 0.8 });
      for (const [label, dist] of SPLITS) if (c.splits[label] == null && c.x >= dist) { c.splits[label] = clock - c.t0; c.splitV[label] = c.d.v; }
      if (c.finish == null && c.x >= QUARTER) c.finish = clock - greenAt;
    }
    for (const c of cars) { for (const p of c.smoke) { p.life -= dt * 0.8; p.r += dt * 2.5; p.x -= dt * 2; } c.smoke = c.smoke.filter(p => p.life > 0); }
    const allDone = cars.every(c => c.finish != null || (c.launchAt == null && clock > greenAt + 8)) || clock > greenAt + 40;
    if (phase === 'racing' && allDone) finish();
  }

  function finish() {
    phase = 'done';
    lights.forEach(l => { if (l.className !== 'red') l.className = ''; });
    const [me, op] = cars;
    const rt = me.launchAt != null ? me.launchAt - greenAt : null;
    const win = !me.foul && me.finish != null && (op.finish == null || me.finish < op.finish);
    const margin = me.finish != null && op.finish != null ? Math.abs(op.finish - me.finish) : null;
    const verdict = me.foul ? '<span class="lose">RED LIGHT</span>' : me.finish == null ? '<span class="lose">NO LAUNCH</span>' : win ? `<span class="win">YOU WIN</span> by ${fmt(margin)} s` : `<span class="lose">YOU LOSE</span> by ${fmt(margin)} s`;
    const row = (label, a, b) => `<tr><td>${label}</td><td>${a}</td><td>${b}</td></tr>`;
    const rows = [row('Reaction', fmt(rt), fmt(op.launchAt - greenAt))];
    for (const [label] of SPLITS) rows.push(row(label, fmt(me.splits[label]), fmt(op.splits[label])));
    rows.push(row('Trap speed', me.splitV['¼ mile'] ? `${(me.splitV['¼ mile'] * MPH).toFixed(1)} mph` : '--', op.splitV['¼ mile'] ? `${(op.splitV['¼ mile'] * MPH).toFixed(1)} mph` : '--'));
    $('dragResults').innerHTML = `<p class="verdict">${verdict}</p><table><thead><tr><th>Time slip</th><th>You</th><th>${op.name}</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    toast(me.foul ? 'Red light: disqualified' : win ? 'You win!' : 'Beaten!', 2400);
    $('stageBtn').disabled = false; $('stageBtn').textContent = 'Race again';
    onResult?.({ opponent: op.name, rt, et: me.splits['¼ mile'] ?? null, trap: me.splitV['¼ mile'] ? me.splitV['¼ mile'] * MPH : null, win, foul: me.foul });
  }

  // ----- drawing -----
  function resize() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
  }
  new ResizeObserver(() => { if (running) resize(); }).observe(stage);

  function draw() {
    const W = canvas.width, H = canvas.height;
    const scale = Math.min(W / 80, H / 26);
    const me = cars[0];
    const camX = Math.max(-8, me.x + 18 - W / scale * 0.5);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2f6b3a'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, -camX * scale, H / 2);
    const x0 = camX - 5, x1 = camX + W / scale + 5;
    // stands + walls
    ctx.fillStyle = '#9aa3b2'; ctx.fillRect(x0, -15, x1 - x0, 4);
    for (let x = Math.floor(x0 / 6) * 6; x < x1; x += 6) { ctx.fillStyle = ['#ff5a00', '#e5e7eb', '#1d4ed8', '#facc15'][Math.abs(Math.round(x / 6)) % 4]; ctx.fillRect(x + 1, -14.2, 1.2, 1.2); ctx.fillRect(x + 3.5, -12.8, 1.2, 1.2); }
    ctx.fillStyle = '#cfd3d9'; ctx.fillRect(x0, -7.2, x1 - x0, 0.6); ctx.fillRect(x0, 6.6, x1 - x0, 0.6);
    // asphalt + burnout box (darker rubber near the line)
    ctx.fillStyle = '#353a42'; ctx.fillRect(x0, -6.6, x1 - x0, 13.2);
    const g = ctx.createLinearGradient(-30, 0, 120, 0); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(-30, -6.6, 150, 13.2);
    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x0, -0.15, x1 - x0, 0.3);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 0.15;
    ctx.beginPath(); ctx.moveTo(x0, -6.2); ctx.lineTo(x1, -6.2); ctx.moveTo(x0, 6.2); ctx.lineTo(x1, 6.2); ctx.stroke(); ctx.setLineDash([]);
    // start line, markers, finish
    ctx.fillStyle = '#fff'; ctx.fillRect(2.05, -6.6, 0.3, 13.2);
    ctx.font = 'bold 1.6px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
    for (const [label, dist] of SPLITS) {
      if (dist !== QUARTER) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(dist + 2.05, -6.6, 0.15, 13.2); }
      ctx.fillStyle = '#111'; ctx.fillRect(dist + 0.6, -10.4, 3, 2.2); ctx.fillStyle = '#fff'; ctx.fillText(label, dist + 2.1, -8.75);
    }
    for (let a = 0; a < 12; a++) for (let b = 0; b < 2; b++) { ctx.fillStyle = (a + b) % 2 ? '#111' : '#fff'; ctx.fillRect(QUARTER + 2.05 + b * 1.1, -6.6 + a * 1.1, 1.1, 1.1); }
    // smoke + cars
    for (const c of cars) for (const p of c.smoke) { ctx.fillStyle = `rgba(235,235,240,${p.life * 0.45})`; ctx.beginPath(); ctx.arc(p.x + 2.1, p.y, p.r, 0, 7); ctx.fill(); }
    for (const c of cars) { ctx.save(); ctx.translate(c.x, c.lane); drawCar(ctx, c.cfg, { boosting: c.boosting, throttle: c.throttle }); ctx.restore(); }
    // HUD on canvas: speed + distance
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = Math.min(window.devicePixelRatio, 2);
    ctx.font = `700 ${16 * dpr}px "Space Grotesk", monospace`; ctx.textAlign = 'left';
    cars.forEach((c, i) => {
      const y = H - (cars.length - i) * 30 * dpr - 10 * dpr;
      ctx.fillStyle = 'rgba(8,10,14,.78)'; ctx.fillRect(12 * dpr, y - 20 * dpr, 330 * dpr, 26 * dpr);
      ctx.fillStyle = i === 0 ? '#ff7a1a' : '#cfd5de';
      ctx.fillText(`${c.name.toUpperCase().slice(0, 10).padEnd(10)} ${String(Math.round(c.d.v * MPH)).padStart(3)} MPH  ${Math.min(QUARTER, c.x).toFixed(0).padStart(3)} m`, 20 * dpr, y);
    });
    if (phase === 'idle') { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `700 ${15 * dpr}px "Space Grotesk", sans-serif`; ctx.textAlign = 'center'; ctx.fillText('Press "Stage the cars" (or Enter) to start', W / 2, 80 * dpr); }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    const h = 1 / 240;
    while (acc >= h) { step(h); acc -= h; }
    draw();
    raf = requestAnimationFrame(frame);
  }

  return {
    start(c, full) {
      cfg = c; specs = full.s; running = true; resize(); setup();
      last = performance.now(); acc = 0; raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); input.gas = input.boost = false; clearTimeout(stageTimer); if (phase === 'staging' || phase === 'racing') phase = 'idle'; },
  };
}
