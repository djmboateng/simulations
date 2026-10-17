// 3D showroom: loads the low-poly EK9 (civic.bin) onto a turntable and applies visual tuning.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const CAMERA_VIEWS = {
  default: { pos: [6.9, 1.9, 6.1], target: [0, 0.42, 0.1] },
  hero: { pos: [5.1, 1.35, 4.5], target: [0, 0.55, 0.05] },
  engine: { pos: [5.0, 2.6, 6.6], target: [0, 0.48, 0.45] },
  wheels: { pos: [4.7, 1.05, 3.7], target: [0.5, 0.35, 0.85] },
  suspension: { pos: [7.8, 0.85, 0.7], target: [0, 0.4, 0] },
  aero: { pos: [5.7, 2.6, -6.3], target: [0, 0.6, -0.6] },
  boost: { pos: [6.1, 2.9, -5.2], target: [0, 0.7, -0.4] },
};

export async function createGarage(container, binUrl, onProgress) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e7e8eb');
  scene.fog = new THREE.Fog('#e7e8eb', 16, 34);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 14;
  controls.maxPolarAngle = 1.5;
  controls.autoRotateSpeed = 0.8;
  camera.position.set(...CAMERA_VIEWS.default.pos);
  controls.target.set(...CAMERA_VIEWS.default.target);

  buildStudio(scene);

  // lights
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9bcc4', 0.9));
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(4, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#ffe2c8', 0.8);
  rim.position.set(-6, 4, -5);
  scene.add(rim);

  // --- load model ---
  const res = await fetch(binUrl);
  const total = +res.headers.get('content-length') || 1903044;
  const reader = res.body.getReader();
  const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress?.(Math.min(1, got / total)); }
  const buf = new Uint8Array(got); { let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; } }
  const dv = new DataView(buf.buffer);
  const hlen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + hlen)));
  const base = 8 + hlen;

  const mats = header.materials.map(m => {
    const col = new THREE.Color().setRGB(...m.color, THREE.SRGBColorSpace);
    const mat = new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: 0.55, metalness: 0.05 });
    if (m.role === 'paint') { mat.roughness = 0.28; mat.metalness = 0.15; }
    if (m.role === 'glass') { mat.transparent = true; mat.opacity = 0.62; mat.roughness = 0.05; mat.metalness = 0.4; }
    if (m.role === 'rim') { mat.roughness = 0.3; mat.metalness = 0.5; }
    if (/light|indicator/i.test(m.role)) { mat.roughness = 0.15; mat.emissive = col.clone().multiplyScalar(0.12); }
    mat.userData.role = m.role;
    return mat;
  });
  const roleMats = role => mats.filter(m => m.userData.role === role);

  const car = new THREE.Group(); car.position.y = PLATFORM_TOP; scene.add(car);
  const body = new THREE.Group(); car.add(body);
  const wheels = header.wheels.map(w => { const g = new THREE.Group(); g.userData = w; g.position.set(...w.center); car.add(g); return g; });
  const rimMeshes = [];
  for (const p of header.parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf.buffer, base + p.pOff, p.pLen), 3));
    geo.setIndex(new THREE.BufferAttribute(p.u32 ? new Uint32Array(buf.buffer, base + p.iOff, p.iLen) : new Uint16Array(buf.buffer, base + p.iOff, p.iLen), 1));
    const mesh = new THREE.Mesh(geo, mats[p.mat]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (p.wheel < 0) body.add(mesh);
    else {
      wheels[p.wheel].add(mesh);
      const role = header.materials[p.mat].role;
      if (role === 'rim' || role === 'accent') { geo.computeBoundingBox(); if (geo.boundingBox.max.x - geo.boundingBox.min.x < 0.08 || role === 'rim') rimMeshes.push(mesh); }
    }
  }
  body.updateMatrixWorld(true);

  // --- add-on parts, placed by raycasting onto the real body surface ---
  const ray = new THREE.Raycaster();
  const surfaceY = (x, z, fallback) => {
    ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(body.children, false)[0];
    return hit ? hit.point.y - PLATFORM_TOP : fallback;
  };
  const rearZ = (() => { // furthest-back point of the hatch at a given height
    for (let z = -2.3; z < -1.4; z += 0.01) { ray.set(new THREE.Vector3(0, 5, z), new THREE.Vector3(0, -1, 0)); if (ray.intersectObjects(body.children, false).length) return z; }
    return -2.0;
  })();
  const addons = buildAddons(surfaceY, rearZ, mats);
  body.add(addons.streetWing, addons.gtWing, addons.jet, addons.scoop, addons.intercooler, addons.exhaust);

  const state = { autoRotate: false, viewTween: null, cfg: null, flameT: 0 };

  function apply(cfg) {
    state.cfg = cfg;
    roleMats('paint').forEach(m => m.color.setStyle(cfg.paint, THREE.SRGBColorSpace));
    addons.wingPaint.forEach(m => m.material.color.setStyle(cfg.paint, THREE.SRGBColorSpace));
    roleMats('rim').forEach(m => m.color.setStyle(cfg.rimColor, THREE.SRGBColorSpace));
    const glass = roleMats('glass')[0];
    glass.color.setStyle(['#9dcfee', '#41505c', '#0d1115'][cfg.tint], THREE.SRGBColorSpace);
    glass.opacity = [0.62, 0.8, 0.93][cfg.tint];
    // wheels: plus-size rims (bigger rim, thinner sidewall) and stance
    const outer = 1 + (cfg.wheelSize - 15) * 0.03;
    const rimGrow = (cfg.wheelSize / 15) / outer;
    for (const w of wheels) {
      const c = w.userData.center;
      w.scale.set(1 + (cfg.wheelSize - 15) * 0.04, outer, outer);
      w.position.set(c[0] + w.userData.side * cfg.stance / 1000, c[1] * outer, c[2]);
    }
    rimMeshes.forEach(m => { m.scale.set(1, rimGrow, rimGrow); m.position.x = m.parent.userData.side * 0.006 * (cfg.wheelSize - 15); });
    body.position.y = header.wheels[0].center[1] * (outer - 1) + cfg.rideHeight / 1000;
    addons.streetWing.visible = cfg.wing === 'street';
    addons.gtWing.visible = cfg.wing === 'gt';
    addons.jet.visible = cfg.jet;
    addons.scoop.visible = cfg.induction === 'super';
    addons.intercooler.visible = cfg.induction === 'turbo';
    addons.exhaust.scale.setScalar([1, 1.35, 1.75][cfg.intake]);
  }

  function setView(name) {
    const v = CAMERA_VIEWS[name] || CAMERA_VIEWS.default;
    state.viewTween = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone(), toP: new THREE.Vector3(...v.pos), toT: new THREE.Vector3(...v.target) };
  }
  controls.addEventListener('start', () => { state.viewTween = null; });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 46 : 32;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  let running = true, last = performance.now();
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state.viewTween) {
      const tw = state.viewTween; tw.t = Math.min(1, tw.t + dt * 1.6);
      const e = 1 - Math.pow(1 - tw.t, 3);
      camera.position.lerpVectors(tw.fromP, tw.toP, e);
      controls.target.lerpVectors(tw.fromT, tw.toT, e);
      if (tw.t >= 1) state.viewTween = null;
    }
    controls.autoRotate = state.autoRotate;
    controls.update();
    if (addons.jet.visible) { state.flameT += dt; const f = addons.jet.userData.flame; const k = 1 + Math.sin(state.flameT * 40) * 0.08 + Math.random() * 0.06; f.scale.set(1, k, 1); }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function snapshot(w = 1600, h = 900) {
    const oldSize = renderer.getSize(new THREE.Vector2()), oldRatio = renderer.getPixelRatio(), oldAspect = camera.aspect, oldFov = camera.fov;
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = 32; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(oldRatio); renderer.setSize(oldSize.x, oldSize.y, false);
    camera.aspect = oldAspect; camera.fov = oldFov; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return url;
  }

  return {
    apply, setView, snapshot, resize, debug: addons.debug,
    setAutoRotate(on) { state.autoRotate = on; },
    pause() { running = false; },
    resume() { if (!running) { running = true; last = performance.now(); resize(); requestAnimationFrame(loop); } },
  };
}

const PLATFORM_TOP = 0.16;

function buildStudio(scene) {
  const white = new THREE.MeshStandardMaterial({ color: '#f4f4f5', roughness: 0.35, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: '#d9dadd', roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // turntable with a glowing hot-orange rim
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.75, PLATFORM_TOP, 72), new THREE.MeshStandardMaterial({ color: '#fbfbfc', roughness: 0.18, metalness: 0.05 }));
  plat.position.y = PLATFORM_TOP / 2; plat.receiveShadow = true; scene.add(plat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.66, 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: '#ff5a00' }));
  ring.rotation.x = Math.PI / 2; ring.position.y = PLATFORM_TOP + 0.005; scene.add(ring);
  // angled garage wall panels and light strips in the background
  const panelGeo = new THREE.BoxGeometry(5, 7, 0.3);
  for (let i = 0; i < 7; i++) {
    const a = -1.9 + i * 0.55;
    const p = new THREE.Mesh(panelGeo, white);
    p.position.set(Math.sin(a) * 15, 3.5, -Math.cos(a) * 15);
    p.lookAt(0, 3.5, 0); scene.add(p);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffffff' : '#ff7a2e' }));
    strip.position.set(Math.sin(a) * 14.8, 1.2, -Math.cos(a) * 14.8); strip.lookAt(0, 1.2, 0); scene.add(strip);
  }
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), white);
  pillar.position.set(-7, 4.5, -6); pillar.rotation.z = 0.35; scene.add(pillar);
}

function buildAddons(surfaceY, rearZ, mats) {
  const paint = () => new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.28, metalness: 0.15 });
  const carbon = new THREE.MeshStandardMaterial({ color: '#1a1b1e', flatShading: true, roughness: 0.4, metalness: 0.3 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#d8dadd', roughness: 0.15, metalness: 1 });
  const wingPaint = [];
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };

  // Street wing: low wing hugging the top of the hatch
  const hatchTop = surfaceY(0, rearZ + 0.32, 1.25);
  const streetWing = new THREE.Group();
  const swPlate = box(1.32, 0.03, 0.24, paint(), 0, hatchTop + 0.11, rearZ + 0.2); swPlate.rotation.x = -0.12; wingPaint.push(swPlate);
  streetWing.add(swPlate);
  for (const sx of [-0.42, 0.42]) streetWing.add(box(0.04, 0.12, 0.12, carbon, sx, hatchTop + 0.05, rearZ + 0.22));

  // GT wing: tall swan-neck style wing above the hatch
  const gtWing = new THREE.Group();
  const gtY = hatchTop + 0.34;
  const gtPlate = box(1.55, 0.035, 0.34, carbon, 0, gtY, rearZ + 0.05); gtPlate.rotation.x = -0.16;
  const flap = box(1.55, 0.025, 0.12, paint(), 0, gtY + 0.06, rearZ - 0.12); flap.rotation.x = -0.45; wingPaint.push(flap);
  gtWing.add(gtPlate, flap);
  for (const sx of [-0.79, 0.79]) gtWing.add(box(0.02, 0.15, 0.38, carbon, sx, gtY + 0.02, rearZ + 0.03));
  for (const sx of [-0.45, 0.45]) {
    const up = box(0.035, gtY - hatchTop + 0.02, 0.1, carbon, sx, (gtY + hatchTop) / 2, rearZ + 0.18);
    up.rotation.x = 0.25; gtWing.add(up);
  }

  // Jet engine: roof-mounted turbine poking out past the rear bumper
  const roofY = surfaceY(0, -0.9, 1.4);
  const jet = new THREE.Group();
  const nacLen = 1.35, nacR = 0.16, jetY = roofY + 0.2, jetZ = rearZ + 0.4;
  const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(nacR, nacR * 0.86, nacLen, 14), new THREE.MeshStandardMaterial({ color: '#9aa0a8', flatShading: true, roughness: 0.25, metalness: 0.9 }));
  nacelle.rotation.x = Math.PI / 2; nacelle.position.set(0, jetY, jetZ); nacelle.castShadow = true;
  const intake = new THREE.Mesh(new THREE.CircleGeometry(nacR * 0.9, 14), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 }));
  intake.position.set(0, jetY, jetZ + nacLen / 2 + 0.002);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(nacR, 0.025, 6, 14), chrome); lip.position.copy(intake.position);
  const nozzle = new THREE.Mesh(new THREE.TorusGeometry(nacR * 0.8, 0.035, 6, 14), new THREE.MeshBasicMaterial({ color: '#ff6a00' }));
  nozzle.position.set(0, jetY, jetZ - nacLen / 2);
  // flame cones: base at the nozzle, tip trailing backwards (-Z)
  const flameGroup = new THREE.Group(); flameGroup.position.set(0, jetY, jetZ - nacLen / 2);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(nacR * 0.7, 0.9, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ff8a1c', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  flame.geometry.translate(0, 0.45, 0); flame.rotation.x = -Math.PI / 2;
  const core = new THREE.Mesh(new THREE.ConeGeometry(nacR * 0.38, 0.5, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.geometry.translate(0, 0.25, 0); core.rotation.x = -Math.PI / 2;
  flameGroup.add(flame, core);
  jet.add(nacelle, intake, lip, nozzle, flameGroup);
  for (const zOff of [0.6, 0.28]) {
    const z = jetZ + zOff; const base = surfaceY(0, z, roofY);
    jet.add(box(0.05, jetY - base, 0.14, carbon, 0, (jetY + base) / 2 - nacR * 0.3, z));
  }
  jet.userData.flame = flameGroup;

  // Supercharger: blower scoop through the hood
  const hoodZ = 1.15, hoodY = surfaceY(0, hoodZ, 0.85);
  const scoop = new THREE.Group();
  scoop.add(box(0.5, 0.14, 0.42, chrome, 0, hoodY + 0.05, hoodZ));
  const hat = box(0.42, 0.13, 0.36, carbon, 0, hoodY + 0.18, hoodZ); hat.rotation.x = 0.08; scoop.add(hat);
  scoop.add(box(0.36, 0.08, 0.02, new THREE.MeshStandardMaterial({ color: '#050505' }), 0, hoodY + 0.19, hoodZ + 0.19));

  // Turbo: front-mount intercooler visible in the lower grille
  const intercooler = new THREE.Group();
  const frontZ = (() => { for (let z = 2.3; z > 1.5; z -= 0.01) if (surfaceY(0, z, -1) > 0) return z; return 2.0; })();
  intercooler.add(box(1.0, 0.16, 0.05, new THREE.MeshStandardMaterial({ color: '#b5b9bf', metalness: 0.9, roughness: 0.35 }), 0, 0.33, frontZ - 0.02));

  // Exhaust tip, scales with intake/exhaust upgrade
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 12, 1, true), chrome);
  exhaust.rotation.x = Math.PI / 2; exhaust.position.set(-0.45, 0.24, rearZ - 0.06); exhaust.material.side = THREE.DoubleSide;

  return { streetWing, gtWing, jet, scoop, intercooler, exhaust, wingPaint, debug: { hatchTop, rearZ, roofY, hoodY, frontZ } };
}
