import * as THREE from 'three';

// GPU point-sprite particle system: soft round sprites with per-particle size, color and alpha.
export class Particles {
  constructor(scene, { max = 2000, blending = THREE.AdditiveBlending, depthWrite = false } = {}) {
    this.max = max;
    this.items = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */`
        attribute float size; attribute vec4 color; varying vec4 vColor; uniform float uScale;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying vec4 vColor;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
          float a = pow(1.0 - r, 1.6); gl_FragColor = vec4(vColor.rgb, vColor.a * a); }`,
      transparent: true, depthWrite, blending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  setScale(h) { this.points.material.uniforms.uScale.value = h * 0.6; }
  spawn(p) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({
      x: p.x, y: p.y, z: p.z, vx: p.vx || 0, vy: p.vy || 0, vz: p.vz || 0,
      life: p.life, age: 0, size: p.size, size1: p.size1 ?? p.size,
      c0: p.c0, c1: p.c1 || p.c0, a: p.a ?? 1, g: p.g || 0, drag: p.drag ?? 0,
      floor: p.floor ?? false, onFloor: p.onFloor,
    });
  }
  update(dt) {
    const it = this.items;
    let n = 0; const landed = [];
    for (let i = 0; i < it.length; i++) {
      const p = it[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= p.g * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor && p.y < 0.01) { if (p.onFloor) landed.push(p); p.age = p.life; continue; }
      const t = p.age / p.life;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 4] = p.c0[0] + (p.c1[0] - p.c0[0]) * t;
      this.col[n * 4 + 1] = p.c0[1] + (p.c1[1] - p.c0[1]) * t;
      this.col[n * 4 + 2] = p.c0[2] + (p.c1[2] - p.c0[2]) * t;
      this.col[n * 4 + 3] = p.a * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
      this.size[n] = p.size + (p.size1 - p.size) * t;
      it[n++] = p;
    }
    it.length = n;
    for (const p of landed) p.onFloor(p);
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}
