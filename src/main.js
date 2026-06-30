import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const viewport = $('#viewport');
const modeBtn = $('#modeBtn');
const seedBtn = $('#seedBtn');
const resetBtn = $('#resetBtn');
const hideUiBtn = $('#hideUiBtn');
const helpBtn = $('#helpBtn');
const brushLockBtn = $('#brushLockBtn');
const timeSlider = $('#timeSlider');
const tools = [...document.querySelectorAll('.tool[data-tool]')];
const sizeButtons = [...document.querySelectorAll('.size-btn')];

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 240);
camera.position.set(18, 16, 24);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
viewport.innerHTML = '';
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);
controls.minDistance = 8;
controls.maxDistance = 80;
controls.maxPolarAngle = Math.PI * 0.52;
controls.enablePan = false;

const hemi = new THREE.HemisphereLight(0xffffff, 0x7b806f, 1.4);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(10, 18, 10);
sun.castShadow = true;
scene.add(hemi, sun);

const skySphere = new THREE.Mesh(
  new THREE.SphereGeometry(150, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xdce8e2, side: THREE.BackSide })
);
scene.add(skySphere);

const sunDiskMaterial = new THREE.MeshBasicMaterial({ color: 0xffe8a0, depthTest: false });
const moonDiskMaterial = new THREE.MeshBasicMaterial({ color: 0xe8edff, depthTest: false });
const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 12), sunDiskMaterial);
const moonDisk = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 12), moonDiskMaterial);
sunDisk.renderOrder = 999;
moonDisk.renderOrder = 999;
scene.add(sunDisk, moonDisk);

const cloudGroup = new THREE.Group();
const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
scene.add(cloudGroup);
function addCloud(x, y, z, s) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(s * (0.55 + i * 0.08), 10, 6), cloudMaterial);
    p.scale.set(2.0, 0.38, 0.7);
    p.position.set(i * s * 0.55, Math.sin(i) * 0.08, Math.cos(i) * 0.14);
    g.add(p);
  }
  g.position.set(x, y, z);
  g.rotation.y = x * 0.07;
  cloudGroup.add(g);
}
addCloud(-24, 14, -20, 1.3);
addCloud(6, 17, -24, 1.6);
addCloud(23, 15, 8, 1.2);
addCloud(-30, 18, 15, 1.35);

const world = new THREE.Group();
scene.add(world);

const WORLD_SIZE = 58;
const SEGMENTS = 120;
const WATER_LEVEL = -0.16;
const geom = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEGMENTS, SEGMENTS);
geom.rotateX(-Math.PI / 2);
const pos = geom.attributes.position;
const colors = [];
const data = [];
for (let i = 0; i < pos.count; i++) {
  data[i] = { h: 0, water: 0, veg: 0, stone: 0, density: 1 };
  colors.push(0.68, 0.72, 0.54);
}
geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
const terrain = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
terrain.receiveShadow = true;
world.add(terrain);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 40, 40).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x8cbaba, transparent: true, opacity: 0.22, roughness: 0.3 })
);
water.position.y = WATER_LEVEL;
world.add(water);

const vegetation = new THREE.Group();
const rocks = new THREE.Group();
const falls = new THREE.Group();
world.add(vegetation, rocks, falls);

const mats = {
  grass: new THREE.MeshStandardMaterial({ color: 0x657c51, roughness: 0.98, side: THREE.DoubleSide }),
  flower1: new THREE.MeshStandardMaterial({ color: 0xe8d0d6, roughness: 0.98 }),
  flower2: new THREE.MeshStandardMaterial({ color: 0xf0e4a2, roughness: 0.98 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x876f4e, roughness: 0.96 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x7a935f, roughness: 0.98 }),
  pine: new THREE.MeshStandardMaterial({ color: 0x5f7651, roughness: 0.98 }),
  palm: new THREE.MeshStandardMaterial({ color: 0x6f8f58, roughness: 0.98 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x9e998c, roughness: 0.98 }),
  waterFall: new THREE.MeshStandardMaterial({ color: 0xa5d3d6, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
};

let seed = Date.now() % 999999;
let seedType = 0;
let currentTool = 'grass';
let mode = 'explore';
let brushLock = false;
let brushRadius = 2.7;
let pointerDown = null;
let currentDensity = 'normal';
let timeOfDay = 0.28;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const brushMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
let brush = makeBrush();
scene.add(brush);

function rand(x, z, s = seed) {
  const n = Math.sin((x + s * 0.011) * 12.9898 + (z - s * 0.017) * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
function gauss(x, z, cx, cz, r, h) {
  return Math.exp(-(((x - cx) ** 2 + (z - cz) ** 2) / (r * r))) * h;
}
function ridge(x, z, angle, off, width, h) {
  const d = Math.abs(Math.cos(angle) * x + Math.sin(angle) * z - off);
  return Math.max(0, 1 - d / width) * h;
}
function colorAt(i) {
  const d = data[i];
  const visibleH = d.h - d.water * 0.26 + d.stone * 0.16;
  const nearWater = THREE.MathUtils.clamp(1 - Math.abs(visibleH - WATER_LEVEL) / 0.8, 0, 1);
  const beach = nearWater * (1 - d.water * 0.75);
  const c = new THREE.Color(0xaab486)
    .lerp(new THREE.Color(0xb8c195), 0.24)
    .lerp(new THREE.Color(0x74885d), d.veg * 0.16)
    .lerp(new THREE.Color(0xd6c99c), beach * 0.95)
    .lerp(new THREE.Color(0x8cbaba), d.water * 0.82)
    .lerp(new THREE.Color(0xa8a195), d.stone * 0.65)
    .lerp(new THREE.Color(0x9d9078), Math.max(0, d.h - 1.0) * 0.08);
  geom.attributes.color.setXYZ(i, c.r, c.g, c.b);
}
function applyPoint(i) {
  const d = data[i];
  pos.setY(i, d.h - d.water * 0.26 + d.stone * 0.16);
  colorAt(i);
}
function updateTerrain() {
  pos.needsUpdate = true;
  geom.attributes.color.needsUpdate = true;
  geom.computeVertexNormals();
}
function heightAt(x, z) {
  let best = 0, dist = Infinity;
  for (let i = 0; i < pos.count; i += 3) {
    const dx = pos.getX(i) - x, dz = pos.getZ(i) - z;
    const d = dx * dx + dz * dz;
    if (d < dist) { dist = d; best = i; }
  }
  return pos.getY(best);
}
function dataAt(x, z) {
  let best = 0, dist = Infinity;
  for (let i = 0; i < pos.count; i += 3) {
    const dx = pos.getX(i) - x, dz = pos.getZ(i) - z;
    const d = dx * dx + dz * dz;
    if (d < dist) { dist = d; best = i; }
  }
  return data[best];
}
function biomeAt(x, z) {
  const h = heightAt(x, z);
  const d = dataAt(x, z);
  if (d.water > 0.12 || Math.abs(h - WATER_LEVEL) < 0.55) return 'coast';
  if (h > 1.0) return 'highland';
  if (d.veg > 0.58) return 'forest';
  return 'plains';
}
function clearGroup(g) {
  for (const c of [...g.children]) {
    g.remove(c);
    if (c.children) clearGroup(c);
    if (c.geometry) c.geometry.dispose();
  }
}
function generateSeed(newSeed = Math.floor(Math.random() * 999999)) {
  seed = newSeed;
  seedType = Math.floor(rand(10, 20) * 7);
  clearGroup(vegetation); clearGroup(rocks); clearGroup(falls);
  const angle = rand(2, 8) * Math.PI;
  const lakeX = (rand(7, 9) - 0.5) * 16;
  const lakeZ = (rand(9, 7) - 0.5) * 16;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = 0, w = 0, veg = 0.20 + rand(x * 0.35, z * 0.35) * 0.3, stone = 0;
    if (seedType === 0) {
      h += gauss(x, z, -15, -8, 10, 1.7) + gauss(x, z, 14, 8, 9, 1.4);
      const river = Math.abs(x - (Math.sin(z * 0.17) * 4));
      w = Math.max(THREE.MathUtils.clamp(1 - river / 2.4, 0, 1) * 0.85, THREE.MathUtils.clamp((7 - Math.hypot(x - lakeX, z - lakeZ)) / 4, 0, 1));
    } else if (seedType === 1) {
      h += gauss(x, z, 0, 0, 8, 3.2) + ridge(x, z, angle, 0, 4, 1.2);
      w = THREE.MathUtils.clamp((4 - Math.abs(x + Math.sin(z * 0.2) * 2)) / 2.4, 0, 0.55);
      stone += 0.34;
    } else if (seedType === 2) {
      const island = Math.hypot(x, z);
      h += gauss(x, z, 0, 0, 17, 1.35) - Math.max(0, island - 14) * 0.18;
      w = THREE.MathUtils.clamp((island - 13) / 7, 0, 1);
      veg += 0.15;
    } else if (seedType === 3) {
      const canyon = Math.abs(Math.sin(angle) * x - Math.cos(angle) * z);
      h += ridge(x, z, angle, 0, 5.2, 1.8) - Math.max(0, 1 - canyon / 3) * 1.25;
      w = THREE.MathUtils.clamp(1 - canyon / 1.8, 0, 1) * 0.74;
      stone += 0.42;
      veg -= 0.08;
    } else if (seedType === 4) {
      h += gauss(x, z, 0, 0, 6.5, 3.0) - gauss(x, z, 0, 0, 2.2, 1.5);
      w = THREE.MathUtils.clamp((5 - Math.hypot(x - 5, z + 3)) / 3.2, 0, 1);
      stone += 0.45;
    } else if (seedType === 5) {
      h += ridge(x, z, angle, -8, 3, 1.5) + ridge(x, z, angle, 8, 3, 1.5);
      w = Math.max(THREE.MathUtils.clamp((5 - Math.hypot(x - lakeX, z - lakeZ)) / 3.5, 0, 1), THREE.MathUtils.clamp((5 - Math.hypot(x + 10, z - 8)) / 3.5, 0, 1));
    } else {
      h += gauss(x, z, -8, -8, 7, 1.2) + gauss(x, z, 8, 9, 7, 1.1);
      w = Math.max(THREE.MathUtils.clamp((4.5 - Math.hypot(x - 8, z - 4)) / 3, 0, 1), THREE.MathUtils.clamp((4.5 - Math.hypot(x + 9, z + 6)) / 3, 0, 1));
      veg += 0.35;
    }
    h += Math.sin((x + seed) * 0.11) * 0.06 + Math.cos((z - seed) * 0.12) * 0.06;
    data[i] = { h, water: THREE.MathUtils.clamp(w, 0, 1), veg: THREE.MathUtils.clamp(veg, 0, 1), stone: THREE.MathUtils.clamp(stone + Math.max(0, h - 0.7) * 0.18 + rand(x * 1.8, z * 1.8) * 0.08, 0, 0.8), density: 1 };
    applyPoint(i);
  }
  updateTerrain();
  if ([1, 3, 4].includes(seedType)) addWaterfall({ x: (rand(4, 8) - 0.5) * 10, z: (rand(8, 4) - 0.5) * 12 });
  refreshDecorations();
  resetCamera();
}
function addGrass(x, z, scale = 1) {
  const g = new THREE.Group();
  const count = 2 + Math.floor(rand(x, z) * 3);
  for (let i = 0; i < count; i++) {
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.035 * scale, 0.12 * scale), mats.grass);
    blade.position.set((rand(x + i, z) - 0.5) * 0.26, 0.065 * scale, (rand(x, z + i) - 0.5) * 0.26);
    blade.rotation.set(0, rand(x + i * 3, z) * Math.PI, (rand(x + i * 2, z) - 0.5) * 0.35);
    g.add(blade);
  }
  if (rand(x + 4, z - 1) > 0.78) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005 * scale, 0.006 * scale, 0.10 * scale, 4), mats.grass);
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.028 * scale, 6, 4), rand(x, z) > 0.5 ? mats.flower1 : mats.flower2);
    stem.position.y = 0.05 * scale;
    flower.position.y = 0.115 * scale;
    g.add(stem, flower);
  }
  g.position.set(x, heightAt(x, z) + 0.018, z);
  vegetation.add(g);
}
function addTree(x, z, scale = 1) {
  const biome = biomeAt(x, z);
  const g = new THREE.Group();
  const trunkH = biome === 'coast' ? 0.72 : biome === 'highland' ? 0.38 : 0.46;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * scale, 0.07 * scale, trunkH * scale, 6), mats.trunk);
  trunk.position.y = trunkH * scale * 0.5;
  g.add(trunk);
  if (biome === 'coast') {
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09 * scale, 0.56 * scale, 5), mats.palm);
      leaf.position.y = 0.78 * scale;
      leaf.rotation.z = Math.PI / 2.7;
      leaf.rotation.y = i * Math.PI * 0.4;
      g.add(leaf);
    }
  } else if (biome === 'highland') {
    const pine = new THREE.Mesh(new THREE.ConeGeometry(0.28 * scale, 0.78 * scale, 7), mats.pine);
    pine.position.y = 0.66 * scale;
    g.add(pine);
  } else {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.32 * scale, 8, 6), mats.leaf);
    crown.scale.set(1.1, 0.86, 1);
    crown.position.y = 0.70 * scale;
    g.add(crown);
  }
  g.position.set(x, heightAt(x, z) + 0.02, z);
  g.rotation.y = rand(x, z) * Math.PI * 2;
  vegetation.add(g);
}
function addRock(x, z, scale = 1) {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 * scale, 1), mats.rock);
  r.position.set(x, heightAt(x, z) + 0.07 * scale, z);
  r.scale.set(0.8 + rand(x, z) * 0.7, 0.42 + rand(z, x) * 0.26, 0.68 + rand(x + 4, z) * 0.5);
  r.rotation.set(rand(x, z) * 0.6, rand(x + 1, z) * Math.PI * 2, rand(x, z + 1) * 0.5);
  rocks.add(r);
}
function addWaterfall(p) {
  const h = heightAt(p.x, p.z);
  if (h < 0.55) return;
  const height = Math.min(1.4, Math.max(0.45, h - WATER_LEVEL));
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.12 + rand(p.x + i, p.z) * 0.06, height, 1, 6), mats.waterFall.clone());
    strip.position.x = (i - 1.5) * 0.14;
    strip.rotation.z = (rand(p.x + i, p.z) - 0.5) * 0.1;
    g.add(strip);
  }
  g.position.set(p.x, h - height / 2, p.z);
  g.rotation.y = rand(p.x, p.z) * Math.PI * 2;
  falls.add(g);
}
function refreshDecorations() {
  clearGroup(vegetation); clearGroup(rocks);
  const densityMult = currentDensity === 'low' ? 0.25 : currentDensity === 'high' ? 1.4 : 0.75;
  for (let i = 0; i < pos.count; i += 23) {
    const x = pos.getX(i), z = pos.getZ(i), d = data[i], h = pos.getY(i);
    if (d.water > 0.2 || Math.abs(x) > WORLD_SIZE * 0.48 || Math.abs(z) > WORLD_SIZE * 0.48) continue;
    const n = rand(x * 1.4, z * 1.4);
    if (d.veg > 0.25 && n > 1 - 0.42 * densityMult) {
      if (d.veg > 0.55 && n > 1 - 0.16 * densityMult) addTree(x, z, 0.65 + rand(x + 3, z) * 0.58);
      else addGrass(x, z, 0.72 + rand(x, z + 2) * 0.42);
    }
    if ((d.stone > 0.55 || h > 1.5 || biomeAt(x, z) === 'coast') && rand(x + 9, z - 4) > 1 - 0.10 * densityMult) addRock(x, z, 0.22 + rand(x, z) * 0.35);
  }
}
function paintAt(p) {
  const targetHeight = heightAt(p.x, p.z);
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - p.x, dz = pos.getZ(i) - p.z, dist = Math.hypot(dx, dz);
    if (dist > brushRadius) continue;
    const f = Math.pow(1 - dist / brushRadius, 2.2), d = data[i];
    if (currentTool === 'grass') { d.veg = THREE.MathUtils.clamp(d.veg + f * 0.22, 0, 1); d.water = Math.max(0, d.water - f * 0.05); }
    else if (currentTool === 'forest') { d.veg = THREE.MathUtils.clamp(d.veg + f * 0.38, 0, 1); d.water = Math.max(0, d.water - f * 0.04); }
    else if (currentTool === 'water') { d.water = THREE.MathUtils.clamp(d.water + f * 0.20, 0, 1); d.h -= f * 0.035; }
    else if (currentTool === 'stone') { d.stone = THREE.MathUtils.clamp(d.stone + f * 0.18, 0, 1); }
    else if (currentTool === 'raise') { d.h = THREE.MathUtils.clamp(d.h + f * 0.36, -2, 4.6); d.water = Math.max(0, d.water - f * 0.18); d.stone = THREE.MathUtils.clamp(d.stone + f * 0.035, 0, 1); }
    else if (currentTool === 'lower') { d.h = THREE.MathUtils.clamp(d.h - f * 0.30, -2.4, 4.6); d.water = THREE.MathUtils.clamp(d.water + f * 0.02, 0, 1); }
    else if (currentTool === 'erase') { d.water = Math.max(0, d.water - f * 0.20); d.veg = Math.max(0, d.veg - f * 0.28); d.stone = Math.max(0, d.stone - f * 0.2); }
    else if (currentTool === 'smooth') { d.h = THREE.MathUtils.lerp(d.h, targetHeight, f * 0.12); }
    else if (currentTool === 'flatten') { d.h = THREE.MathUtils.lerp(d.h, targetHeight, f * 0.34); }
    applyPoint(i);
  }
  if (currentTool === 'waterfall') addWaterfall(p);
  updateTerrain();
  clearTimeout(window._decoTimer);
  window._decoTimer = setTimeout(refreshDecorations, 160);
}
function pointerPoint(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const out = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, out);
  return out;
}
function makeBrush() {
  const b = new THREE.Mesh(new THREE.RingGeometry(brushRadius * 0.84, brushRadius, 64), brushMaterial);
  b.rotation.x = -Math.PI / 2;
  b.position.y = 0.12;
  b.visible = false;
  return b;
}
function rebuildBrush() { scene.remove(brush); brush.geometry.dispose(); brush = makeBrush(); scene.add(brush); }
function setMode(next) {
  mode = next;
  app.dataset.mode = mode;
  modeBtn.textContent = mode === 'edit' ? 'Editar' : 'Explorar';
  modeBtn.classList.toggle('primary', mode === 'explore');
  controls.enabled = !(mode === 'edit' && brushLock);
}
function setBrushLock(v) {
  brushLock = v;
  brushLockBtn.textContent = v ? 'Pincel: continuo' : 'Pincel: toque';
  brushLockBtn.classList.toggle('is-active', v);
  controls.enabled = !(mode === 'edit' && brushLock);
}
function updateSky() {
  const day = Math.max(0, Math.sin(timeOfDay * Math.PI));
  const skyColor = new THREE.Color(0x17213a).lerp(new THREE.Color(0xdce8e2), day);
  scene.background = skyColor;
  skySphere.material.color.copy(skyColor);
  hemi.intensity = 0.45 + day * 1.45;
  sun.intensity = 0.25 + day * 2.1;
  const angle = timeOfDay * Math.PI * 2 - Math.PI * 0.15;
  sun.position.set(Math.cos(angle) * 22, Math.sin(angle) * 22, 10);
  sunDisk.position.set(Math.cos(angle) * 48, Math.max(8, Math.sin(angle) * 30 + 18), -34);
  moonDisk.position.set(-Math.cos(angle) * 48, Math.max(8, -Math.sin(angle) * 30 + 18), -34);
  sunDisk.visible = day > 0.08;
  moonDisk.visible = day < 0.92;
  cloudMaterial.opacity = 0.16 + day * 0.38;
  water.material.color.copy(new THREE.Color(0x5a6b7d).lerp(new THREE.Color(0x8cbaba), day));
}
function resetCamera() { camera.position.set(18, 16, 24); controls.target.set(0, 0, 0); controls.update(); }
function stop(e) { e.preventDefault(); e.stopPropagation(); }
function bindButton(el, fn) { el?.addEventListener('pointerdown', stop); el?.addEventListener('pointerup', (e) => { stop(e); fn(); }); }

renderer.domElement.addEventListener('pointerdown', (e) => { pointerDown = { x: e.clientX, y: e.clientY, p: pointerPoint(e) }; brush.visible = mode === 'edit'; brush.position.set(pointerDown.p.x, 0.12, pointerDown.p.z); if (mode === 'edit' && brushLock) paintAt(pointerDown.p); });
renderer.domElement.addEventListener('pointermove', (e) => { const p = pointerPoint(e); brush.visible = mode === 'edit'; brush.position.set(p.x, 0.12, p.z); if (mode === 'edit' && brushLock && pointerDown) paintAt(p); });
renderer.domElement.addEventListener('pointerup', (e) => { if (!pointerDown) return; const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y); if (mode === 'edit' && !brushLock && moved < 8) paintAt(pointerDown.p); pointerDown = null; });
renderer.domElement.addEventListener('dblclick', resetCamera);

bindButton(modeBtn, () => setMode(mode === 'explore' ? 'edit' : 'explore'));
bindButton(seedBtn, () => generateSeed());
bindButton(resetBtn, () => generateSeed(seed));
bindButton(hideUiBtn, () => { app.classList.toggle('ui-hidden'); hideUiBtn.textContent = app.classList.contains('ui-hidden') ? '☰' : '👁️'; });
bindButton(helpBtn, () => $('#infoPanel')?.classList.toggle('is-hidden'));
bindButton(brushLockBtn, () => setBrushLock(!brushLock));
bindButton($('#undoBtn'), () => {});
bindButton($('#redoBtn'), () => {});
tools.forEach((btn) => bindButton(btn, () => { currentTool = btn.dataset.tool; tools.forEach(b => b.classList.toggle('active', b === btn)); }));
sizeButtons.forEach((btn) => bindButton(btn, () => { brushRadius = btn.dataset.size === 'small' ? 1.25 : btn.dataset.size === 'large' ? 4.8 : 2.7; sizeButtons.forEach(b => b.classList.toggle('active', b === btn)); rebuildBrush(); }));
$('#densitySelect')?.addEventListener('change', (e) => { currentDensity = e.target.value; refreshDecorations(); });
timeSlider?.addEventListener('input', (e) => { timeOfDay = Number(e.target.value); updateSky(); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

generateSeed(seed);
setMode('explore');
setBrushLock(false);
updateSky();

function animate() {
  controls.update();
  const t = performance.now() * 0.001;
  water.position.y = WATER_LEVEL + Math.sin(t * 1.2) * 0.012;
  water.material.opacity = 0.21 + Math.sin(t * 1.3) * 0.02;
  cloudGroup.children.forEach((c, i) => c.position.x += Math.sin(t + i) * 0.0008);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
