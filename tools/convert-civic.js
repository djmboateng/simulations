// Converts the Onshape OBJ export into a compact binary (civic.bin) for the simulator.
// Splits the body by material and separates the 4 wheel assemblies (rim + tire + brake)
// so the simulator can recolor, lower, widen and resize them independently.
// Usage: node tools/convert-civic.js <model.obj> <model.mtl> <out.bin>
const fs = require('fs');
const [objPath, mtlPath, outPath] = process.argv.slice(2);

// --- materials ---
const materials = []; const matIndex = {};
for (const l of fs.readFileSync(mtlPath, 'utf8').split(/\r?\n/)) {
  if (l.startsWith('newmtl ')) { matIndex[l.slice(7).trim()] = materials.length; materials.push({ name: l.slice(7).trim(), color: [1, 1, 1] }); }
  else if (l.startsWith('Kd ')) materials[materials.length - 1].color = l.split(/\s+/).slice(1, 4).map(Number);
}
const role = c => {
  const k = c.map(x => x.toFixed(2)).join(',');
  return ({ '0.92,0.91,0.91': 'paint', '0.62,0.81,0.93': 'glass', '0.84,0.15,0.08': 'accent', '1.00,1.00,1.00': 'rim',
    '0.99,0.99,0.99': 'rim', '0.98,0.18,0.01': 'taillight', '0.97,0.25,0.01': 'taillight', '0.98,0.54,0.04': 'indicator',
    '0.71,0.69,0.66': 'headlight', '0.95,0.93,0.88': 'lightTrim' })[k] || 'trim';
};
materials.forEach(m => m.role = role(m.color));

// --- parse OBJ ---
const V = []; const faces = []; // {g, m, v:[i,i,i]}
let g = '', m = 0;
for (const l of fs.readFileSync(objPath, 'utf8').split(/\r?\n/)) {
  if (l.startsWith('v ')) { const p = l.split(/\s+/); V.push([+p[1], +p[2], +p[3]]); }
  else if (l.startsWith('g ')) g = l.slice(2).trim();
  else if (l.startsWith('usemtl ')) m = matIndex[l.slice(7).trim()] ?? 0;
  else if (l.startsWith('f ')) {
    const idx = l.split(/\s+/).slice(1).filter(Boolean).map(t => { const i = parseInt(t); return i > 0 ? i - 1 : V.length + i; });
    for (let k = 1; k < idx.length - 1; k++) faces.push({ g, m, v: [idx[0], idx[k], idx[k + 1]] });
  }
}

// --- wheel classification ---
const rimGroups = ['Rim1', 'Rim2', 'Rim3', 'Rim4'];
const rimBox = rimGroups.map(() => ({ min: [9, 9, 9], max: [-9, -9, -9] }));
for (const f of faces) { const w = rimGroups.indexOf(f.g); if (w < 0) continue; for (const i of f.v) for (let k = 0; k < 3; k++) { rimBox[w].min[k] = Math.min(rimBox[w].min[k], V[i][k]); rimBox[w].max[k] = Math.max(rimBox[w].max[k], V[i][k]); } }
const hubs = rimBox.map(b => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);
const TIRE_R = 0.312;
function wheelOf(f) {
  const w = rimGroups.indexOf(f.g); if (w >= 0) return w;
  if (f.g !== 'Part 1') return -1;
  let found = -1;
  for (const i of f.v) {
    const p = V[i]; if (Math.abs(p[0]) < 0.5) return -1;
    let hit = -1;
    hubs.forEach((h, j) => { if (Math.sign(h[0]) === Math.sign(p[0]) && Math.hypot(p[1] - h[1], p[2] - h[2]) < TIRE_R) hit = j; });
    if (hit < 0 || (found >= 0 && hit !== found)) return -1;
    found = hit;
  }
  return found;
}

// --- bucket faces: body by material, wheels by wheel+material ---
const buckets = new Map(); // key -> {wheel, mat, faces}
for (const f of faces) {
  const w = wheelOf(f); const key = w + ':' + f.m;
  if (!buckets.has(key)) buckets.set(key, { wheel: w, mat: f.m, faces: [] });
  buckets.get(key).faces.push(f.v);
}
// true wheel centers from the classified geometry
const wbox = hubs.map(() => ({ min: [9, 9, 9], max: [-9, -9, -9] }));
for (const b of buckets.values()) if (b.wheel >= 0) for (const tri of b.faces) for (const i of tri) for (let k = 0; k < 3; k++) { wbox[b.wheel].min[k] = Math.min(wbox[b.wheel].min[k], V[i][k]); wbox[b.wheel].max[k] = Math.max(wbox[b.wheel].max[k], V[i][k]); }
const groundZ = Math.min(...V.map(p => p[2]));
// OBJ is Z-up with the nose toward -Y; three.js is Y-up, nose toward +Z.
const toThree = p => [p[0], p[2] - groundZ, -p[1]];
const wheelCenters = wbox.map((b, j) => toThree([(b.min[0] + b.max[0]) / 2, hubs[j][1], hubs[j][2]]));

// --- write binary ---
const chunks = []; let offset = 0; const parts = [];
for (const b of buckets.values()) {
  const remap = new Map(); const pos = []; const ind = [];
  const c = b.wheel >= 0 ? wheelCenters[b.wheel] : [0, 0, 0];
  for (const tri of b.faces) for (const i of tri) {
    if (!remap.has(i)) { remap.set(i, pos.length / 3); const t = toThree(V[i]); pos.push(t[0] - c[0], t[1] - c[1], t[2] - c[2]); }
    ind.push(remap.get(i));
  }
  const P = Buffer.from(new Float32Array(pos).buffer);
  const big = pos.length / 3 > 65535;
  const I = Buffer.from((big ? new Uint32Array(ind) : new Uint16Array(ind)).buffer);
  const pad = Buffer.alloc((4 - (I.length % 4)) % 4);
  parts.push({ wheel: b.wheel, mat: b.mat, pOff: offset, pLen: pos.length, iOff: offset + P.length, iLen: ind.length, u32: big });
  chunks.push(P, I, pad); offset += P.length + I.length + pad.length;
}
const header = Buffer.from(JSON.stringify({ materials, wheels: wheelCenters.map((c, j) => ({ center: c, side: Math.sign(c[0]), front: c[2] > 0 })), parts }));
const hpad = Buffer.alloc((4 - (header.length % 4)) % 4, 32);
const head = Buffer.alloc(8); head.write('CIV1', 0); head.writeUInt32LE(header.length + hpad.length, 4);
fs.writeFileSync(outPath, Buffer.concat([head, header, hpad, ...chunks]));
console.log('wrote', outPath, (8 + header.length + offset) + ' bytes,', parts.length, 'parts');
console.log('wheels', wheelCenters.map(c => c.map(x => x.toFixed(3)).join(',')).join(' | '));
for (const p of parts) console.log(String(p.wheel).padStart(2), materials[p.mat].role.padEnd(10), p.iLen / 3);
