import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const app = document.querySelector('#app');
const viewport = document.querySelector('#viewport');
const resetBtn = document.querySelector('#resetBtn');
const modeBtn = document.querySelector('#modeBtn');
const hideUiBtn = document.querySelector('#hideUiBtn');
const helpBtn = document.querySelector('#helpBtn');
const brushLockBtn = document.querySelector('#brushLockBtn');
const modeHint = document.querySelector('#modeHint');
const infoPanel = document.querySelector('#infoPanel');
const tools = document.querySelectorAll('.tool[data-tool]');
const sizeButtons = document.querySelectorAll('.size-btn');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7df);
scene.fog = new THREE.Fog(0xdfe7df, 20, 74);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 140);
camera.position.set(10, 12, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI * 0.46;
controls.minDistance = 8;
controls.maxDistance = 36;
controls.enablePan = false;

const sun = new THREE.DirectionalLight(0xffffff, 2.25);
sun.position.set(7, 12, 5);
sun.castShadow = true;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xf4efe5, 0x88917c, 1.8));

const world = new THREE.Group();
scene.add(world);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

let currentTool = 'grass';
let mode = 'explore';
let brushLock = false;
let brushRadius = 2.2;
let downAt = null;
let infoTimer = null;
let decorationTimer = null;
let lastTap = null;

const size = 30;
const segments = 96;
const tapMoveLimit = 8;
const sculptStrength = 0.18;
const waterLevel = -0.18;

const palette = {
  grass: new THREE.Color(0xaab486),
  grass2: new THREE.Color(0xb8c195),
  water: new THREE.Color(0x8bb5b5),
  stone: new THREE.Color(0xb7b1a0),
  earth: new THREE.Color(0xa99f83),
  shore: new THREE.Color(0xc5b996),
  darkGrass: new THREE.Color(0x788a5f)
};

const terrainGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
terrainGeometry.rotateX(-Math.PI / 2);

const position = terrainGeometry.attributes.position;
const colors = [];
const baseHeights = [];
const terrainData = [];

for (let i = 0; i < position.count; i++) {
  const x = position.getX(i);
  const z = position.getZ(i);
  const ripple = Math.sin(x * 0.48) * 0.08 + Math.cos(z * 0.44) * 0.07 + Math.sin((x + z) * 0.28) * 0.05;
  baseHeights[i] = ripple;
  terrainData[i] = { height: ripple, water: 0, stone: 0, offset: 0, vegetation: 0 };
  const color = palette.grass.clone().lerp(palette.grass2, Math.random() * 0.35);
  colors.push(color.r, color.g, color.b);
  position.setY(i, ripple);
}

terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
terrainGeometry.computeVertexNormals();

const terrain = new THREE.Mesh(
  terrainGeometry,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0.01, flatShading: false })
);
terrain.receiveShadow = true;
world.add(terrain);

const waterGeometry = new THREE.PlaneGeometry(size, size, 40, 40);
waterGeometry.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(
  waterGeometry,
  new THREE.MeshStandardMaterial({ color: 0x8bb5b5, transparent: true, opacity: 0.20, roughness: 0.34, metalness: 0.06 })
);
water.position.y = waterLevel;
world.add(water);

const brushMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
let brush = createBrush();
scene.add(brush);

const rocks = new THREE.Group();
const vegetation = new THREE.Group();
const waterfalls = new THREE.Group();
world.add(rocks);
world.add(vegetation);
world.add(waterfalls);

const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b7555, roughness: 0.95 });
const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x71875c, roughness: 0.98 });
const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x6f8558, roughness: 0.98 });
const pebbleMaterial = new THREE.MeshStandardMaterial({ color: 0x9d988b, roughness: 0.96 });
const waterfallMaterial = new THREE.MeshStandardMaterial({ color: 0x9fd0d3, transparent: true, opacity: 0.54, roughness: 0.25, metalness: 0.03, side: THREE.DoubleSide });

function createBrush() {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(brushRadius * 0.84, brushRadius, 64), brushMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.12;
  mesh.visible = false;
  return mesh;
}

function rebuildBrush() {
  scene.remove(brush);
  brush.geometry.dispose();
  brush = createBrush();
  scene.add(brush);
}

function seededNoise(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function pickPoint(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const point = new THREE.Vector3();
  raycaster.ray.intersectPlane(pointerPlane, point);
  return point;
}

function nearestIndex(x, z) {
  let closest = 0;
  let best = Infinity;
  for (let i = 0; i < position.count; i += 2) {
    const d = (position.getX(i) - x) ** 2 + (position.getZ(i) - z) ** 2;
    if (d < best) {
      best = d;
      closest = i;
    }
  }
  return closest;
}

function getHeightAt(x, z) {
  return position.getY(nearestIndex(x, z));
}

function getSlopeAt(i) {
  const x = position.getX(i);
  const z = position.getZ(i);
  const h = position.getY(i);
  let maxDelta = 0;
  for (let j = 0; j < position.count; j += 13) {
    const d = Math.hypot(position.getX(j) - x, position.getZ(j) - z);
    if (d > 0.25 && d < 0.75) maxDelta = Math.max(maxDelta, Math.abs(position.getY(j) - h));
  }
  return maxDelta;
}

function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child.children) clearGroup(child);
    if (child.geometry) child.geometry.dispose();
  }
}

function addRock(x, z, scale = 1) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 * scale, 1), pebbleMaterial);
  rock.position.set(x, getHeightAt(x, z) + 0.12 * scale, z);
  rock.rotation.set(seededNoise(x + 11, z - 3) * 0.55, seededNoise(x, z) * Math.PI * 2, (seededNoise(x - 7, z + 5) - 0.5) * 0.28);
  rock.scale.set(1.32, 0.48, 0.82);
  rock.castShadow = true;
  rocks.add(rock);
}

function addGrassTuft(x, z, scale = 1) {
  const tuft = new THREE.Group();
  const count = 2 + Math.floor(seededNoise(x, z) * 3);
  for (let i = 0; i < count; i++) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035 * scale, 0.38 * scale, 5), grassMaterial);
    blade.position.set((seededNoise(x + i, z) - 0.5) * 0.22, 0.18 * scale, (seededNoise(x, z + i) - 0.5) * 0.22);
    blade.rotation.z = (seededNoise(x + i * 2, z) - 0.5) * 0.45;
    blade.castShadow = true;
    tuft.add(blade);
  }
  tuft.position.set(x, getHeightAt(x, z) + 0.03, z);
  tuft.rotation.y = seededNoise(x, z) * Math.PI;
  vegetation.add(tuft);
}

function addTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * scale, 0.075 * scale, 0.45 * scale, 6), trunkMaterial);
  trunk.position.y = 0.22 * scale;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.32 * scale, 0.85 * scale, 7), leafMaterial);
  crown.position.y = 0.72 * scale;
  trunk.castShadow = true;
  crown.castShadow = true;
  tree.add(trunk, crown);
  tree.position.set(x, getHeightAt(x, z) + 0.02, z);
  tree.rotation.y = seededNoise(x, z) * Math.PI * 2;
  vegetation.add(tree);
}

function addWaterfall(point) {
  const x = point.x;
  const z = point.z;
  const top = getHeightAt(x, z) + 0.08;
  const bottom = Math.max(waterLevel + 0.05, top - 1.35);
  const height = Math.max(0.35, top - bottom);
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.95, height, 1, 8), waterfallMaterial);
  ribbon.position.set(x, bottom + height / 2, z);
  ribbon.rotation.y = seededNoise(x, z) * Math.PI * 2;
  ribbon.castShadow = false;
  waterfalls.add(ribbon);
}

function updateColorAt(i) {
  const x = position.getX(i);
  const z = position.getZ(i);
  const data = terrainData[i];
  const baseGreen = palette.grass.clone().lerp(palette.grass2, Math.sin(x * 0.7 + z * 0.4) * 0.15 + 0.25);
  const shoreAmount = THREE.MathUtils.clamp(data.water * 1.4 + (1 - data.water) * Math.max(0, 0.18 - Math.abs(data.height - waterLevel)) * 2.2, 0, 0.7);
  const relief = THREE.MathUtils.clamp(Math.abs(data.offset) * 0.22, 0, 0.32);
  const veg = THREE.MathUtils.clamp(data.vegetation * 0.22, 0, 0.22);
  const color = baseGreen
    .lerp(palette.darkGrass, veg)
    .lerp(palette.earth, relief)
    .lerp(palette.shore, shoreAmount * (1 - data.water))
    .lerp(palette.water, data.water * 0.78)
    .lerp(palette.stone, data.stone * 0.9);
  terrainGeometry.attributes.color.setXYZ(i, color.r, color.g, color.b);
}

function applyHeight(i, immediate = false) {
  const data = terrainData[i];
  const targetHeight = baseHeights[i] + data.offset - data.water * 0.30 + data.stone * 0.34;
  data.height = immediate ? targetHeight : THREE.MathUtils.lerp(data.height, targetHeight, 0.9);
  position.setY(i, data.height);
}

function brushIndexes(point) {
  const indexes = [];
  for (let i = 0; i < position.count; i++) {
    const distance = Math.hypot(position.getX(i) - point.x, position.getZ(i) - point.z);
    if (distance <= brushRadius) indexes.push({ i, distance });
  }
  return indexes;
}

function sampleAverageOffset(point) {
  const indexes = brushIndexes(point);
  if (!indexes.length) return 0;
  return indexes.reduce((sum, item) => sum + terrainData[item.i].offset, 0) / indexes.length;
}

function sampleCenterOffset(point) {
  return terrainData[nearestIndex(point.x, point.z)].offset;
}

function naturalRelax(point, strength = 0.18) {
  const averageOffset = sampleAverageOffset(point);
  for (const { i, distance } of brushIndexes(point)) {
    const falloff = Math.pow(1 - distance / brushRadius, 2.2);
    const data = terrainData[i];
    data.offset = THREE.MathUtils.lerp(data.offset, averageOffset, falloff * strength);
    applyHeight(i, true);
    updateColorAt(i);
  }
}

function paintAt(point, tool) {
  if (tool === 'waterfall') {
    addWaterfall(point);
    return;
  }

  let changed = false;
  const averageOffset = tool === 'smooth' ? sampleAverageOffset(point) : 0;
  const centerOffset = tool === 'flatten' ? sampleCenterOffset(point) : 0;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const distance = Math.hypot(x - point.x, z - point.z);
    if (distance > brushRadius) continue;

    const falloff = Math.pow(1 - distance / brushRadius, 2.25);
    const data = terrainData[i];

    if (tool === 'water') {
      data.water = THREE.MathUtils.clamp(data.water + falloff * 0.20, 0, 1);
      data.stone = THREE.MathUtils.clamp(data.stone - falloff * 0.10, 0, 1);
      data.vegetation = THREE.MathUtils.clamp(data.vegetation - falloff * 0.10, 0, 1);
      data.offset = THREE.MathUtils.clamp(data.offset - falloff * 0.04, -1.8, 2.4);
    } else if (tool === 'forest') {
      data.vegetation = THREE.MathUtils.clamp(data.vegetation + falloff * 0.34, 0, 1);
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.08, 0, 1);
      data.stone = THREE.MathUtils.clamp(data.stone - falloff * 0.04, 0, 1);
    } else if (tool === 'stone') {
      data.stone = THREE.MathUtils.clamp(data.stone + falloff * 0.18, 0, 1);
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.10, 0, 1);
      data.vegetation = THREE.MathUtils.clamp(data.vegetation - falloff * 0.05, 0, 1);
      data.offset = THREE.MathUtils.clamp(data.offset + falloff * 0.025, -1.8, 2.4);
    } else if (tool === 'raise') {
      data.offset = THREE.MathUtils.clamp(data.offset + falloff * sculptStrength, -1.8, 2.4);
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.08, 0, 1);
    } else if (tool === 'lower') {
      data.offset = THREE.MathUtils.clamp(data.offset - falloff * sculptStrength, -1.8, 2.4);
      data.water = THREE.MathUtils.clamp(data.water + falloff * 0.015, 0, 1);
    } else if (tool === 'smooth') {
      data.offset = THREE.MathUtils.lerp(data.offset, averageOffset, falloff * 0.75);
    } else if (tool === 'flatten') {
      data.offset = THREE.MathUtils.lerp(data.offset, centerOffset, falloff * 0.55);
    } else if (tool === 'erase') {
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.22, 0, 1);
      data.stone = THREE.MathUtils.clamp(data.stone - falloff * 0.22, 0, 1);
      data.vegetation = THREE.MathUtils.clamp(data.vegetation - falloff * 0.32, 0, 1);
      data.offset = THREE.MathUtils.lerp(data.offset, 0, falloff * 0.16);
    } else {
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.18, 0, 1);
      data.stone = THREE.MathUtils.clamp(data.stone - falloff * 0.12, 0, 1);
      data.vegetation = THREE.MathUtils.clamp(data.vegetation + falloff * 0.06, 0, 1);
    }

    applyHeight(i, true);
    updateColorAt(i);
    changed = true;
  }

  if (tool === 'raise' || tool === 'lower' || tool === 'water' || tool === 'stone') naturalRelax(point, 0.10);

  if (changed) {
    position.needsUpdate = true;
    terrainGeometry.attributes.color.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    scheduleDecorations();
  }
}

function refreshDecorations() {
  clearGroup(vegetation);
  clearGroup(rocks);

  for (let i = 0; i < position.count; i += 17) {
    const x = position.getX(i);
    const z = position.getZ(i);
    if (Math.abs(x) > size * 0.48 || Math.abs(z) > size * 0.48) continue;

    const data = terrainData[i];
    const n = seededNoise(x * 1.7, z * 1.7);
    const slope = getSlopeAt(i);
    const shore = data.water > 0.18 || Math.abs(data.height - waterLevel) < 0.18;

    if (data.water < 0.18 && data.vegetation > 0.26 && slope < 0.26 && n > 0.48) {
      const scale = 0.75 + seededNoise(x + 4, z - 2) * 0.6;
      if (data.vegetation > 0.62 && n > 0.72) addTree(x, z, scale);
      else addGrassTuft(x, z, scale);
    }

    if (data.water < 0.25 && (data.stone > 0.36 || slope > 0.42 || (shore && n > 0.9))) {
      const rx = x + (n - 0.5) * 0.45;
      const rz = z + (seededNoise(z, x) - 0.5) * 0.45;
      addRock(rx, rz, 0.32 + n * 0.48);
    }
  }
}

function scheduleDecorations() {
  clearTimeout(decorationTimer);
  decorationTimer = setTimeout(refreshDecorations, 180);
}

function seedWorld() {
  paintAt(new THREE.Vector3(0, 0, 0), 'water');
  paintAt(new THREE.Vector3(1.5, 0, -0.5), 'water');
  paintAt(new THREE.Vector3(-1.2, 0, 0.9), 'water');
  paintAt(new THREE.Vector3(4.2, 0, 2.5), 'stone');
  paintAt(new THREE.Vector3(4.8, 0, 2.1), 'stone');
  paintAt(new THREE.Vector3(-5, 0, -3), 'stone');
  paintAt(new THREE.Vector3(-3.8, 0, 2.5), 'raise');
  paintAt(new THREE.Vector3(-4.5, 0, -4), 'forest');
  paintAt(new THREE.Vector3(-5.2, 0, -3.6), 'forest');
  refreshDecorations();
}

function updateBrush(event) {
  if (mode !== 'edit') {
    brush.visible = false;
    return null;
  }
  const point = pickPoint(event);
  brush.position.x = point.x;
  brush.position.z = point.z;
  brush.visible = true;
  return point;
}

function showInfo() {
  infoPanel.classList.remove('is-hidden');
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => infoPanel.classList.add('is-hidden'), 5200);
}

function resetCamera() {
  controls.target.set(0, 0, 0);
  camera.position.set(10, 12, 14);
  controls.update();
}

function setBrushLock(nextValue) {
  brushLock = nextValue;
  app.dataset.brushLock = brushLock ? 'on' : 'off';
  brushLockBtn.textContent = brushLock ? 'Pincel: continuo' : 'Pincel: toque';
  brushLockBtn.classList.toggle('is-active', brushLock);
  if (modeHint) modeHint.textContent = brushLock ? 'Arrastra para pintar' : 'Arrastra para mover cámara';
  controls.enabled = !(mode === 'edit' && brushLock);
}

function setMode(nextMode) {
  mode = nextMode;
  app.dataset.mode = mode;
  const editing = mode === 'edit';
  modeBtn.textContent = editing ? 'Editar' : 'Explorar';
  modeBtn.classList.toggle('primary', !editing);
  if (!editing) setBrushLock(false);
  else controls.enabled = !brushLock;
  brush.visible = false;
  showInfo();
}

function setTool(tool) {
  currentTool = tool;
  tools.forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
}

function setBrushSize(sizeName) {
  const sizes = { small: 1.15, medium: 2.2, large: 4.2 };
  brushRadius = sizes[sizeName] ?? sizes.medium;
  sizeButtons.forEach(button => button.classList.toggle('active', button.dataset.size === sizeName));
  rebuildBrush();
}

function bindPress(element, handler) {
  element.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener('pointerup', event => {
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  });
  element.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
  });
}

renderer.domElement.addEventListener('pointerdown', event => {
  const point = pickPoint(event);
  downAt = { x: event.clientX, y: event.clientY, point, time: performance.now() };
  updateBrush(event);
  if (mode === 'edit' && brushLock) paintAt(point, currentTool);
});

renderer.domElement.addEventListener('pointermove', event => {
  const point = updateBrush(event);
  if (mode === 'edit' && brushLock && downAt && point) paintAt(point, currentTool);
});

renderer.domElement.addEventListener('pointerup', event => {
  if (!downAt) return;
  const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
  const now = performance.now();

  if (mode === 'edit' && !brushLock && moved <= tapMoveLimit) paintAt(downAt.point, currentTool);

  if (mode === 'explore' && moved <= tapMoveLimit) {
    const sameSpot = lastTap ? Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 34 : false;
    if (lastTap && sameSpot && now - lastTap.time < 340) {
      resetCamera();
      lastTap = null;
    } else {
      lastTap = { x: event.clientX, y: event.clientY, time: now };
    }
  }

  downAt = null;
});

renderer.domElement.addEventListener('pointerleave', () => {
  downAt = null;
  brush.visible = false;
});

renderer.domElement.addEventListener('dblclick', resetCamera);

bindPress(modeBtn, () => setMode(mode === 'explore' ? 'edit' : 'explore'));
bindPress(brushLockBtn, () => {
  setBrushLock(!brushLock);
  showInfo();
});
bindPress(hideUiBtn, () => {
  app.classList.toggle('ui-hidden');
  hideUiBtn.textContent = app.classList.contains('ui-hidden') ? '☰' : '👁️';
});
bindPress(helpBtn, showInfo);
tools.forEach(button => bindPress(button, () => setTool(button.dataset.tool)));
sizeButtons.forEach(button => bindPress(button, () => setBrushSize(button.dataset.size)));

bindPress(resetBtn, () => {
  clearGroup(vegetation);
  clearGroup(rocks);
  clearGroup(waterfalls);
  for (let i = 0; i < position.count; i++) {
    terrainData[i] = { height: baseHeights[i], water: 0, stone: 0, offset: 0, vegetation: 0 };
    position.setY(i, baseHeights[i]);
    updateColorAt(i);
  }
  position.needsUpdate = true;
  terrainGeometry.attributes.color.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  seedWorld();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

seedWorld();
setMode('explore');
setBrushLock(false);
setBrushSize('medium');

function animate() {
  controls.update();
  const t = performance.now() * 0.0015;
  water.material.opacity = 0.20 + Math.sin(t) * 0.024;
  water.position.y = waterLevel + Math.sin(t * 0.8) * 0.01;
  waterfalls.children.forEach((fall, index) => {
    fall.material.opacity = 0.48 + Math.sin(t * 3 + index) * 0.05;
  });
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
