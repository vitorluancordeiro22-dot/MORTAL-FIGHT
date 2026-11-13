import * as THREE from 'three';
import { Particles } from './particles.js';

// ---------- procedural textures ----------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function stoneTextures(size = 1024, seed = 7, tiles = 4) {
  const r = rng(seed);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const h = document.createElement('canvas'); h.width = h.height = size; // height/roughness
  const hg = h.getContext('2d');
  g.fillStyle = '#2b2522'; g.fillRect(0, 0, size, size);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, size, size);
  const t = size / tiles;
  for (let y = 0; y < tiles; y++) for (let x = 0; x < tiles; x++) {
    const off = (y % 2) * t * 0.5;
    const px = x * t + off, py = y * t, gap = 6;
    const v = 38 + r() * 26, hue = 15 + r() * 15;
    for (const dx of [0, -size]) {
      g.fillStyle = `hsl(${hue},10%,${v * 0.42}%)`;
      g.fillRect(px + dx + gap, py + gap, t - gap * 2, t - gap * 2);
      hg.fillStyle = `rgb(${150 + r() * 60},0,0)`;
      hg.fillRect(px + dx + gap, py + gap, t - gap * 2, t - gap * 2);
    }
  }
  // grime / speckle noise
  const img = g.getImageData(0, 0, size, size), hi = hg.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 26;
    img.data[i] += n; img.data[i + 1] += n * 0.9; img.data[i + 2] += n * 0.85;
    hi.data[i] = Math.max(0, hi.data[i] + n * 1.5); hi.data[i + 1] = hi.data[i]; hi.data[i + 2] = hi.data[i];
  }
  g.putImageData(img, 0, 0); hg.putImageData(hi, 0, 0);
  // blotches + cracks
  for (let i = 0; i < 90; i++) {
    const x = r() * size, y = r() * size, rad = 20 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${r() < 0.25 ? '60,8,8' : '10,8,6'},${0.15 + r() * 0.25})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (const ctx of [g, hg]) {
    ctx.strokeStyle = ctx === g ? 'rgba(8,6,5,0.8)' : 'rgba(0,0,0,0.9)'; ctx.lineWidth = 1.5;
  }
  for (let i = 0; i < 40; i++) {
    let x = r() * size, y = r() * size; g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); hg.lineTo(x, y); }
    g.stroke(); hg.stroke();
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(h);
  for (const tx of [map, bump]) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 8; }
  return { map, bump };
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,240,220,0.9)');
  gr.addColorStop(0.45, 'rgba(255,120,80,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function runeTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 64;
  const g = c.getContext('2d'); const r = rng(3);
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round';
  for (let i = 0; i < 48; i++) {
    const x0 = i * (2048 / 48) + 10; g.beginPath();
    for (let k = 0; k < 4; k++) {
      const ax = x0 + r() * 24, ay = 10 + r() * 44, bx = x0 + r() * 24, by = 10 + r() * 44;
      g.moveTo(ax, ay); g.lineTo(bx, by);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

// ---------- arena ----------
export function buildArena(scene, renderer) {
  const group = new THREE.Group(); scene.add(group);

  // sky dome with blood-red gradient
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.; a*=.5;} return s; }
      void main(){ float y = vP.y;
        vec3 top = vec3(0.02,0.0,0.015), mid = vec3(0.22,0.03,0.03), hor = vec3(0.55,0.12,0.05);
        vec3 col = mix(hor, mid, smoothstep(-0.02, 0.18, y)); col = mix(col, top, smoothstep(0.15, 0.6, y));
        vec2 uv = vP.xz/(vP.y+0.35)*1.6; float cl = fbm(uv + vec2(uTime*0.01, 0.)) ;
        col = mix(col, col*0.25, smoothstep(0.45, 0.8, cl) * smoothstep(0.02, 0.25, y));
        float st = step(0.9975, h(floor(vP.xz*300.0+vP.y*170.))) * smoothstep(0.2,0.6,y);
        col += st*0.6;
        gl_FragColor = vec4(col,1.); }`,
  }));
  group.add(sky);

  // moon
  const glow = glowTexture();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffb08a, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  moon.position.set(18, 26, -80); moon.scale.setScalar(38); group.add(moon);
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshBasicMaterial({ color: 0xffd9b8, fog: false }));
  moonDisc.position.set(18, 26, -82); moonDisc.lookAt(0, 2, 6); group.add(moonDisc);

  // mountains silhouettes
  const mtnMat = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false });
  [[0x140406, -60, 14, 1], [0x0b0204, -45, 9, 2]].forEach(([col, z, hgt, seed]) => {
    const r = rng(seed * 99); const pts = [new THREE.Vector2(-140, -5)];
    for (let x = -140; x <= 140; x += 6) pts.push(new THREE.Vector2(x, 2 + r() * hgt + Math.sin(x * 0.05 + seed) * hgt * 0.5));
    pts.push(new THREE.Vector2(140, -5));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), mtnMat(col));
    m.position.z = z; group.add(m);
  });

  // floor
  const { map, bump } = stoneTextures(1024, 11, 4);
  map.repeat.set(6, 6); bump.repeat.set(6, 6);
  const floorMat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.2, roughnessMap: bump, roughness: 0.85, metalness: 0.05, color: 0x9c948e });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04; floor.receiveShadow = true; group.add(floor);

  // central fighting platform (raised dais)
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.8, 0.12, 72), new THREE.MeshStandardMaterial({ map: map.clone(), bumpMap: bump, bumpScale: 1.5, roughness: 0.75, metalness: 0.1, color: 0x9a8a80 }));
  dais.material.map.repeat.set(2.4, 2.4); dais.position.y = -0.06; dais.receiveShadow = true; group.add(dais);

  // glowing rune ring
  const rt = runeTexture(); rt.repeat.set(1, 1);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.6, 7.1, 128, 1), new THREE.MeshBasicMaterial({ map: rt, color: 0xff3a1a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; group.add(ring);
  // the ring texture needs polar UVs — remap
  {
    const uv = ring.geometry.attributes.uv, pos = ring.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const x = pos.getX(i), y = pos.getY(i); const a = Math.atan2(y, x) / (Math.PI * 2) + 0.5; const rr = Math.hypot(x, y);
      uv.setXY(i, a * 6, (rr - 6.6) / 0.5);
    }
  }

  // pillars with torches
  const stone2 = stoneTextures(512, 21, 2); stone2.map.repeat.set(1, 3); stone2.bump.repeat.set(1, 3);
  const pillarMat = new THREE.MeshStandardMaterial({ map: stone2.map, bumpMap: stone2.bump, bumpScale: 3, roughness: 0.92, color: 0x8f8078 });
  const pillarGeo = (() => {
    const pts = [];
    const prof = [[0, 0], [0.75, 0], [0.75, 0.35], [0.6, 0.45], [0.55, 0.6], [0.48, 1], [0.45, 5.2], [0.55, 5.4], [0.7, 5.55], [0.75, 5.8], [0, 5.8]];
    for (const [x, y] of prof) pts.push(new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 24);
    const p = g.attributes.position, r = rng(5);
    for (let i = 0; i < p.count; i++) { const k = 1 + (r() - 0.5) * 0.06; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    g.computeVertexNormals(); return g;
  })();
  const torches = [];
  const pillarSpots = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.05 + i * (0.9 / 8));
    pillarSpots.push([Math.cos(a) * 11, -Math.sin(a) * 8.5 - 2.5, i]);
  }
  pillarSpots.push([-13, 3.5, 9], [13, 3.5, 10]);
  for (const [x, z, i] of pillarSpots) {
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(x, 0, z); p.castShadow = true; p.receiveShadow = true;
    const broken = i === 2 || i === 6;
    if (broken) p.scale.y = 0.55;
    p.rotation.y = i;
    group.add(p);
    if (!broken && i % 2 === 0) {
      // torch bowl
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.18, 0.35, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a1c12, metalness: 0.8, roughness: 0.45, side: THREE.DoubleSide }));
      bowl.position.set(x, 5.98, z); group.add(bowl);
      const light = new THREE.PointLight(0xff7a2a, 18, 16, 1.6);
      light.position.set(x, 6.6, z); group.add(light);
      torches.push({ light, x, y: 6.15, z, phase: Math.random() * 10 });
    }
  }

  // stone archway / gate behind the fight (focal point)
  const archMat = pillarMat.clone(); archMat.color = new THREE.Color(0x6e625c);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.55, 12, 40, Math.PI), archMat);
  arch.position.set(0, 7.5, -16); arch.castShadow = true; group.add(arch);
  for (const sx of [-4.2, 4.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7.5, 1.2), archMat);
    leg.position.set(sx, 3.75, -16); group.add(leg);
  }
  const portal = new THREE.Mesh(new THREE.CircleGeometry(3.6, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime;
      void main(){ vec2 p=vUv-0.5; float r=length(p)*2.; float a=atan(p.y,p.x);
        float sw = sin(a*5. + r*14. - uTime*2.5)*0.5+0.5;
        float m = smoothstep(1.,0.2,r);
        vec3 c = mix(vec3(0.6,0.02,0.02), vec3(1.0,0.45,0.1), sw*m);
        gl_FragColor = vec4(c, m*(0.35+0.4*sw)); }`,
  }));
  portal.position.set(0, 6.8, -15.9); group.add(portal);
  const portalLight = new THREE.PointLight(0xff3010, 30, 22, 1.4); portalLight.position.set(0, 6, -14); group.add(portalLight);

  // scattered rubble
  const rockGeo = new THREE.DodecahedronGeometry(0.4, 1);
  { const p = rockGeo.attributes.position, r = rng(9); for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.4), p.getY(i) * (0.6 + r() * 0.3), p.getZ(i) * (0.8 + r() * 0.4)); rockGeo.computeVertexNormals(); }
  const rocks = new THREE.InstancedMesh(rockGeo, pillarMat, 60);
  { const r = rng(42), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < 60; i++) {
      const a = r() * Math.PI * 2, d = 8.5 + r() * 12;
      const pos = new THREE.Vector3(Math.cos(a) * d, 0.05, Math.sin(a) * d - 2);
      if (pos.z > 5) pos.z = -pos.z;
      e.set(r() * 3, r() * 3, r() * 3); q.setFromEuler(e); s.setScalar(0.4 + r() * 1.4);
      m.compose(pos, q, s); rocks.setMatrixAt(i, m);
    } }
  rocks.castShadow = rocks.receiveShadow = true; group.add(rocks);

  // lights
  const hemi = new THREE.HemisphereLight(0x8a7aa0, 0x1a0806, 0.9); scene.add(hemi);
  const moonLight = new THREE.DirectionalLight(0xffc0a0, 2.2);
  moonLight.position.set(6, 14, 8); moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  Object.assign(moonLight.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  moonLight.shadow.bias = -0.0008; moonLight.shadow.normalBias = 0.04;
  scene.add(moonLight);
  // key light on the fighters, like a stage spotlight
  const key = new THREE.SpotLight(0xffe2c8, 60, 30, 0.55, 0.6, 1.2);
  key.position.set(-2, 9, 6); key.target.position.set(0, 0.8, 0);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xff4020, 1.6); rim.position.set(-4, 5, -10); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x4060ff, 0.9); rim2.position.set(6, 3, -8); scene.add(rim2);

  scene.fog = new THREE.FogExp2(0x1a0507, 0.032);

  // fire + embers
  const fire = new Particles(scene, { max: 1600 });
  const embers = new Particles(scene, { max: 400 });
  const smoke = new Particles(scene, { max: 400, blending: THREE.NormalBlending });

  let t = 0;
  function update(dt) {
    t += dt;
    sky.material.uniforms.uTime.value = t;
    portal.material.uniforms.uTime.value = t;
    portalLight.intensity = 26 + Math.sin(t * 2.3) * 6;
    rt.offset.x = t * 0.01;
    ring.material.opacity = 0.65 + Math.sin(t * 1.7) * 0.25;
    for (const tc of torches) {
      tc.light.intensity = 16 + Math.sin(t * 13 + tc.phase) * 3 + Math.sin(t * 27.3 + tc.phase * 2) * 2 + Math.random() * 2;
      for (let k = 0; k < 3; k++) fire.spawn({
        x: tc.x + (Math.random() - 0.5) * 0.4, y: tc.y + Math.random() * 0.1, z: tc.z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 0.3, vy: 1.2 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.3,
        life: 0.45 + Math.random() * 0.4, size: 0.55, size1: 0.12, c0: [1.4, 0.75, 0.25], c1: [0.9, 0.12, 0.02], a: 0.85,
      });
      if (Math.random() < 0.3) smoke.spawn({ x: tc.x, y: tc.y + 0.8, z: tc.z, vx: (Math.random() - 0.5) * 0.2, vy: 0.7, vz: 0, life: 2.5, size: 0.5, size1: 1.8, c0: [0.08, 0.05, 0.05], a: 0.35 });
      if (Math.random() < 0.15) embers.spawn({ x: tc.x, y: tc.y + 0.4, z: tc.z, vx: (Math.random() - 0.5) * 0.8, vy: 1.5 + Math.random(), vz: (Math.random() - 0.5) * 0.8, life: 2.5, size: 0.06, c0: [1.6, 0.6, 0.15], c1: [0.6, 0.05, 0], drag: 0.3 });
    }
    // ambient embers drifting across the arena
    if (Math.random() < 0.6) embers.spawn({
      x: (Math.random() - 0.5) * 22, y: Math.random() * 0.5, z: -8 + Math.random() * 12,
      vx: 0.3 + Math.random() * 0.4, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.2,
      life: 4 + Math.random() * 3, size: 0.05, c0: [1.8, 0.5, 0.1], c1: [0.5, 0.05, 0], a: 0.9,
    });
    fire.update(dt); embers.update(dt); smoke.update(dt);
  }
  function setPointScale(h) { fire.setScale(h); embers.setScale(h); smoke.setScale(h); }

  return { update, setPointScale, floor };
}
