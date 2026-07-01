import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const viewport = $('#viewport');
const modeBtn = $('#modeBtn');
const seedBtn = $('#seedBtn');
const resetBtn = $('#resetBtn');
const hideUiBtn = $('#hideUiBtn');
const helpBtn = $('#helpBtn');
const brushLockBtn = $('#brushLockBtn');
const timeSlider = $('#timeSlider');
const densitySelect = $('#densitySelect');
const undoBtn = $('#undoBtn');
const redoBtn = $('#redoBtn');
const saveBtn = $('#saveBtn');
const loadBtn = $('#loadBtn');
const loadFileInput = $('#loadFileInput');
const tools = [...document.querySelectorAll('.tool[data-tool]')];
const sizeButtons = [...document.querySelectorAll('.size-btn')];

const WORLD = 58;
const SEG = 110;
const WATER = -0.16;
const STORAGE_KEY = 'storyworlds.autosave.v080';
const MAX_HISTORY = 80;

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
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 8, maxDistance: 85, maxPolarAngle: Math.PI * 0.54, enablePan: false });
controls.target.set(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0x7b806f, 1.35);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
scene.add(hemi, sun);

const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.MeshBasicMaterial({ color: 0xdce8e2, side: THREE.BackSide }));
scene.add(sky);
const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffe8a0, depthTest: false }));
const moonDisk = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 12), new THREE.MeshBasicMaterial({ color: 0xe8edff, depthTest: false }));
sunDisk.renderOrder = moonDisk.renderOrder = 999;
scene.add(sunDisk, moonDisk);

const clouds = new THREE.Group();
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false });
scene.add(clouds);
function addCloud(x, y, z, s) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(s * (0.55 + i * 0.08), 10, 6), cloudMat);
    p.scale.set(2, 0.38, 0.7);
    p.position.set(i * s * 0.55, Math.sin(i) * 0.08, Math.cos(i) * 0.14);
    g.add(p);
  }
  g.position.set(x, y, z);
  g.rotation.y = x * 0.07;
  clouds.add(g);
}
[-24, 6, 23, -30].forEach((x, i) => addCloud(x, 14 + (i % 3) * 1.5, -20 + i * 11, 1.2 + (i % 2) * 0.35));

const world = new THREE.Group();
scene.add(world);

const geom = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
geom.rotateX(-Math.PI / 2);
const pos = geom.attributes.position;
const colors = [];
const data = [];
for (let i = 0; i < pos.count; i++) {
  data[i] = { h: 0, water: 0, veg: 0, forest: 0, stone: 0, terrace: 0 };
  colors.push(0.68, 0.72, 0.54);
}
geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
const terrain = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
terrain.receiveShadow = true;
world.add(terrain);

const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD, 42, 42).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8cbaba, transparent: true, opacity: 0.18, roughness: 0.3 }));
water.position.y = WATER;
world.add(water);

const generatedPlants = new THREE.Group();
const generatedTrees = new THREE.Group();
const generatedRocks = new THREE.Group();
const paintedPlants = new THREE.Group();
const paintedTrees = new THREE.Group();
const paintedRocks = new THREE.Group();
world.add(generatedPlants, generatedTrees, generatedRocks, paintedPlants, paintedTrees, paintedRocks);

const mats = {
  grass: new THREE.MeshStandardMaterial({ color: 0x657c51, roughness: 0.98, side: THREE.DoubleSide }),
  grass2: new THREE.MeshStandardMaterial({ color: 0x819461, roughness: 0.98, side: THREE.DoubleSide }),
  flower1: new THREE.MeshStandardMaterial({ color: 0xe8d0d6, roughness: 0.98 }),
  flower2: new THREE.MeshStandardMaterial({ color: 0xf0e4a2, roughness: 0.98 }),
  flower3: new THREE.MeshStandardMaterial({ color: 0xd8d7ef, roughness: 0.98 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x876f4e, roughness: 0.96 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x7a935f, roughness: 0.98 }),
  pine: new THREE.MeshStandardMaterial({ color: 0x5f7651, roughness: 0.98 }),
  palm: new THREE.MeshStandardMaterial({ color: 0x6f8f58, roughness: 0.98 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x9e998c, roughness: 0.98 })
};

let seed = Date.now() % 999999;
let currentTool = 'grass';
let mode = 'explore';
let brushLock = false;
let brushRadius = 2.7;
let pointerDown = null;
let currentDensity = 'normal';
let timeOfDay = 0.28;
let paintedPlantRecords = [];
let paintedTreeRecords = [];
let paintedRockRecords = [];
const undoStack = [];
const redoStack = [];

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const brushMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
let brush = makeBrush();
scene.add(brush);

function rand(x, z, s = seed) { const n = Math.sin((x + s * 0.011) * 12.9898 + (z - s * 0.017) * 78.233) * 43758.5453; return n - Math.floor(n); }
function gauss(x, z, cx, cz, r, h) { return Math.exp(-(((x - cx) ** 2 + (z - cz) ** 2) / (r * r))) * h; }
function fbm(x, z) { return (rand(x, z) - 0.5) + (rand(x * 1.7 + 9, z * 1.7 - 5) - 0.5) * 0.28 + (rand(x * 3.1 - 3, z * 3.1 + 8) - 0.5) * 0.08; }
function smoothstep(a, b, x) { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function lerpPoint(a, b, t) { return { x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }; }
function makePath(kind, count = 7, anchor = null, salt = 0) {
  const pts = [];
  let start, end;
  if (kind === 'river') {
    const side = Math.floor(rand(40 + salt, count) * 4);
    start = side === 0 ? { x: -30, z: (rand(1 + salt, 2) - 0.5) * 44 } : side === 1 ? { x: 30, z: (rand(2 + salt, 3) - 0.5) * 44 } : side === 2 ? { x: (rand(3 + salt, 4) - 0.5) * 44, z: -30 } : { x: (rand(4 + salt, 5) - 0.5) * 44, z: 30 };
    end = { x: -start.x + (rand(6 + salt, 7) - 0.5) * 16, z: -start.z + (rand(8 + salt, 9) - 0.5) * 16 };
  } else if (kind === 'branch' && anchor) {
    start = { x: (rand(80 + salt, 1) - 0.5) * 52, z: (rand(81 + salt, 2) - 0.5) * 52 };
    end = anchor;
  } else {
    start = { x: (rand(11 + salt, 12) - 0.5) * 40, z: (rand(12 + salt, 13) - 0.5) * 40 };
    end = { x: (rand(13 + salt, 14) - 0.5) * 40, z: (rand(14 + salt, 15) - 0.5) * 40 };
  }
  const dx = end.x - start.x, dz = end.z - start.z, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len;
  const amp = kind === 'river' ? 8 + rand(20 + salt, 21) * 7 : kind === 'branch' ? 4 + rand(90 + salt, 91) * 4 : 6 + rand(22 + salt, 23) * 6;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1), base = lerpPoint(start, end, t);
    const bend = Math.sin(t * Math.PI * (1.1 + rand(i + salt, 30) * 1.8) + rand(i + salt, 31) * 3.2) * amp * (0.25 + Math.sin(t * Math.PI) * 0.95);
    pts.push({ x: base.x + nx * bend + (rand(i * 3 + salt, 50) - 0.5) * 5.5, z: base.z + nz * bend + (rand(i * 3 + salt, 51) - 0.5) * 5.5 });
  }
  return pts;
}
function distanceToSegment(px, pz, a, b) { const vx = b.x - a.x, vz = b.z - a.z, wx = px - a.x, wz = pz - a.z, c = THREE.MathUtils.clamp((wx * vx + wz * vz) / (vx * vx + vz * vz || 1), 0, 1), x = a.x + vx * c, z = a.z + vz * c; return { d: Math.hypot(px - x, pz - z), segmentT: c }; }
function distanceToPath(x, z, path) { let best = { d: Infinity, segment: 0 }; for (let i = 0; i < path.length - 1; i++) { const r = distanceToSegment(x, z, path[i], path[i + 1]); if (r.d < best.d) best = { ...r, segment: i }; } return best; }
function visibleHeight(d) { return d.h - d.water * 0.22 + d.stone * 0.16; }
function colorAt(i) {
  const d = data[i], h = visibleHeight(d), near = THREE.MathUtils.clamp(1 - Math.abs(h - WATER) / 0.68, 0, 1), beach = near * (1 - d.water * 0.75);
  const c = new THREE.Color(0xaab486).lerp(new THREE.Color(0xb8c195), 0.24).lerp(new THREE.Color(0x74885d), d.veg * 0.14 + d.forest * 0.08).lerp(new THREE.Color(0xd6c99c), beach * 0.88).lerp(new THREE.Color(0x8cbaba), d.water * 0.78).lerp(new THREE.Color(0xa8a195), d.stone * 0.65).lerp(new THREE.Color(0xb8ad85), d.terrace * 0.18).lerp(new THREE.Color(0x9d9078), Math.max(0, d.h - 1) * 0.08);
  geom.attributes.color.setXYZ(i, c.r, c.g, c.b);
}
function applyPoint(i) { pos.setY(i, visibleHeight(data[i])); colorAt(i); }
function updateTerrain() { pos.needsUpdate = true; geom.attributes.color.needsUpdate = true; geom.computeVertexNormals(); }
function nearestIndex(x, z) { let best = 0, dist = Infinity; for (let i = 0; i < pos.count; i++) { const d = (pos.getX(i) - x) ** 2 + (pos.getZ(i) - z) ** 2; if (d < dist) { dist = d; best = i; } } return best; }
function heightAt(x, z) { return pos.getY(nearestIndex(x, z)); }
function dataAt(x, z) { return data[nearestIndex(x, z)]; }
function biomeAt(x, z) { const h = heightAt(x, z), d = dataAt(x, z); if (d.water > 0.14 || Math.abs(h - WATER) < 0.5) return 'coast'; if (h > 1.05) return 'highland'; if (d.forest > 0.5) return 'forest'; return 'plains'; }
function clearGroup(g) { for (const c of [...g.children]) { g.remove(c); if (c.children) clearGroup(c); if (c.geometry) c.geometry.dispose(); } }
function clearGenerated() { clearGroup(generatedPlants); clearGroup(generatedTrees); clearGroup(generatedRocks); }
function clearPainted() { clearGroup(paintedPlants); clearGroup(paintedTrees); clearGroup(paintedRocks); }
function clearAllObjects() { clearGenerated(); clearPainted(); }
function smoothGeneratedSurface() {
  const next = data.map(d => ({ ...d }));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), d = data[i];
      if (d.water > 0.62) continue;
      let sum = d.h, count = 1;
      for (let j = 0; j < pos.count; j += 13) if (Math.hypot(pos.getX(j) - x, pos.getZ(j) - z) < 1.15) { sum += data[j].h; count++; }
      next[i].h = THREE.MathUtils.lerp(d.h, sum / count, 0.32);
    }
    for (let i = 0; i < pos.count; i++) data[i].h = next[i].h;
  }
}
function applyTerraces() { for (let i = 0; i < pos.count; i++) { const d = data[i]; if (d.water > 0.28 || d.h < 0.42) continue; const step = 0.34, level = Math.round(d.h / step) * step, mask = THREE.MathUtils.clamp((d.h - 0.42) / 1.6, 0, 0.52) * d.terrace; d.h = THREE.MathUtils.lerp(d.h, level, mask); } }

function generateSeed(newSeed = Math.floor(Math.random() * 999999), record = true) {
  if (record) pushHistory();
  seed = newSeed;
  clearAllObjects();
  paintedPlantRecords = [];
  paintedTreeRecords = [];
  paintedRockRecords = [];
  const seedType = Math.floor(rand(10, 20) * 6);
  const riverPath = makePath('river', 9);
  const riverAnchor = riverPath[Math.floor(2 + rand(33, 44) * (riverPath.length - 4))];
  const branches = Array.from({ length: 1 + Math.floor(rand(55, 66) * 3) }, (_, k) => makePath('branch', 5 + Math.floor(rand(70 + k, 71) * 3), riverAnchor, 100 + k * 19));
  const ridgeAPath = makePath('ridge', 6, null, 210), ridgeBPath = makePath('ridge', 5, null, 310);
  const lakeA = { x: (rand(7, 9) - 0.5) * 26, z: (rand(9, 7) - 0.5) * 26, r: 4.2 + rand(1, 9) * 3 };
  const lakeB = { x: (rand(13, 19) - 0.5) * 32, z: (rand(19, 13) - 0.5) * 32, r: 3 + rand(2, 8) * 2.3 };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), river = distanceToPath(x, z, riverPath), ridgeA = distanceToPath(x, z, ridgeAPath), ridgeB = distanceToPath(x, z, ridgeBPath), organic = fbm(x * 0.08, z * 0.08), shape = fbm(x * 0.14 + 11, z * 0.14 - 8);
    let h = organic * 0.1 + shape * 0.032, w = 0, veg = 0.2 + rand(x * 0.25, z * 0.25) * 0.28, forest = 0, stone = 0, terrace = 0;
    const riverWidth = 0.34 + rand(river.segment + 6, river.segment + 8) * 0.48, riverMask = 1 - smoothstep(riverWidth, riverWidth + 0.78, river.d + organic * 0.16), bankMask = 1 - smoothstep(riverWidth + 0.55, riverWidth + 2.7, river.d + organic * 0.25);
    let branchMask = 0, branchBank = 0;
    for (let b = 0; b < branches.length; b++) { const br = distanceToPath(x, z, branches[b]), bw = 0.2 + rand(200 + b, br.segment + 3) * 0.28, m = 1 - smoothstep(bw, bw + 0.56, br.d + shape * 0.1); branchMask = Math.max(branchMask, m * 0.58); branchBank = Math.max(branchBank, 1 - smoothstep(bw + 0.42, bw + 1.7, br.d + shape * 0.14)); }
    const lakeMaskA = 1 - smoothstep(lakeA.r, lakeA.r + 2.1, Math.hypot(x - lakeA.x, z - lakeA.z) + shape * 0.42), lakeMaskB = seedType % 2 === 0 ? 1 - smoothstep(lakeB.r, lakeB.r + 2, Math.hypot(x - lakeB.x, z - lakeB.z) + organic * 0.42) : 0;
    if (seedType === 0) { h += (1 - smoothstep(4, 13, ridgeA.d + organic * 0.7)) * (1.05 + shape * 0.12); h += gauss(x, z, -12 + organic, 10, 11, 0.86); forest += gauss(x, z, -13, 8, 12, 0.72) + bankMask * 0.25 + branchBank * 0.18; terrace += (1 - smoothstep(5, 12, ridgeA.d)) * 0.28; }
    else if (seedType === 1) { h += (1 - smoothstep(2.4, 9, ridgeA.d + organic * 0.6)) * 2.05; h += gauss(x, z, 5 + organic, -3, 7, 1.32); stone += 0.26 + (1 - smoothstep(3, 8, ridgeA.d)) * 0.34; forest += (1 - smoothstep(8, 16, ridgeA.d)) * 0.2; terrace += (1 - smoothstep(4, 11, ridgeA.d)) * 0.54; }
    else if (seedType === 2) { const coast = Math.hypot(x + organic, z - shape); h += gauss(x, z, 0, 0, 18, 1.12) - Math.max(0, coast - 15) * 0.16; w = Math.max(w, smoothstep(14.5, 21, coast + organic * 0.55)); forest += 0.28 + gauss(x, z, -7, 4, 9, 0.42); terrace += smoothstep(6, 14, coast) * 0.22; }
    else if (seedType === 3) { const canyonWidth = 1.05 + rand(80, 81) * 0.62, canyon = 1 - smoothstep(canyonWidth, canyonWidth + 2.3, river.d + shape * 0.15); h += (1 - smoothstep(4, 15, ridgeA.d)) * 1.16 + (1 - smoothstep(4, 14, ridgeB.d)) * 0.82; h -= canyon * 1.28; stone += 0.34 + canyon * 0.22; veg -= 0.05; terrace += canyon * 0.45 + (1 - smoothstep(4, 12, ridgeB.d)) * 0.3; }
    else if (seedType === 4) { h += gauss(x, z, -3 + organic, 1 + shape, 6.6, 2.72) - gauss(x, z, -2, 1, 2.4, 1.24); h += (1 - smoothstep(5, 13, ridgeB.d + organic * 0.35)) * 0.76; stone += 0.4; forest += gauss(x, z, -15, 12, 10, 0.4); terrace += (1 - smoothstep(4, 11, ridgeB.d)) * 0.42; }
    else { h += (1 - smoothstep(3, 11, ridgeA.d + organic * 0.6)) * 1.43; h += (1 - smoothstep(4, 12, ridgeB.d - shape * 0.4)) * 0.9; forest += gauss(x, z, 9, 9, 11, 0.72) + gauss(x, z, -14, -4, 9, 0.48); stone += 0.14; terrace += Math.max(1 - smoothstep(4, 13, ridgeA.d), 1 - smoothstep(5, 14, ridgeB.d)) * 0.36; }
    h -= riverMask * 0.28; h -= branchMask * 0.16; h -= Math.max(lakeMaskA, lakeMaskB) * 0.48;
    w = Math.max(w, riverMask * 0.72, branchMask * 0.5, lakeMaskA, lakeMaskB);
    veg = THREE.MathUtils.clamp(veg + forest * 0.2 + bankMask * 0.28 + branchBank * 0.22 - stone * 0.06, 0, 1);
    forest = THREE.MathUtils.clamp(forest + bankMask * 0.2 + branchBank * 0.18 + (rand(x * 0.19, z * 0.19) > 0.68 ? 0.24 : 0), 0, 1);
    stone = THREE.MathUtils.clamp(stone + Math.max(0, h - 0.9) * 0.16 + Math.max(0, 1 - smoothstep(3, 7, ridgeA.d)) * 0.18 + rand(x * 1.8, z * 1.8) * 0.02, 0, 0.85);
    data[i] = { h, water: THREE.MathUtils.clamp(w, 0, 1), veg, forest, stone, terrace: THREE.MathUtils.clamp(terrace, 0, 1) };
  }
  smoothGeneratedSurface(); applyTerraces(); applyAllTerrain(); refreshDecorations(); resetCamera(); autoSave(); updateStatus('Nuevo seed');
}
function applyAllTerrain() { for (let i = 0; i < pos.count; i++) applyPoint(i); updateTerrain(); }

function addGrass(x, z, scale = 1, group = generatedPlants) {
  const g = new THREE.Group(), count = 4 + Math.floor(rand(x, z) * 6);
  for (let i = 0; i < count; i++) { const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.035 * scale, 0.13 * scale), rand(x + i, z) > 0.5 ? mats.grass : mats.grass2); blade.position.set((rand(x + i, z) - 0.5) * 0.42, 0.06 * scale, (rand(x, z + i) - 0.5) * 0.42); blade.rotation.set(0, rand(x + i * 3, z) * Math.PI, (rand(x + i * 2, z) - 0.5) * 0.32); g.add(blade); }
  const flowerMats = [mats.flower1, mats.flower2, mats.flower3], flowers = rand(x + 4, z - 1) > 0.48 ? 1 + Math.floor(rand(x - 2, z + 8) * 3) : 0;
  for (let i = 0; i < flowers; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.026 * scale, 6, 4), flowerMats[Math.floor(rand(x + i * 9, z - i) * flowerMats.length)]); f.position.set((rand(x, z + 3 + i) - 0.5) * 0.34, 0.095 * scale, (rand(x + 3 + i, z) - 0.5) * 0.34); g.add(f); }
  g.position.set(x, heightAt(x, z) + 0.014, z); group.add(g);
}
function addTree(x, z, scale = 1, group = generatedTrees) {
  const biome = biomeAt(x, z), g = new THREE.Group(), trunkH = biome === 'coast' ? 0.72 : biome === 'highland' ? 0.38 : 0.46;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * scale, 0.07 * scale, trunkH * scale, 6), mats.trunk); trunk.position.y = trunkH * scale * 0.5; g.add(trunk);
  if (biome === 'coast') for (let i = 0; i < 5; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09 * scale, 0.56 * scale, 5), mats.palm); leaf.position.y = 0.78 * scale; leaf.rotation.z = Math.PI / 2.7; leaf.rotation.y = i * Math.PI * 0.4; g.add(leaf); }
  else if (biome === 'highland') { const pine = new THREE.Mesh(new THREE.ConeGeometry(0.28 * scale, 0.78 * scale, 7), mats.pine); pine.position.y = 0.66 * scale; g.add(pine); }
  else { const crown = new THREE.Mesh(new THREE.SphereGeometry(0.32 * scale, 8, 6), mats.leaf); crown.scale.set(1.1, 0.86, 1); crown.position.y = 0.7 * scale; g.add(crown); }
  g.position.set(x, heightAt(x, z) + 0.02, z); g.rotation.y = rand(x, z) * Math.PI * 2; group.add(g);
}
function addRock(x, z, scale = 1, group = generatedRocks) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 * scale, 1), mats.rock); r.position.set(x, heightAt(x, z) + 0.07 * scale, z); r.scale.set(0.8 + rand(x, z) * 0.7, 0.42 + rand(z, x) * 0.26, 0.68 + rand(x + 4, z) * 0.5); r.rotation.set(rand(x, z) * 0.6, rand(x + 1, z) * Math.PI * 2, rand(x, z + 1) * 0.5); group.add(r); }
function refreshDecorations() {
  clearGenerated();
  const mult = currentDensity === 'low' ? 0.55 : currentDensity === 'high' ? 1.85 : 1.18, step = 1.9;
  for (let gx = -WORLD / 2 + 1; gx < WORLD / 2 - 1; gx += step) for (let gz = -WORLD / 2 + 1; gz < WORLD / 2 - 1; gz += step) {
    const jx = (rand(gx * 0.73, gz * 0.41) - 0.5) * step * 1.35, jz = (rand(gx * 0.37 + 9, gz * 0.81 - 4) - 0.5) * step * 1.35, x = gx + jx, z = gz + jz;
    if (Math.abs(x) > WORLD * 0.48 || Math.abs(z) > WORLD * 0.48) continue;
    const d = dataAt(x, z), h = heightAt(x, z); if (d.water > 0.22) continue;
    const n = rand(x * 1.91 + 7, z * 1.37 - 3);
    if (d.veg > 0.16 && n > 1 - 0.56 * mult) addGrass(x, z, 0.74 + rand(x, z + 2) * 0.44, generatedPlants);
    if (d.forest > 0.36 && n > 1 - 0.1 * mult) addTree(x, z, 0.65 + rand(x + 3, z) * 0.58, generatedTrees);
    if ((d.stone > 0.62 || h > 1.6 || biomeAt(x, z) === 'coast') && rand(x + 9, z - 4) > 1 - 0.045 * mult) addRock(x, z, 0.2 + rand(x, z) * 0.32, generatedRocks);
  }
}
function rebuildPaintedObjects() { clearPainted(); paintedPlantRecords.forEach(o => addGrass(o.x, o.z, o.s, paintedPlants)); paintedTreeRecords.forEach(o => addTree(o.x, o.z, o.s, paintedTrees)); paintedRockRecords.forEach(o => addRock(o.x, o.z, o.s, paintedRocks)); }
function scatterBrushObjects(p, type) {
  const amount = type === 'grass' ? 12 : type === 'forest' ? 4 : 3;
  for (let k = 0; k < amount; k++) {
    const a = rand(p.x + k * 7, p.z - k) * Math.PI * 2, r = Math.sqrt(rand(p.x - k, p.z + k)) * brushRadius * 0.9, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, d = dataAt(x, z);
    if (d.water > 0.22) continue;
    if (type === 'grass') { const o = { x, z, s: 0.78 + rand(x, z) * 0.45 }; paintedPlantRecords.push(o); addGrass(o.x, o.z, o.s, paintedPlants); }
    if (type === 'forest') { const o = { x, z, s: 0.65 + rand(x, z) * 0.5 }; paintedTreeRecords.push(o); addTree(o.x, o.z, o.s, paintedTrees); }
    if (type === 'stone') { const o = { x, z, s: 0.22 + rand(x, z) * 0.35 }; paintedRockRecords.push(o); addRock(o.x, o.z, o.s, paintedRocks); }
  }
}
function erasePaintedNear(p) {
  const keepFar = o => Math.hypot(o.x - p.x, o.z - p.z) > brushRadius;
  paintedPlantRecords = paintedPlantRecords.filter(keepFar);
  paintedTreeRecords = paintedTreeRecords.filter(keepFar);
  paintedRockRecords = paintedRockRecords.filter(keepFar);
  rebuildPaintedObjects();
}
function paintAt(p) {
  const target = heightAt(p.x, p.z);
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - p.x, dz = pos.getZ(i) - p.z, dist = Math.hypot(dx, dz); if (dist > brushRadius) continue;
    const f = Math.pow(1 - dist / brushRadius, 2.2), d = data[i];
    if (currentTool === 'grass') { d.veg = THREE.MathUtils.clamp(d.veg + f * 0.72, 0, 1); d.forest = Math.max(0, d.forest - f * 0.2); d.water = Math.max(0, d.water - f * 0.04); }
    else if (currentTool === 'forest') { d.forest = THREE.MathUtils.clamp(d.forest + f * 0.52, 0, 1); d.veg = THREE.MathUtils.clamp(d.veg + f * 0.16, 0, 1); d.water = Math.max(0, d.water - f * 0.04); }
    else if (currentTool === 'water') { d.water = THREE.MathUtils.clamp(d.water + f * 0.14, 0, 1); d.h -= f * 0.018; }
    else if (currentTool === 'stone') { d.stone = THREE.MathUtils.clamp(d.stone + f * 0.18, 0, 1); }
    else if (currentTool === 'raise') { d.h = THREE.MathUtils.clamp(d.h + f * 0.36, -2, 4.6); d.water = Math.max(0, d.water - f * 0.18); d.stone = THREE.MathUtils.clamp(d.stone + f * 0.035, 0, 1); }
    else if (currentTool === 'lower') { d.h = THREE.MathUtils.clamp(d.h - f * 0.3, -2.4, 4.6); d.water = THREE.MathUtils.clamp(d.water + f * 0.02, 0, 1); }
    else if (currentTool === 'erase') { d.water = Math.max(0, d.water - f * 0.2); d.veg = Math.max(0, d.veg - f * 0.45); d.forest = Math.max(0, d.forest - f * 0.35); d.stone = Math.max(0, d.stone - f * 0.2); }
    else if (currentTool === 'smooth') d.h = THREE.MathUtils.lerp(d.h, target, f * 0.12);
    else if (currentTool === 'flatten') d.h = THREE.MathUtils.lerp(d.h, target, f * 0.34);
    applyPoint(i);
  }
  if (currentTool === 'grass') scatterBrushObjects(p, 'grass');
  if (currentTool === 'forest') scatterBrushObjects(p, 'forest');
  if (currentTool === 'stone') scatterBrushObjects(p, 'stone');
  if (currentTool === 'erase') erasePaintedNear(p);
  updateTerrain(); clearTimeout(window._decoTimer); window._decoTimer = setTimeout(refreshDecorations, 420);
}

function snapshot() { return JSON.stringify({ version: '0.8.0', seed, timeOfDay, currentDensity, data, paintedPlantRecords, paintedTreeRecords, paintedRockRecords }); }
function restoreFromString(str) {
  const s = JSON.parse(str);
  if (!s || !Array.isArray(s.data) || s.data.length !== data.length) throw new Error('Archivo incompatible');
  seed = s.seed ?? seed; timeOfDay = s.timeOfDay ?? timeOfDay; currentDensity = s.currentDensity ?? currentDensity;
  for (let i = 0; i < data.length; i++) data[i] = { h: 0, water: 0, veg: 0, forest: 0, stone: 0, terrace: 0, ...s.data[i] };
  paintedPlantRecords = s.paintedPlantRecords || [];
  paintedTreeRecords = s.paintedTreeRecords || [];
  paintedRockRecords = s.paintedRockRecords || [];
  if (densitySelect) densitySelect.value = currentDensity;
  if (timeSlider) timeSlider.value = timeOfDay;
  applyAllTerrain(); refreshDecorations(); rebuildPaintedObjects(); updateSky(); autoSave(); updateStatus('Mundo cargado');
}
function pushHistory() { undoStack.push(snapshot()); if (undoStack.length > MAX_HISTORY) undoStack.shift(); redoStack.length = 0; updateUndoRedo(); }
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restoreFromString(undoStack.pop()); updateUndoRedo(); updateStatus('Undo'); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restoreFromString(redoStack.pop()); updateUndoRedo(); updateStatus('Redo'); }
function updateUndoRedo() { if (undoBtn) undoBtn.disabled = !undoStack.length; if (redoBtn) redoBtn.disabled = !redoStack.length; }
function autoSave() { try { localStorage.setItem(STORAGE_KEY, snapshot()); updateStatus('Autoguardado'); } catch {} }
function tryAutoLoad() { try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) { restoreFromString(saved); updateStatus('Autoguardado cargado'); return true; } } catch {} return false; }
function downloadWorld() { const blob = new Blob([snapshot()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `storyworld-${seed}.storyworld`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 800); updateStatus('Descargado'); }
function uploadWorld(file) { const reader = new FileReader(); reader.onload = () => { pushHistory(); try { restoreFromString(String(reader.result)); } catch (e) { alert('No pude cargar este mundo.'); } }; reader.readAsText(file); }
function updateStatus(msg) { const hint = $('#modeHint'); if (hint) hint.textContent = msg; }

function pointerPoint(e) { const r = renderer.domElement.getBoundingClientRect(); pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1; pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1; raycaster.setFromCamera(pointer, camera); const out = new THREE.Vector3(); raycaster.ray.intersectPlane(plane, out); return out; }
function makeBrush() { const b = new THREE.Mesh(new THREE.RingGeometry(brushRadius * 0.84, brushRadius, 64), brushMat); b.rotation.x = -Math.PI / 2; b.position.y = 0.12; b.visible = false; return b; }
function rebuildBrush() { scene.remove(brush); brush.geometry.dispose(); brush = makeBrush(); scene.add(brush); }
function setMode(next) { mode = next; app.dataset.mode = mode; modeBtn.textContent = mode === 'edit' ? 'Editar' : 'Explorar'; modeBtn.classList.toggle('primary', mode === 'explore'); controls.enabled = !(mode === 'edit' && brushLock); }
function setBrushLock(v) { brushLock = v; brushLockBtn.textContent = v ? 'Pincel: continuo' : 'Pincel: toque'; brushLockBtn.classList.toggle('is-active', v); controls.enabled = !(mode === 'edit' && brushLock); }
function updateSky() {
  const day = Math.max(0, Math.sin(timeOfDay * Math.PI)), skyColor = new THREE.Color(0x17213a).lerp(new THREE.Color(0xdce8e2), day);
  scene.background = skyColor; sky.material.color.copy(skyColor); hemi.intensity = 0.45 + day * 1.45; sun.intensity = 0.25 + day * 2.1;
  const angle = timeOfDay * Math.PI * 2 - Math.PI * 0.15; sun.position.set(Math.cos(angle) * 22, Math.sin(angle) * 22, 10);
  sunDisk.position.set(Math.cos(angle) * 48, Math.max(8, Math.sin(angle) * 30 + 18), -34); moonDisk.position.set(-Math.cos(angle) * 48, Math.max(8, -Math.sin(angle) * 30 + 18), -34);
  sunDisk.visible = day > 0.08; moonDisk.visible = day < 0.92; cloudMat.opacity = 0.16 + day * 0.38; water.material.color.copy(new THREE.Color(0x5a6b7d).lerp(new THREE.Color(0x8cbaba), day));
}
function resetCamera() { camera.position.set(18, 16, 24); controls.target.set(0, 0, 0); controls.update(); }
function stop(e) { e.preventDefault(); e.stopPropagation(); }
function bindButton(el, fn) { el?.addEventListener('pointerdown', stop); el?.addEventListener('pointerup', e => { stop(e); fn(); }); }

renderer.domElement.addEventListener('pointerdown', e => { pointerDown = { x: e.clientX, y: e.clientY, p: pointerPoint(e), history: false }; brush.visible = mode === 'edit'; brush.position.set(pointerDown.p.x, 0.12, pointerDown.p.z); if (mode === 'edit') { pushHistory(); pointerDown.history = true; if (brushLock) paintAt(pointerDown.p); } });
renderer.domElement.addEventListener('pointermove', e => { const p = pointerPoint(e); brush.visible = mode === 'edit'; brush.position.set(p.x, 0.12, p.z); if (mode === 'edit' && brushLock && pointerDown) paintAt(p); });
renderer.domElement.addEventListener('pointerup', e => { if (!pointerDown) return; const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y); if (mode === 'edit' && !brushLock && moved < 8) paintAt(pointerDown.p); if (mode === 'edit') autoSave(); pointerDown = null; });
renderer.domElement.addEventListener('dblclick', resetCamera);

bindButton(modeBtn, () => setMode(mode === 'explore' ? 'edit' : 'explore'));
bindButton(seedBtn, () => generateSeed());
bindButton(resetBtn, () => { pushHistory(); generateSeed(seed, false); });
bindButton(hideUiBtn, () => { app.classList.toggle('ui-hidden'); hideUiBtn.textContent = app.classList.contains('ui-hidden') ? '☰' : '👁️'; });
bindButton(helpBtn, () => $('#infoPanel')?.classList.toggle('is-hidden'));
bindButton(brushLockBtn, () => setBrushLock(!brushLock));
bindButton(undoBtn, undo);
bindButton(redoBtn, redo);
bindButton(saveBtn, downloadWorld);
bindButton(loadBtn, () => loadFileInput?.click());
loadFileInput?.addEventListener('change', e => { const file = e.target.files?.[0]; if (file) uploadWorld(file); e.target.value = ''; });
tools.forEach(btn => bindButton(btn, () => { currentTool = btn.dataset.tool; tools.forEach(b => b.classList.toggle('active', b === btn)); }));
sizeButtons.forEach(btn => bindButton(btn, () => { brushRadius = btn.dataset.size === 'small' ? 1.25 : btn.dataset.size === 'large' ? 4.8 : 2.7; sizeButtons.forEach(b => b.classList.toggle('active', b === btn)); rebuildBrush(); }));
densitySelect?.addEventListener('change', e => { pushHistory(); currentDensity = e.target.value; refreshDecorations(); autoSave(); });
timeSlider?.addEventListener('input', e => { timeOfDay = Number(e.target.value); updateSky(); autoSave(); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

generateSeed(seed, false);
if (!tryAutoLoad()) autoSave();
setMode('explore'); setBrushLock(false); updateSky(); updateUndoRedo();
function animate() { controls.update(); const t = performance.now() * 0.001; water.position.y = WATER + Math.sin(t * 1.2) * 0.012; water.material.opacity = 0.17 + Math.sin(t * 1.3) * 0.015; clouds.children.forEach((c, i) => c.position.x += Math.sin(t + i) * 0.0008); renderer.render(scene, camera); requestAnimationFrame(animate); }
animate();
