import { DEFAULT_CONFIG, ENGINES, TIRES, PAINTS, RIM_COLORS, fullSpecs, lateralG, buildCost, upgradeCount, CLASS_COLORS, MPH, KMH } from './physics.js';
import { createTrackMode } from './track.js';
import { createDragMode } from './drag.js';
import { downloadPhoto, downloadReport } from './report.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const svg = body => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  engine: svg('<rect x="14" y="5" width="20" height="12" rx="2"/><path d="M14 10h20M14 13.5h20"/><path d="M21 17l-3 15M27 17l3 15"/><circle cx="24" cy="36" r="7"/><circle cx="24" cy="36" r="2.2" fill="currentColor"/>'),
  boost: svg('<path d="M24 24m-3 0a3 3 0 1 0 6 0a7 7 0 1 0-14 0a11 11 0 1 0 22 0a15 15 0 0 0-15-15"/><path d="M9 24H4M24 9h14v7"/>'),
  brakes: svg('<circle cx="22" cy="26" r="16"/><circle cx="22" cy="26" r="5"/><circle cx="22" cy="15" r="1.4" fill="currentColor"/><circle cx="31.5" cy="26" r="1.4" fill="currentColor"/><circle cx="12.5" cy="26" r="1.4" fill="currentColor"/><circle cx="22" cy="37" r="1.4" fill="currentColor"/><path d="M33 8c6 3 9 8 9 14" stroke-width="6"/>'),
  suspension: svg('<rect x="3" y="14" width="8" height="20" rx="2"/><rect x="37" y="14" width="8" height="20" rx="2"/><path d="M11 24h26"/><rect x="19" y="19" width="10" height="10" rx="1.5"/><path d="M15 24V10M33 24V10M12 10h6M30 10h6"/>'),
  wheels: svg('<circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="11"/><circle cx="24" cy="24" r="3" fill="currentColor"/><path d="M24 13v8M24 27v8M13 24h8M27 24h8"/>'),
  aero: svg('<path d="M3 20c12-6 30-8 42-4l-2 5c-12-3-26-1-37 4z" fill="currentColor"/><path d="M14 23v14M34 19v18M10 37h28"/>'),
  drivetrain: svg('<circle cx="24" cy="24" r="6"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/><circle cx="24" cy="24" r="14"/>'),
  paint: svg('<rect x="13" y="16" width="16" height="28" rx="3"/><path d="M16 16v-5h10v5M19 11V6h4v5"/><path d="M33 8h2M37 5h2M37 11h2M41 8h2"/><path d="M13 26h16"/>'),
};

const sub = (hp) => (hp ? `+${hp} hp` : 'Stock');
const CATEGORIES = [
  { id: 'engine', name: 'Engine', view: 'engine',
    desc: 'Engine upgrades improve acceleration and top speed. Swap in a bigger VTEC motor, let it breathe with a freer intake and exhaust, and remap the ECU for more revs. Power alone won\'t win races, though. A fast car needs grip and brakes to match.',
    groups: [
      { key: 'engine', label: 'Engine swap', options: Object.entries(ENGINES).map(([v, e]) => ({ v, name: e.name.split(' (')[0].replace(' VTEC', '').replace(' i-VTEC', ''), sub: `${e.hp} hp`,
        desc: { b16b: 'The factory B16B: a hand-finished 1.6L that screams to 8,400 rpm. 116 hp per liter, a record for a naturally aspirated production engine at the time.', b18c: 'The 1.8L from the Integra Type R. More displacement means more torque everywhere, for a small weight penalty.', k20a: 'The 2.0L i-VTEC from the next-generation Type R. The biggest jump in torque and a higher redline. A popular swap.' }[v] })) },
      { key: 'intake', label: 'Intake & exhaust', options: [
        { v: 0, name: 'Stock', sub: 'Factory', desc: 'Factory airbox and exhaust. Quiet and reliable.' },
        { v: 1, name: 'Sport', sub: '+5% power', desc: 'Cold-air intake and a cat-back exhaust. More airflow, more power and a better sound. The exhaust tip gets bigger too.' },
        { v: 2, name: 'Race', sub: '+10% power', desc: 'Velocity stacks, a 4-2-1 header and a straight-through exhaust. Loud and fast, with a massive exhaust tip.' }] },
      { key: 'ecu', label: 'ECU tune', options: [
        { v: 0, name: 'Stock', sub: '8,400 rpm', desc: 'Factory engine map.' },
        { v: 1, name: 'Stage 1', sub: '+4% · +300 rpm', desc: 'Optimized ignition timing and fuel maps, plus a raised rev limiter.' },
        { v: 2, name: 'Stage 2', sub: '+8% · +600 rpm', desc: 'Aggressive dyno tune with a much higher rev limiter. VTEC engages earlier and pulls harder.' }] },
    ] },
  { id: 'boost', name: 'Boost', view: 'boost',
    desc: 'Forced induction and other power adders. A turbocharger gives huge top-end power but has lag. A supercharger pulls hard from low rpm. Nitrous and the jet engine give you a boost meter. Hold Space on the track to use it.',
    groups: [
      { key: 'induction', label: 'Forced induction', options: [
        { v: 'na', name: 'None', sub: 'Naturally aspirated', desc: 'Pure, high-revving VTEC. No boost.' },
        { v: 'turbo', name: 'Turbo', sub: 'Up to +60%', desc: 'A big single turbo with a front-mount intercooler (look at the grille). Boost builds above about 5,500 rpm, so there is lag off the line and then a big rush of power.' },
        { v: 'super', name: 'Supercharger', sub: 'Up to +38%', desc: 'A belt-driven blower poking through the hood. Instant response and strong low-end torque, but less peak power than the turbo.' }] },
      { key: 'nitrous', label: 'Nitrous oxide', options: [
        { v: 0, name: 'None', sub: '—', desc: 'No nitrous system.' },
        { v: 1, name: '50 shot', sub: '+50 hp · 10 s', desc: 'A mild wet nitrous kit. Hold Space for +50 hp. The bottle slowly refills on the track.' },
        { v: 2, name: '100 shot', sub: '+100 hp · 8 s', desc: 'A big nitrous shot. Hold Space for +100 hp and blue flames from the exhaust.' }] },
      { key: 'jet', label: 'Jet engine', options: [
        { v: false, name: 'No jet', sub: 'Sensible', desc: 'Keep the roof clear.' },
        { v: true, name: 'Jet engine', sub: '+3.2 kN thrust', desc: 'A roof-mounted turbojet. It pushes the car without needing tire grip, so launches are huge and top speed climbs well past the rev limiter. Hold Space to light the afterburner. Heavy and draggy, and gloriously silly.' }] },
    ] },
  { id: 'brakes', name: 'Brakes', view: 'wheels',
    desc: 'Better brakes let the car stop later and harder before corners. On the track, the auto-driver brakes later with every upgrade, and that alone can cut seconds off a lap. Braking power is still limited by how much grip your tires have.',
    groups: [
      { key: 'brakes', label: 'Brake kit', options: [
        { v: 0, name: 'Stock', sub: '262 mm discs', desc: 'Factory single-piston calipers and vented discs.' },
        { v: 1, name: 'Sport', sub: 'Pads + rotors', desc: 'Performance pads, slotted rotors and braided lines. Stronger and resists fade.' },
        { v: 2, name: 'Race', sub: 'Big brake kit', desc: '4-piston calipers on large two-piece rotors. Maximum stopping power, if the tires can use it.' }] },
    ] },
  { id: 'suspension', name: 'Suspension', view: 'suspension',
    desc: 'Suspension controls how the car leans, squats and grips. Stiffer springs and dampers cut body roll for sharper handling. Lowering the car drops the center of gravity and helps the aero. Watch the body sink over the wheels as you slide it down.',
    groups: [
      { key: 'springs', label: 'Springs & dampers', options: [
        { v: 0, name: 'Stock', sub: 'Comfort', desc: 'Factory Type R suspension. Already firm for a road car.' },
        { v: 1, name: 'Sport', sub: 'Coilovers', desc: 'Adjustable coilovers with stiffer springs. Less roll and more grip in corners.' },
        { v: 2, name: 'Race', sub: 'Track setup', desc: 'Stiff race springs, adjustable dampers and sway bars. Maximum mechanical grip.' }] },
      { key: 'rideHeight', label: 'Ride height', type: 'range', min: -80, max: 40, step: 5, unit: 'mm', left: 'Slammed', right: 'Raised',
        desc: 'Lower means a lower center of gravity, less drag and more downforce. Raising it does the opposite.' },
    ] },
  { id: 'wheels', name: 'Wheels & Tires', view: 'wheels',
    desc: 'Tires are the only part of the car touching the road, so the compound is the biggest single change you can make to handling. Bigger rims with lower-profile tires sharpen the steering, and a wider track adds stability.',
    groups: [
      { key: 'tire', label: 'Tire compound', options: Object.entries(TIRES).map(([v, t]) => ({ v, name: t.name, sub: `${t.lat.toFixed(2)} g grip`,
        desc: { street: 'Factory 195/55 R15 road tires. Balanced, but they give up early when pushed.', sport: 'Sticky performance road tires. A big step up in cornering and braking.', slick: 'Track-day semi-slicks. Huge grip in corners and under braking.', drag: 'Soft, tall drag radials. Incredible launches in a straight line, but they squirm in corners.' }[v] })) },
      { key: 'wheelSize', label: 'Rim size', options: [15, 16, 17, 18].map(v => ({ v, name: `${v}"`, sub: v === 15 ? 'Stock' : `+${(v - 15) * 2.5} kg`, desc: v === 15 ? 'Factory 15" five-spoke wheels.' : `${v}" rims with lower-profile tires: sharper turn-in, slightly heavier.` })) },
      { key: 'stance', label: 'Track width', type: 'range', min: 0, max: 50, step: 5, unit: 'mm', left: 'Stock', right: 'Wide',
        desc: 'Wheel spacers push the wheels out to the arches. A wider stance gives more cornering stability and looks aggressive.' },
      { key: 'rimColor', label: 'Rim color', type: 'color', colors: RIM_COLORS },
    ] },
  { id: 'aero', name: 'Aero & Weight', view: 'aero',
    desc: 'A wing pushes the car into the road at speed, giving more grip in fast corners at the cost of some drag and top speed. Removing weight helps everything: acceleration, braking and cornering.',
    groups: [
      { key: 'wing', label: 'Rear wing', options: [
        { v: 'stock', name: 'Stock', sub: 'Roof spoiler', desc: 'The factory EK9 roof spoiler. Almost no downforce.' },
        { v: 'street', name: 'Street', sub: 'Low wing', desc: 'A low hatch wing. Some downforce with very little extra drag.' },
        { v: 'gt', name: 'GT wing', sub: 'Max downforce', desc: 'A tall carbon GT wing. Lots of grip in fast corners, but more drag lowers the top speed.' }] },
      { key: 'weight', label: 'Weight reduction', options: [
        { v: 0, name: 'Stock', sub: '1,070 kg', desc: 'Full interior, A/C and CD player included.' },
        { v: 1, name: 'Street', sub: '−45 kg', desc: 'Lightweight seats, delete the spare tire and A/C.' },
        { v: 2, name: 'Race', sub: '−110 kg', desc: 'Stripped interior, carbon hood and hatch, lexan windows.' }] },
    ] },
  { id: 'drivetrain', name: 'Drivetrain', view: 'default',
    desc: 'The drivetrain puts power to the front wheels. Shorter gears keep the engine in its VTEC sweet spot but hit the rev limiter sooner. Longer gears raise the top speed, which powerful builds need. A tighter limited-slip differential helps the car pull out of corners and off the line.',
    groups: [
      { key: 'gearing', label: 'Final drive', type: 'range', min: -2, max: 2, step: 1, unit: '', left: 'Short (accel)', right: 'Long (speed)',
        desc: 'Short ratios rev higher in each gear. Long ratios are needed when you have lots of power or a jet, otherwise the car hits the rev limiter in 5th.' },
      { key: 'diff', label: 'Differential', options: [
        { v: 0, name: 'Helical LSD', sub: 'Stock', desc: 'The factory torque-sensing helical limited-slip differential.' },
        { v: 1, name: 'Sport LSD', sub: 'Plate type', desc: 'A clutch-type LSD with more lockup: better traction off the line and out of corners.' }] },
    ] },
  { id: 'paint', name: 'Paint', view: 'default',
    desc: 'Make it yours. The four factory Type R colors are marked with a dot, or pick any color you like. Your paint follows the car onto the track and the drag strip.',
    groups: [
      { key: 'paint', label: 'Body paint', type: 'color', colors: PAINTS, custom: true },
      { key: 'tint', label: 'Window tint', options: [
        { v: 0, name: 'Clear', sub: 'Factory', desc: 'Factory glass.' }, { v: 1, name: 'Light', sub: '35%', desc: 'A light smoked tint.' }, { v: 2, name: 'Limo', sub: '5%', desc: 'Blacked-out windows.' }] },
    ] },
];

// ---------- state ----------
const state = { cfg: { ...DEFAULT_CONFIG }, cat: 'engine', name: 'My EK9 Type R', mode: 'garage', results: { laps: {}, drag: [] } };
const stockFull = fullSpecs(DEFAULT_CONFIG);
let current = stockFull;
let garage = null;

// ---------- stat bars (0-10, like a racing game) ----------
const clamp10 = x => Math.max(0, Math.min(10, x));
const ratings = f => ({
  Speed: clamp10((f.run.vmax * MPH - 80) / 18),
  Handling: clamp10((lateralG(f.s, 44) - 0.55) / 0.11),
  Acceleration: clamp10(10 - (f.run.t060 - 2) / 0.7),
  Launch: clamp10(10 - (f.run.qm - 9) / 0.85),
  Braking: clamp10(10 - (stopDist(f.s) * 3.281 - 85) / 8),
});
const stopDist = s => (60 / MPH) ** 2 / (2 * s.brakeG * 9.81);
const fmtNum = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function setBadge(el, f) {
  el.style.setProperty('--cls', CLASS_COLORS[f.cls]);
  el.innerHTML = `<b>${f.cls}</b><i>${f.pi}</i>`;
}

function renderStats() {
  const f = current, s = f.s, st = stockFull;
  setBadge($('#piBadge'), f); setBadge($('#piBadgeBig'), f);
  $('#piFill').style.width = `${(f.pi - 100) / 9}%`;
  document.querySelector('.pi-row').style.setProperty('--cls', CLASS_COLORS[f.cls]);
  $('#piStock').style.left = `${(st.pi - 100) / 9}%`;
  const r = ratings(f), r0 = ratings(st);
  $('#bars').innerHTML = Object.keys(r).map(k => {
    const a = r0[k] * 10, b = r[k] * 10;
    const base = Math.min(a, b), gain = b > a ? b - a : 0, loss = a > b ? a - b : 0;
    return `<div class="bar"><span>${k}</span><div class="bar-track"><i class="base" style="width:${base}%"></i><i class="gain" style="left:${base}%;width:${gain}%"></i><i class="loss" style="left:${base}%;width:${loss}%"></i></div><b>${r[k].toFixed(1)}</b></div>`;
  }).join('');
  const delta = (v, v0, better, digits = 0, unit = '') => {
    const d = v - v0; if (Math.abs(d) < 0.5 * 10 ** -digits) return '';
    const good = better === 'up' ? d > 0 : d < 0;
    return `<small class="${good ? 'up' : 'down'}">${d > 0 ? '+' : ''}${fmtNum(d, digits)}${unit}</small>`;
  };
  const items = [
    ['Power', `${fmtNum(s.hp)}<small>hp</small>`, delta(s.hp, st.s.hp, 'up')],
    ['Torque', `${fmtNum(s.lbft)}<small>lb-ft</small>`, delta(s.lbft, st.s.lbft, 'up')],
    ['Weight', `${fmtNum(s.kg)}<small>kg</small>`, delta(s.kg, st.s.kg, 'down')],
    ['0–60 mph', `${f.run.t060.toFixed(2)}<small>s</small>`, delta(f.run.t060, st.run.t060, 'down', 2)],
    ['¼ mile', `${f.run.qm.toFixed(2)}<small>s</small>`, delta(f.run.qm, st.run.qm, 'down', 2)],
    ['Top speed', `${fmtNum(f.run.vmax * MPH)}<small>mph</small>`, delta(f.run.vmax * MPH, st.run.vmax * MPH, 'up')],
    ['Grip', `${lateralG(s, 44).toFixed(2)}<small>g</small>`, delta(lateralG(s, 44), lateralG(st.s, 44), 'up', 2)],
    ['60–0 mph', `${fmtNum(stopDist(s) * 3.281)}<small>ft</small>`, delta(stopDist(s) * 3.281, stopDist(st.s) * 3.281, 'down')],
  ];
  $('#numbers').innerHTML = items.map(([k, v, d]) => `<div><dt>${k}</dt><dd>${v}${d}</dd></div>`).join('');
  $('#upgradeCount').textContent = upgradeCount(state.cfg);
  $('#buildCost').textContent = fmtNum(buildCost(state.cfg));
  document.querySelectorAll('.cat-tile').forEach(t => {
    const cat = CATEGORIES.find(c => c.id === t.dataset.cat);
    t.classList.toggle('modded', cat.groups.some(g => state.cfg[g.key] !== DEFAULT_CONFIG[g.key]));
  });
}

// ---------- shop ----------
function renderStrip() {
  $('#catStrip').innerHTML = CATEGORIES.map(c => `<button class="cat-tile${c.id === state.cat ? ' active' : ''}" data-cat="${c.id}" role="tab" aria-selected="${c.id === state.cat}" title="${c.name}">${ICONS[c.id]}<span>${c.name}</span><i class="dot"></i></button>`).join('');
}

function piDeltaFor(key, v) {
  if (state.cfg[key] === v) return '';
  const f = fullSpecs({ ...state.cfg, [key]: v });
  const d = f.pi - current.pi;
  return d === 0 ? '' : `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>`;
}

function renderShop() {
  const cat = CATEGORIES.find(c => c.id === state.cat);
  $('#catTitle').textContent = cat.name.toUpperCase();
  $('#catDesc').textContent = cat.desc;
  $('#catOptions').innerHTML = cat.groups.map(g => {
    const val = state.cfg[g.key];
    if (g.type === 'range') {
      const p = ((val - g.min) / (g.max - g.min)) * 100;
      const shown = g.unit ? `${val > 0 ? '+' : ''}${val} ${g.unit}` : (val === 0 ? 'Stock' : `${val > 0 ? '+' : ''}${val}`);
      return `<div class="opt-group"><h4>${g.label}<span id="val-${g.key}">${shown}</span></h4>
        <div class="range-row"><span>${g.left}</span><input type="range" data-key="${g.key}" min="${g.min}" max="${g.max}" step="${g.step}" value="${val}" style="--p:${p}%" aria-label="${g.label}"><span>${g.right}</span></div>
        <p class="opt-desc">${g.desc}</p></div>`;
    }
    if (g.type === 'color') {
      const named = g.colors.find(c => c.hex.toLowerCase() === String(val).toLowerCase());
      return `<div class="opt-group"><h4>${g.label}</h4><div class="swatches">
        ${g.colors.map(c => `<button class="swatch${c.factory ? ' factory' : ''}${c.hex.toLowerCase() === String(val).toLowerCase() ? ' on' : ''}" style="--c:${c.hex}" data-key="${g.key}" data-v="${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`).join('')}
        ${g.custom ? `<label class="swatch custom${named ? '' : ' on'}" title="Custom color"><input type="color" data-key="${g.key}" value="${val}" aria-label="Custom color"></label>` : ''}
        </div><p class="swatch-name">Selected: <b>${named ? named.name : `Custom ${String(val).toUpperCase()}`}</b>${g.colors.some(c => c.factory) ? ' · <span class="legend-dot"></span>factory color' : ''}</p></div>`;
    }
    const sel = g.options.find(o => o.v === val) || g.options[0];
    return `<div class="opt-group"><h4>${g.label}</h4><div class="seg">
      ${g.options.map(o => `<button class="opt${o.v === val ? ' on' : ''}" data-key="${g.key}" data-v='${JSON.stringify(o.v)}' data-desc="${esc(o.desc)}">${piDeltaFor(g.key, o.v)}<b>${o.name}</b><small>${o.sub}</small></button>`).join('')}
      </div><p class="opt-desc" data-default="${esc(sel.desc)}">${sel.desc}</p></div>`;
  }).join('');
}

function setValue(key, v, rerenderShop = true) {
  state.cfg = { ...state.cfg, [key]: v };
  current = fullSpecs(state.cfg);
  garage?.apply(state.cfg);
  renderStats();
  if (rerenderShop) renderShop();
}

function selectCat(id) {
  state.cat = id;
  renderStrip(); renderShop();
  garage?.setView(CATEGORIES.find(c => c.id === id).view);
  $('#shop .shop-body').scrollTop = 0;
}

$('#catStrip').addEventListener('click', e => { const t = e.target.closest('.cat-tile'); if (t) selectCat(t.dataset.cat); });
$('#catStrip').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const i = CATEGORIES.findIndex(c => c.id === state.cat) + (e.key === 'ArrowRight' ? 1 : -1);
  selectCat(CATEGORIES[(i + CATEGORIES.length) % CATEGORIES.length].id);
  document.querySelector('.cat-tile.active').focus();
});
$('#catOptions').addEventListener('click', e => {
  const b = e.target.closest('.opt, .swatch:not(.custom)'); if (!b) return;
  setValue(b.dataset.key, b.classList.contains('swatch') ? b.dataset.v : JSON.parse(b.dataset.v));
});
$('#catOptions').addEventListener('input', e => {
  const t = e.target, key = t.dataset.key; if (!key) return;
  if (t.type === 'range') {
    const v = +t.value, g = CATEGORIES.flatMap(c => c.groups).find(g => g.key === key);
    t.style.setProperty('--p', `${((v - g.min) / (g.max - g.min)) * 100}%`);
    $(`#val-${key}`).textContent = g.unit ? `${v > 0 ? '+' : ''}${v} ${g.unit}` : (v === 0 ? 'Stock' : `${v > 0 ? '+' : ''}${v}`);
    setValue(key, v, false);
  } else if (t.type === 'color') setValue(key, t.value, false);
});
$('#catOptions').addEventListener('change', e => { if (e.target.type === 'color' || e.target.type === 'range') renderShop(); });
$('#catOptions').addEventListener('mouseover', e => {
  const b = e.target.closest('.opt'); if (!b) return;
  b.closest('.opt-group').querySelector('.opt-desc').textContent = b.dataset.desc;
});
$('#catOptions').addEventListener('mouseout', e => {
  const b = e.target.closest('.opt'); if (!b) return;
  const d = b.closest('.opt-group').querySelector('.opt-desc'); d.textContent = d.dataset.default;
});

$('#buildName').addEventListener('input', e => { state.name = e.target.value.trim() || 'My EK9 Type R'; });
$('#resetBtn').addEventListener('click', () => {
  state.cfg = { ...DEFAULT_CONFIG }; current = stockFull; garage?.apply(state.cfg); renderStats(); renderShop();
});
$('#spinBtn').addEventListener('click', e => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', on); garage?.setAutoRotate(on);
});
$('#photoBtn').addEventListener('click', () => garage && downloadPhoto(garage, state.name, current, stockFull));
$('#reportBtn').addEventListener('click', () => downloadReport({ name: state.name, cfg: state.cfg, full: current, stock: stockFull, results: state.results, photo: garage?.snapshot(1280, 720), categories: CATEGORIES }));
$('#toDriveBtn').addEventListener('click', () => setMode('drive'));

// ---------- modes ----------
const track = createTrackMode({
  canvas: $('#driveCanvas'), stage: $('#driveStage'),
  onLap: (trackName, time) => { const l = state.results.laps; if (!l[trackName] || time < l[trackName]) l[trackName] = time; },
});
const drag = createDragMode({
  canvas: $('#dragCanvas'), stage: $('#dragStage'),
  onResult: r => { state.results.drag.unshift(r); state.results.drag.length = Math.min(state.results.drag.length, 5); },
});

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  document.querySelectorAll('.mode-view').forEach(v => v.classList.toggle('active', v.id === `view-${mode}`));
  if (mode === 'garage') garage?.resume(); else garage?.pause();
  if (mode === 'drive') track.start(state.cfg, current, stockFull); else track.stop();
  if (mode === 'drag') drag.start(state.cfg, current); else drag.stop();
}
document.querySelector('.modes').addEventListener('click', e => { const b = e.target.closest('.mode-btn'); if (b) setMode(b.dataset.mode); });

const dlg = $('#infoDialog');
$('#infoBtn').addEventListener('click', () => dlg.showModal());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

// ---------- boot ----------
renderStrip(); renderShop(); renderStats();
import('./garage3d.js').then(async ({ createGarage }) => {
  garage = await createGarage($('#viewport'), 'civic.bin', p => { $('#loaderFill').style.width = `${p * 100}%`; });
  garage.apply(state.cfg);
  garage.setView(CATEGORIES.find(c => c.id === state.cat).view);
  if (state.mode !== 'garage') garage.pause();
  $('#loader').classList.add('done');
  window.READY = true;
}).catch(err => {
  console.error(err);
  $('#loader').innerHTML = '<p>Couldn\'t load the 3D model. Check your connection and refresh.<br>You can still tune the car and drive it.</p>';
  window.READY = true;
});
