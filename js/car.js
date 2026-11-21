import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { BELT_TOP, ZONES, surfaceY, surfaceSlope } from './layout.js';
import { makeSoftCircleTexture } from './effects.js';

const STEEL = new THREE.Color(0x6b7280);
let glowTex = null;

function easeOutBack(k) {
  const c1 = 1.70158, c3 = c1 + 1;
  return Math.max(0.001, 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2));
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);

export class Car {
  constructor(scene, paintColorHex, id) {
    this.id = id;
    this.paintColor = new THREE.Color(paintColorHex);
    this.x = -37;
    this.phase = Math.random() * Math.PI * 2;
    this.delivered = false;

    // reveal state (0..1, lerped toward target)
    this.hullReveal = 0;   this.hullTarget = 0;
    this.asmReveal = 0;    this.asmTarget = 0;
    this.lightsOn = false;
    this.paintedDone = false;

    const g = new THREE.Group();
    this.group = g;

    // ---- frame stage (always visible): skirt + rails + cab posts ----
    this.frameMat = new THREE.MeshStandardMaterial({ color: 0x39414f, metalness: 0.72, roughness: 0.42 });
    const skirt = new THREE.Mesh(new RoundedBoxGeometry(4.5, 0.3, 2.02, 3, 0.12), this.frameMat);
    skirt.position.y = 0.32;
    skirt.castShadow = true;
    g.add(skirt);

    const railGeo = new THREE.BoxGeometry(4.1, 0.12, 0.09);
    for (const z of [-1.06, 1.06]) {
      const rail = new THREE.Mesh(railGeo, this.frameMat);
      rail.position.set(0, 0.55, z);
      g.add(rail);
    }
    this.posts = [];
    const postGeo = new THREE.BoxGeometry(0.14, 0.5, 0.14);
    for (const px of [1.05, -1.35]) {
      for (const z of [-0.72, 0.72]) {
        const post = new THREE.Mesh(postGeo, this.frameMat);
        post.position.set(px, 0.62, z);
        g.add(post);
        this.posts.push(post);
      }
    }

    // ---- hull (revealed at welding station) ----
    this.hullGroup = new THREE.Group();
    this.bodyMat = new THREE.MeshPhysicalMaterial({
      color: STEEL.clone(), metalness: 0.35, roughness: 0.34,
      clearcoat: 0.9, clearcoatRoughness: 0.25, transparent: true, opacity: 0,
    });
    const hull = new THREE.Mesh(new RoundedBoxGeometry(4.3, 0.62, 1.9, 4, 0.18), this.bodyMat);
    hull.position.y = 0.68;
    hull.castShadow = true;
    this.hullGroup.add(hull);
    // subtle lower lip (darker steel trim along the bottom edge)
    const lip = new THREE.Mesh(new RoundedBoxGeometry(4.34, 0.16, 1.94, 2, 0.07), this.frameMat);
    lip.position.y = 0.42;
    this.hullGroup.add(lip);
    g.add(this.hullGroup);

    // ---- cabin + wheels (revealed at assembly station) ----
    this.asmGroup = new THREE.Group();
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x10161f, metalness: 0.85, roughness: 0.12, transparent: true, opacity: 0,
      clearcoat: 1, clearcoatRoughness: 0.08,
    });
    this.glassMat = glassMat;
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(2.15, 0.6, 1.66, 4, 0.26), glassMat);
    cabin.position.set(-0.3, 1.28, 0);
    cabin.castShadow = true;
    this.asmGroup.add(cabin);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.12, 1.5, 2, 0.05), this.bodyMat);
    roof.position.set(-0.3, 1.6, 0);
    this.asmGroup.add(roof);

    const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 22);
    const hubGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.32, 16);
    this.tireMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.92, metalness: 0.05, transparent: true, opacity: 0 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xc9ced8, roughness: 0.28, metalness: 0.9, transparent: true, opacity: 0 });
    this.wheels = [];
    for (const wx of [1.45, -1.45]) {
      for (const wz of [-0.88, 0.88]) {
        const wheel = new THREE.Group();
        const tire = new THREE.Mesh(tireGeo, this.tireMat);
        tire.rotation.x = Math.PI / 2;
        tire.castShadow = true;
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.rotation.x = Math.PI / 2;
        wheel.add(tire, hub);
        wheel.position.set(wx, 0.42, wz);
        this.asmGroup.add(wheel);
        this.wheels.push(wheel);
      }
    }
    g.add(this.asmGroup);

    // ---- lights ----
    const headMat = new THREE.MeshStandardMaterial({ color: 0x2a2416, emissive: 0xfff3c4, emissiveIntensity: 0 });
    this.headMat = headMat;
    const headGeo = new THREE.BoxGeometry(0.12, 0.16, 0.36);
    for (const z of [-0.6, 0.6]) {
      const h = new THREE.Mesh(headGeo, headMat);
      h.position.set(2.14, 0.72, z);
      g.add(h);
    }
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x220a0a, emissive: 0xff2222, emissiveIntensity: 1.4 });
    for (const z of [-0.62, 0.62]) {
      const t = new THREE.Mesh(headGeo, tailMat);
      t.position.set(-2.14, 0.72, z);
      g.add(t);
    }

    // headlight glow sprites (fade in when finished)
    if (!glowTex) glowTex = makeSoftCircleTexture();
    this.headGlows = [];
    for (const z of [-0.6, 0.6]) {
      const m = new THREE.SpriteMaterial({ map: glowTex, color: 0xffe9b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(m);
      s.position.set(2.35, 0.72, z);
      s.scale.set(1.5, 1.5, 1);
      g.add(s);
      this.headGlows.push(m);
    }

    scene.add(g);
    this.group.position.set(this.x, surfaceY(this.x), 0);
  }

  update(dt, t, speed) {
    // advance along the line
    this.x += speed * dt;
    const x = this.x;

    // ---- staged reveals ----
    if (x >= -17.5) this.hullTarget = 1;
    if (x >= 3.2) this.asmTarget = 1;
    if (x >= 13.4 && !this.lightsOn) { this.lightsOn = true; }

    const rate = Math.min(1, dt * 3.6);
    this.hullReveal += (this.hullTarget - this.hullReveal) * rate;
    this.asmReveal += (this.asmTarget - this.asmReveal) * rate;

    // hull pop-in + fade
    const hk = clamp01(this.hullReveal);
    this.hullGroup.scale.setScalar(easeOutBack(hk));
    this.bodyMat.opacity = Math.min(1, hk * 1.6);
    // frame posts shrink away once hull appears
    const postScale = Math.max(0.001, 1 - hk * 1.4);
    for (const p of this.posts) p.scale.setScalar(postScale);

    // assembly pop-in
    const ak = clamp01(this.asmReveal);
    this.asmGroup.scale.setScalar(easeOutBack(ak));
    this.glassMat.opacity = Math.min(1, ak * 1.6);
    this.tireMat.opacity = Math.min(1, ak * 1.8);
    // hub material is shared with roof? no — separate; set opacity:
    const hubMat = this.wheels[0]?.children[1]?.material;
    if (hubMat) hubMat.opacity = Math.min(1, ak * 1.8);

    // ---- paint job: gray -> target color across the paint zone ----
    const { x0, x1 } = ZONES.paint;
    if (x >= x0 && !this.paintedDone) {
      const k = smooth(clamp01((x - x0) / (x1 - x0)));
      this.bodyMat.color.copy(STEEL).lerp(this.paintColor, k);
    } else if (x >= x1 && !this.paintedDone) {
      this.bodyMat.color.copy(this.paintColor);
      this.paintedDone = true;
    }

    // ---- wheels spin + body bob ----
    for (const w of this.wheels) w.rotation.z -= (speed * dt / 0.42);
    const bob = Math.sin(t * 2.3 + this.phase) * 0.02;
    this.hullGroup.position.y = bob;
    this.asmGroup.position.y = bob * 1.4;

    // ---- lights on when finished ----
    const targetGlow = this.lightsOn ? 0.85 : 0;
    for (const m of this.headGlows) {
      m.opacity += (targetGlow - m.opacity) * Math.min(1, dt * 4);
    }
    const targetEmissive = this.lightsOn ? 3.2 : 0;
    this.headMat.emissiveIntensity += (targetEmissive - this.headMat.emissiveIntensity) * Math.min(1, dt * 4);

    // ---- position on line / ramp / road ----
    const y = surfaceY(x);
    this.group.position.set(x, y, 0);
    this.group.rotation.z = surfaceSlope(x);

    return x > 64; // caller removes when true
  }
}
