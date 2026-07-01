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

const WORLD = 62;
const SEG = 116;
const WATER = -0.18;
const STORE = 'storyworlds.autosave.v091';
const MAX_HISTORY = 70;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 240);
camera.position.set(19, 16, 25);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
viewport.innerHTML = '';
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, {
  enableDamping: true,
  dampingFactor: 0.08,
  minDistance: 8,
  maxDistance: 90,
  maxPolarAngle: Math.PI * 0.55,
  enablePan: false
});
controls.target.set(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0x77816f, 1.25);
const sun = new THREE.DirectionalLight(0xffffff, 2.25);
sun.position.set(18, 24, 10);
sun.castShadow = true;
scene.add(hemi, sun);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(160, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xdce8e2, side: THREE.BackSide })
);
scene.add(sky);

const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffe8a0, depthTest: false }));
const moonDisk = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 12), new THREE.MeshBasicMaterial({ color: 0xe8edff, depthTest: false }));
sunDisk.renderOrder = moonDisk.renderOrder = 999;
scene.add(sunDisk, moonDisk);

const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false });
const clouds = new THREE.Group();
scene.add(clouds);

function addCloud(x, y, z, s) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(s * (0.45 + i * 0.05), 10, 6), cloudMat);
    p.scale.set(2.25, 0.32, 0.62);
    p.position.set(i * s * 0.42, Math.sin(i) * 0.06, Math.cos(i) * 0.11);
    g.add(p);
  }
  g.position.set(x, y, z);
  g.rotation.y = x * 0.05;
  clouds.add(g);
}
[-26, -7, 14, 28].forEach((x, i) => addCloud(x, 14 + (i % 2) * 1.5, -22 + i * 13, 1.25 + (i % 2) * 0.35));

const world = new THREE.Group();
scene.add(world);

const geom = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
geom.rotateX(-Math.PI / 2);
const pos = geom.attributes.position;
const colors = [];
const data = [];
for (let i = 0; i < pos.count; i++) {
  data[i] = { h: 0, water: 0, veg: 0, forest: 0, stone: 0, terrace: 0, path: 0 };
  colors.push(0.67, 0.72, 0.55);
}
geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

const terrain = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
terrain.receiveShadow = true;
world.add(terrain);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD, WORLD, 48, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x8cbaba, transparent: true, opacity: 0.17, roughness: 0.35 })
);
water.position.y = WATER;
world.add(water);

const generatedPlants = new THREE.Group();
const generatedTrees = new THREE.Group();
const generatedRocks = new THREE.Group();
const paintedPlants = new THREE.Group();
const paintedTrees = new THREE.Group();
const paintedRocks = new THREE.Group();
const paintedPaths = new THREE.Group();
const paintedBridges = new THREE.Group();
const paintedHouses = new THREE.Group();
world.add(generatedPlants, generatedTrees, generatedRocks, paintedPlants, paintedTrees, paintedRocks, paintedPaths, paintedBridges, paintedHouses);

const mat = color => new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0 });
const mats = {
  grass: mat(0x61784f),
  grass2: mat(0x7f9365),
  flower1: mat(0xe8cad6),
  flower2: mat(0xf0df9a),
  flower3: mat(0xd6d1ef),
  trunk: mat(0x765d42),
  leaf: mat(0x728a5e),
  leaf2: mat(0x58734f),
  palm: mat(0x6f8d58),
  rock: mat(0x9f988a),
  path: mat(0xb99b6d),
  pathEdge: mat(0xd4c197),
  bridge: mat(0x826648),
  wall: mat(0xd9c5a3),
  wall2: mat(0xcbb28f),
  roof: mat(0x8e5845),
  roof2: mat(0xa46a4e),
  door: mat(0x554232),
  white: mat(0xf1e8d4),
  shadow: mat(0x94795d)
};

let seed = Date.now() % 999999;
let currentTool = 'grass';
let mode = 'explore';
let brushLock = false;
let brushRadius = 2.6;
let pointerDown = null;
let currentDensity = 'normal';
let timeOfDay = 0.28;
let paintedPlantRecords = [];
let paintedTreeRecords = [];
let paintedRockRecords = [];
let paintedPathRecords = [];
let paintedBridgeRecords = [];
let paintedHouseRecords = [];
const undoStack = [];
const redoStack = [];

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const brushMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, side: THREE.DoubleSide });
let brush = makeBrush();
scene.add(brush);

function rand(x, z, s = seed) {
  const n = Math.sin((x + s * 0.011) * 12.9898 + (z - s * 0.017) * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
function fbm(x, z) {
  return (rand(x, z) - 0.5) + (rand(x * 1.9 + 11, z * 1.9 - 7) - 0.5) * 0.34 + (rand(x * 3.4 - 4, z * 3.4 + 9) - 0.5) * 0.12;
}
function gauss(x, z, cx, cz, r, h) {
  return Math.exp(-(((x - cx) ** 2 + (z - cz) ** 2) / (r * r))) * h;
}
function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function visibleHeight(d) {
  return d.h - d.water * 0.2 + d.stone * 0.12;
}
function nearestIndex(x, z) {
  let best = 0;
  let dist = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const dd = (pos.getX(i) - x) ** 2 + (pos.getZ(i) - z) ** 2;
    if (dd < dist) {
      dist = dd;
      best = i;
    }
  }
  return best;
}
function heightAt(x, z) {
  return pos.getY(nearestIndex(x, z));
}
function dataAt(x, z) {
  return data[nearestIndex(x, z)];
}
function biomeAt(x, z) {
  const h = heightAt(x, z);
  const d = dataAt(x, z);
  if (d.water > 0.14 || Math.abs(h - WATER) < 0.5) return 'coast';
  if (h > 1.12) return 'highland';
  if (d.forest > 0.45) return 'forest';
  return 'plains';
}
function nearWater(x, z, r = 1.15) {
  for (let a = 0; a < 8; a++) {
    if (dataAt(x + Math.cos(a * Math.PI / 4) * r, z + Math.sin(a * Math.PI / 4) * r).water > 0.18) return true;
  }
  return false;
}
function colorAt(i) {
  const d = data[i];
  const h = visibleHeight(d);
  const near = THREE.MathUtils.clamp(1 - Math.abs(h - WATER) / 0.72, 0, 1);
  const beach = near * (1 - d.water * 0.8);
  const c = new THREE.Color(0xa8b589)
    .lerp(new THREE.Color(0x74885d), d.veg * 0.14 + d.forest * 0.12)
    .lerp(new THREE.Color(0xd5c795), beach * 0.85)
    .lerp(new THREE.Color(0x8cbaba), d.water * 0.8)
    .lerp(new THREE.Color(0xb99b6d), d.path * 0.62)
    .lerp(new THREE.Color(0x9d9488), d.stone * 0.45)
    .lerp(new THREE.Color(0x927c66), Math.max(0, d.h - 1.1) * 0.08);
  geom.attributes.color.setXYZ(i, c.r, c.g, c.b);
}
function applyPoint(i) {
  pos.setY(i, visibleHeight(data[i]));
  colorAt(i);
}
function applyAllTerrain() {
  for (let i = 0; i < pos.count; i++) applyPoint(i);
  updateTerrain();
}
function updateTerrain() {
  pos.needsUpdate = true;
  geom.attributes.color.needsUpdate = true;
  geom.computeVertexNormals();
}
function clearGroup(g) {
  for (const c of [...g.children]) {
    g.remove(c);
    if (c.children) clearGroup(c);
    if (c.geometry) c.geometry.dispose();
  }
}
function clearGenerated() {
  clearGroup(generatedPlants);
  clearGroup(generatedTrees);
  clearGroup(generatedRocks);
}
function clearPainted() {
  [paintedPlants, paintedTrees, paintedRocks, paintedPaths, paintedBridges, paintedHouses].forEach(clearGroup);
}

function makeRiver(x, z, offset = 0) {
  const v = Math.sin((z + seed * 0.002 + offset) * 0.11) * 7 + Math.sin((z + offset) * 0.23) * 2.8;
  return Math.abs(x - v);
}
function generateSeed(newSeed = Math.floor(Math.random() * 999999), record = true) {
  if (record) pushHistory();
  seed = newSeed;
  clearGenerated();
  clearPainted();
  paintedPlantRecords = [];
  paintedTreeRecords = [];
  paintedRockRecords = [];
  paintedPathRecords = [];
  paintedBridgeRecords = [];
  paintedHouseRecords = [];

  const coast = rand(2, 3) > 0.55;
  const ridgeX = (rand(4, 5) - 0.5) * 18;
  const ridgeZ = (rand(7, 8) - 0.5) * 18;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = fbm(x * 0.07, z * 0.07);
    let h = n * 0.18 + gauss(x, z, ridgeX, ridgeZ, 13, 1.2) + gauss(x, z, -ridgeZ * 0.55, ridgeX * 0.35, 9, 0.8);
    const river = makeRiver(x, z);
    const rmask = 1 - smoothstep(0.36, 1.15, river + n * 0.15);
    const lake1 = gauss(x, z, (rand(20, 21) - 0.5) * 26, (rand(21, 22) - 0.5) * 26, 5.8, 1);
    const lake2 = rand(5, 6) > 0.55 ? gauss(x, z, (rand(30, 31) - 0.5) * 30, (rand(31, 32) - 0.5) * 30, 4.5, 1) : 0;
    let waterMask = Math.max(rmask * 0.72, lake1, lake2);
    if (coast) waterMask = Math.max(waterMask, smoothstep(21, 28, Math.hypot(x + 8, z - 6)));
    h -= waterMask * 0.42;
    const bank = 1 - smoothstep(0.9, 3.6, river);
    const forest = THREE.MathUtils.clamp(gauss(x, z, -10, 8, 13, 0.65) + bank * 0.28 + (rand(x * 0.18, z * 0.18) > 0.72 ? 0.22 : 0), 0, 1);
    const veg = THREE.MathUtils.clamp(0.28 + rand(x * 0.24, z * 0.24) * 0.32 + bank * 0.18 + forest * 0.18, 0, 1);
    const stone = THREE.MathUtils.clamp(Math.max(0, h - 0.9) * 0.22 + rand(x * 1.6, z * 1.6) * 0.04, 0, 0.8);
    data[i] = { h, water: THREE.MathUtils.clamp(waterMask, 0, 1), veg, forest, stone, terrace: 0, path: 0 };
  }
  applyAllTerrain();
  refreshDecorations();
  resetCamera();
  autoSave();
  updateStatus('Nuevo seed');
}

function makePetalLeaf(scale, material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 10, 7), material);
  mesh.scale.set(1.9, 0.28, 0.62);
  return mesh;
}
function addCanopyBlob(g, x, y, z, s, material) {
  const c = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), material);
  c.position.set(x, y, z);
  c.scale.set(1.12 + rand(x, z) * 0.2, 0.9, 1.02);
  g.add(c);
}
function addGrass(x, z, scale = 1, group = generatedPlants) {
  const g = new THREE.Group();
  const blades = 2 + Math.floor(rand(x, z) * 4);
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.Mesh(new THREE.SphereGeometry(0.035 * scale, 6, 4), rand(x + i, z) > 0.5 ? mats.grass : mats.grass2);
    blade.scale.set(0.55, 1.9, 0.55);
    blade.position.set((rand(x + i, z) - 0.5) * 0.52, 0.075 * scale, (rand(x, z + i) - 0.5) * 0.52);
    blade.rotation.z = (rand(x + i, z + 2) - 0.5) * 0.45;
    g.add(blade);
  }
  if (rand(x + 8, z - 4) > 0.5) {
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.035 * scale, 6, 4), [mats.flower1, mats.flower2, mats.flower3][Math.floor(rand(x, z) * 3)]);
    flower.position.set((rand(x + 2, z) - 0.5) * 0.4, 0.15 * scale, (rand(x, z + 2) - 0.5) * 0.4);
    g.add(flower);
  }
  g.position.set(x, heightAt(x, z) + 0.012, z);
  group.add(g);
}
function addTree(x, z, scale = 1, group = generatedTrees) {
  const biome = biomeAt(x, z);
  const g = new THREE.Group();
  const trunkH = biome === 'coast' ? 0.7 : biome === 'highland' ? 0.55 : 0.62;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.085 * scale, trunkH * scale, 7), mats.trunk);
  trunk.position.y = trunkH * scale * 0.5;
  g.add(trunk);

  if (biome === 'coast') {
    for (let i = 0; i < 7; i++) {
      const leaf = makePetalLeaf(scale, mats.palm);
      leaf.position.y = 0.82 * scale;
      leaf.rotation.z = Math.PI / 2.8;
      leaf.rotation.y = i * Math.PI * 2 / 7;
      g.add(leaf);
    }
  } else if (biome === 'highland') {
    addCanopyBlob(g, 0, 0.74 * scale, 0, 0.28 * scale, mats.leaf2);
    addCanopyBlob(g, -0.12 * scale, 0.95 * scale, 0.02 * scale, 0.22 * scale, mats.leaf2);
    addCanopyBlob(g, 0.14 * scale, 0.96 * scale, -0.03 * scale, 0.22 * scale, mats.leaf2);
    addCanopyBlob(g, 0.02 * scale, 1.14 * scale, 0.01 * scale, 0.18 * scale, mats.leaf2);
  } else {
    addCanopyBlob(g, 0, 0.8 * scale, 0, 0.34 * scale, mats.leaf);
    addCanopyBlob(g, -0.22 * scale, 0.72 * scale, 0.08 * scale, 0.23 * scale, mats.leaf);
    addCanopyBlob(g, 0.22 * scale, 0.74 * scale, -0.06 * scale, 0.23 * scale, mats.leaf2);
    addCanopyBlob(g, 0.02 * scale, 0.99 * scale, 0.02 * scale, 0.22 * scale, mats.leaf);
  }
  g.position.set(x, heightAt(x, z) + 0.02, z);
  g.rotation.y = rand(x, z) * Math.PI * 2;
  group.add(g);
}
function addRock(x, z, scale = 1, group = generatedRocks) {
  const g = new THREE.Group();
  const pieces = 1 + Math.floor(rand(x, z) * 3);
  for (let i = 0; i < pieces; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15 * scale * (1 - i * 0.12), 1), mats.rock);
    r.position.set((rand(x + i, z) - 0.5) * 0.45, 0.06 * scale, (rand(x, z + i) - 0.5) * 0.35);
    r.scale.set(1.15, 0.42 + rand(z, x) * 0.18, 0.8);
    r.rotation.set(rand(x, z) * 0.5, rand(x + 1, z) * Math.PI * 2, rand(x, z + 1) * 0.5);
    g.add(r);
  }
  g.position.set(x, heightAt(x, z) + 0.03, z);
  group.add(g);
}
function addPathTile(x, z, scale = 1, group = paintedPaths) {
  const g = new THREE.Group();
  const under = new THREE.Mesh(new THREE.CircleGeometry(0.32 * scale, 18), mats.pathEdge);
  under.rotation.x = -Math.PI / 2;
  under.scale.set(1.65, 0.7, 1);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.27 * scale, 18), mats.path);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.006;
  top.scale.set(1.6, 0.65, 1);
  g.add(under, top);
  g.rotation.y = rand(x, z) * Math.PI;
  g.position.set(x, heightAt(x, z) + 0.024, z);
  group.add(g);
}
function roundedRectShape(w, h, r) {
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function addBridge(x, z, scale = 1, group = paintedBridges) {
  const g = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.2 * scale, 0.05, 0), new THREE.Vector3(0, 0.32 * scale, 0), new THREE.Vector3(1.2 * scale, 0.05, 0));
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const p = curve.getPoint(t);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.12 * scale, 0.9 * scale), mats.bridge);
    plank.position.copy(p);
    plank.rotation.z = (t - 0.5) * -0.36;
    g.add(plank);
  }
  for (const side of [-1, 1]) {
    for (const px of [-0.95, 0, 0.95]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * scale, 0.052 * scale, 0.48 * scale, 6), mats.bridge);
      post.position.set(px * scale, 0.35 * scale, side * 0.46 * scale);
      g.add(post);
    }
  }
  g.position.set(x, Math.max(heightAt(x, z), WATER) + 0.08, z);
  g.rotation.y = rand(x, z) * Math.PI;
  group.add(g);
}
function addHouse(x, z, scale = 1, group = paintedHouses) {
  const g = new THREE.Group();
  const bodyShape = roundedRectShape(1.32 * scale, 0.78 * scale, 0.12 * scale);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(bodyShape, { depth: 1.05 * scale, bevelEnabled: true, bevelSize: 0.035 * scale, bevelThickness: 0.035 * scale, bevelSegments: 2 }), mats.wall);
  body.rotation.x = -Math.PI / 2;
  body.position.set(0, 0.08 * scale, 0.52 * scale);
  const sideShape = roundedRectShape(0.48 * scale, 0.54 * scale, 0.09 * scale);
  const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(sideShape, { depth: 0.78 * scale, bevelEnabled: true, bevelSize: 0.025 * scale, bevelThickness: 0.025 * scale, bevelSegments: 1 }), mats.wall2);
  wing.rotation.x = -Math.PI / 2;
  wing.position.set(0.72 * scale, 0.06 * scale, 0.38 * scale);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.78 * scale, 0);
  roofShape.lineTo(0, 0.48 * scale);
  roofShape.lineTo(0.78 * scale, 0);
  roofShape.lineTo(-0.78 * scale, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 1.2 * scale, bevelEnabled: true, bevelSize: 0.035 * scale, bevelThickness: 0.035 * scale, bevelSegments: 1 }), mats.roof);
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(0, 0.8 * scale, 0.6 * scale);
  const roof2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42 * scale, 1), mats.roof2);
  roof2.scale.set(1.05, 0.42, 0.85);
  roof2.position.set(0.72 * scale, 0.84 * scale, -0.05 * scale);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.24 * scale, 0.38 * scale), mats.door);
  door.position.set(-0.25 * scale, 0.33 * scale, 1.061 * scale);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.19 * scale, 0.16 * scale), mats.white);
  win.position.set(0.28 * scale, 0.52 * scale, 1.062 * scale);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.0 * scale, 18), mats.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  shadow.scale.set(1.2, 0.75, 1);
  g.add(shadow, body, wing, roof, roof2, door, win);
  for (let i = 0; i < 5; i++) addGrassToGroup(g, (rand(x + i, z) - 0.5) * 1.8 * scale, (rand(x, z + i) - 0.5) * 1.5 * scale, 0.55 * scale);
  g.position.set(x, heightAt(x, z) + 0.025, z);
  g.rotation.y = Math.round(rand(x, z) * 3) * Math.PI / 2;
  group.add(g);
}
function addGrassToGroup(g, x, z, scale) {
  const blade = new THREE.Mesh(new THREE.SphereGeometry(0.03 * scale, 6, 4), mats.grass);
  blade.scale.set(0.5, 1.8, 0.5);
  blade.position.set(x, 0.09 * scale, z);
  blade.rotation.z = (rand(x, z) - 0.5) * 0.35;
  g.add(blade);
}
function refreshDecorations() {
  clearGenerated();
  const mult = currentDensity === 'low' ? 0.35 : currentDensity === 'high' ? 1.05 : 0.72;
  const step = 2.45;
  for (let gx = -WORLD / 2 + 1; gx < WORLD / 2 - 1; gx += step) {
    for (let gz = -WORLD / 2 + 1; gz < WORLD / 2 - 1; gz += step) {
      const x = gx + (rand(gx * 0.73, gz * 0.41) - 0.5) * step * 1.45;
      const z = gz + (rand(gx * 0.37 + 9, gz * 0.81 - 4) - 0.5) * step * 1.45;
      if (Math.abs(x) > WORLD * 0.48 || Math.abs(z) > WORLD * 0.48) continue;
      const d = dataAt(x, z);
      const h = heightAt(x, z);
      if (d.water > 0.22 || d.path > 0.25) continue;
      const n = rand(x * 1.91 + 7, z * 1.37 - 3);
      if (d.veg > 0.18 && n > 1 - 0.28 * mult) addGrass(x, z, 0.62 + rand(x, z + 2) * 0.24);
      if (d.forest > 0.38 && n > 1 - 0.095 * mult) addTree(x, z, 0.74 + rand(x + 3, z) * 0.48);
      if ((d.stone > 0.66 || h > 1.65 || biomeAt(x, z) === 'coast') && rand(x + 9, z - 4) > 1 - 0.025 * mult) addRock(x, z, 0.2 + rand(x, z) * 0.24);
    }
  }
}
function rebuildPaintedObjects() {
  clearPainted();
  paintedPlantRecords.forEach(o => addGrass(o.x, o.z, o.s, paintedPlants));
  paintedTreeRecords.forEach(o => addTree(o.x, o.z, o.s, paintedTrees));
  paintedRockRecords.forEach(o => addRock(o.x, o.z, o.s, paintedRocks));
  paintedPathRecords.forEach(o => addPathTile(o.x, o.z, o.s, paintedPaths));
  paintedBridgeRecords.forEach(o => addBridge(o.x, o.z, o.s, paintedBridges));
  paintedHouseRecords.forEach(o => addHouse(o.x, o.z, o.s, paintedHouses));
}
function hasBridgeNear(x, z) {
  return paintedBridgeRecords.some(o => Math.hypot(o.x - x, o.z - z) < 6.2);
}
function scatterObjects(p, type) {
  const amount = type === 'grass' ? 5 : type === 'forest' ? 2 : type === 'path' ? 1 : type === 'stone' ? 1 : 1;
  for (let k = 0; k < amount; k++) {
    const a = rand(p.x + k * 7, p.z - k) * Math.PI * 2;
    const r = Math.sqrt(rand(p.x - k, p.z + k)) * brushRadius * (type === 'path' ? 0.15 : 0.72);
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    const d = dataAt(x, z);
    if (d.water > 0.22 && !['bridge', 'path'].includes(type)) continue;
    if (type === 'grass') {
      const o = { x, z, s: 0.54 + rand(x, z) * 0.28 };
      paintedPlantRecords.push(o);
      addGrass(o.x, o.z, o.s, paintedPlants);
    }
    if (type === 'forest') {
      const o = { x, z, s: 0.72 + rand(x, z) * 0.38 };
      paintedTreeRecords.push(o);
      addTree(o.x, o.z, o.s, paintedTrees);
    }
    if (type === 'stone') {
      const o = { x, z, s: 0.18 + rand(x, z) * 0.24 };
      paintedRockRecords.push(o);
      addRock(o.x, o.z, o.s, paintedRocks);
    }
    if (type === 'path') {
      const o = { x, z, s: 0.72 + rand(x, z) * 0.12 };
      paintedPathRecords.push(o);
      addPathTile(o.x, o.z, o.s, paintedPaths);
      if (nearWater(x, z, 0.95) && !hasBridgeNear(x, z)) {
        const b = { x, z, s: 0.92 };
        paintedBridgeRecords.push(b);
        addBridge(b.x, b.z, b.s, paintedBridges);
      }
    }
  }
  if (type === 'bridge') {
    const o = { x: p.x, z: p.z, s: 1 };
    paintedBridgeRecords.push(o);
    addBridge(o.x, o.z, o.s, paintedBridges);
  }
  if (type === 'house') {
    if (dataAt(p.x, p.z).water > 0.16) return;
    const o = { x: p.x, z: p.z, s: 0.9 + rand(p.x, p.z) * 0.14 };
    paintedHouseRecords.push(o);
    addHouse(o.x, o.z, o.s, paintedHouses);
  }
}
function eraseNear(p) {
  const keep = o => Math.hypot(o.x - p.x, o.z - p.z) > brushRadius;
  paintedPlantRecords = paintedPlantRecords.filter(keep);
  paintedTreeRecords = paintedTreeRecords.filter(keep);
  paintedRockRecords = paintedRockRecords.filter(keep);
  paintedPathRecords = paintedPathRecords.filter(keep);
  paintedBridgeRecords = paintedBridgeRecords.filter(keep);
  paintedHouseRecords = paintedHouseRecords.filter(keep);
  rebuildPaintedObjects();
}
function paintAt(p) {
  const target = heightAt(p.x, p.z);
  const pathRadius = brushRadius * 0.32;
  for (let i = 0; i < pos.count; i++) {
    const dist = Math.hypot(pos.getX(i) - p.x, pos.getZ(i) - p.z);
    const limit = currentTool === 'path' ? pathRadius : brushRadius;
    if (dist > limit) continue;
    const f = Math.pow(1 - dist / limit, 2.2);
    const d = data[i];
    if (currentTool === 'grass') {
      d.veg = THREE.MathUtils.clamp(d.veg + f * 0.48, 0, 1);
      d.forest = Math.max(0, d.forest - f * 0.12);
    } else if (currentTool === 'forest') {
      d.forest = THREE.MathUtils.clamp(d.forest + f * 0.38, 0, 1);
      d.veg = THREE.MathUtils.clamp(d.veg + f * 0.1, 0, 1);
    } else if (currentTool === 'water') {
      d.water = THREE.MathUtils.clamp(d.water + f * 0.14, 0, 1);
      d.h -= f * 0.018;
    } else if (currentTool === 'stone') {
      d.stone = THREE.MathUtils.clamp(d.stone + f * 0.18, 0, 1);
    } else if (currentTool === 'path') {
      d.path = THREE.MathUtils.clamp(d.path + f * 0.38, 0, 1);
      d.veg = Math.max(0, d.veg - f * 0.34);
      d.forest = Math.max(0, d.forest - f * 0.2);
    } else if (currentTool === 'raise') {
      d.h = THREE.MathUtils.clamp(d.h + f * 0.36, -2, 4.8);
      d.water = Math.max(0, d.water - f * 0.18);
    } else if (currentTool === 'lower') {
      d.h = THREE.MathUtils.clamp(d.h - f * 0.3, -2.4, 4.8);
    } else if (currentTool === 'erase') {
      d.path = Math.max(0, d.path - f * 0.6);
      d.veg = Math.max(0, d.veg - f * 0.45);
      d.forest = Math.max(0, d.forest - f * 0.35);
      d.stone = Math.max(0, d.stone - f * 0.2);
    } else if (currentTool === 'smooth') {
      d.h = THREE.MathUtils.lerp(d.h, target, f * 0.12);
    } else if (currentTool === 'flatten') {
      d.h = THREE.MathUtils.lerp(d.h, target, f * 0.34);
    }
    applyPoint(i);
  }
  if (currentTool === 'grass') scatterObjects(p, 'grass');
  if (currentTool === 'forest') scatterObjects(p, 'forest');
  if (currentTool === 'stone') scatterObjects(p, 'stone');
  if (currentTool === 'path') scatterObjects(p, 'path');
  if (currentTool === 'bridge') scatterObjects(p, 'bridge');
  if (currentTool === 'house') scatterObjects(p, 'house');
  if (currentTool === 'erase') eraseNear(p);
  updateTerrain();
  clearTimeout(window._decoTimer);
  window._decoTimer = setTimeout(refreshDecorations, 420);
}

function snapshot() {
  return JSON.stringify({ version: '0.9.1', seed, timeOfDay, currentDensity, data, paintedPlantRecords, paintedTreeRecords, paintedRockRecords, paintedPathRecords, paintedBridgeRecords, paintedHouseRecords });
}
function restoreFromString(str) {
  const s = JSON.parse(str);
  if (!s || !Array.isArray(s.data) || s.data.length !== data.length) throw new Error('Archivo incompatible');
  seed = s.seed ?? seed;
  timeOfDay = s.timeOfDay ?? timeOfDay;
  currentDensity = s.currentDensity ?? currentDensity;
  for (let i = 0; i < data.length; i++) data[i] = { h: 0, water: 0, veg: 0, forest: 0, stone: 0, terrace: 0, path: 0, ...s.data[i] };
  paintedPlantRecords = s.paintedPlantRecords || [];
  paintedTreeRecords = s.paintedTreeRecords || [];
  paintedRockRecords = s.paintedRockRecords || [];
  paintedPathRecords = s.paintedPathRecords || [];
  paintedBridgeRecords = s.paintedBridgeRecords || [];
  paintedHouseRecords = s.paintedHouseRecords || [];
  if (densitySelect) densitySelect.value = currentDensity;
  if (timeSlider) timeSlider.value = timeOfDay;
  applyAllTerrain();
  refreshDecorations();
  rebuildPaintedObjects();
  updateSky();
  autoSave();
  updateStatus('Mundo cargado');
}
function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  updateUndoRedo();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restoreFromString(undoStack.pop());
  updateUndoRedo();
  updateStatus('Undo');
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restoreFromString(redoStack.pop());
  updateUndoRedo();
  updateStatus('Redo');
}
function updateUndoRedo() {
  if (undoBtn) undoBtn.disabled = !undoStack.length;
  if (redoBtn) redoBtn.disabled = !redoStack.length;
}
function autoSave() {
  try {
    localStorage.setItem(STORE, snapshot());
    updateStatus('Autoguardado');
  } catch {}
}
function tryAutoLoad() {
  try {
    const saved = localStorage.getItem(STORE);
    if (saved) {
      restoreFromString(saved);
      updateStatus('Autoguardado cargado');
      return true;
    }
  } catch {}
  return false;
}
function downloadWorld() {
  const blob = new Blob([snapshot()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `storyworld-${seed}.storyworld`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}
function uploadWorld(file) {
  const reader = new FileReader();
  reader.onload = () => {
    pushHistory();
    try { restoreFromString(String(reader.result)); }
    catch { alert('No pude cargar este mundo.'); }
  };
  reader.readAsText(file);
}
function updateStatus(msg) {
  const hint = $('#modeHint');
  if (hint) hint.textContent = msg;
}
function pointerPoint(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const out = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, out);
  return out;
}
function makeBrush() {
  const b = new THREE.Mesh(new THREE.RingGeometry(brushRadius * 0.84, brushRadius, 64), brushMat);
  b.rotation.x = -Math.PI / 2;
  b.position.y = 0.12;
  b.visible = false;
  return b;
}
function rebuildBrush() {
  scene.remove(brush);
  brush.geometry.dispose();
  brush = makeBrush();
  scene.add(brush);
}
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
  sky.material.color.copy(skyColor);
  hemi.intensity = 0.45 + day * 1.45;
  sun.intensity = 0.25 + day * 2.1;
  const angle = timeOfDay * Math.PI * 2 - Math.PI * 0.15;
  sun.position.set(Math.cos(angle) * 22, Math.sin(angle) * 22, 10);
  sunDisk.position.set(Math.cos(angle) * 48, Math.max(8, Math.sin(angle) * 30 + 18), -34);
  moonDisk.position.set(-Math.cos(angle) * 48, Math.max(8, -Math.sin(angle) * 30 + 18), -34);
  sunDisk.visible = day > 0.08;
  moonDisk.visible = day < 0.92;
  cloudMat.opacity = 0.16 + day * 0.38;
  water.material.color.copy(new THREE.Color(0x5a6b7d).lerp(new THREE.Color(0x8cbaba), day));
}
function resetCamera() {
  camera.position.set(19, 16, 25);
  controls.target.set(0, 0, 0);
  controls.update();
}
function stop(e) {
  e.preventDefault();
  e.stopPropagation();
}
function bindButton(el, fn) {
  el?.addEventListener('pointerdown', stop);
  el?.addEventListener('pointerup', e => { stop(e); fn(); });
}

renderer.domElement.addEventListener('pointerdown', e => {
  pointerDown = { x: e.clientX, y: e.clientY, p: pointerPoint(e) };
  brush.visible = mode === 'edit';
  brush.position.set(pointerDown.p.x, 0.12, pointerDown.p.z);
  if (mode === 'edit') {
    pushHistory();
    if (brushLock && currentTool !== 'house' && currentTool !== 'bridge') paintAt(pointerDown.p);
  }
});
renderer.domElement.addEventListener('pointermove', e => {
  const p = pointerPoint(e);
  brush.visible = mode === 'edit';
  brush.position.set(p.x, 0.12, p.z);
  if (mode === 'edit' && brushLock && pointerDown && currentTool !== 'house' && currentTool !== 'bridge') paintAt(p);
});
renderer.domElement.addEventListener('pointerup', e => {
  if (!pointerDown) return;
  const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
  if (mode === 'edit' && (currentTool === 'house' || currentTool === 'bridge' || (!brushLock && moved < 8))) paintAt(pointerDown.p);
  if (mode === 'edit') autoSave();
  pointerDown = null;
});
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
loadFileInput?.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (file) uploadWorld(file);
  e.target.value = '';
});
tools.forEach(btn => bindButton(btn, () => {
  currentTool = btn.dataset.tool;
  tools.forEach(b => b.classList.toggle('active', b === btn));
}));
sizeButtons.forEach(btn => bindButton(btn, () => {
  brushRadius = btn.dataset.size === 'small' ? 1.25 : btn.dataset.size === 'large' ? 4.8 : 2.6;
  sizeButtons.forEach(b => b.classList.toggle('active', b === btn));
  rebuildBrush();
}));
densitySelect?.addEventListener('change', e => { pushHistory(); currentDensity = e.target.value; refreshDecorations(); autoSave(); });
timeSlider?.addEventListener('input', e => { timeOfDay = Number(e.target.value); updateSky(); autoSave(); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

generateSeed(seed, false);
if (!tryAutoLoad()) autoSave();
setMode('explore');
setBrushLock(false);
updateSky();
updateUndoRedo();

function animate() {
  controls.update();
  const t = performance.now() * 0.001;
  water.position.y = WATER + Math.sin(t * 1.15) * 0.01;
  water.material.opacity = 0.16 + Math.sin(t * 1.3) * 0.014;
  clouds.children.forEach((c, i) => { c.position.x += Math.sin(t + i) * 0.0008; });
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
