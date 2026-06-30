import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const app = document.querySelector('#app');
const viewport = document.querySelector('#viewport');
const resetBtn = document.querySelector('#resetBtn');
const modeBtn = document.querySelector('#modeBtn');
const hideUiBtn = document.querySelector('#hideUiBtn');
const helpBtn = document.querySelector('#helpBtn');
const brushLockBtn = document.querySelector('#brushLockBtn');
const infoPanel = document.querySelector('#infoPanel');
const tools = document.querySelectorAll('.tool[data-tool]');

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
let downAt = null;
let infoTimer = null;

const size = 30;
const segments = 96;
const brushRadius = 2.2;
const tapMoveLimit = 8;

const palette = {
  grass: new THREE.Color(0xaab486),
  grass2: new THREE.Color(0xb8c195),
  water: new THREE.Color(0x8bb5b5),
  stone: new THREE.Color(0xb7b1a0)
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
  terrainData[i] = { height: ripple, water: 0, stone: 0 };
  const color = palette.grass.clone().lerp(palette.grass2, Math.random() * 0.35);
  colors.push(color.r, color.g, color.b);
  position.setY(i, ripple);
}

terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
terrainGeometry.computeVertexNormals();

const terrain = new THREE.Mesh(
  terrainGeometry,
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0.01,
    flatShading: false
  })
);
terrain.receiveShadow = true;
world.add(terrain);

const waterGeometry = new THREE.PlaneGeometry(size, size, 1, 1);
waterGeometry.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(
  waterGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x8bb5b5,
    transparent: true,
    opacity: 0.28,
    roughness: 0.38,
    metalness: 0.05
  })
);
water.position.y = -0.17;
world.add(water);

const brush = new THREE.Mesh(
  new THREE.RingGeometry(brushRadius * 0.84, brushRadius, 64),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
);
brush.rotation.x = -Math.PI / 2;
brush.position.y = 0.08;
brush.visible = false;
scene.add(brush);

const rocks = new THREE.Group();
world.add(rocks);

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

function getHeightAt(x, z) {
  let closest = 0;
  let best = Infinity;
  for (let i = 0; i < position.count; i += 3) {
    const dx = position.getX(i) - x;
    const dz = position.getZ(i) - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      closest = position.getY(i);
    }
  }
  return closest;
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

function paintAt(point, tool) {
  const colorAttribute = terrainGeometry.attributes.color;
  let changed = false;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const dx = x - point.x;
    const dz = z - point.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > brushRadius) continue;

    const falloff = Math.pow(1 - distance / brushRadius, 2);
    const data = terrainData[i];

    if (tool === 'water') {
      data.water = THREE.MathUtils.clamp(data.water + falloff * 0.18, 0, 1);
      data.stone = THREE.MathUtils.clamp(data.stone - falloff * 0.12, 0, 1);
    } else if (tool === 'stone') {
      data.stone = THREE.MathUtils.clamp(data.stone + falloff * 0.16, 0, 1);
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.08, 0, 1);
    } else if (tool === 'erase') {
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.2, 0, 1);
      data.stone = THREE.MathUtils.clamp(data.stone - falloff * 0.2, 0, 1);
    } else {
      data.water = THREE.MathUtils.clamp(data.water - falloff * 0.15, 0, 1);
      data.stone = THREE.MathUtils.clamp(data.stone - falloff * 0.1, 0, 1);
    }

    const targetHeight = baseHeights[i] - data.water * 0.28 + data.stone * 0.42;
    data.height = THREE.MathUtils.lerp(data.height, targetHeight, 0.85);
    position.setY(i, data.height);

    const green = palette.grass.clone().lerp(palette.grass2, Math.sin(x * 0.7 + z * 0.4) * 0.15 + 0.25);
    const color = green.lerp(palette.water, data.water).lerp(palette.stone, data.stone * 0.9);
    colorAttribute.setXYZ(i, color.r, color.g, color.b);
    changed = true;
  }

  if (changed) {
    position.needsUpdate = true;
    colorAttribute.needsUpdate = true;
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
  brushLockBtn.textContent = brushLock ? '🔓' : '🔒';
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

modeBtn.addEventListener('click', () => {
  setMode(mode === 'explore' ? 'edit' : 'explore');
});

brushLockBtn.addEventListener('click', () => {
  setBrushLock(!brushLock);
  showInfo();
});

hideUiBtn.addEventListener('click', () => {
  app.classList.toggle('ui-hidden');
  hideUiBtn.textContent = app.classList.contains('ui-hidden') ? '☰' : '👁️';
});

helpBtn.addEventListener('click', showInfo);

resetBtn.addEventListener('click', () => {
  rocks.clear();
  for (let i = 0; i < position.count; i++) {
    terrainData[i] = { height: baseHeights[i], water: 0, stone: 0 };
    position.setY(i, baseHeights[i]);
    const x = position.getX(i);
    const z = position.getZ(i);
    const color = palette.grass.clone().lerp(palette.grass2, Math.sin(x * 0.7 + z * 0.4) * 0.15 + 0.25);
    terrainGeometry.attributes.color.setXYZ(i, color.r, color.g, color.b);
  }
  position.needsUpdate = true;
  terrainGeometry.attributes.color.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  seedWorld();
});

tools.forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

seedWorld();
setMode('explore');
setBrushLock(false);

function animate() {
  controls.update();
  water.material.opacity = 0.24 + Math.sin(performance.now() * 0.0015) * 0.025;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
