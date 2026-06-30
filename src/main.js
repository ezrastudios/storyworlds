import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const viewport = document.querySelector('#viewport');
const resetBtn = document.querySelector('#resetBtn');
const tools = document.querySelectorAll('.tool');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7df);
scene.fog = new THREE.Fog(0xdfe7df, 18, 55);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(8, 10, 12);

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
controls.minDistance = 7;
controls.maxDistance = 34;
controls.enablePan = false;

const sun = new THREE.DirectionalLight(0xffffff, 2.15);
sun.position.set(6, 11, 5);
sun.castShadow = true;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xf4efe5, 0x8b927d, 1.65));

const world = new THREE.Group();
scene.add(world);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const cells = new Map();
let currentTool = 'grass';
let downAt = null;
let isPainting = false;

const radius = 0.92;
const hexHeight = Math.sqrt(3) * radius;

const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0xaab486, roughness: 0.98, flatShading: false }),
  water: new THREE.MeshStandardMaterial({ color: 0x8bb5b5, roughness: 0.5, metalness: 0.03, transparent: true, opacity: 0.9 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xb6b1a2, roughness: 0.95 }),
  guide: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 })
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

const landGeometry = new THREE.ExtrudeGeometry(hexShape, {
  depth: 0.1,
  bevelEnabled: true,
  bevelThickness: 0.035,
  bevelSize: 0.05,
  bevelSegments: 3
});
landGeometry.rotateX(-Math.PI / 2);
landGeometry.translate(0, -0.05, 0);

const waterGeometry = new THREE.CylinderGeometry(radius * 0.95, radius * 0.98, 0.045, 36);
waterGeometry.translate(0, -0.04, 0);

const guideGeometry = new THREE.BufferGeometry().setFromPoints([
  ...Array.from({ length: 7 }, (_, i) => {
    const angle = Math.PI / 3 * (i % 6) + Math.PI / 6;
    return new THREE.Vector3(Math.cos(angle) * radius, 0.018, Math.sin(angle) * radius);
  })
]);

const brush = new THREE.Mesh(
  new THREE.RingGeometry(radius * 0.78, radius * 1.02, 48),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
);
brush.rotation.x = -Math.PI / 2;
brush.visible = false;
scene.add(brush);

const basePlane = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshBasicMaterial({ color: 0xdfe7df, transparent: true, opacity: 0.001 })
);
basePlane.rotation.x = -Math.PI / 2;
scene.add(basePlane);

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

function softHeight(q, r, type) {
  if (type === 'water') return -0.08;
  const wave = Math.sin(q * 0.74) * 0.035 + Math.cos(r * 0.62) * 0.035;
  if (type === 'stone') return 0.12 + wave;
  return wave;
}

function paintCell(q, r, type) {
  const id = key(q, r);
  const existing = cells.get(id);
  if (existing) {
    world.remove(existing.group);
    cells.delete(id);
  }
  if (type === 'erase') return;

  const group = new THREE.Group();
  const geometry = type === 'water' ? waterGeometry : landGeometry;
  const mesh = new THREE.Mesh(geometry, materials[type]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.scale.y = type === 'stone' ? 1.35 : 1;
  group.add(mesh);

  if (type !== 'water') {
    const guide = new THREE.Line(guideGeometry, materials.guide);
    guide.position.y = 0.018;
    guide.visible = false;
    group.add(guide);
  }

  const pos = axialToWorld(q, r);
  group.position.set(pos.x, softHeight(q, r, type), pos.z);
  group.rotation.y = (Math.sin(q * 12.9898 + r * 78.233) * 0.035);
  group.userData = { q, r, type };
  world.add(group);
  cells.set(id, { group, type });
}

function paintBlob(q, r, type, radiusCells = 1) {
  for (let dq = -radiusCells; dq <= radiusCells; dq++) {
    for (let dr = -radiusCells; dr <= radiusCells; dr++) {
      if (Math.abs(dq + dr) > radiusCells) continue;
      paintCell(q + dq, r + dr, type);
    }
  }
}

function seedWorld() {
  for (let q = -5; q <= 5; q++) {
    for (let r = -5; r <= 5; r++) {
      if (Math.abs(q + r) > 5) continue;
      const distance = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      if (distance < 5) paintCell(q, r, 'grass');
    }
  }

  [[0, 0], [1, 0], [0, 1], [-1, 1], [1, -1], [2, -1]].forEach(([q, r]) => paintCell(q, r, 'water'));
  [[-3, 2], [-4, 2], [3, -2], [3, -3]].forEach(([q, r]) => paintCell(q, r, 'stone'));
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

function updateBrush(event) {
  const { q, r } = pickCell(event);
  const pos = axialToWorld(q, r);
  brush.position.set(pos.x, 0.05, pos.z);
  brush.visible = true;
  return { q, r };
}

renderer.domElement.addEventListener('pointerdown', event => {
  downAt = { x: event.clientX, y: event.clientY, time: performance.now() };
  isPainting = true;
});

renderer.domElement.addEventListener('pointermove', event => {
  const { q, r } = updateBrush(event);
  if (!isPainting || !downAt) return;
  const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
  if (moved > 10) paintBlob(q, r, currentTool, 1);
});

renderer.domElement.addEventListener('pointerup', event => {
  const { q, r } = updateBrush(event);
  if (downAt) paintBlob(q, r, currentTool, 1);
  downAt = null;
  isPainting = false;
});

renderer.domElement.addEventListener('pointerleave', () => {
  isPainting = false;
  brush.visible = false;
});

resetBtn.addEventListener('click', () => {
  cells.forEach(cell => world.remove(cell.group));
  cells.clear();
  seedWorld();
});

tools.forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

seedWorld();

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
