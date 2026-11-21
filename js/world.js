import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { BELT_START, BELT_END, ZONES } from './layout.js';
import { makeSoftCircleTexture, Smoke } from './effects.js';

// ---------- canvas texture helpers ----------
function gradientSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  // canvas y=0 is top of texture (v=1 at sphere top)
  g.addColorStop(0.00, '#04060e');
  g.addColorStop(0.38, '#0d1530');
  g.addColorStop(0.52, '#232047');
  g.addColorStop(0.58, '#4a3050');
  g.addColorStop(0.63, '#6e4638');   // warm horizon band
  g.addColorStop(0.68, '#2b2340');
  g.addColorStop(1.00, '#141126');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b101c';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      if (Math.random() < 0.42) {
        const warm = Math.random() < 0.7;
        ctx.fillStyle = warm ? 'rgba(255,205,130,0.9)' : 'rgba(150,200,255,0.85)';
        ctx.fillRect(x, y, 8, 10);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hazardStripeTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 16;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8b13a';
  ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = '#15181f';
  for (let x = -16; x < 80; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 16); ctx.lineTo(x + 12, 0); ctx.lineTo(x + 24, 0); ctx.lineTo(x + 12, 16);
    ctx.closePath(); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// ---------- sky, stars, sun glow ----------
export function makeSky(scene) {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(280, 32, 20),
    new THREE.MeshBasicMaterial({ map: gradientSkyTexture(), side: THREE.BackSide, fog: false })
  );
  scene.add(sphere);

  // stars (upper hemisphere)
  const starCount = 420;
  const pos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.85 + 0.12); // bias toward top
    const r = 265;
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xdfe8ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false, depthWrite: false,
  }));
  scene.add(stars);

  // warm sun glow near horizon (right side, behind the exit road)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSoftCircleTexture(), color: 0xff9e5e, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  glow.position.set(190, 42, 130);
  glow.scale.set(150, 90, 1);
  scene.add(glow);
}

// ---------- ground / pad / road ----------
export function makeGround(scene) {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(280, 48),
    new THREE.MeshStandardMaterial({ color: 0x12151f, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // concrete pad under the building (top at y=0.14)
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(54, 0.14, 19.5),
    new THREE.MeshStandardMaterial({ color: 0x222836, roughness: 0.95 })
  );
  pad.position.set(-7.5, 0.07, -1.75); // spans x[-34.5,19.5] z[-11.5,8]
  pad.receiveShadow = true;
  scene.add(pad);

  // road strip exiting to the right (x from 16 onward)
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 7),
    new THREE.MeshStandardMaterial({ color: 0x181d29, roughness: 1 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(48, 0.02, 0); // spans x[16,80]
  road.receiveShadow = true;
  scene.add(road);

  // dashed center line + solid edge lines
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c98a });
  for (let x = 19; x < 78; x += 7) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(3, 0.03, 0.26), dashMat);
    dash.position.set(x, 0.045, 0);
    scene.add(dash);
  }
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x8b93a5 });
  for (const z of [-3.25, 3.25]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(62, 0.03, 0.18), edgeMat);
    edge.position.set(48, 0.045, z);
    scene.add(edge);
  }

  // hazard stripes along the ramp edges (follow the slope)
  const stripeTex = hazardStripeTexture();
  stripeTex.repeat.set(6, 1);
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.8 });
  const slopeAngle = Math.atan2(0.03 - 1.0, 19 - 16); // matches surfaceY ramp
  for (const z of [-3.35, 3.35]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.07, 0.42), stripeMat);
    stripe.position.set(17.5, 0.55, z);
    stripe.rotation.z = slopeAngle;
    scene.add(stripe);
  }
}

// ---------- building shell ----------
export function makeBuilding(scene) {
  const refs = {};
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x1c2333, roughness: 0.82, metalness: 0.25 });
  const columnMat = new THREE.MeshStandardMaterial({ color: 0x232b3d, roughness: 0.7, metalness: 0.4 });

  // back wall + ribs
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(54, 8.2, 0.4), steelDark);
  backWall.position.set(-7, 4.1, -10);
  backWall.castShadow = true; backWall.receiveShadow = true;
  scene.add(backWall);
  for (let x = -32; x <= 18; x += 6.5) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.35, 8.2, 0.25), columnMat);
    rib.position.set(x, 4.1, -9.72);
    scene.add(rib);
  }
  // clerestory windows (warm lit strips near the top of the back wall)
  const winMatA = new THREE.MeshBasicMaterial({ color: 0xe8c98f });
  const winMatB = new THREE.MeshBasicMaterial({ color: 0x9fb6d8 });
  for (let i = 0; i < 10; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.15), i % 3 === 2 ? winMatB : winMatA);
    w.position.set(-30 + i * 5.4, 6.35, -9.78);
    scene.add(w);
  }

  // columns: back row + two front corner posts (front stays open for the camera)
  const colGeo = new THREE.BoxGeometry(0.5, 8.2, 0.5);
  for (let x = -33; x <= 19; x += 7.6) {
    const c = new THREE.Mesh(colGeo, columnMat);
    c.position.set(x, 4.1, -9.35);
    c.castShadow = true;
    scene.add(c);
  }
  for (const [cx, cz] of [[-34, 6.2], [20, 6.2]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 8.2, 0.55), columnMat);
    post.position.set(cx, 4.1, cz);
    post.castShadow = true;
    scene.add(post);
  }

  // roof slab + underside light strips
  const roof = new THREE.Mesh(new THREE.BoxGeometry(56, 0.5, 17.4), new THREE.MeshStandardMaterial({ color: 0x161c29, roughness: 0.9 }));
  roof.position.set(-7, 8.45, -1.75);
  roof.castShadow = true;
  scene.add(roof);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffe3b8 });
  for (const z of [-6, 0, 4.5]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(50, 0.1, 0.42), stripMat);
    strip.position.set(-7, 8.16, z);
    scene.add(strip);
  }

  // warm interior point lights under the roof
  for (const x of [-20, -2, 14]) {
    const pl = new THREE.PointLight(0xffc98a, 95, 30, 2);
    pl.position.set(x, 7.3, 0);
    scene.add(pl);
  }

  // smokestacks on the roof (raw-material side) + animated smoke
  refs.smokes = [];
  for (const sx of [-25, -19]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 5.4, 18), columnMat);
    stack.position.set(sx, 11.3, -8.3);
    stack.castShadow = true;
    scene.add(stack);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.4, 18), steelDark);
    rim.position.set(sx, 14.05, -8.3);
    scene.add(rim);
    const smoke = new Smoke(sx, 14.2, -8.3, 9, 2.6);
    scene.add(smoke.group);
    refs.smokes.push(smoke);
  }

  // roof vent boxes
  for (const [vx, vz] of [[-10, -6], [2, -6.5], [12, -5.8]]) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 1.25), steelDark);
    vent.position.set(vx, 9.05, vz);
    scene.add(vent);
  }

  // gantry crane over the raw-material zone (animated hook)
  const craneMat = new THREE.MeshStandardMaterial({ color: 0x2a3244, roughness: 0.6, metalness: 0.5 });
  for (const z of [-4.8, 4.8]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 7.1, 0.45), craneMat);
    leg.position.set(-27, 3.55, z);
    leg.castShadow = true;
    scene.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 10.6), craneMat);
  beam.position.set(-27, 7.35, 0);
  beam.castShadow = true;
  scene.add(beam);
  const beamGlow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 9.6), new THREE.MeshBasicMaterial({ color: 0xffb454 }));
  beamGlow.position.set(-27, 6.86, 0);
  scene.add(beamGlow);
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.7, 1.35), craneMat);
  trolley.position.set(-27, 6.75, 0);
  scene.add(trolley);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.5, 6), new THREE.MeshStandardMaterial({ color: 0x11141c }));
  cable.position.set(-27, 5.35, 0);
  scene.add(cable);
  const hook = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.5, 0.55, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0xe8b13a, roughness: 0.5, metalness: 0.6 }));
  hook.position.set(-27, 3.95, 0);
  scene.add(hook);
  refs.crane = { trolley, cable, hook };

  // raw material piles (steel sheets + engine block) along the back wall
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b8, metalness: 0.85, roughness: 0.35 });
  for (const [px, pz] of [[-30, -6.6], [-25.5, -7.1], [-22, -6.4]]) {
    const stack = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.13, 2.15), steelMat);
      sheet.position.set((Math.random() - 0.5) * 0.25, 0.35 + i * 0.16, (Math.random() - 0.5) * 0.25);
      sheet.rotation.y = (Math.random() - 0.5) * 0.22;
      sheet.castShadow = true;
      stack.add(sheet);
    }
    stack.position.set(px, 0.14, pz);
    scene.add(stack);
  }
  const engineBlock = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.95, 1.15, 2, 0.16), new THREE.MeshStandardMaterial({ color: 0x3a4150, metalness: 0.6, roughness: 0.45 }));
  engineBlock.position.set(-27.5, 0.62, -6.1);
  engineBlock.castShadow = true;
  scene.add(engineBlock);
  const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.55, 12), steelMat);
  intake.position.set(-27.5, 1.35, -6.1);
  scene.add(intake);

  // parts rack behind the belt at the assembly station (spare wheels + crate)
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x2c3547, roughness: 0.6, metalness: 0.5 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 1.3), tableMat);
  table.position.set(4, 1.05, -6.2);
  table.castShadow = true;
  scene.add(table);
  for (const [lx, lz] of [[-1.25, -0.5], [1.25, -0.5], [-1.25, 0.5], [1.25, 0.5]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.14), tableMat);
    leg.position.set(4 + lx, 0.52, -6.2 + lz);
    scene.add(leg);
  }
  const spareTireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.24, 20);
  const spareHubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 14);
  for (const [wx, wz] of [[3.35, -6.45], [4.65, -5.95]]) {
    const tire = new THREE.Mesh(spareTireGeo, new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 }));
    tire.position.set(wx, 1.3, wz);
    scene.add(tire);
    const hub = new THREE.Mesh(spareHubGeo, steelMat);
    hub.position.set(wx, 1.31, wz);
    scene.add(hub);
  }
  const crate = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.72, 0.9, 2, 0.08), new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 0.85 }));
  crate.position.set(5.6, 1.5, -6.35);
  crate.castShadow = true;
  scene.add(crate);

  // exit portal beam over the road (right end of building)
  const portalMat = columnMat;
  for (const z of [-3.6, 3.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 7.4, 0.42), portalMat);
    post.position.set(20, 3.7, z);
    post.castShadow = true;
    scene.add(post);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.15, 7.9), portalMat);
  header.position.set(20, 7.35, 0);
  scene.add(header);
  const exitStrip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 2.6), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
  exitStrip.position.set(20, 6.68, 0);
  scene.add(exitStrip);

  return refs;
}

// ---------- conveyor belt + infeed stub ----------
export function makeConveyor(scene) {
  const refs = {};
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.85 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x2a3244, metalness: 0.6, roughness: 0.45 });

  // main belt (top at y=1.0) + infeed stub to the left
  const belt = new THREE.Mesh(new THREE.BoxGeometry(BELT_END - BELT_START, 0.55, 3.6), beltMat);
  belt.position.set((BELT_START + BELT_END) / 2, 0.725, 0);
  belt.receiveShadow = true;
  scene.add(belt);
  const stub = new THREE.Mesh(new THREE.BoxGeometry(9, 0.55, 3.6), beltMat);
  stub.position.set(-33.5, 0.725, 0);
  scene.add(stub);

  // side rails along the whole run (incl. stub)
  for (const z of [-1.86, 1.86]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(BELT_END - BELT_START + 9, 0.2, 0.12), railMat);
    rail.position.set((-37 + BELT_END) / 2, 1.08, z);
    scene.add(rail);
  }

  // support legs (reach the concrete pad top at y=0.14)
  const legGeo = new THREE.BoxGeometry(0.32, 0.5, 0.32);
  for (let x = -36; x <= 15; x += 7.6) {
    for (const z of [-1.4, 1.4]) {
      const leg = new THREE.Mesh(legGeo, railMat);
      leg.position.set(x, 0.25, z);
      scene.add(leg);
    }
  }

  // scrolling roller strips on the belt surface (visible motion cue)
  refs.rollers = [];
  const rollerGeo = new THREE.BoxGeometry(0.55, 0.07, 3.35);
  const rollerMat = new THREE.MeshStandardMaterial({ color: 0x232a38, roughness: 0.7 });
  for (let x = BELT_START - 1; x <= BELT_END + 1; x += 2.05) {
    const r = new THREE.Mesh(rollerGeo, rollerMat);
    r.position.set(x, 1.02, 0);
    scene.add(r);
    refs.rollers.push(r);
  }
  return refs;
}

// ---------- stations (welding / paint / assembly / check) ----------
export function makeStations(scene) {
  const refs = {};
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x232b3d, roughness: 0.65, metalness: 0.45 });

  // --- welding arch (orange lamps) ---
  for (const z of [-2.6, 2.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.2, 0.35), steelDark);
    post.position.set(-16, 2.6, z);
    post.castShadow = true;
    scene.add(post);
  }
  const weldBeam = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 5.9), steelDark);
  weldBeam.position.set(-16, 5.35, 0);
  scene.add(weldBeam);
  refs.weldLamps = [];
  for (const z of [-1.6, 0, 1.6]) {
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xff8c1a });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.2), lampMat);
    lamp.position.set(-16, 5.05, z);
    scene.add(lamp);
    refs.weldLamps.push(lampMat);
  }

  // --- paint gantry (cyan nozzles + translucent volume) ---
  const pc = -5.5; // zone center x
  for (const px of [-8.6, -2.4]) {
    for (const z of [-3.6, 3.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 6.5, 0.32), steelDark);
      post.position.set(px, 3.25, z);
      post.castShadow = true;
      scene.add(post);
    }
  }
  for (const z of [-3.6, 3.6]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.35, 0.35), steelDark);
    rail.position.set(pc, 6.55, z);
    scene.add(rail);
  }
  const spine = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.3, 0.3), steelDark);
  spine.position.set(pc, 6.35, 0);
  scene.add(spine);
  refs.paintNozzles = [];
  for (let i = 0; i < 5; i++) {
    const nx = -8 + i * 1.25;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.05, 0.5, 10), steelDark);
    nozzle.position.set(nx, 6.0, 0);
    scene.add(nozzle);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), tipMat);
    tip.position.set(nx, 5.72, 0);
    scene.add(tip);
    refs.paintNozzles.push(tipMat);
  }
  const volumeMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide });
  const volume = new THREE.Mesh(new THREE.BoxGeometry(7.2, 4.6, 4.6), volumeMat);
  volume.position.set(pc, 3.35, 0);
  scene.add(volume);
  refs.paintVolumeMat = volumeMat;

  // --- assembly arch (cyan lamps) ---
  for (const z of [-2.6, 2.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.1, 0.35), steelDark);
    post.position.set(4, 2.55, z);
    post.castShadow = true;
    scene.add(post);
  }
  const asmBeam = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 5.9), steelDark);
  asmBeam.position.set(4, 5.25, 0);
  scene.add(asmBeam);
  refs.assemblyLamps = [];
  for (const z of [-1.6, 0, 1.6]) {
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.2), lampMat);
    lamp.position.set(4, 4.95, z);
    scene.add(lamp);
    refs.assemblyLamps.push(lampMat);
  }

  // --- quality check arch (green strip + sweep plane) ---
  for (const z of [-2.6, 2.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.9, 0.35), steelDark);
    post.position.set(11, 2.45, z);
    post.castShadow = true;
    scene.add(post);
  }
  const checkBeam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 5.9), steelDark);
  checkBeam.position.set(11, 4.95, 0);
  scene.add(checkBeam);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 5.2), stripMat);
  strip.position.set(11, 4.68, 0);
  scene.add(strip);
  refs.checkStripMat = stripMat;
  const sweepMat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
  const sweep = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 4.4), sweepMat);
  sweep.position.set(11, 2.9, 0);
  sweep.visible = false;
  scene.add(sweep);
  refs.sweepPlane = sweep;

  // --- robotic arms (welding x2 sides, assembly x1 back side) ---
  refs.arms = [];
  const armMat = new THREE.MeshStandardMaterial({ color: 0xd97b29, roughness: 0.45, metalness: 0.55 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x2a3244, roughness: 0.5, metalness: 0.6 });
  function makeArm(baseX, baseZ, phase, zone) {
    const root = new THREE.Group();
    root.position.set(baseX, 1.0, baseZ);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.7, 14), jointMat);
    base.position.y = 0.35;
    root.add(base);
    const shoulder = new THREE.Group();
    shoulder.position.y = 0.75;
    root.add(shoulder);
    const upper = new THREE.Mesh(new RoundedBoxGeometry(0.34, 2.5, 0.34, 2, 0.12), armMat);
    upper.position.y = 1.25;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = 2.5;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new RoundedBoxGeometry(0.26, 1.9, 0.26, 2, 0.1), armMat);
    fore.position.y = 0.95;
    elbow.add(fore);
    const claw = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.4, 0.5, 2, 0.1), jointMat);
    claw.position.y = 2.0;
    elbow.add(claw);
    scene.add(root);
    const arm = { root, shoulder, elbow, phase, baseZ, zone };
    refs.arms.push(arm);
    return arm;
  }
  makeArm(-16, -3.1, 0.0, 'weld');   // welding left side (back)
  makeArm(-16, 3.1, 2.1, 'weld');    // welding right side (front)
  makeArm(4, -3.1, 4.2, 'assembly');     // assembly back side

  return refs;
}

// ---------- background city + distant stacks ----------
export function makeBackground(scene) {
  const tex = windowTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  for (let i = 0; i < 16; i++) {
    const w = 6 + Math.random() * 7;
    const h = 9 + Math.random() * 26;
    const d = 6 + Math.random() * 5;
    const x = -95 + i * 13 + (Math.random() - 0.5) * 8;
    const z = -48 - Math.random() * 30;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    box.position.set(x, h / 2, z);
    scene.add(box);
  }
  // distant smokestacks with slow smoke (left background)
  const refs = { smokes: [] };
  for (const [sx, sz] of [[-58, -34], [-50, -40]]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 17, 14), new THREE.MeshStandardMaterial({ color: 0x141a28, roughness: 0.9 }));
    stack.position.set(sx, 8.5, sz);
    scene.add(stack);
    const smoke = new Smoke(sx, 17.4, sz, 7, 3.6);
    scene.add(smoke.group);
    refs.smokes.push(smoke);
  }
  return refs;
}
