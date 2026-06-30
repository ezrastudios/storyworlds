import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const $ = s => document.querySelector(s);
const app = $('#app'), viewport = $('#viewport'), resetBtn = $('#resetBtn'), seedBtn = $('#seedBtn'), modeBtn = $('#modeBtn'), hideUiBtn = $('#hideUiBtn'), helpBtn = $('#helpBtn');
const brushLockBtn = $('#brushLockBtn'), infoPanel = $('#infoPanel'), undoBtn = $('#undoBtn'), redoBtn = $('#redoBtn'), densitySelect = $('#densitySelect'), timeSlider = $('#timeSlider');
const tools = [...document.querySelectorAll('.tool[data-tool]')], sizeButtons = [...document.querySelectorAll('.size-btn')];

const STORAGE_KEY = 'storyworlds.v07.autosave';
const densityCode = { low: 0, normal: 1, high: 2 };
const densityName = ['low', 'normal', 'high'];
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 260);
camera.position.set(16, 16, 24);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.075, maxPolarAngle: Math.PI * 0.5, minDistance: 8, maxDistance: 76, enablePan: false });
controls.target.set(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xf8efe0, 0x6d756b, 1.6);
const sun = new THREE.DirectionalLight(0xffffff, 2.35);
sun.castShadow = true;
const moon = new THREE.DirectionalLight(0xb6c6ff, 0.0);
const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), new THREE.MeshBasicMaterial({ color: 0xdbe7e5, side: THREE.BackSide }));
const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 12), new THREE.MeshBasicMaterial({ color: 0xfff0b5 }));
const moonDisk = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 12), new THREE.MeshBasicMaterial({ color: 0xe8ebff }));
scene.add(hemi, sun, moon, sky, sunDisk, moonDisk);

const cloudGroup = new THREE.Group();
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf7f5ec, transparent: true, opacity: 0.52 });
scene.add(cloudGroup);
function addCloud(x, y, z, s) {
  const c = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(s * (0.42 + i * 0.07), 10, 6), cloudMat);
    p.scale.set(2.1, 0.38, 0.75);
    p.position.set(i * s * 0.55, Math.sin(i) * s * 0.06, Math.cos(i) * s * 0.1);
    c.add(p);
  }
  c.position.set(x, y, z);
  c.rotation.y = Math.random() * Math.PI;
  cloudGroup.add(c);
}
[-28, -12, 8, 25, 42].forEach((x, i) => addCloud(x, 15 + i % 3, -20 + i * 8, 1.0 + (i % 3) * 0.25));

const world = new THREE.Group();
scene.add(world);
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let currentTool = 'grass', mode = 'explore', brushLock = false, brushRadius = 2.6, downAt = null, lastTap = null, infoTimer = null, saveTimer = null, decoTimer = null;
let density = 'normal', timeOfDay = 0.28, seedSalt = 1207, seedType = 0, undoStack = [], redoStack = [];

const size = 58, segments = 150, waterLevel = -0.18, tapMoveLimit = 8, sculptStrength = 0.16;
const palette = {
  grass: new THREE.Color(0xaab486), grass2: new THREE.Color(0xb8c195), water: new THREE.Color(0x8bb5b5), stone: new THREE.Color(0xb7b1a0),
  earth: new THREE.Color(0xa99f83), shore: new THREE.Color(0xc8bb95), darkGrass: new THREE.Color(0x768c5f), sand: new THREE.Color(0xd4c799)
};

const terrainGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
terrainGeometry.rotateX(-Math.PI / 2);
const position = terrainGeometry.attributes.position, colors = [], baseHeights = [], terrainData = [];
for (let i = 0; i < position.count; i++) {
  const x = position.getX(i), z = position.getZ(i);
  const base = Math.sin(x * 0.18) * 0.04 + Math.cos(z * 0.2) * 0.04;
  baseHeights[i] = base;
  terrainData[i] = { height: base, water: 0, stone: 0, offset: 0, vegetation: 0, density: 1 };
  const c = palette.grass.clone().lerp(palette.grass2, Math.random() * 0.35);
  colors.push(c.r, c.g, c.b);
  position.setY(i, base);
}
terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0.01 }));
terrain.receiveShadow = true;
world.add(terrain);

const waterGeometry = new THREE.PlaneGeometry(size, size, 70, 70);
waterGeometry.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(waterGeometry, new THREE.MeshStandardMaterial({ color: 0x8bb5b5, transparent: true, opacity: 0.2, roughness: 0.32, metalness: 0.04 }));
water.position.y = waterLevel;
world.add(water);

const brushMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
let brush = createBrush(); scene.add(brush);
const vegetation = new THREE.Group(), rocks = new THREE.Group(), waterfalls = new THREE.Group(); world.add(vegetation, rocks, waterfalls);

const mats = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x8b7555, roughness: 0.95 }),
  pine: new THREE.MeshStandardMaterial({ color: 0x5f7651, roughness: 0.98 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x7d935f, roughness: 0.98 }),
  palm: new THREE.MeshStandardMaterial({ color: 0x6e8d5e, roughness: 0.98 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x667d52, roughness: 0.98 }),
  flowerA: new THREE.MeshStandardMaterial({ color: 0xe9d1d1, roughness: 0.98 }),
  flowerB: new THREE.MeshStandardMaterial({ color: 0xefe3a8, roughness: 0.98 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x9d988b, roughness: 0.96 }),
  fall: new THREE.MeshStandardMaterial({ color: 0x9fd0d3, transparent: true, opacity: 0.38, side: THREE.DoubleSide, roughness: 0.25 }),
  foam: new THREE.MeshBasicMaterial({ color: 0xd8eeee, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
};

function createBrush() { const m = new THREE.Mesh(new THREE.RingGeometry(brushRadius * 0.84, brushRadius, 64), brushMaterial); m.rotation.x = -Math.PI / 2; m.position.y = 0.12; m.visible = false; return m; }
function rebuildBrush() { scene.remove(brush); brush.geometry.dispose(); brush = createBrush(); scene.add(brush); }
function noise(x, z, s = seedSalt) { const n = Math.sin((x + s * 0.013) * 12.9898 + (z - s * 0.017) * 78.233) * 43758.5453; return n - Math.floor(n); }
function gaussian(x, z, cx, cz, r, h) { return Math.exp(-(((x - cx) ** 2 + (z - cz) ** 2) / (r * r))) * h; }
function ridge(x, z, a, off, width, h) { const d = Math.abs(Math.cos(a) * x + Math.sin(a) * z - off); return Math.max(0, 1 - d / width) * h; }
function trench(x, z, a, off, width, h) { return -ridge(x, z, a, off, width, h); }
function pickPoint(e) { const r = renderer.domElement.getBoundingClientRect(); pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1; pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1; raycaster.setFromCamera(pointer, camera); const p = new THREE.Vector3(); raycaster.ray.intersectPlane(plane, p); return p; }
function nearestIndex(x, z) { let idx = 0, best = Infinity; for (let i = 0; i < position.count; i += 2) { const d = (position.getX(i) - x) ** 2 + (position.getZ(i) - z) ** 2; if (d < best) { best = d; idx = i; } } return idx; }
function heightAt(x, z) { return position.getY(nearestIndex(x, z)); }
function slopeAt(i) { const x = position.getX(i), z = position.getZ(i), h = position.getY(i); let m = 0; for (let j = 0; j < position.count; j += 19) { const d = Math.hypot(position.getX(j) - x, position.getZ(j) - z); if (d > 0.25 && d < 1.05) m = Math.max(m, Math.abs(position.getY(j) - h)); } return m; }
function clearGroup(g) { for (const child of [...g.children]) { g.remove(child); if (child.children) clearGroup(child); if (child.geometry) child.geometry.dispose(); } }
function biomeAt(x, z) { const i = nearestIndex(x, z), d = terrainData[i], h = position.getY(i), slope = slopeAt(i); if (d.water > 0.18 || Math.abs(h - waterLevel) < 0.25) return 'coast'; if (h > 1.2 || slope > 0.8) return 'highland'; if (d.vegetation > 0.5) return 'forest'; return 'plains'; }
function applyHeight(i) { const d = terrainData[i]; d.height = baseHeights[i] + d.offset - d.water * 0.32 + d.stone * 0.25; position.setY(i, d.height); }
function updateColorAt(i) { const x = position.getX(i), z = position.getZ(i), d = terrainData[i], h = position.getY(i), shore = THREE.MathUtils.clamp(d.water * 1.2 + Math.max(0, 0.22 - Math.abs(h - waterLevel)) * 2.6, 0, 1); const c = palette.grass.clone().lerp(palette.grass2, 0.22 + Math.sin(x * 0.2 + z * 0.33) * 0.08).lerp(palette.darkGrass, d.vegetation * 0.16).lerp(palette.earth, Math.abs(d.offset) * 0.12).lerp(palette.sand, shore * (1 - d.water) * 0.75).lerp(palette.water, d.water * 0.78).lerp(palette.stone, d.stone * 0.75); terrainGeometry.attributes.color.setXYZ(i, c.r, c.g, c.b); }
function brushIndexes(p) { const a = []; for (let i = 0; i < position.count; i++) { const dist = Math.hypot(position.getX(i) - p.x, position.getZ(i) - p.z); if (dist <= brushRadius) a.push({ i, dist }); } return a; }
function avgOffset(p) { const a = brushIndexes(p); return a.length ? a.reduce((s, o) => s + terrainData[o.i].offset, 0) / a.length : 0; }
function centerOffset(p) { return terrainData[nearestIndex(p.x, p.z)].offset; }
function relax(p, strength = 0.08) { const avg = avgOffset(p); for (const { i, dist } of brushIndexes(p)) { const f = Math.pow(1 - dist / brushRadius, 2.2); terrainData[i].offset = THREE.MathUtils.lerp(terrainData[i].offset, avg, f * strength); applyHeight(i); updateColorAt(i); } }

function addRock(x, z, scale = 1) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 * scale, noise(x, z) > 0.55 ? 0 : 1), mats.rock); r.position.set(x, heightAt(x, z) + 0.07 * scale, z); r.rotation.set(noise(x + 11, z) * 0.8, noise(x, z) * Math.PI * 2, (noise(x, z + 7) - 0.5) * 0.7); r.scale.set(0.8 + noise(x + 2, z) * 0.85, 0.38 + noise(x, z + 3) * 0.3, 0.65 + noise(x - 1, z) * 0.55); r.castShadow = true; rocks.add(r); }
function addGrass(x, z, scale = 1) { const g = new THREE.Group(), n = 2 + Math.floor(noise(x, z) * 3); for (let i = 0; i < n; i++) { const blade = new THREE.Mesh(new THREE.ConeGeometry(0.022 * scale, 0.15 * scale, 4), mats.grass); blade.position.set((noise(x + i, z) - 0.5) * 0.22, 0.07 * scale, (noise(x, z + i) - 0.5) * 0.22); blade.rotation.z = (noise(x + i * 2, z) - 0.5) * 0.6; g.add(blade); } g.position.set(x, heightAt(x, z) + 0.02, z); g.rotation.y = noise(x, z) * Math.PI; vegetation.add(g); }
function addFlower(x, z, scale = 1) { const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * scale, 0.012 * scale, 0.11 * scale, 4), mats.grass); const head = new THREE.Mesh(new THREE.SphereGeometry(0.035 * scale, 6, 4), noise(x, z) > 0.5 ? mats.flowerA : mats.flowerB); const g = new THREE.Group(); stem.position.y = 0.055 * scale; head.position.y = 0.13 * scale; g.add(stem, head); g.position.set(x, heightAt(x, z) + 0.015, z); vegetation.add(g); }
function addTree(x, z, scale = 1) { const b = biomeAt(x, z), g = new THREE.Group(); const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * scale, 0.07 * scale, (b === 'coast' ? 0.68 : 0.43) * scale, 6), mats.trunk); trunk.position.y = (b === 'coast' ? 0.34 : 0.21) * scale; trunk.castShadow = true; g.add(trunk); if (b === 'coast') { for (let i = 0; i < 5; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.10 * scale, 0.55 * scale, 5), mats.palm); leaf.position.y = 0.72 * scale; leaf.rotation.z = Math.PI / 2.7; leaf.rotation.y = i * Math.PI * 0.4; g.add(leaf); } } else if (b === 'highland') { const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.28 * scale, 0.78 * scale, 7), mats.pine); c1.position.y = 0.68 * scale; g.add(c1); } else { const crown = new THREE.Mesh(new THREE.SphereGeometry(0.31 * scale, 8, 6), mats.leaf); crown.scale.set(1.12, 0.86, 1); crown.position.y = 0.66 * scale; g.add(crown); } g.position.set(x, heightAt(x, z) + 0.02, z); g.rotation.y = noise(x, z) * Math.PI * 2; vegetation.add(g); }
function addWaterfall(p) { const top = heightAt(p.x, p.z); if (top < 0.45) return; const bottom = Math.max(waterLevel + 0.04, top - 1.15), h = Math.max(0.32, top - bottom), g = new THREE.Group(); for (let i = 0; i < 5; i++) { const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.10 + noise(p.x + i, p.z) * 0.06, h * (0.8 + noise(p.z, i) * 0.25), 1, 8), mats.fall.clone()); strip.position.set((i - 2) * 0.13, 0, 0.012 * i); strip.rotation.z = (noise(p.x + i, p.z) - 0.5) * 0.12; g.add(strip); } const foam = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24), mats.foam); foam.rotation.x = -Math.PI / 2; foam.position.y = -h / 2 + 0.02; g.add(foam); g.position.set(p.x, bottom + h / 2, p.z); g.rotation.y = noise(p.x, p.z) * Math.PI * 2; g.userData.storyWorld = { type: 'waterfall', x: p.x, z: p.z }; waterfalls.add(g); }

function makeSnapshot() { return { density, timeOfDay, seedSalt, seedType, terrain: terrainData.map(d => [d.water, d.stone, d.offset, d.vegetation, d.density]), waterfalls: waterfalls.children.map(f => f.userData.storyWorld).filter(Boolean) }; }
function applySnapshot(s) { if (!s?.terrain) return; density = s.density || 'normal'; timeOfDay = s.timeOfDay ?? 0.28; seedSalt = s.seedSalt || seedSalt; seedType = s.seedType || 0; if (densitySelect) densitySelect.value = density; if (timeSlider) timeSlider.value = timeOfDay; s.terrain.forEach((row, i) => { if (!terrainData[i]) return; terrainData[i].water = row[0] || 0; terrainData[i].stone = row[1] || 0; terrainData[i].offset = row[2] || 0; terrainData[i].vegetation = row[3] || 0; terrainData[i].density = row[4] ?? 1; applyHeight(i); updateColorAt(i); }); clearGroup(waterfalls); (s.waterfalls || []).forEach(item => addWaterfall(new THREE.Vector3(item.x, 0, item.z))); position.needsUpdate = true; terrainGeometry.attributes.color.needsUpdate = true; terrainGeometry.computeVertexNormals(); refreshDecorations(); updateSky(); }
function pushHistory() { undoStack.push(makeSnapshot()); if (undoStack.length > 80) undoStack.shift(); redoStack = []; }
function undo() { if (!undoStack.length) return; redoStack.push(makeSnapshot()); applySnapshot(undoStack.pop()); scheduleSave(); }
function redo() { if (!redoStack.length) return; undoStack.push(makeSnapshot()); applySnapshot(redoStack.pop()); scheduleSave(); }
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(makeSnapshot())); } catch {} }, 250); }
function loadSaved() { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return false; applySnapshot(JSON.parse(raw)); return true; } catch { return false; } }
function clearWorld() { clearGroup(vegetation); clearGroup(rocks); clearGroup(waterfalls); for (let i = 0; i < position.count; i++) { terrainData[i] = { height: baseHeights[i], water: 0, stone: 0, offset: 0, vegetation: 0, density: densityCode[density] ?? 1 }; position.setY(i, baseHeights[i]); updateColorAt(i); } }

function generateSeedWorld(newSeed = Math.floor(Math.random() * 999999)) {
  seedSalt = newSeed; seedType = Math.floor(noise(100, 200) * 8); clearWorld();
  const a = noise(3, 8) * Math.PI, lakeX = (noise(7, 9) - 0.5) * 14, lakeZ = (noise(9, 7) - 0.5) * 14;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i), d = terrainData[i]; let h = 0, w = 0, veg = 0.16 + noise(x * 0.35, z * 0.35) * 0.22, stone = 0;
    if (seedType === 0) { h += gaussian(x, z, -14, -8, 10, 1.9) + gaussian(x, z, 13, 9, 9, 1.5); const r = Math.abs(x - (Math.sin(z * 0.18) * 4 + (noise(2, 3) - 0.5) * 5)); w = Math.max(THREE.MathUtils.clamp(1 - r / 2.2, 0, 1) * 0.9, THREE.MathUtils.clamp((7 - Math.hypot(x - lakeX, z - lakeZ)) / 4, 0, 1)); }
    else if (seedType === 1) { h += gaussian(x, z, 0, 0, 8, 3.5) + ridge(x, z, a, 0, 4, 1.4); w = THREE.MathUtils.clamp((4 - Math.abs(x + Math.sin(z * 0.2) * 2)) / 2.4, 0, 0.7); stone += 0.38; }
    else if (seedType === 2) { const island = Math.hypot(x, z); h += gaussian(x, z, 0, 0, 17, 1.45) - Math.max(0, island - 14) * 0.18; w = THREE.MathUtils.clamp((island - 13) / 7, 0, 1); veg += 0.16; }
    else if (seedType === 3) { const c = Math.abs(Math.sin(a) * x - Math.cos(a) * z); h += ridge(x, z, a, 0, 5.6, 1.9) + trench(x, z, a + Math.PI / 2, 0, 3.0, 1.25); w = THREE.MathUtils.clamp(1 - c / 1.7, 0, 1) * 0.78; stone += 0.45; veg -= 0.08; }
    else if (seedType === 4) { h += gaussian(x, z, -8, -3, 8, 1.4) + gaussian(x, z, 9, 5, 6, 2.2); h -= gaussian(x, z, 2, 1, 3.2, 1.4); w = THREE.MathUtils.clamp((5.2 - Math.hypot(x - 4, z + 2)) / 3.4, 0, 1); stone += Math.max(0, h - 0.6) * 0.22; }
    else if (seedType === 5) { h += ridge(x, z, a, -9, 3.2, 1.5) + ridge(x, z, a, 7, 3.2, 1.6) + gaussian(x, z, 10, -11, 6, 1.2); w = Math.max(THREE.MathUtils.clamp((4.5 - Math.hypot(x - lakeX, z - lakeZ)) / 3.5, 0, 1), THREE.MathUtils.clamp((4.2 - Math.hypot(x + 10, z - 9)) / 3.2, 0, 1)); }
    else if (seedType === 6) { h += ridge(x, z, a, 0, 2.3, 2.4) + gaussian(x, z, -10, 6, 7, 1.1); w = THREE.MathUtils.clamp((2.0 - Math.abs(Math.sin(a) * x - Math.cos(a) * z)) / 1.8, 0, 1) * 0.65; stone += 0.55; veg -= 0.12; }
    else { h += gaussian(x, z, -8, -8, 7, 1.2) + gaussian(x, z, 8, 9, 7, 1.1); w = Math.max(THREE.MathUtils.clamp((4.6 - Math.hypot(x - 8, z - 4)) / 3.1, 0, 1), THREE.MathUtils.clamp((4.6 - Math.hypot(x + 9, z + 6)) / 3.1, 0, 1)); veg += 0.38; }
    d.offset = h; d.water = THREE.MathUtils.clamp(w, 0, 1); d.vegetation = THREE.MathUtils.clamp(veg, 0, 1); d.stone = THREE.MathUtils.clamp(stone + Math.max(0, h - 0.65) * 0.22 + noise(x * 1.7, z * 1.7) * 0.1, 0, 0.8); d.density = densityCode[density] ?? 1; applyHeight(i); updateColorAt(i);
  }
  position.needsUpdate = true; terrainGeometry.attributes.color.needsUpdate = true; terrainGeometry.computeVertexNormals();
  if ([1, 3, 4, 6].includes(seedType)) addWaterfall(new THREE.Vector3((noise(5, 6) - 0.5) * 8, 0, (noise(6, 5) - 0.5) * 10));
  refreshDecorations(); resetCamera(); scheduleSave(); showInfo();
}

function paintAt(p, tool, opt = {}) {
  if (!opt.skipHistory) pushHistory();
  if (tool === 'waterfall') { addWaterfall(p); scheduleSave(); return; }
  let changed = false; const avg = tool === 'smooth' ? avgOffset(p) : 0, center = tool === 'flatten' ? centerOffset(p) : 0, activeDensity = densityCode[density] ?? 1;
  for (const { i, dist } of brushIndexes(p)) {
    const f = Math.pow(1 - dist / brushRadius, 2.25), d = terrainData[i]; d.density = activeDensity;
    if (tool === 'water') { d.water = THREE.MathUtils.clamp(d.water + f * 0.2, 0, 1); d.stone = Math.max(0, d.stone - f * 0.1); d.vegetation = Math.max(0, d.vegetation - f * 0.16); d.offset = THREE.MathUtils.clamp(d.offset - f * 0.04, -2, 3.6); }
    else if (tool === 'forest') { d.vegetation = THREE.MathUtils.clamp(d.vegetation + f * 0.36, 0, 1); d.water = Math.max(0, d.water - f * 0.08); }
    else if (tool === 'grass') { d.vegetation = THREE.MathUtils.clamp(d.vegetation + f * 0.18, 0, 1); d.water = Math.max(0, d.water - f * 0.05); d.stone = Math.max(0, d.stone - f * 0.06); }
    else if (tool === 'stone') { d.stone = THREE.MathUtils.clamp(d.stone + f * 0.18, 0, 1); d.water = Math.max(0, d.water - f * 0.1); d.offset = THREE.MathUtils.clamp(d.offset + f * 0.018, -2, 3.6); }
    else if (tool === 'raise') { d.offset = THREE.MathUtils.clamp(d.offset + f * sculptStrength, -2, 3.6); d.water = Math.max(0, d.water - f * 0.08); }
    else if (tool === 'lower') { d.offset = THREE.MathUtils.clamp(d.offset - f * sculptStrength, -2, 3.6); d.water = THREE.MathUtils.clamp(d.water + f * 0.015, 0, 1); }
    else if (tool === 'smooth') d.offset = THREE.MathUtils.lerp(d.offset, avg, f * 0.22);
    else if (tool === 'flatten') d.offset = THREE.MathUtils.lerp(d.offset, center, f * 0.42);
    else if (tool === 'erase') { d.water = Math.max(0, d.water - f * 0.22); d.stone = Math.max(0, d.stone - f * 0.22); d.vegetation = Math.max(0, d.vegetation - f * 0.32); d.offset = THREE.MathUtils.lerp(d.offset, 0, f * 0.16); }
    applyHeight(i); updateColorAt(i); changed = true;
  }
  if (['raise', 'lower', 'water', 'stone'].includes(tool)) relax(p, 0.07);
  if (changed) { position.needsUpdate = true; terrainGeometry.attributes.color.needsUpdate = true; terrainGeometry.computeVertexNormals(); scheduleDecorations(); scheduleSave(); }
}

function rulesFor(code) { if (code === 0) return { grass: 0.82, tree: 0.94, flower: 0.9, rock: 0.988, stride: 3 }; if (code === 2) return { grass: 0.46, tree: 0.75, flower: 0.72, rock: 0.955, stride: 1 }; return { grass: 0.62, tree: 0.84, flower: 0.82, rock: 0.975, stride: 2 }; }
function refreshDecorations() {
  clearGroup(vegetation); clearGroup(rocks);
  for (let i = 0; i < position.count; i += 19) {
    const x = position.getX(i), z = position.getZ(i), d = terrainData[i]; if (Math.abs(x) > size * 0.48 || Math.abs(z) > size * 0.48) continue;
    const r = rulesFor(d.density ?? 1), n = noise(x * 1.7, z * 1.7), slope = slopeAt(i), b = biomeAt(x, z); if ((i / 19) % r.stride !== 0) continue;
    if (d.water < 0.18 && d.vegetation > 0.20 && slope < 0.42 && n > r.grass) {
      const scale = 0.55 + noise(x + 4, z - 2) * 0.56;
      if (d.vegetation > 0.55 && n > r.tree) addTree(x, z, scale);
      else if (b === 'plains' && n > r.flower) addFlower(x, z, scale);
      else addGrass(x, z, scale);
    }
    if (d.water < 0.25 && (d.stone > 0.6 || slope > 0.82 || (b === 'coast' && n > r.rock))) addRock(x + (n - 0.5) * 0.5, z + (noise(z, x) - 0.5) * 0.5, 0.22 + n * 0.28);
  }
}
function scheduleDecorations() { clearTimeout(decoTimer); decoTimer = setTimeout(refreshDecorations, 160); }
function updateSky() { const t = timeOfDay; const day = Math.max(0, Math.sin(t * Math.PI)); const dusk = 1 - Math.abs(t - 0.5) * 2; const skyColor = new THREE.Color(0x17213a).lerp(new THREE.Color(0xdbe7e5), day).lerp(new THREE.Color(0xf0d2ad), Math.max(0, dusk - 0.72) * 0.75); scene.background = skyColor; scene.fog.color.copy(skyColor); sky.material.color.copy(skyColor); sun.intensity = 0.35 + day * 2.25; moon.intensity = 0.75 * (1 - day); hemi.intensity = 0.45 + day * 1.45; const angle = t * Math.PI * 2 - Math.PI * 0.2; sun.position.set(Math.cos(angle) * 18, Math.sin(angle) * 18, 10); sunDisk.position.copy(sun.position); moon.position.set(-sun.position.x, -sun.position.y, -sun.position.z); moonDisk.position.copy(moon.position); sunDisk.visible = sun.position.y > -1; moonDisk.visible = moon.position.y > -1; cloudMat.opacity = 0.18 + day * 0.42; water.material.color.copy(new THREE.Color(0x5d6f80).lerp(new THREE.Color(0x8bb5b5), day)); }
function updateBrush(e) { if (mode !== 'edit') { brush.visible = false; return null; } const p = pickPoint(e); brush.position.x = p.x; brush.position.z = p.z; brush.visible = true; return p; }
function showInfo() { infoPanel.classList.remove('is-hidden'); clearTimeout(infoTimer); infoTimer = setTimeout(() => infoPanel.classList.add('is-hidden'), 5200); }
function resetCamera() { controls.target.set(0, 0, 0); camera.position.set(16, 16, 24); controls.update(); }
function setBrushLock(v) { brushLock = v; app.dataset.brushLock = v ? 'on' : 'off'; brushLockBtn.textContent = v ? 'Pincel: continuo' : 'Pincel: toque'; brushLockBtn.classList.toggle('is-active', v); controls.enabled = !(mode === 'edit' && v); }
function setMode(m) { mode = m; app.dataset.mode = m; const editing = m === 'edit'; modeBtn.textContent = editing ? 'Editar' : 'Explorar'; modeBtn.classList.toggle('primary', !editing); if (!editing) setBrushLock(false); else controls.enabled = !brushLock; brush.visible = false; showInfo(); }
function setTool(t) { currentTool = t; tools.forEach(b => b.classList.toggle('active', b.dataset.tool === t)); }
function setBrushSize(n) { const sizes = { small: 1.25, medium: 2.6, large: 4.8 }; brushRadius = sizes[n] ?? sizes.medium; sizeButtons.forEach(b => b.classList.toggle('active', b.dataset.size === n)); rebuildBrush(); }
function bindPress(el, fn) { el?.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); }); el?.addEventListener('pointerup', e => { e.preventDefault(); e.stopPropagation(); fn(e); }); el?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }); }

renderer.domElement.addEventListener('pointerdown', e => { const p = pickPoint(e); downAt = { x: e.clientX, y: e.clientY, point: p, historySaved: false }; updateBrush(e); if (mode === 'edit' && brushLock) { pushHistory(); downAt.historySaved = true; paintAt(p, currentTool, { skipHistory: true }); } });
renderer.domElement.addEventListener('pointermove', e => { const p = updateBrush(e); if (mode === 'edit' && brushLock && downAt && p) paintAt(p, currentTool, { skipHistory: true }); });
renderer.domElement.addEventListener('pointerup', e => { if (!downAt) return; const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y), now = performance.now(); if (mode === 'edit' && !brushLock && moved <= tapMoveLimit) paintAt(downAt.point, currentTool); if (mode === 'edit' && brushLock && downAt.historySaved) scheduleSave(); if (mode === 'explore' && moved <= tapMoveLimit) { const same = lastTap ? Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 34 : false; if (lastTap && same && now - lastTap.time < 340) { resetCamera(); lastTap = null; } else lastTap = { x: e.clientX, y: e.clientY, time: now }; } downAt = null; });
renderer.domElement.addEventListener('pointerleave', () => { downAt = null; brush.visible = false; });
renderer.domElement.addEventListener('dblclick', resetCamera);

bindPress(modeBtn, () => setMode(mode === 'explore' ? 'edit' : 'explore'));
bindPress(brushLockBtn, () => { setBrushLock(!brushLock); showInfo(); });
bindPress(hideUiBtn, () => { app.classList.toggle('ui-hidden'); hideUiBtn.textContent = app.classList.contains('ui-hidden') ? '☰' : '👁️'; });
bindPress(helpBtn, showInfo); bindPress(undoBtn, undo); bindPress(redoBtn, redo);
bindPress(seedBtn, () => { pushHistory(); generateSeedWorld(); });
bindPress(resetBtn, () => { pushHistory(); generateSeedWorld(seedSalt); });
tools.forEach(b => bindPress(b, () => setTool(b.dataset.tool))); sizeButtons.forEach(b => bindPress(b, () => setBrushSize(b.dataset.size)));
densitySelect?.addEventListener('change', e => { density = e.target.value; scheduleSave(); });
timeSlider?.addEventListener('input', e => { timeOfDay = Number(e.target.value); updateSky(); scheduleSave(); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

if (!loadSaved()) { generateSeedWorld(seedSalt); scheduleSave(); }
setMode('explore'); setBrushLock(false); setBrushSize('medium'); updateSky();
function animate() { controls.update(); const t = performance.now() * 0.0015; water.material.opacity = 0.18 + Math.sin(t) * 0.024; water.position.y = waterLevel + Math.sin(t * 0.8) * 0.01; cloudGroup.children.forEach((c, i) => c.position.x += Math.sin(t + i) * 0.0008); waterfalls.children.forEach((fall, index) => fall.children.forEach(child => { if (child.material && 'opacity' in child.material) child.material.opacity = 0.30 + Math.sin(t * 3 + index) * 0.04; })); renderer.render(scene, camera); requestAnimationFrame(animate); }
animate();
