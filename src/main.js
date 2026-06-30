import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const $ = s => document.querySelector(s);
const app = $('#app'), viewport = $('#viewport'), modeBtn = $('#modeBtn'), seedBtn = $('#seedBtn'), resetBtn = $('#resetBtn'), hideUiBtn = $('#hideUiBtn'), helpBtn = $('#helpBtn'), brushLockBtn = $('#brushLockBtn'), timeSlider = $('#timeSlider');
const tools = [...document.querySelectorAll('.tool[data-tool]')], sizeButtons = [...document.querySelectorAll('.size-btn')];

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
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 8, maxDistance: 80, maxPolarAngle: Math.PI * 0.52, enablePan: false });
controls.target.set(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0x7b806f, 1.4);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
scene.add(hemi, sun);

const skySphere = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.MeshBasicMaterial({ color: 0xdce8e2, side: THREE.BackSide }));
scene.add(skySphere);
const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffe8a0, depthTest: false }));
const moonDisk = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 12), new THREE.MeshBasicMaterial({ color: 0xe8edff, depthTest: false }));
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
addCloud(-24, 14, -20, 1.3); addCloud(6, 17, -24, 1.6); addCloud(23, 15, 8, 1.2); addCloud(-30, 18, 15, 1.35);

const world = new THREE.Group();
scene.add(world);
const WORLD_SIZE = 58, SEGMENTS = 120, WATER_LEVEL = -0.16;
const geom = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEGMENTS, SEGMENTS);
geom.rotateX(-Math.PI / 2);
const pos = geom.attributes.position, colors = [], data = [];
for (let i = 0; i < pos.count; i++) { data[i] = { h: 0, water: 0, veg: 0, forest: 0, stone: 0, density: 1 }; colors.push(0.68, 0.72, 0.54); }
geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
const terrain = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
terrain.receiveShadow = true;
world.add(terrain);
const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 40, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8cbaba, transparent: true, opacity: 0.22, roughness: 0.3 }));
water.position.y = WATER_LEVEL;
world.add(water);

const lowPlants = new THREE.Group(), trees = new THREE.Group(), rocks = new THREE.Group(), falls = new THREE.Group();
world.add(lowPlants, trees, rocks, falls);
const mats = {
  grass: new THREE.MeshStandardMaterial({ color: 0x657c51, roughness: 0.98, side: THREE.DoubleSide }),
  flower1: new THREE.MeshStandardMaterial({ color: 0xe8d0d6, roughness: 0.98 }),
  flower2: new THREE.MeshStandardMaterial({ color: 0xf0e4a2, roughness: 0.98 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x876f4e, roughness: 0.96 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x7a935f, roughness: 0.98 }),
  pine: new THREE.MeshStandardMaterial({ color: 0x5f7651, roughness: 0.98 }),
  palm: new THREE.MeshStandardMaterial({ color: 0x6f8f58, roughness: 0.98 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x9e998c, roughness: 0.98 }),
  fall: new THREE.MeshStandardMaterial({ color: 0xa5d3d6, transparent: true, opacity: 0.30, side: THREE.DoubleSide })
};

let seed = Date.now() % 999999, seedType = 0, currentTool = 'grass', mode = 'explore', brushLock = false, brushRadius = 2.7, pointerDown = null, currentDensity = 'normal', timeOfDay = 0.28;
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const brushMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
let brush = makeBrush(); scene.add(brush);

function rand(x, z, s = seed) { const n = Math.sin((x + s * 0.011) * 12.9898 + (z - s * 0.017) * 78.233) * 43758.5453; return n - Math.floor(n); }
function gauss(x, z, cx, cz, r, h) { return Math.exp(-(((x - cx) ** 2 + (z - cz) ** 2) / (r * r))) * h; }
function fbm(x, z) { return (rand(x, z) - .5) + (rand(x * 2.13 + 9, z * 2.13 - 5) - .5) * .46 + (rand(x * 4.7 - 3, z * 4.7 + 8) - .5) * .20; }
function smoothstep(edge0, edge1, x) { const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }
function lerpPoint(a, b, t) { return { x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) }; }
function makePath(kind, count = 7) {
  const pts = [];
  let start, end;
  if (kind === 'river') {
    const side = Math.floor(rand(40, count) * 4);
    start = side === 0 ? { x: -30, z: (rand(1, 2) - .5) * 44 } : side === 1 ? { x: 30, z: (rand(2, 3) - .5) * 44 } : side === 2 ? { x: (rand(3, 4) - .5) * 44, z: -30 } : { x: (rand(4, 5) - .5) * 44, z: 30 };
    end = { x: -start.x + (rand(6, 7) - .5) * 16, z: -start.z + (rand(8, 9) - .5) * 16 };
  } else {
    start = { x: (rand(11, 12) - .5) * 40, z: (rand(12, 13) - .5) * 40 };
    end = { x: (rand(13, 14) - .5) * 40, z: (rand(14, 15) - .5) * 40 };
  }
  const dx = end.x - start.x, dz = end.z - start.z, len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  const amp = kind === 'river' ? 9 + rand(20, 21) * 7 : 6 + rand(22, 23) * 6;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const base = lerpPoint(start, end, t);
    const bend = Math.sin(t * Math.PI * (1.2 + rand(i, 30) * 1.6) + rand(i, 31) * 3.2) * amp * (0.35 + Math.sin(t * Math.PI) * 0.95);
    const wobbleX = (rand(i * 3, 50) - .5) * 7;
    const wobbleZ = (rand(i * 3, 51) - .5) * 7;
    pts.push({ x: base.x + nx * bend + wobbleX, z: base.z + nz * bend + wobbleZ });
  }
  return pts;
}
function distanceToSegment(px, pz, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, wx = px - a.x, wz = pz - a.z;
  const c = THREE.MathUtils.clamp((wx * vx + wz * vz) / (vx * vx + vz * vz || 1), 0, 1);
  const x = a.x + vx * c, z = a.z + vz * c;
  return { d: Math.hypot(px - x, pz - z), t: c, x, z };
}
function distanceToPath(x, z, path) {
  let best = { d: Infinity, t: 0, x: 0, z: 0, segment: 0 };
  for (let i = 0; i < path.length - 1; i++) {
    const r = distanceToSegment(x, z, path[i], path[i + 1]);
    if (r.d < best.d) best = { ...r, segment: i };
  }
  return best;
}
function visibleHeight(d) { return d.h - d.water * 0.26 + d.stone * 0.16; }
function colorAt(i) {
  const d = data[i], h = visibleHeight(d);
  const nearWater = THREE.MathUtils.clamp(1 - Math.abs(h - WATER_LEVEL) / 0.8, 0, 1);
  const beach = nearWater * (1 - d.water * 0.75);
  const c = new THREE.Color(0xaab486).lerp(new THREE.Color(0xb8c195), 0.24).lerp(new THREE.Color(0x74885d), d.veg * 0.12 + d.forest * 0.08).lerp(new THREE.Color(0xd6c99c), beach * 0.95).lerp(new THREE.Color(0x8cbaba), d.water * 0.82).lerp(new THREE.Color(0xa8a195), d.stone * 0.65).lerp(new THREE.Color(0x9d9078), Math.max(0, d.h - 1.0) * 0.08);
  geom.attributes.color.setXYZ(i, c.r, c.g, c.b);
}
function applyPoint(i) { pos.setY(i, visibleHeight(data[i])); colorAt(i); }
function updateTerrain() { pos.needsUpdate = true; geom.attributes.color.needsUpdate = true; geom.computeVertexNormals(); }
function nearestIndex(x, z) { let best = 0, dist = Infinity; for (let i = 0; i < pos.count; i += 3) { const d = (pos.getX(i) - x) ** 2 + (pos.getZ(i) - z) ** 2; if (d < dist) { dist = d; best = i; } } return best; }
function heightAt(x, z) { return pos.getY(nearestIndex(x, z)); }
function dataAt(x, z) { return data[nearestIndex(x, z)]; }
function biomeAt(x, z) { const h = heightAt(x, z), d = dataAt(x, z); if (d.water > 0.12 || Math.abs(h - WATER_LEVEL) < 0.55) return 'coast'; if (h > 1.0) return 'highland'; if (d.forest > 0.50) return 'forest'; return 'plains'; }
function clearGroup(g) { for (const c of [...g.children]) { g.remove(c); if (c.children) clearGroup(c); if (c.geometry) c.geometry.dispose(); } }
function clearDecorations() { clearGroup(lowPlants); clearGroup(trees); clearGroup(rocks); clearGroup(falls); }

function generateSeed(newSeed = Math.floor(Math.random() * 999999)) {
  seed = newSeed; seedType = Math.floor(rand(10, 20) * 6); clearDecorations();
  const riverPath = makePath('river', 8);
  const ridgePathA = makePath('ridge', 6);
  const ridgePathB = makePath('ridge', 5);
  const lakeA = { x: (rand(7, 9) - .5) * 26, z: (rand(9, 7) - .5) * 26, r: 5 + rand(1, 9) * 4 };
  const lakeB = { x: (rand(13, 19) - .5) * 32, z: (rand(19, 13) - .5) * 32, r: 3.5 + rand(2, 8) * 3 };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const river = distanceToPath(x, z, riverPath);
    const ridgeA = distanceToPath(x, z, ridgePathA);
    const ridgeB = distanceToPath(x, z, ridgePathB);
    const organic = fbm(x * .13, z * .13);
    const micro = fbm(x * .42 + 11, z * .42 - 8);
    let h = organic * .38 + micro * .09, w = 0, veg = .18 + rand(x * .25, z * .25) * .24, forest = 0, stone = 0;

    const riverWidth = 1.4 + rand(river.segment + 6, river.segment + 8) * 1.6;
    const riverMask = 1 - smoothstep(riverWidth, riverWidth + 1.4, river.d + organic * .55);
    const bankMask = 1 - smoothstep(riverWidth + 1.3, riverWidth + 4.5, river.d + organic * .8);

    const lakeMaskA = 1 - smoothstep(lakeA.r, lakeA.r + 2.2, Math.hypot(x - lakeA.x, z - lakeA.z) + micro * 1.6);
    const lakeMaskB = seedType % 2 === 0 ? 1 - smoothstep(lakeB.r, lakeB.r + 2.0, Math.hypot(x - lakeB.x, z - lakeB.z) + organic * 1.4) : 0;

    if (seedType === 0) {
      h += (1 - smoothstep(4, 13, ridgeA.d + organic * 2.2)) * (1.1 + micro * .5);
      h += gauss(x,z,-12 + organic * 2,10,11,.9);
      forest += gauss(x,z,-13,8,12,.65) + bankMask * .22;
    } else if (seedType === 1) {
      h += (1 - smoothstep(2.4, 9, ridgeA.d + organic * 1.7)) * 2.15;
      h += gauss(x,z,5 + organic * 2,-3,7,1.4);
      stone += .28 + (1 - smoothstep(3, 8, ridgeA.d)) * .35;
      forest += (1 - smoothstep(8, 16, ridgeA.d)) * .18;
    } else if (seedType === 2) {
      const coast = Math.hypot(x + organic * 3, z - micro * 3);
      h += gauss(x,z,0,0,18,1.15) - Math.max(0, coast - 15) * .16;
      w = Math.max(w, smoothstep(14.5, 21, coast + organic * 2.2));
      forest += .25 + gauss(x,z,-7,4,9,.38);
    } else if (seedType === 3) {
      const canyonWidth = 1.6 + rand(80, 81) * 1.1;
      const canyon = 1 - smoothstep(canyonWidth, canyonWidth + 3.5, river.d + micro);
      h += (1 - smoothstep(4, 15, ridgeA.d)) * 1.2 + (1 - smoothstep(4, 14, ridgeB.d)) * .85;
      h -= canyon * 1.35;
      stone += .36 + canyon * .22;
      veg -= .08;
    } else if (seedType === 4) {
      h += gauss(x,z,-3 + organic * 2,1 + micro * 2,6.6,2.8) - gauss(x,z,-2,1,2.4,1.3);
      h += (1 - smoothstep(5, 13, ridgeB.d + organic)) * .8;
      stone += .42;
      forest += gauss(x,z,-15,12,10,.38);
    } else {
      h += (1 - smoothstep(3, 11, ridgeA.d + organic * 2)) * 1.5;
      h += (1 - smoothstep(4, 12, ridgeB.d - micro)) * .95;
      forest += gauss(x,z,9,9,11,.65) + gauss(x,z,-14,-4,9,.42);
      stone += .16;
    }

    h -= riverMask * .55;
    h -= Math.max(lakeMaskA, lakeMaskB) * .48;
    w = Math.max(w, riverMask * .86, lakeMaskA, lakeMaskB);
    veg = THREE.MathUtils.clamp(veg + forest * .18 + bankMask * .22 - stone * .08, 0, 1);
    forest = THREE.MathUtils.clamp(forest + (bankMask * .18) + (rand(x * .19, z * .19) > .72 ? .22 : 0), 0, 1);
    stone = THREE.MathUtils.clamp(stone + Math.max(0, h - .9) * .16 + Math.max(0, 1 - smoothstep(3, 7, ridgeA.d)) * .22 + rand(x * 1.8, z * 1.8) * .06, 0, .85);
    data[i] = { h, water: THREE.MathUtils.clamp(w,0,1), veg, forest, stone, density: 1 };
    applyPoint(i);
  }
  updateTerrain(); refreshDecorations(); resetCamera();
}

function addGrass(x,z,scale=1){const g=new THREE.Group(), count=2+Math.floor(rand(x,z)*3); for(let i=0;i<count;i++){const blade=new THREE.Mesh(new THREE.PlaneGeometry(.028*scale,.09*scale),mats.grass); blade.position.set((rand(x+i,z)-.5)*.28,.045*scale,(rand(x,z+i)-.5)*.28); blade.rotation.set(0,rand(x+i*3,z)*Math.PI,(rand(x+i*2,z)-.5)*.25); g.add(blade);} if(rand(x+4,z-1)>.74){const flower=new THREE.Mesh(new THREE.SphereGeometry(.024*scale,6,4),rand(x,z)>.5?mats.flower1:mats.flower2); flower.position.set((rand(x,z+3)-.5)*.18,.085*scale,(rand(x+3,z)-.5)*.18); g.add(flower);} g.position.set(x,heightAt(x,z)+.014,z); lowPlants.add(g);}
function addTree(x,z,scale=1){const biome=biomeAt(x,z), g=new THREE.Group(); const trunkH=biome==='coast'?.72:biome==='highland'?.38:.46; const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.045*scale,.07*scale,trunkH*scale,6),mats.trunk); trunk.position.y=trunkH*scale*.5; g.add(trunk); if(biome==='coast'){for(let i=0;i<5;i++){const leaf=new THREE.Mesh(new THREE.ConeGeometry(.09*scale,.56*scale,5),mats.palm); leaf.position.y=.78*scale; leaf.rotation.z=Math.PI/2.7; leaf.rotation.y=i*Math.PI*.4; g.add(leaf);}} else if(biome==='highland'){const pine=new THREE.Mesh(new THREE.ConeGeometry(.28*scale,.78*scale,7),mats.pine); pine.position.y=.66*scale; g.add(pine);} else {const crown=new THREE.Mesh(new THREE.SphereGeometry(.32*scale,8,6),mats.leaf); crown.scale.set(1.1,.86,1); crown.position.y=.70*scale; g.add(crown);} g.position.set(x,heightAt(x,z)+.02,z); g.rotation.y=rand(x,z)*Math.PI*2; trees.add(g);}
function addRock(x,z,scale=1){const r=new THREE.Mesh(new THREE.DodecahedronGeometry(.13*scale,1),mats.rock); r.position.set(x,heightAt(x,z)+.07*scale,z); r.scale.set(.8+rand(x,z)*.7,.42+rand(z,x)*.26,.68+rand(x+4,z)*.5); r.rotation.set(rand(x,z)*.6,rand(x+1,z)*Math.PI*2,rand(x,z+1)*.5); rocks.add(r);}
function addWaterfall(p){const h=heightAt(p.x,p.z); if(h<.55)return; const g=new THREE.Group(); for(let i=0;i<3;i++){const strip=new THREE.Mesh(new THREE.PlaneGeometry(.10+rand(p.x+i,p.z)*.05,.55+rand(p.x,p.z+i)*.35,1,5),mats.fall.clone()); strip.position.x=(i-1)*.12; strip.rotation.z=(rand(p.x+i,p.z)-.5)*.18; g.add(strip);} g.position.set(p.x,h-.3,p.z); g.rotation.y=rand(p.x,p.z)*Math.PI*2; falls.add(g);}
function refreshDecorations(){clearGroup(lowPlants); clearGroup(trees); clearGroup(rocks); const mult=currentDensity==='low'?.25:currentDensity==='high'?1.4:.75; for(let i=0;i<pos.count;i+=23){const x=pos.getX(i),z=pos.getZ(i),d=data[i],h=pos.getY(i); if(d.water>.2||Math.abs(x)>WORLD_SIZE*.48||Math.abs(z)>WORLD_SIZE*.48)continue; const n=rand(x*1.4,z*1.4); if(d.veg>.24&&n>1-.52*mult)addGrass(x,z,.65+rand(x,z+2)*.34); if(d.forest>.32&&n>1-.14*mult)addTree(x,z,.65+rand(x+3,z)*.58); if((d.stone>.55||h>1.5||biomeAt(x,z)==='coast')&&rand(x+9,z-4)>1-.08*mult)addRock(x,z,.22+rand(x,z)*.35);}}
function paintAt(p){const target=heightAt(p.x,p.z); for(let i=0;i<pos.count;i++){const dx=pos.getX(i)-p.x,dz=pos.getZ(i)-p.z,dist=Math.hypot(dx,dz); if(dist>brushRadius)continue; const f=Math.pow(1-dist/brushRadius,2.2),d=data[i]; if(currentTool==='grass'){d.veg=THREE.MathUtils.clamp(d.veg+f*.36,0,1); d.forest=Math.max(0,d.forest-f*.10); d.water=Math.max(0,d.water-f*.05);} else if(currentTool==='forest'){d.forest=THREE.MathUtils.clamp(d.forest+f*.42,0,1); d.veg=THREE.MathUtils.clamp(d.veg+f*.10,0,1); d.water=Math.max(0,d.water-f*.04);} else if(currentTool==='water'){d.water=THREE.MathUtils.clamp(d.water+f*.2,0,1); d.h-=f*.035;} else if(currentTool==='stone'){d.stone=THREE.MathUtils.clamp(d.stone+f*.18,0,1);} else if(currentTool==='raise'){d.h=THREE.MathUtils.clamp(d.h+f*.36,-2,4.6); d.water=Math.max(0,d.water-f*.18); d.stone=THREE.MathUtils.clamp(d.stone+f*.035,0,1);} else if(currentTool==='lower'){d.h=THREE.MathUtils.clamp(d.h-f*.30,-2.4,4.6); d.water=THREE.MathUtils.clamp(d.water+f*.02,0,1);} else if(currentTool==='erase'){d.water=Math.max(0,d.water-f*.2); d.veg=Math.max(0,d.veg-f*.35); d.forest=Math.max(0,d.forest-f*.35); d.stone=Math.max(0,d.stone-f*.2);} else if(currentTool==='smooth'){d.h=THREE.MathUtils.lerp(d.h,target,f*.12);} else if(currentTool==='flatten'){d.h=THREE.MathUtils.lerp(d.h,target,f*.34);} applyPoint(i);} if(currentTool==='waterfall')addWaterfall(p); updateTerrain(); clearTimeout(window._decoTimer); window._decoTimer=setTimeout(refreshDecorations,160);}
function pointerPoint(e){const r=renderer.domElement.getBoundingClientRect(); pointer.x=((e.clientX-r.left)/r.width)*2-1; pointer.y=-((e.clientY-r.top)/r.height)*2+1; raycaster.setFromCamera(pointer,camera); const out=new THREE.Vector3(); raycaster.ray.intersectPlane(plane,out); return out;}
function makeBrush(){const b=new THREE.Mesh(new THREE.RingGeometry(brushRadius*.84,brushRadius,64),brushMaterial); b.rotation.x=-Math.PI/2; b.position.y=.12; b.visible=false; return b;}
function rebuildBrush(){scene.remove(brush); brush.geometry.dispose(); brush=makeBrush(); scene.add(brush);}
function setMode(next){mode=next; app.dataset.mode=mode; modeBtn.textContent=mode==='edit'?'Editar':'Explorar'; modeBtn.classList.toggle('primary',mode==='explore'); controls.enabled=!(mode==='edit'&&brushLock);}
function setBrushLock(v){brushLock=v; brushLockBtn.textContent=v?'Pincel: continuo':'Pincel: toque'; brushLockBtn.classList.toggle('is-active',v); controls.enabled=!(mode==='edit'&&brushLock);}
function updateSky(){const day=Math.max(0,Math.sin(timeOfDay*Math.PI)); const skyColor=new THREE.Color(0x17213a).lerp(new THREE.Color(0xdce8e2),day); scene.background=skyColor; skySphere.material.color.copy(skyColor); hemi.intensity=.45+day*1.45; sun.intensity=.25+day*2.1; const angle=timeOfDay*Math.PI*2-Math.PI*.15; sun.position.set(Math.cos(angle)*22,Math.sin(angle)*22,10); sunDisk.position.set(Math.cos(angle)*48,Math.max(8,Math.sin(angle)*30+18),-34); moonDisk.position.set(-Math.cos(angle)*48,Math.max(8,-Math.sin(angle)*30+18),-34); sunDisk.visible=day>.08; moonDisk.visible=day<.92; cloudMaterial.opacity=.16+day*.38; water.material.color.copy(new THREE.Color(0x5a6b7d).lerp(new THREE.Color(0x8cbaba),day));}
function resetCamera(){camera.position.set(18,16,24); controls.target.set(0,0,0); controls.update();}
function stop(e){e.preventDefault(); e.stopPropagation();}
function bindButton(el,fn){el?.addEventListener('pointerdown',stop); el?.addEventListener('pointerup',(e)=>{stop(e); fn();});}
renderer.domElement.addEventListener('pointerdown',(e)=>{pointerDown={x:e.clientX,y:e.clientY,p:pointerPoint(e)}; brush.visible=mode==='edit'; brush.position.set(pointerDown.p.x,.12,pointerDown.p.z); if(mode==='edit'&&brushLock)paintAt(pointerDown.p);});
renderer.domElement.addEventListener('pointermove',(e)=>{const p=pointerPoint(e); brush.visible=mode==='edit'; brush.position.set(p.x,.12,p.z); if(mode==='edit'&&brushLock&&pointerDown)paintAt(p);});
renderer.domElement.addEventListener('pointerup',(e)=>{if(!pointerDown)return; const moved=Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y); if(mode==='edit'&&!brushLock&&moved<8)paintAt(pointerDown.p); pointerDown=null;});
renderer.domElement.addEventListener('dblclick',resetCamera);
bindButton(modeBtn,()=>setMode(mode==='explore'?'edit':'explore')); bindButton(seedBtn,()=>generateSeed()); bindButton(resetBtn,()=>generateSeed(seed)); bindButton(hideUiBtn,()=>{app.classList.toggle('ui-hidden'); hideUiBtn.textContent=app.classList.contains('ui-hidden')?'☰':'👁️';}); bindButton(helpBtn,()=>$('#infoPanel')?.classList.toggle('is-hidden')); bindButton(brushLockBtn,()=>setBrushLock(!brushLock)); bindButton($('#undoBtn'),()=>{}); bindButton($('#redoBtn'),()=>{});
tools.forEach((btn)=>bindButton(btn,()=>{currentTool=btn.dataset.tool; tools.forEach(b=>b.classList.toggle('active',b===btn));}));
sizeButtons.forEach((btn)=>bindButton(btn,()=>{brushRadius=btn.dataset.size==='small'?1.25:btn.dataset.size==='large'?4.8:2.7; sizeButtons.forEach(b=>b.classList.toggle('active',b===btn)); rebuildBrush();}));
$('#densitySelect')?.addEventListener('change',(e)=>{currentDensity=e.target.value; refreshDecorations();});
timeSlider?.addEventListener('input',(e)=>{timeOfDay=Number(e.target.value); updateSky();});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight);});
generateSeed(seed); setMode('explore'); setBrushLock(false); updateSky();
function animate(){controls.update(); const t=performance.now()*.001; water.position.y=WATER_LEVEL+Math.sin(t*1.2)*.012; water.material.opacity=.21+Math.sin(t*1.3)*.02; cloudGroup.children.forEach((c,i)=>c.position.x+=Math.sin(t+i)*.0008); renderer.render(scene,camera); requestAnimationFrame(animate);} animate();
