// Downloads: a captioned photo of the build and a standalone HTML tuning report.
import { DEFAULT_CONFIG, lateralG, buildCost, upgradeCount, CLASS_COLORS, MPH, KMH, RHO } from './physics.js';

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ek9-build';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const stopFt = s => (60 / MPH) ** 2 / (2 * s.brakeG * 9.81) * 3.281;

function save(href, filename) {
  const a = document.createElement('a'); a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

export async function downloadPhoto(garage, name, full, stock) {
  const W = 1600, H = 900;
  const img = new Image();
  img.src = garage.snapshot(W, H);
  await img.decode();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  await document.fonts.ready;
  // bottom caption band
  const grad = g.createLinearGradient(0, H - 190, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.35, 'rgba(0,0,0,.78)'); grad.addColorStop(1, 'rgba(0,0,0,.92)');
  g.fillStyle = grad; g.fillRect(0, H - 190, W, 190);
  g.fillStyle = '#ff5a00'; g.fillRect(0, H - 6, W, 6);
  g.fillStyle = '#fff'; g.font = '800 46px Orbitron, sans-serif'; g.textBaseline = 'alphabetic';
  g.fillText(name.toUpperCase(), 48, H - 70);
  g.fillStyle = '#c9cfd8'; g.font = '600 22px "Space Grotesk", sans-serif';
  g.fillText('2000 Honda Civic Type R (EK9)  ·  Low-poly model by David Boateng', 50, H - 34);
  // class badge
  const bx = W - 560, by = H - 118;
  g.fillStyle = CLASS_COLORS[full.cls]; g.fillRect(bx, by, 64, 52);
  g.fillStyle = '#fff'; g.fillRect(bx + 64, by, 96, 52);
  g.font = '700 30px "Space Grotesk", sans-serif'; g.textAlign = 'center';
  g.fillText(full.cls, bx + 32, by + 37); g.fillStyle = '#12151b'; g.fillText(full.pi, bx + 112, by + 37);
  // stats
  const stats = [[`${Math.round(full.s.hp)}`, 'HP'], [full.run.t060.toFixed(1), '0–60 S'], [`${Math.round(full.run.vmax * MPH)}`, 'MPH TOP']];
  stats.forEach(([v, l], i) => {
    const x = W - 330 + i * 115;
    g.fillStyle = '#fff'; g.font = '700 36px "Space Grotesk", sans-serif'; g.fillText(v, x, H - 78);
    g.fillStyle = '#9aa3b2'; g.font = '700 15px "Space Grotesk", sans-serif'; g.fillText(l, x, H - 52);
  });
  g.textAlign = 'left';
  g.fillStyle = 'rgba(18,21,27,.75)'; g.font = '700 20px "Space Grotesk", sans-serif';
  g.fillText("DAVID BOATENG'S SIMULATIONS", 40, 52);
  save(c.toDataURL('image/png'), `${slug(name)}.png`);
}

function optionLabel(group, value) {
  if (group.type === 'range') return group.unit ? `${value > 0 ? '+' : ''}${value} ${group.unit}` : (value === 0 ? 'Stock' : `${value > 0 ? '+' : ''}${value} (${value < 0 ? 'shorter' : 'longer'})`);
  if (group.type === 'color') { const n = group.colors.find(c => c.hex.toLowerCase() === String(value).toLowerCase()); return `${n ? n.name : 'Custom'} <span class="chip" style="background:${esc(value)}"></span> ${esc(String(value).toUpperCase())}`; }
  const o = group.options.find(o => o.v === value); return o ? `${esc(o.name)} <span class="sub">${esc(o.sub)}</span>` : esc(value);
}

export function downloadReport({ name, cfg, full, stock, results, photo, categories }) {
  const s = full.s, s0 = stock.s, r = full.run, r0 = stock.run;
  const down100 = cfgDown => 0.5 * RHO * cfgDown * (100 / MPH) ** 2 / 9.81;
  const fmtT = t => t == null ? '--' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  const rows = [
    ['Peak power', `${Math.round(s.hp)} hp @ ${s.hpRpm.toLocaleString()} rpm`, `${Math.round(s0.hp)} hp`, s.hp - s0.hp, 'hp', 0, 1],
    ['Peak torque', `${Math.round(s.lbft)} lb-ft @ ${s.tqRpm.toLocaleString()} rpm`, `${Math.round(s0.lbft)} lb-ft`, s.lbft - s0.lbft, 'lb-ft', 0, 1],
    ['Redline', `${s.redline.toLocaleString()} rpm`, `${s0.redline.toLocaleString()} rpm`, s.redline - s0.redline, 'rpm', 0, 1],
    ['Curb weight', `${s.kg.toLocaleString()} kg (${Math.round(s.kg * 2.2046).toLocaleString()} lb)`, `${s0.kg.toLocaleString()} kg`, s.kg - s0.kg, 'kg', 0, -1],
    ['Power-to-weight', `${(s.hp / s.kg * 1000).toFixed(0)} hp/tonne`, `${(s0.hp / s0.kg * 1000).toFixed(0)} hp/tonne`, (s.hp / s.kg - s0.hp / s0.kg) * 1000, 'hp/t', 0, 1],
    ['0–60 mph', `${r.t060.toFixed(2)} s`, `${r0.t060.toFixed(2)} s`, r.t060 - r0.t060, 's', 2, -1],
    ['0–100 km/h', `${r.t0100.toFixed(2)} s`, `${r0.t0100.toFixed(2)} s`, r.t0100 - r0.t0100, 's', 2, -1],
    ['⅛ mile', `${r.eighth.toFixed(2)} s`, `${r0.eighth.toFixed(2)} s`, r.eighth - r0.eighth, 's', 2, -1],
    ['¼ mile', `${r.qm.toFixed(2)} s @ ${(r.trap * MPH).toFixed(1)} mph`, `${r0.qm.toFixed(2)} s`, r.qm - r0.qm, 's', 2, -1],
    ['Top speed', `${Math.round(r.vmax * MPH)} mph (${Math.round(r.vmax * KMH)} km/h)`, `${Math.round(r0.vmax * MPH)} mph`, (r.vmax - r0.vmax) * MPH, 'mph', 0, 1],
    ['Cornering grip @ 60 mph', `${lateralG(s, 60 / MPH).toFixed(2)} g`, `${lateralG(s0, 60 / MPH).toFixed(2)} g`, lateralG(s, 60 / MPH) - lateralG(s0, 60 / MPH), 'g', 2, 1],
    ['Cornering grip @ 100 mph', `${lateralG(s, 100 / MPH).toFixed(2)} g`, `${lateralG(s0, 100 / MPH).toFixed(2)} g`, lateralG(s, 100 / MPH) - lateralG(s0, 100 / MPH), 'g', 2, 1],
    ['Braking 60–0 mph', `${Math.round(stopFt(s))} ft`, `${Math.round(stopFt(s0))} ft`, stopFt(s) - stopFt(s0), 'ft', 0, -1],
    ['Downforce @ 100 mph', `${Math.round(down100(Math.max(0, s.cla)))} kg`, `${Math.round(down100(Math.max(0, s0.cla)))} kg`, down100(Math.max(0, s.cla)) - down100(Math.max(0, s0.cla)), 'kg', 0, 1],
    ['Drag area (CdA)', `${s.cda.toFixed(3)} m²`, `${s0.cda.toFixed(3)} m²`, s.cda - s0.cda, 'm²', 3, -1],
  ];
  const deltaCell = (d, unit, digits, better) => {
    if (Math.abs(d) < 0.5 * 10 ** -digits) return '<td class="d">—</td>';
    const good = Math.sign(d) === better;
    return `<td class="d ${good ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d.toFixed(digits)} ${unit}</td>`;
  };
  const configHtml = categories.map(c => `<div class="cat"><h3>${esc(c.name)}</h3><table>${c.groups.map(g => `<tr class="${cfg[g.key] !== DEFAULT_CONFIG[g.key] ? 'mod' : ''}"><td>${esc(g.label)}</td><td>${optionLabel(g, cfg[g.key])}</td></tr>`).join('')}</table></div>`).join('');
  const laps = Object.entries(results.laps);
  const sessionHtml = laps.length || results.drag.length ? `
    <h2>Session results</h2>
    ${laps.length ? `<table class="perf"><thead><tr><th>Track</th><th>Best lap</th></tr></thead><tbody>${laps.map(([t, v]) => `<tr><td>${esc(t)}</td><td>${fmtT(v)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${results.drag.length ? `<table class="perf"><thead><tr><th>Drag race vs.</th><th>Reaction</th><th>¼ mile</th><th>Trap</th><th>Result</th></tr></thead><tbody>${results.drag.map(d => `<tr><td>${esc(d.opponent)}</td><td>${d.rt == null ? '--' : d.rt.toFixed(3) + ' s'}</td><td>${d.et == null ? '--' : d.et.toFixed(3) + ' s'}</td><td>${d.trap == null ? '--' : d.trap.toFixed(1) + ' mph'}</td><td>${d.foul ? 'Red light' : d.win ? 'Win' : 'Loss'}</td></tr>`).join('')}</tbody></table>` : ''}` : '';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} · Tuning Report</title>
<style>
:root{--hot:#ff5a00;--ink:#12151b;--muted:#6b7280;--line:#e5e7eb}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#f4f5f7;padding:32px 16px;line-height:1.45}
.page{max-width:900px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.08)}
header{background:#0b0d12;color:#fff;padding:28px 32px;border-bottom:5px solid var(--hot);display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:flex-end}
header small{color:#ff8a4a;font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:12px}header h1{font-size:30px;margin-top:6px}header p{color:#aab2bf;margin-top:4px;font-size:14px}
.badge{display:inline-flex;border-radius:8px;overflow:hidden;font-weight:800;font-size:22px}.badge b{background:${CLASS_COLORS[full.cls]};padding:6px 14px}.badge i{font-style:normal;background:#fff;color:var(--ink);padding:6px 14px}
.photo{display:block;width:100%;height:auto;background:#e7e8eb}
main{padding:28px 32px 36px}h2{font-size:18px;margin:28px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--hot)}h2:first-child{margin-top:0}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.summary div{background:#f4f5f7;border-radius:10px;padding:12px 14px}.summary span{display:block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.summary b{font-size:20px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.perf td:nth-child(n+2),.perf th:nth-child(n+2){text-align:right}.d.up{color:#16a34a;font-weight:700}.d.down{color:#dc2626;font-weight:700}.d{color:var(--muted)}
.config{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.cat{border:1px solid var(--line);border-radius:10px;overflow:hidden}.cat h3{font-size:13px;letter-spacing:.08em;text-transform:uppercase;background:#f4f5f7;padding:8px 12px}
.cat td:first-child{color:var(--muted);width:45%}.cat tr.mod td:last-child{font-weight:700}.cat tr.mod td:first-child::before{content:"● ";color:var(--hot)}.sub{color:var(--muted);font-weight:400;font-size:12px}
.chip{display:inline-block;width:12px;height:12px;border-radius:50%;border:1px solid #0002;vertical-align:-1px;margin:0 2px}
footer{padding:18px 32px;background:#f4f5f7;color:var(--muted);font-size:12px}
@media print{body{background:#fff;padding:0}.page{box-shadow:none}}
</style></head><body><div class="page">
<header><div><small>Tuning report · ${esc(date)}</small><h1>${esc(name)}</h1><p>2000 Honda Civic Type R (EK9) · low-poly model by David Boateng</p></div><span class="badge"><b>${full.cls}</b><i>${full.pi}</i></span></header>
${photo ? `<img class="photo" src="${photo}" alt="Photo of ${esc(name)}">` : ''}
<main>
<h2>Build summary</h2>
<div class="summary">
<div><span>Class / PI</span><b>${full.cls} ${full.pi}</b></div><div><span>Stock PI</span><b>${stock.cls} ${stock.pi}</b></div>
<div><span>Upgrades</span><b>${upgradeCount(cfg)}</b></div><div><span>Build cost</span><b>CR ${buildCost(cfg).toLocaleString()}</b></div>
</div>
<h2>Performance</h2>
<table class="perf"><thead><tr><th>Spec</th><th>Your build</th><th>Stock EK9</th><th>Change</th></tr></thead><tbody>
${rows.map(([k, v, v0, d, u, dig, better]) => `<tr><td>${k}</td><td><b>${v}</b></td><td>${v0}</td>${deltaCell(d, u, dig, better)}</tr>`).join('')}
</tbody></table>
<h2>Full configuration</h2><div class="config">${configHtml}</div>
${sessionHtml}
</main>
<footer>Generated by David Boateng's Simulations · Low-Poly Car Tuning Simulator. Figures are estimates from a simplified physics model calibrated to the factory EK9 (0–60 mph ≈ 6.3 s, top speed ≈ 139 mph).</footer>
</div></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  save(url, `${slug(name)}-tuning-report.html`);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
