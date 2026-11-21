import * as THREE from 'three';
import { surfaceY, ZONES, CAR_SPEED, SPAWN_INTERVAL, DESPAWN_X } from './layout.js';
import { makeSky, makeGround, makeBuilding, makeConveyor, makeStations, makeBackground } from './world.js';
import { Car } from './car.js';
import { Sparks, Mist } from './effects.js';

// ---------------- renderer / scene / camera ----------------
const container = document.getElementById('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('loaderText').textContent = 'WebGL is not available in this browser.';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.42;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x1c2138, 70, 175);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 600);

// ---------------- lights ----------------
scene.add(new THREE.HemisphereLight(0xa3b6d8, 0x2a211a, 0.95));
const sun = new THREE.DirectionalLight(0xffd9a0, 2.15);
sun.position.set(45, 32, 38);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 5; sun.shadow.camera.far = 170;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
const sunTarget = new THREE.Object3D();
sunTarget.position.set(-6, 0, 0);
scene.add(sunTarget);
sun.target = sunTarget;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x7d92c2, 0.55);
fill.position.set(40, 25, 60);
scene.add(fill);

// ---------------- world ----------------
makeSky(scene);
makeGround(scene);
const buildingRefs = makeBuilding(scene);
const conveyorRefs = makeConveyor(scene);
const stationRefs = makeStations(scene);
const bgRefs = makeBackground(scene);

// ---------------- particles ----------------
const sparks = new Sparks(180); scene.add(sparks.points);
const mist = new Mist(260); scene.add(mist.points);

// ---------------- camera rig (custom orbit) ----------------
const camTarget = new THREE.Vector3(-4, 2.6, 0);
const DEFAULT_VIEW = { theta: 0.88, phi: 1.27, radius: 49 };
let theta = DEFAULT_VIEW.theta, phi = DEFAULT_VIEW.phi, radius = DEFAULT_VIEW.radius;
let lastInteract = -10;   // seconds since interaction (game-time independent)
let cameraTween = null;   // {t, from:{...}, to:{...}}
const clockNow = () => performance.now() / 1000;

function applyCamera() {
  const sp = Math.sin(phi), cp = Math.cos(phi);
  camera.position.set(
    camTarget.x + radius * sp * Math.cos(theta),
    camTarget.y + radius * cp,
    camTarget.z + radius * sp * Math.sin(theta)
  );
  camera.lookAt(camTarget);
}
applyCamera();

const canvas = renderer.domElement;
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  lastInteract = clockNow(); cameraTween = null;
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  theta -= dx * 0.0052;
  phi = THREE.MathUtils.clamp(phi - dy * 0.004, 0.22, 1.38);
  lastInteract = clockNow();
});
canvas.addEventListener('pointerup', () => { dragging = false; lastInteract = clockNow(); });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  radius = THREE.MathUtils.clamp(radius * Math.exp(e.deltaY * 0.0011), 16, 85);
  lastInteract = clockNow(); cameraTween = null;
}, { passive: false });
canvas.addEventListener('dblclick', () => resetView());
// touch pinch zoom (two pointers)
const activePointers = new Map();
let pinchDist = 0;
canvas.addEventListener('pointerdown', (e) => {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2) {
    const [a, b] = [...activePointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2) {
    const [a, b] = [...activePointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0 && d > 0) {
      radius = THREE.MathUtils.clamp(radius * (pinchDist / d), 16, 85);
    }
    pinchDist = d;
    lastInteract = clockNow(); cameraTween = null;
  }
});
const endPointer = (e) => { activePointers.delete(e.pointerId); if (activePointers.size < 2) pinchDist = 0; };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

function resetView() {
  cameraTween = { t: 0, from: { theta, phi, radius }, to: { ...DEFAULT_VIEW } };
}
document.getElementById('resetViewBtn').addEventListener('click', () => { resetView(); lastInteract = clockNow(); });

// ---------------- game state ----------------
const PAINT_PALETTE = [0xff5a36, 0x38bdf8, 0xfacc15, 0xa78bfa, 0x34d399, 0xf472b6, 0xe5484d];
let cars = [];
let nextCarId = 1;
let spawnTimer = 2.5;         // first car appears shortly after load
let deliveredCount = 0;
let paused = false;
let multiplier = 1;
let gameTime = 0;
let beltScroll = 0;
const clock = new THREE.Clock();

// ---------------- UI refs & wiring ----------------
const elCars = document.getElementById('statCars');
const elOnLine = document.getElementById('statOnLine');
const elSpeed = document.getElementById('statSpeed');
const pauseBtn = document.getElementById('pauseBtn');
const pauseIconPlay = document.getElementById('iconPlay');
const pauseIconPause = document.getElementById('iconPause');
const pausedPill = document.getElementById('pausedPill');
const toastsEl = document.getElementById('toasts');
const chips = {
  raw: document.querySelector('[data-chip="raw"]'),
  weld: document.querySelector('[data-chip="weld"]'),
  paint: document.querySelector('[data-chip="paint"]'),
  assembly: document.querySelector('[data-chip="assembly"]'),
  check: document.querySelector('[data-chip="check"]'),
  delivery: document.querySelector('[data-chip="delivery"]'),
};

function setPaused(p) {
  paused = p;
  pauseIconPlay.style.display = p ? 'block' : 'none';
  pauseIconPause.style.display = p ? 'none' : 'block';
  pausedPill.classList.toggle('visible', p);
}
pauseBtn.addEventListener('click', () => setPaused(!paused));
document.querySelectorAll('[data-speed]').forEach((btn) => {
  btn.addEventListener('click', () => {
    multiplier = parseFloat(btn.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', b === btn));
  });
});
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-dot"></span>${msg}`;
  toastsEl.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}

// ---------------- per-frame world animation helpers ----------------
const neutralPaint = new THREE.Color(0x67e8f9);
let paintTint = neutralPaint.clone();   // current volume/nozzle color (lerped)

function updateWorldAnimations(dt, t, speed) {
  // belt rollers scroll with the line (beltScroll advanced by caller only when unpaused)
  const span = 48.5;
  for (const r of conveyorRefs.rollers) {
    if (r.userData.base === undefined) r.userData.base = r.position.x;
    const base = r.userData.base;
    r.position.x = -31 + ((base + beltScroll + 31) % span + span) % span;
  }

  // gantry crane hook sway
  const cz = Math.sin(t * 0.32) * 2.6;
  buildingRefs.crane.trolley.position.z = cz;
  buildingRefs.crane.cable.position.z = cz;
  buildingRefs.crane.hook.position.z = cz + Math.sin(t * 0.9) * 0.12;
  buildingRefs.crane.hook.rotation.z = Math.sin(t * 0.9) * 0.08;

  // zone occupancy (cars currently inside each stage)
  const inZone = { raw: false, weld: false, paint: false, assembly: false, check: false };
  let deliveryCars = 0;
  for (const car of cars) {
    const x = car.x;
    if (x >= ZONES.raw.x0 && x <= ZONES.raw.x1) inZone.raw = true;
    if (x >= ZONES.weld.x0 && x <= ZONES.weld.x1) inZone.weld = true;
    if (x >= ZONES.paint.x0 && x <= ZONES.paint.x1) inZone.paint = true;
    if (x >= ZONES.assembly.x0 && x <= ZONES.assembly.x1) inZone.assembly = true;
    if (x >= ZONES.check.x0 && x <= ZONES.check.x1) inZone.check = true;
    if (x > 16) deliveryCars++;
  }

  // welding lamps pulse while a car is under the arch
  const weldPulse = inZone.weld ? 0.55 + 0.45 * Math.sin(t * 9) : 0.35;
  for (const m of stationRefs.weldLamps) m.color.setHex(0xff8c1a).multiplyScalar(weldPulse);

  // assembly lamps pulse similarly
  const asmPulse = inZone.assembly ? 0.55 + 0.45 * Math.sin(t * 7.5 + 1.3) : 0.35;
  for (const m of stationRefs.assemblyLamps) m.color.setHex(0x22d3ee).multiplyScalar(asmPulse);

  // check strip pulses green when a car is inside the arch
  const chkPulse = inZone.check ? 0.6 + 0.4 * Math.sin(t * 8) : 0.45;
  stationRefs.checkStripMat.color.setHex(0x34d399).multiplyScalar(chkPulse);

  // paint volume color: follow the car being painted (or neutral cyan)
  let targetTint = neutralPaint;
  for (const car of cars) {
    if (car.x >= ZONES.paint.x0 && car.x <= ZONES.paint.x1) { targetTint = car.paintColor; break; }
  }
  paintTint.lerp(targetTint, Math.min(1, dt * 3));
  stationRefs.paintVolumeMat.color.copy(paintTint);
  for (const m of stationRefs.paintNozzles) m.color.copy(paintTint);

  // paint mist particles while a car is in the zone
  if (inZone.paint && Math.random() < dt * 22) {
    mist.spawnAt(-5.5, 5.55, 0, paintTint, 2);
  }

  // welding sparks while a car is under the arch
  if (inZone.weld && Math.random() < dt * 26) {
    const car = cars.find((c) => c.x >= ZONES.weld.x0 && c.x <= ZONES.weld.x1);
    if (car) sparks.spawnAt(car.x + (Math.random() - 0.5) * 2.6, 1.62, (Math.random() - 0.5) * 1.7, 3);
  }

  // quality-check sweep plane: scan across the arch while a car is inside
  const sweep = stationRefs.sweepPlane;
  if (inZone.check) {
    sweep.visible = true;
    const k = ((t * 1.35) % 1 + 1) % 1;
    sweep.position.x = 9.6 + k * 2.8;
    sweep.material.opacity = 0.22 + 0.18 * Math.sin(t * 10);
  } else {
    sweep.visible = false;
  }

  // robotic arms: swing toward the belt when a car is in their zone
  for (const arm of stationRefs.arms) {
    const sideSign = Math.sign(arm.baseZ);           // +1 front, -1 back
    const activeZone = arm.zone === 'weld' ? ZONES.weld : ZONES.assembly;
    let targetSwing = 0.12 * Math.sin(t * 0.8 + arm.phase);
    for (const car of cars) {
      if (car.x >= activeZone.x0 && car.x <= activeZone.x1) {
        targetSwing = 0.42 + Math.sin(t * 3.2 + arm.phase) * 0.34;
        break;
      }
    }
    const tilt = sideSign > 0 ? -targetSwing : targetSwing; // lean toward belt center
    arm.shoulder.rotation.x += (tilt - arm.shoulder.rotation.x) * Math.min(1, dt * 5);
    arm.elbow.rotation.x = -arm.shoulder.rotation.x * 0.55 + Math.sin(t * 2.6 + arm.phase) * 0.08;
  }

  // smoke stacks (factory roof + background)
  for (const s of buildingRefs.smokes) s.update(dt, t);
  for (const s of bgRefs.smokes) s.update(dt, t);

  // legend chips
  chips.raw.classList.toggle('active', inZone.raw);
  chips.weld.classList.toggle('active', inZone.weld);
  chips.paint.classList.toggle('active', inZone.paint);
  chips.assembly.classList.toggle('active', inZone.assembly);
  chips.check.classList.toggle('active', inZone.check);
  chips.delivery.classList.toggle('active', deliveryCars > 0);
}

// ---------------- spawn / remove cars ----------------
function pickColor() { return PAINT_PALETTE[Math.floor(Math.random() * PAINT_PALETTE.length)]; }
function spawnCar(startX = -37) {
  const car = new Car(scene, pickColor(), nextCarId++);
  if (startX !== -37) { car.x = startX; car.group.position.set(car.x, surfaceY(car.x), 0); }
  cars.push(car);
}
// pre-populate the line so it is alive from the first frame
for (const startX of [-27, -7, 9]) spawnCar(startX);

// ---------------- main loop ----------------
let statTimer = 0;
function animate() {
  requestAnimationFrame(animate);
  const dtRaw = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime; // wall-time for ambient animation (keeps sky/smoke alive when paused)
  const speed = CAR_SPEED * multiplier;
  const dt = paused ? 0 : dtRaw * multiplier;   // world time step
  gameTime += dt;

  // camera: auto-rotate after idle + reset tween
  if (cameraTween) {
    cameraTween.t += dtRaw / 0.9;
    const k = Math.min(1, cameraTween.t);
    const e = k * k * (3 - 2 * k);
    theta = THREE.MathUtils.lerp(cameraTween.from.theta, cameraTween.to.theta, e);
    phi = THREE.MathUtils.lerp(cameraTween.from.phi, cameraTween.to.phi, e);
    radius = THREE.MathUtils.lerp(cameraTween.from.radius, cameraTween.to.radius, e);
    if (k >= 1) cameraTween = null;
  } else if (!dragging && clockNow() - lastInteract > 5) {
    theta += dtRaw * 0.045;
  }
  applyCamera();

  // spawn cars on a timer (game time, so pause freezes the line)
  if (!paused) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnCar();
      spawnTimer = SPAWN_INTERVAL * (0.85 + Math.random() * 0.3);
    }
  }

  // update cars
  for (let i = cars.length - 1; i >= 0; i--) {
    const car = cars[i];
    if (!paused) {
      const remove = car.update(dt, t, speed);
      if (car.x > 20 && !car.delivered) {
        car.delivered = true;
        deliveredCount++;
        toast(`Car #${car.id} delivered — line output ${deliveredCount}`);
      }
      if (remove || car.x > DESPAWN_X) {
        scene.remove(car.group);
        cars.splice(i, 1);
        continue;
      }
    }
  }

  if (!paused) beltScroll += speed * dt;

  // world animation (uses wall-time t for ambient motion so smoke/sky stay alive when paused)
  updateWorldAnimations(dtRaw, t, speed);

  // particles always tick with real dt so effects don't freeze mid-air on pause (subtle slowdown instead)
  sparks.update(dtRaw * (paused ? 0.25 : multiplier), t);
  mist.update(dtRaw * (paused ? 0.25 : multiplier), t);

  // stats DOM (throttled)
  statTimer -= dtRaw;
  if (statTimer <= 0) {
    statTimer = 0.15;
    elCars.textContent = String(deliveredCount);
    elOnLine.textContent = String(cars.length);
    elSpeed.textContent = `${multiplier}×`;
  }

  renderer.render(scene, camera);
}
animate();

// debug/testing hook (harmless in production)
window.__factory = {
  get cars() { return cars.map(c => ({ id: c.id, x: +c.x.toFixed(2), delivered: c.delivered })); },
  get deliveredCount() { return deliveredCount; },
  get paused() { return paused; },
  get multiplier() { return multiplier; },
};

// ---------------- resize / loader ----------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
requestAnimationFrame(() => {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 900);
  }
});
