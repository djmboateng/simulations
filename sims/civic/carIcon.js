// Top-down EK9 icon drawn in meters, centered on the car, nose pointing toward +x.
// The visible upgrades (paint, stance, wheels, wing, jet, scoop, flames) mirror the 3D garage.

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 + amt))));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function drawCar(ctx, cfg, o = {}) {
  const { boosting = false, throttle = 0, ghost = false, t = 0 } = o;
  const paint = ghost ? '#9aa3b2' : cfg.paint;
  const L = 4.18, W = 1.7, hl = L / 2, hw = W / 2;
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.45;

  // exhaust / jet flames go underneath the body
  if (!ghost && cfg.jet && throttle > 0.1) {
    const len = (boosting ? 3.4 : 1.6) * (0.85 + Math.random() * 0.3);
    const g = ctx.createLinearGradient(-hl - 0.5, 0, -hl - 0.5 - len, 0);
    g.addColorStop(0, 'rgba(255,245,200,.95)'); g.addColorStop(0.35, 'rgba(255,140,30,.85)'); g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-hl - 0.45, -0.2); ctx.lineTo(-hl - 0.5 - len, 0); ctx.lineTo(-hl - 0.45, 0.2); ctx.closePath(); ctx.fill();
  }
  if (!ghost && boosting && cfg.nitrous) {
    const len = 1.1 + Math.random() * 0.5;
    const g = ctx.createLinearGradient(-hl, 0, -hl - len, 0);
    g.addColorStop(0, 'rgba(220,240,255,.95)'); g.addColorStop(0.4, 'rgba(80,160,255,.8)'); g.addColorStop(1, 'rgba(80,120,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-hl + 0.05, -0.55); ctx.lineTo(-hl - len, -0.45); ctx.lineTo(-hl + 0.05, -0.35); ctx.closePath(); ctx.fill();
  }

  // tires
  const track = 0.74 + cfg.stance / 1000;
  const tl = 0.62 * (1 + (cfg.wheelSize - 15) * 0.03), tw = 0.21 + (cfg.wheelSize - 15) * 0.012;
  ctx.fillStyle = '#111';
  for (const x of [1.31, -1.31]) for (const y of [-track, track]) {
    ctx.beginPath(); ctx.roundRect(x - tl / 2, y - tw / 2, tl, tw, 0.05); ctx.fill();
  }

  // body
  ctx.fillStyle = paint;
  ctx.strokeStyle = ghost ? '#6b7280' : shade(paint, -0.45);
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(hl - 0.35, -hw + 0.05);
  ctx.quadraticCurveTo(hl, -hw + 0.12, hl, -0.35); ctx.lineTo(hl, 0.35);
  ctx.quadraticCurveTo(hl, hw - 0.12, hl - 0.35, hw - 0.05);
  ctx.lineTo(-hl + 0.25, hw); ctx.quadraticCurveTo(-hl, hw, -hl, hw - 0.3);
  ctx.lineTo(-hl, -hw + 0.3); ctx.quadraticCurveTo(-hl, -hw, -hl + 0.25, -hw);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // glass + roof
  ctx.fillStyle = ghost ? '#4b5563' : ['#2b3a47', '#1c242c', '#07090b'][cfg.tint];
  ctx.beginPath(); ctx.moveTo(0.95, -0.62); ctx.lineTo(0.5, -0.7); ctx.lineTo(0.5, 0.7); ctx.lineTo(0.95, 0.62); ctx.closePath(); ctx.fill(); // windshield
  ctx.beginPath(); ctx.moveTo(-1.35, -0.68); ctx.lineTo(-1.75, -0.6); ctx.lineTo(-1.75, 0.6); ctx.lineTo(-1.35, 0.68); ctx.closePath(); ctx.fill(); // rear glass
  ctx.fillStyle = ghost ? '#a3acb9' : shade(paint, 0.12);
  ctx.beginPath(); ctx.roundRect(-1.35, -0.68, 1.85, 1.36, 0.12); ctx.fill();
  // lights
  if (!ghost) {
    ctx.fillStyle = '#fff6cf';
    ctx.fillRect(hl - 0.2, -hw + 0.15, 0.14, 0.38); ctx.fillRect(hl - 0.2, hw - 0.53, 0.14, 0.38);
    ctx.fillStyle = '#ff2a12';
    ctx.fillRect(-hl + 0.02, -hw + 0.08, 0.1, 0.35); ctx.fillRect(-hl + 0.02, hw - 0.43, 0.1, 0.35);
  }
  // supercharger scoop
  if (cfg.induction === 'super') { ctx.fillStyle = '#1a1b1e'; ctx.fillRect(1.0, -0.22, 0.5, 0.44); ctx.fillStyle = '#c7cbd1'; ctx.fillRect(1.45, -0.18, 0.08, 0.36); }
  // wings
  ctx.fillStyle = '#1a1b1e';
  if (cfg.wing === 'street') { ctx.fillStyle = paint; ctx.strokeStyle = shade(paint, -0.45); ctx.beginPath(); ctx.rect(-1.95, -0.68, 0.22, 1.36); ctx.fill(); ctx.stroke(); }
  if (cfg.wing === 'gt') {
    ctx.fillRect(-2.25, -0.82, 0.36, 1.64);
    ctx.fillStyle = paint; ctx.fillRect(-2.32, -0.8, 0.1, 1.6);
    ctx.fillStyle = '#1a1b1e'; ctx.fillRect(-2.34, -0.84, 0.48, 0.06); ctx.fillRect(-2.34, 0.78, 0.48, 0.06);
  }
  // jet engine
  if (cfg.jet) {
    ctx.fillStyle = '#9aa0a8'; ctx.strokeStyle = '#4b5058'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.roundRect(-hl - 0.45, -0.19, 1.6, 0.38, 0.08); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff6a00'; ctx.fillRect(-hl - 0.47, -0.16, 0.06, 0.32);
  }
  ctx.restore();
}
