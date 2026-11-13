import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildArena } from './arena.js';
import { Fighter, MOVES, prepareClips } from './fighter.js';
import { Particles } from './particles.js';
import { Input } from './input.js';
import { AI } from './ai.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const ARENA_HALF = 5.6;
const ROUND_TIME = 99;
const WINS_NEEDED = 2;

// ---------- renderer ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
camera.position.set(0, 1.6, 6);

const arena = buildArena(scene, renderer);

// post-processing: bloom + vignette/grain/chromatic aberration
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.6, 0.82);
composer.addPass(bloom);
const fx = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAberr: { value: 0 }, uRed: { value: 0 }, uGray: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uAberr,uRed,uGray; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec2 d = vUv-0.5; float r2 = dot(d,d);
      vec2 off = d * (0.004 + uAberr*0.03);
      vec3 c = vec3(texture2D(tDiffuse, vUv+off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-off).b);
      float g = dot(c, vec3(0.299,0.587,0.114)); c = mix(c, vec3(g)*vec3(1.1,0.95,0.9), uGray);
      c *= 1.0 - r2*1.25;
      c = mix(c, c*vec3(1.6,0.3,0.3), uRed * smoothstep(0.05,0.35,r2));
      c += (h(vUv*vec2(1920.,1080.)+uTime)-0.5)*0.022;
      gl_FragColor = vec4(c,1.); }`,
});
composer.addPass(fx);
composer.addPass(new OutputPass());

// ---------- combat effects ----------
const sparks = new Particles(scene, { max: 800 });
const blood = new Particles(scene, { max: 1500, blending: THREE.NormalBlending, depthWrite: false });
const decals = [];
const decalGeo = new THREE.CircleGeometry(1, 20);
const decalMat = new THREE.MeshBasicMaterial({ color: 0x2a0003, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
function bloodDecal(x, z, s) {
  const m = new THREE.Mesh(decalGeo, decalMat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006 + decals.length * 0.00005, z);
  m.scale.set(s * (0.7 + Math.random() * 0.6), s * (0.7 + Math.random() * 0.6), 1);
  m.rotation.z = Math.random() * 6;
  scene.add(m); decals.push(m);
  if (decals.length > 140) scene.remove(decals.shift());
}
function clearDecals() { for (const d of decals) scene.remove(d); decals.length = 0; }

function spawnBlood(p, dir, amount) {
  for (let i = 0; i < amount; i++) {
    const s = 0.5 + Math.random();
    blood.spawn({
      x: p.x, y: p.y, z: p.z,
      vx: dir * (1 + Math.random() * 3.5) * s, vy: 0.5 + Math.random() * 3.2, vz: (Math.random() - 0.5) * 2.4,
      g: 9.8, life: 1.6, size: 0.03 + Math.random() * 0.06, c0: [0.55, 0.0, 0.01], c1: [0.3, 0, 0], a: 1, floor: true,
      onFloor: (q) => { if (Math.random() < 0.35) bloodDecal(q.x, q.z, 0.04 + Math.random() * 0.1); },
    });
  }
  for (let i = 0; i < amount / 4; i++) blood.spawn({ x: p.x, y: p.y, z: p.z, vx: dir * Math.random() * 1.2, vy: Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.8, drag: 2, life: 0.7, size: 0.15, size1: 0.45, c0: [0.35, 0, 0], a: 0.5 });
}
function spawnSparks(p, n = 30, col = [2.5, 1.6, 0.6]) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, sp = 2 + Math.random() * 5;
    sparks.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.sin(b) * sp + 1, vz: Math.sin(a) * Math.cos(b) * sp, g: 6, drag: 1.5, life: 0.25 + Math.random() * 0.35, size: 0.05, size1: 0.01, c0: col, c1: [1.2, 0.2, 0.0] });
  }
  sparks.spawn({ x: p.x, y: p.y, z: p.z, life: 0.1, size: 0.45, size1: 0.1, c0: [2, 1.4, 0.8], a: 0.9 });
}

// ---------- game state ----------
const input = new Input();
let fighters = [], ai = null, mode = 'cpu';
let phase = 'menu', phaseT = 0, timer = ROUND_TIME, round = 1, wins = [0, 0];
let paused = false, timeScale = 1, hitstop = 0, shake = 0, slowmo = 0, gray = 0;
const camTarget = new THREE.Vector3(0, 1.1, 0);
let introOrbit = 0;

function announce(text, ms = 1200, small = false) {
  const el = $('announce'); el.textContent = text; el.classList.toggle('small', small);
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(announce.t); if (ms) announce.t = setTimeout(() => el.classList.remove('show'), ms);
}

function updateHUD() {
  fighters.forEach((f, i) => {
    const p = i ? 'p2' : 'p1';
    $(p + 'hp').style.width = f.hp + '%';
    $(p + 'lag').style.width = f.hp + '%';
    $(p + 'hp').classList.toggle('low', f.hp < 30);
    $(p + 'wins').innerHTML = '<i></i>'.repeat(wins[i]);
  });
  $('timer').textContent = Math.max(0, Math.ceil(timer));
}

function showCombo(i, n) {
  const el = $(i ? 'p2combo' : 'p1combo');
  el.textContent = `${n} GOLPES!`; el.classList.add('show');
  clearTimeout(el.t); el.t = setTimeout(() => el.classList.remove('show'), 1100);
}

function startRound() {
  fighters.forEach((f) => f.reset());
  clearDecals();
  timer = ROUND_TIME; phase = 'intro'; phaseT = 0; slowmo = 0; gray = 0;
  updateHUD();
  announce(`ROUND ${round}`, 1300);
  sfx.gong();
}

function startMatch(m) {
  mode = m; wins = [0, 0]; round = 1;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('p2name').textContent = 'VEXA' + (mode === 'cpu' ? ' (CPU)' : '');
  ai = mode === 'cpu' ? new AI(fighters[1], fighters[0], 0.65) : null;
  startRound();
}

function endRound(winner) {
  phase = 'ko'; phaseT = 0;
  if (winner >= 0) {
    wins[winner]++;
    const loser = fighters[1 - winner];
    const flawless = fighters[winner].hp >= 100;
    announce(flawless ? 'PERFEITO!' : 'K.O.', 1800);
    slowmo = 2.2;
    sfx.gong();
    setTimeout(() => { if (phase === 'ko') fighters[winner].win(); }, 1400);
    loser.vx *= 1.4;
  } else {
    announce('EMPATE', 1800);
  }
  updateHUD();
}

function afterRound() {
  const champ = wins.findIndex((w) => w >= WINS_NEEDED);
  if (champ >= 0) {
    phase = 'matchover'; phaseT = 0;
    announce(`${fighters[champ].name} VENCE!`, 0, true);
    setTimeout(() => {
      if (phase !== 'matchover') return;
      $('announce').classList.remove('show');
      $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); phase = 'menu';
    }, 4200);
  } else { round++; startRound(); }
}

// ---------- hit resolution ----------
const tmp = new THREE.Vector3();
function resolveAttacks() {
  for (let i = 0; i < 2; i++) {
    const a = fighters[i], d = fighters[1 - i];
    if (a.state !== 'attack' || a.hitDone) continue;
    const info = a.moveInfo[a.move], mv = MOVES[a.move];
    if (a.current.time < info.hitTime) continue;
    a.hitDone = true;
    sfx.whoosh();
    const dx = (d.x - a.x) * a.facing;
    if (dx <= 0 || dx > info.reach + 0.32) continue; // whiff
    if (['down', 'getup', 'ko'].includes(d.state)) continue;
    a.limbPos(info.limb, tmp);
    tmp.x = d.x - a.facing * 0.15;
    const facingAttacker = d.facing === -a.facing;
    if (d.blocking && facingAttacker) {
      d.blockHit(mv.dmg * 0.12);
      spawnSparks(tmp, 26, [1.0, 1.8, 3.0]);
      sfx.block(); hitstop = 0.05; shake = Math.max(shake, 0.08);
      continue;
    }
    const now = performance.now() / 1000;
    a.combo = now - a.lastHitAt < 1.3 ? a.combo + 1 : 1; a.lastHitAt = now;
    if (a.combo >= 2) showCombo(i, a.combo);
    const dmg = mv.dmg * (1 + Math.min(a.combo - 1, 4) * 0.08);
    const knock = mv.heavy && (a.combo >= 3 || Math.random() < 0.28);
    d.takeHit(dmg, mv.heavy, knock);
    spawnSparks(tmp, mv.heavy ? 36 : 20);
    spawnBlood(tmp, a.facing, mv.heavy ? 70 : 38);
    sfx.hit(mv.heavy); if (knock) setTimeout(() => sfx.thud(), 650);
    hitstop = mv.heavy ? 0.11 : 0.07;
    shake = Math.max(shake, mv.heavy ? 0.28 : 0.15);
    fx.uniforms.uAberr.value = mv.heavy ? 1 : 0.5;
    fx.uniforms.uRed.value = Math.max(fx.uniforms.uRed.value, mv.heavy ? 0.6 : 0.35);
    if (d.hp <= 0) { spawnBlood(tmp, a.facing, 160); endRound(i); }
    updateHUD();
  }
}

function separate() {
  const [a, b] = fighters; const min = 0.72;
  const dx = b.x - a.x;
  if (Math.abs(dx) < min && a.alive && b.alive) {
    const push = (min - Math.abs(dx)) / 2 * Math.sign(dx || 1);
    a.x -= push; b.x += push;
  }
}

// ---------- camera ----------
function updateCamera(dt, t) {
  const [a, b] = fighters;
  const mid = (a.x + b.x) / 2, sep = Math.abs(a.x - b.x);
  let pos, look;
  if (phase === 'menu') {
    introOrbit += dt * 0.12;
    pos = new THREE.Vector3(Math.sin(introOrbit) * 6.5, 2.2 + Math.sin(introOrbit * 0.7) * 0.4, Math.cos(introOrbit) * 6.5);
    look = new THREE.Vector3(0, 1.2, 0);
  } else if (phase === 'ko' || phase === 'matchover') {
    const w = fighters.find((f) => f.state === 'win') || fighters.find((f) => f.alive) || a;
    pos = new THREE.Vector3(w.x + w.facing * 1.6, 1.4, 2.6);
    look = new THREE.Vector3(w.x, 1.0, 0);
  } else {
    const dist = THREE.MathUtils.clamp(3.3 + sep * 0.55, 3.6, 6.4);
    pos = new THREE.Vector3(mid * 0.92, 1.45 + sep * 0.05, dist);
    look = new THREE.Vector3(mid, 1.05, 0);
  }
  const k = 1 - Math.exp(-dt * (phase === 'fight' ? 5 : 2.2));
  camera.position.lerp(pos, k);
  camTarget.lerp(look, k);
  camera.lookAt(camTarget);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    camera.rotation.z += (Math.random() - 0.5) * shake * 0.06;
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (!paused) step(dt);
  composer.render();
}

function step(dt) {
  elapsed += dt;

  // global time effects
  shake = Math.max(0, shake - dt * 1.4);
  fx.uniforms.uAberr.value *= Math.exp(-dt * 8);
  fx.uniforms.uRed.value *= Math.exp(-dt * 2.5);
  if (slowmo > 0) { slowmo -= dt; timeScale = 0.28; } else timeScale += (1 - timeScale) * Math.min(1, dt * 4);
  gray += ((phase === 'ko' && slowmo > 0 ? 0.55 : 0) - gray) * Math.min(1, dt * 5);
  fx.uniforms.uGray.value = gray;
  fx.uniforms.uTime.value = elapsed;
  let gdt = dt * timeScale;
  if (hitstop > 0) { hitstop -= dt; gdt *= 0.04; }

  if (fighters.length) {
    if (phase === 'fight') {
      input.apply(0, fighters[0]);
      if (ai) ai.update(gdt); else input.apply(1, fighters[1]);
      timer -= gdt;
      if (timer <= 0) {
        timer = 0;
        const [a, b] = fighters;
        if (a.hp === b.hp) endRound(-1);
        else { const w = a.hp > b.hp ? 0 : 1; endRound(w); fighters[1 - w].die(); }
      }
    } else {
      for (const f of fighters) { f.input.left = f.input.right = f.input.block = false; f.input.attack = null; }
      input.queued = [null, null];
    }
    fighters[0].update(gdt, fighters[1], ARENA_HALF);
    fighters[1].update(gdt, fighters[0], ARENA_HALF);
    separate();
    if (phase === 'fight') resolveAttacks();
    if (phase === 'fight' || phase === 'intro') updateHUD();

    phaseT += dt;
    if (phase === 'intro' && phaseT > 1.6) { phase = 'fight'; announce('LUTEM!', 800); sfx.hit(true); }
    if (phase === 'ko' && phaseT > 5.0) afterRound();
  }

  arena.update(gdt);
  sparks.update(gdt); blood.update(gdt);
  if (fighters.length) updateCamera(dt, elapsed);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.fov = w / h < 1 ? 58 : 38;
  camera.updateProjectionMatrix();
  const ph = h * renderer.getPixelRatio();
  arena.setPointScale(ph); sparks.setScale(ph); blood.setScale(ph);
}
addEventListener('resize', resize); resize();

// ---------- menus / keys ----------
document.querySelectorAll('#menuButtons button').forEach((b) => b.addEventListener('click', () => { sfx.unlock(); startMatch(b.dataset.mode); }));
input.onKey = (e) => {
  if (e.code === 'Enter' && phase === 'menu' && fighters.length && !$('menu').classList.contains('hidden')) { sfx.unlock(); startMatch('cpu'); return true; }
  if (e.code === 'KeyP' && phase !== 'menu') { paused = !paused; $('pause').classList.toggle('hidden', !paused); return true; }
  if (e.code === 'Escape' && paused) { paused = false; $('pause').classList.add('hidden'); $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); phase = 'menu'; fighters.forEach((f) => f.reset()); return true; }
  if (e.code === 'KeyM') { sfx.toggleMute(); return true; }
  return false;
};

// ---------- load ----------
const MODEL_URL = 'models/fighter.glb';

// Downloads the model with progress. Accepts a .glb or a .gltf/.json with an embedded base64 buffer;
// the latter is rebuilt into a GLB in memory so no data: URL has to be fetched (some hosts block that).
async function loadModelBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = +res.headers.get('content-length') || 0;
  let bytes;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader(); const parts = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      parts.push(value); got += value.length;
      $('loadpct').textContent = total ? Math.round((got / total) * 100) + '%' : (got / 1048576).toFixed(1) + ' MB';
    }
    bytes = new Uint8Array(got); let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
  } else bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) return bytes.buffer; // 'glTF'
  const json = JSON.parse(new TextDecoder().decode(bytes));
  const uri = json.buffers[0].uri; delete json.buffers[0].uri;
  const bin = Uint8Array.from(atob(uri.slice(uri.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  const pad4 = (n) => (n + 3) & ~3;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jl = pad4(jsonBytes.length), bl = pad4(bin.length), totalLen = 12 + 8 + jl + 8 + bl;
  const out = new ArrayBuffer(totalLen), dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, totalLen, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true); u8.fill(0x20, 20, 20 + jl); u8.set(jsonBytes, 20);
  dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004e4942, true); u8.set(bin, 28 + jl);
  return out;
}

addEventListener('error', (e) => { if (!fighters.length) $('loading').textContent = 'Erro: ' + e.message; });

loadModelBuffer(MODEL_URL)
  .then((buf) => new GLTFLoader().parseAsync(buf, ''))
  .then((gltf) => {
    const prepared = prepareClips(gltf);
    const p1 = new Fighter(gltf, prepared, { name: 'KAEL', color: 0x8c0f14, accent: 0xff5a1f, side: -1 });
    const p2 = new Fighter(gltf, prepared, { name: 'VEXA', color: 0x0d3f6e, accent: 0x38c8ff, side: 1 });
    scene.add(p1.obj, p2.obj);
    fighters = [p1, p2];
    window.__game = { scene, camera, fighters, prepared, get phase() { return phase; }, startMatch, input,
      sim(sec) { for (let t = 0; t < sec; t += 1 / 60) step(1 / 60); composer.render(); } };
    $('loading').classList.add('hidden'); $('menuButtons').classList.remove('hidden');
  })
  .catch((err) => { $('loading').textContent = 'Erro ao carregar os lutadores: ' + err.message; });

frame();
