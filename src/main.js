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
scene.fog = new THREE.Fog(0xdfe7df, 20, 70);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 140);
camera.position.set(10, 12, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
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

const size = 30;
const segments = 96;
const tapMoveLimit = 8;
const sculptStrength = 0.42;

const palette = {
  grass: new THREE.Color(0xaab486),
  grass2: new THREE.Color(0xb8c195),
  water: new THREE.Color(0x8bb5b5),
  stone: new THREE.Color(0xb7b1a0),
  earth: new THREE.Color(0xa99f83)
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
  terrainData[i] = { height: ripple, water: 0, stone: 0, offset: 0 };
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

const waterGeometry = new THREE.PlaneGeometry(size, size, 1, 1);
waterGeometry.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(
  waterGeometry,
  new THREE.MeshStandardMaterial({ color: 0x8bb5b5, transparent: true, opacity: 0.24, roughness: 0.38, metalness: 0.05 })
);
water.position.y = -0.18;
world.add(water);

const brushMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
let brush = createBrush();
scene.add(brush);

const rocks = new THREE.Group();
world.add(rocks);

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

function pickPoint(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const point = new THREE.Vector3();
  raycaster.ray.intersectPlane(pointerPlane, point);
  return point;
}

function getHeightAt(x, z) {
  let closest = 0;
  let best = Infinity;
  for (let i = 0; i < position.count; i += 2) {
    const d = (position.getX(i) - x) ** 2 + (position.getZ(i) - z) ** 2;
    if (d < best) {
      best = d;
      closest = position.getY(i);
    }
  }
  return closest;
}

function addRock(x, z, scale = 1) {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.35 * scale, 1),
    new THREE.MeshStandardMaterial({ color: 0x9d988b, roughness: 0.96 })
  );
  rock.position.set(x, getHeightAt(x, z) + 0.24 * scale, z);
  rock.rotation.set(Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.4);
  rock.scale.set(1.25, 0.55, 0.85);
  rock.castShadow = true;
  rocks.add(rock);
}

function updateColorAt(i) {
  const x = position.getX(i);
  const z = position.getZ(i);
  const data = terrainData[i];
  const baseGreen = palette.grass.clone().lerp(palette.grass2, Math.sin(x * 0.7 + z * 0.4) * 0.15 + 0.25);
  const relief = THREE.MathUtils.clamp(Math.abs(data.offset) * 0.35, 0, 0.45);
  const color = baseGreen
    .lerp(palette.earth, relief)
    .lerp(palette.water, data.water)
    .lerp(palette.stone, data.stone * 0.9);
  terrainGeometry.attributes.color.setXYZ(i, color.r, color.g, color.b);
}

function applyHeight(i, immediate = false) {
  const data = terrainData[i];
  const targetHeight = baseHeights[i] + data.offset - data.water * 0.30 + data.stone * 0.42;
  data.height = immediate ? targetHeight : THREE.MathUtils.lerp(data.height, targetHeight, 0.92);
  position.setY(i, data.height);
}

function sampleAverageOffset(point) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < position.count; i++) {
    const distance = Math.hypot(position.getX(i) - point.x, position.getZ(i) - point.z);
    if (distance <= brushRadius) {
      total += terrainData[i].offset;
      count++;
    }
  }
  return count ? total / count : 0;
}

function paintAt(point, tool) {
  let changed = false;
  const averageOffset = tool === 'smooth' ? sampleAverageOffset(point) : 0;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const distance = Math.hypot(x - point.x, z - point.z);
    if (distance > brushRadius) continue;

    const falloff = Math.pow(1 - distance / brushRadius, 1.65);
    const data = terrainData[i];

    if (tool === 'water') {
      data.water = THREE.MathUtils.clamp(data.water + falloff * 0.22, 0, 1);
      data.stone = THREE.MathUtils.clamp(data.stone - falloff * 0.12, 0, 1);
      data.offset = THREE.MathUtils.clamp(data.offset - falloff * 0.06, -2.4, 3.2);
    } else if (tool === 'stone') {
      data.stone = THREE.MathUtils.clamp(data.stone + falloff * 0.20, 0, 1);
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.10, 0, 1);
      data.offset = THREE.MathUtils.clamp(data.offset + falloff * 0.05, -2.4, 3.2);
    } else if (tool === 'raise') {
      data.offset = THREE.MathUtils.clamp(data.offset + falloff * sculptStrength, -2.4, 3.2);
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.10, 0, 1);
    } else if (tool === 'lower') {
      data.offset = THREE.MathUtils.clamp(data.offset - falloff * sculptStrength, -2.4, 3.2);
      data.water = THREE.MathUtils.clamp(data.water + falloff * 0.02, 0, 1);
    } else if (tool === 'smooth') {
      data.offset = THREE.MathUtils.lerp(data.offset, averageOffset, falloff * 0.65);
    } else if (tool === 'erase') {
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.22, 0, 1);
      data.stone = THREE.MathUtils.clamp(data.stone - falloff * 0.22, 0, 1);
      data.offset = THREE.MathUtils.lerp(data.offset, 0, falloff * 0.20);
    } else {
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.18, 0, 1);
      data.stone = THREE.MathUtils.clamp(data.stone - falloff * 0.12, 0, 1);
    }

    applyHeight(i, tool === 'raise' || tool === 'lower' || tool === 'smooth');
    updateColorAt(i);
    changed = true;
  }

  if (changed) {
    position.needsUpdate = true;
    terrainGeometry.attributes.color.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
  }
}

function seedWorld() {
  paintAt(new THREE.Vector3(0, 0, 0), 'water');
  paintAt(new THREE.Vector3(1.5, 0, -0.5), 'water');
  paintAt(new THREE.Vector3(-1.2, 0, 0.9), 'water');
  paintAt(new THREE.Vector3(4.2, 0, 2.5), 'stone');
  paintAt(new THREE.Vector3(4.8, 0, 2.1), 'stone');
  paintAt(new THREE.Vector3(-5, 0, -3), 'stone');
  paintAt(new THREE.Vector3(-3.8, 0, 2.5), 'raise');
  paintAt(new THREE.Vector3(-3.8, 0, 2.5), 'raise');
  addRock(4.1, 2.4, 1.2);
  addRock(4.8, 2.2, 0.85);
  addRock(-5, -3, 0.9);
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
  downAt = { x: event.clientX, y: event.clientY, point };
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
  const shouldPaint = mode === 'edit' && !brushLock && moved <= tapMoveLimit;
  if (shouldPaint) paintAt(downAt.point, currentTool);
  downAt = null;
});

renderer.domElement.addEventListener('pointerleave', () => {
  downAt = null;
  brush.visible = false;
});

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
  rocks.clear();
  for (let i = 0; i < position.count; i++) {
    terrainData[i] = { height: baseHeights[i], water: 0, stone: 0, offset: 0 };
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
  water.material.opacity = 0.24 + Math.sin(performance.now() * 0.0015) * 0.025;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
