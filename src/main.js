import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const viewport = document.querySelector('#viewport');
const resetBtn = document.querySelector('#resetBtn');
const tools = document.querySelectorAll('.tool');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7df);
scene.fog = new THREE.Fog(0xdfe7df, 18, 48);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(8, 9, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 6;
controls.maxDistance = 30;
controls.enablePan = false;

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 10, 4);
sun.castShadow = true;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xf4efe5, 0x8b927d, 1.5));

const world = new THREE.Group();
scene.add(world);

const grid = new THREE.Group();
scene.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const cells = new Map();
let currentTool = 'grass';
let downAt = null;

const radius = 1;
const hexHeight = Math.sqrt(3) * radius;
const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0x9eaa7a, roughness: 0.95 }),
  water: new THREE.MeshStandardMaterial({ color: 0x7fa6a6, roughness: 0.45, metalness: 0.05 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xaaa69a, roughness: 0.9 }),
  grid: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
};

const hexShape = new THREE.Shape();
for (let i = 0; i < 6; i++) {
  const angle = Math.PI / 3 * i + Math.PI / 6;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  if (i === 0) hexShape.moveTo(x, y);
  else hexShape.lineTo(x, y);
}
hexShape.closePath();

const cellGeometry = new THREE.ExtrudeGeometry(hexShape, {
  depth: 0.22,
  bevelEnabled: true,
  bevelThickness: 0.025,
  bevelSize: 0.025,
  bevelSegments: 1
});
cellGeometry.rotateX(-Math.PI / 2);
cellGeometry.translate(0, -0.11, 0);

const gridGeometry = new THREE.BufferGeometry().setFromPoints([
  ...Array.from({ length: 7 }, (_, i) => {
    const angle = Math.PI / 3 * (i % 6) + Math.PI / 6;
    return new THREE.Vector3(Math.cos(angle) * radius, 0.015, Math.sin(angle) * radius);
  })
]);

function axialToWorld(q, r) {
  return {
    x: radius * 1.5 * q,
    z: hexHeight * (r + q / 2)
  };
}

function worldToAxial(x, z) {
  const q = (2 / 3 * x) / radius;
  const r = (-1 / 3 * x + Math.sqrt(3) / 3 * z) / radius;
  return roundAxial(q, r);
}

function roundAxial(q, r) {
  let x = q;
  let z = r;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

function key(q, r) {
  return `${q},${r}`;
}

function createGrid() {
  for (let q = -7; q <= 7; q++) {
    for (let r = -7; r <= 7; r++) {
      if (Math.abs(q + r) > 7) continue;
      const line = new THREE.Line(gridGeometry, materials.grid);
      const pos = axialToWorld(q, r);
      line.position.set(pos.x, 0, pos.z);
      grid.add(line);
    }
  }
}

function paintCell(q, r, type) {
  const id = key(q, r);
  const existing = cells.get(id);
  if (existing) {
    world.remove(existing);
    cells.delete(id);
  }
  if (type === 'erase') return;
  const mesh = new THREE.Mesh(cellGeometry, materials[type]);
  const pos = axialToWorld(q, r);
  mesh.position.set(pos.x, type === 'water' ? -0.08 : 0, pos.z);
  mesh.scale.y = type === 'stone' ? 1.55 : 1;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { q, r, type };
  world.add(mesh);
  cells.set(id, mesh);
}

function seedWorld() {
  [
    [0, 0, 'grass'], [1, 0, 'grass'], [0, 1, 'grass'], [-1, 1, 'grass'],
    [-1, 0, 'water'], [0, -1, 'water'], [1, -1, 'stone']
  ].forEach(([q, r, type]) => paintCell(q, r, type));
}

function setTool(tool) {
  currentTool = tool;
  tools.forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
}

function pickCell(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, point);
  return worldToAxial(point.x, point.z);
}

renderer.domElement.addEventListener('pointerdown', event => {
  downAt = { x: event.clientX, y: event.clientY, time: performance.now() };
});

renderer.domElement.addEventListener('pointerup', event => {
  if (!downAt) return;
  const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
  if (moved < 8) {
    const { q, r } = pickCell(event);
    if (Math.abs(q) <= 7 && Math.abs(r) <= 7 && Math.abs(q + r) <= 7) {
      paintCell(q, r, currentTool);
    }
  }
  downAt = null;
});

resetBtn.addEventListener('click', () => {
  cells.forEach(mesh => world.remove(mesh));
  cells.clear();
  seedWorld();
});

tools.forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

createGrid();
seedWorld();

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
