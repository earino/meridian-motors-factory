import * as THREE from 'three';

// ---------- shared soft-circle texture (for sprites / glow) ----------
export function makeSoftCircleTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- generic point-particle pool (sparks / mist) ----------
class PointPool {
  constructor(max, size, blending) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);     // remaining life
    this.maxLife = new Float32Array(max);
    this.baseColor = new Float32Array(max * 3);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.drift = new Float32Array(max);     // horizontal drift amplitude
    this.phase = new Float32Array(max);
    this.alive = 0;
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    // park everything far away initially
    for (let i = 0; i < max; i++) {
      this.positions[i * 3 + 1] = -9999;
      this.life[i] = 0;
    }
  }

  spawn(x, y, z, opts = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const spread = opts.spread ?? 0.4;
    this.positions[i * 3]     = x + (Math.random() - 0.5) * spread;
    this.positions[i * 3 + 1] = y + (Math.random() - 0.5) * spread * 0.6;
    this.positions[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
    const vSpread = opts.vSpread ?? 1.4;
    this.vel[i * 3]     = (Math.random() - 0.5) * vSpread + (opts.vx ?? 0);
    this.vel[i * 3 + 1] = (opts.vy ?? 2.2) * (0.6 + Math.random() * 0.8);
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * vSpread + (opts.vz ?? 0);
    const life = opts.life ?? (0.4 + Math.random() * 0.5);
    this.life[i] = life;
    this.maxLife[i] = life;
    const c = opts.color ?? new THREE.Color(1, 0.7, 0.3);
    const bright = 0.75 + Math.random() * 0.45;
    this.baseColor[i * 3]     = c.r * bright;
    this.baseColor[i * 3 + 1] = c.g * bright;
    this.baseColor[i * 3 + 2] = c.b * bright;
    this.gravity[i] = opts.gravity ?? -12;
    this.drag[i] = opts.drag ?? 0.4;
    this.drift[i] = opts.drift ?? 0;
    this.phase[i] = Math.random() * Math.PI * 2;
  }

  update(dt, t) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -9999;
        this.colors[i * 3] = this.colors[i * 3 + 1] = this.colors[i * 3 + 2] = 0;
        continue;
      }
      const i3 = i * 3;
      this.vel[i3 + 1] += this.gravity[i] * dt;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 2] *= d;
      this.positions[i3] += (this.vel[i3] + Math.sin(t * 2.1 + this.phase[i]) * this.drift[i]) * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += (this.vel[i3 + 2] + Math.cos(t * 1.7 + this.phase[i]) * this.drift[i]) * dt;
      const k = this.life[i] / this.maxLife[i];
      this.colors[i3]     = this.baseColor[i3] * k;
      this.colors[i3 + 1] = this.baseColor[i3 + 1] * k;
      this.colors[i3 + 2] = this.baseColor[i3 + 2] * k;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class Sparks extends PointPool {
  constructor(max = 180) {
    super(max, 0.16, THREE.AdditiveBlending);
  }
  spawnAt(x, y, z, count = 3) {
    for (let i = 0; i < count; i++) {
      this.spawn(x, y, z, {
        spread: 0.5, vSpread: 2.6, vy: 2.8, life: 0.35 + Math.random() * 0.45,
        color: new THREE.Color().setHSL(0.08 + Math.random() * 0.05, 1.0, 0.55),
        gravity: -13, drag: 0.6, drift: 0.2,
      });
    }
  }
}

export class Mist extends PointPool {
  constructor(max = 260) {
    super(max, 0.55, THREE.AdditiveBlending);
  }
  spawnAt(x, y, z, color, count = 2) {
    for (let i = 0; i < count; i++) {
      this.spawn(x + (Math.random() - 0.5) * 6.4, y, z + (Math.random() - 0.5) * 3.2, {
        spread: 0.8, vSpread: 0.35, vy: -0.55 - Math.random() * 0.7,
        life: 1.4 + Math.random() * 1.6, color, gravity: 0.12, drag: 0.25, drift: 0.5,
      });
    }
  }
}

// ---------- smoke sprites (stacks / background stacks) ----------
export class Smoke {
  constructor(x, y, z, count = 9, scaleBase = 2.4) {
    this.group = new THREE.Group();
    this.sprites = [];
    const tex = makeSoftCircleTexture();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, color: 0x9aa4b8, transparent: true, opacity: 0, depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      this.group.add(s);
      this.sprites.push({
        sprite: s, mat,
        phase: (i / count) * Math.PI * 2,
        speed: 0.55 + Math.random() * 0.35,
        baseX: x, baseY: y, baseZ: z, scaleBase,
      });
    }
  }
  update(dt, t) {
    for (const p of this.sprites) {
      const cycle = ((t * p.speed + p.phase) % (Math.PI * 2)) / (Math.PI * 2); // 0..1
      const rise = cycle * 14;
      const s = p.scaleBase * (0.7 + cycle * 3.4);
      p.sprite.position.set(
        p.baseX + Math.sin(t * 0.5 + p.phase) * (1.2 + cycle * 3.2),
        p.baseY + rise,
        p.baseZ + Math.cos(t * 0.4 + p.phase) * (0.8 + cycle * 2.4)
      );
      p.sprite.scale.set(s, s, 1);
      p.mat.opacity = 0.34 * Math.sin(cycle * Math.PI); // in-out
    }
  }
}
