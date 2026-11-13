import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Moves: clip name, playback speed, damage, whether it can knock down.
export const MOVES = {
  punch: { clip: 'punch', speed: 1.55, dmg: 6, heavy: false, label: 'SOCO' },
  hook: { clip: 'hook', speed: 2.1, dmg: 12, heavy: true, label: 'GANCHO' },
  kick: { clip: 'kick1', speed: 1.35, dmg: 9, heavy: false, label: 'CHUTE' },
  high: { clip: 'kick2', speed: 1.3, dmg: 13, heavy: true, label: 'CHUTE ALTO' },
};

const LIMBS = ['mixamorigRightHand', 'mixamorigLeftHand', 'mixamorigRightFoot', 'mixamorigLeftFoot'];
const SCALE = 0.01;

// Prepares the shared clips once: removes horizontal root motion so the game controls movement,
// builds an idle stance and measures when/where each attack connects.
export function prepareClips(gltf) {
  const clips = {};
  for (const c of gltf.animations) {
    const clip = c.clone();
    for (const tr of clip.tracks) {
      if (tr.name.endsWith('Hips.position')) {
        const v = tr.values, x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
    }
    clips[clip.name] = clip;
  }
  // idle = guard stance taken from the first frame of the kick, held
  const src = clips.kick1;
  const idleTracks = src.tracks.map((tr) => {
    const n = tr.getValueSize();
    const v0 = Array.from(tr.values.slice(0, n));
    const Ctor = tr.constructor;
    return new Ctor(tr.name, [0, 1], v0.concat(v0));
  });
  clips.idle = new THREE.AnimationClip('idle', 1, idleTracks);

  // the victory clip walks off; keep its first 4 seconds
  clips.victory = THREE.AnimationUtils.subclip(clips.victory, 'victory', 0, 120, 30);

  // analyse attacks: time of maximum forward reach of any limb
  const probe = SkeletonUtils.clone(gltf.scene); probe.scale.setScalar(SCALE);
  const mixer = new THREE.AnimationMixer(probe);
  const limbs = LIMBS.map((n) => probe.getObjectByName(n));
  const hips = probe.getObjectByName('mixamorigHips');
  const v = new THREE.Vector3(), hv = new THREE.Vector3();
  const info = {};
  for (const key of Object.keys(MOVES)) {
    const clip = clips[MOVES[key].clip];
    mixer.stopAllAction();
    const a = mixer.clipAction(clip); a.play();
    let best = { reach: -1, t: 0, limb: 0, y: 1 };
    for (let i = 0; i <= 90; i++) {
      const t = (i / 90) * clip.duration;
      mixer.setTime(t); probe.updateMatrixWorld(true);
      hips.getWorldPosition(hv);
      limbs.forEach((b, li) => {
        b.getWorldPosition(v);
        if (v.z > best.reach) best = { reach: v.z, t, limb: li, y: v.y };
      });
    }
    a.stop();
    info[key] = { hitTime: best.t, reach: best.reach, limb: LIMBS[best.limb], height: best.y };
  }
  return { clips, info };
}

export class Fighter {
  constructor(gltf, prepared, { name, color, accent, side }) {
    this.name = name;
    this.clips = prepared.clips;
    this.moveInfo = prepared.info;
    this.obj = new THREE.Group();
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.scale.setScalar(SCALE);
    this.obj.add(this.model);

    // premium-looking armor materials
    const body = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new THREE.Color(accent) });
    const joints = new THREE.MeshStandardMaterial({ color: 0x15100e, metalness: 0.9, roughness: 0.35, emissive: new THREE.Color(accent), emissiveIntensity: 0.18 });
    this.bodyMat = body;
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = /joint/i.test(o.name) ? joints : body;
      }
    });
    this.bones = {};
    for (const n of [...LIMBS, 'mixamorigHips', 'mixamorigSpine1', 'mixamorigSpine2', 'mixamorigHead', 'mixamorigNeck']) this.bones[n] = this.model.getObjectByName(n);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [k, c] of Object.entries(this.clips)) this.actions[k] = this.mixer.clipAction(c);
    this.mixer.addEventListener('finished', (e) => this.onFinished(e.action));

    this.side = side; // -1 left, +1 right
    this.reset();
  }

  reset() {
    this.hp = 100;
    this.x = this.side * 1.7;
    this.vx = 0;
    this.facing = -this.side; // +1 faces +x
    this.state = 'idle';
    this.move = null;
    this.hitDone = false;
    this.stun = 0;
    this.combo = 0; this.lastHitAt = -10;
    this.blocking = false;
    this.flash = 0;
    this.input = { left: false, right: false, block: false, attack: null };
    this.mixer.stopAllAction();
    this.current = null;
    this.play('idle', { loop: true, fade: 0 });
    this.syncTransform(0);
  }

  play(name, { loop = false, fade = 0.12, speed = 1, clamp = true, from = 0 } = {}) {
    const a = this.actions[name];
    const prev = this.current;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = clamp;
    a.timeScale = speed;
    a.time = from;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (prev && prev !== a && fade > 0) prev.crossFadeTo(a, fade, false);
    else if (prev && prev !== a) prev.stop();
    this.current = a;
    this.currentName = name;
  }

  get busy() { return ['attack', 'hit', 'down', 'getup', 'ko', 'win'].includes(this.state); }
  get alive() { return this.state !== 'ko'; }

  attack(key) {
    if (this.busy) return false;
    const m = MOVES[key];
    this.state = 'attack';
    this.move = key;
    this.hitDone = false;
    this.blocking = false;
    this.play(m.clip, { speed: m.speed, fade: 0.08 });
    return true;
  }

  takeHit(dmg, heavy, knock) {
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 1;
    this.blocking = false;
    if (this.hp <= 0) { this.die(); return; }
    if (knock) {
      this.state = 'down'; this.stun = 0;
      this.play('knocked_down', { speed: 1.25, fade: 0.06 });
      this.vx = -this.facing * 4.2;
    } else {
      this.state = 'hit';
      this.play('hit_reaction', { speed: heavy ? 1.5 : 1.9, fade: 0.05 });
      this.stun = heavy ? 0.6 : 0.42;
      this.vx = -this.facing * (heavy ? 3.2 : 2.2);
    }
  }

  blockHit(dmg) {
    this.hp = Math.max(1, this.hp - dmg);
    this.vx = -this.facing * 1.8;
    this.flash = 0.35;
  }

  die() {
    this.state = 'ko';
    this.play('dying', { speed: 1.0, fade: 0.08 });
    this.vx = -this.facing * 3.5;
  }

  win() {
    this.state = 'win';
    this.blocking = false;
    this.play('victory', { fade: 0.3 });
  }

  onFinished(action) {
    if (action !== this.current) return;
    if (this.state === 'down') {
      // get up = knockdown played in reverse
      this.state = 'getup';
      const d = this.clips.knocked_down.duration;
      this.play('knocked_down', { speed: -1.6, fade: 0.0, from: d });
      this.current.time = d;
      return;
    }
    if (this.state === 'getup') { this.toIdle(); return; }
    if (this.state === 'attack') this.toIdle();
  }

  toIdle() {
    this.state = 'idle';
    this.move = null;
    this.play('idle', { loop: true, fade: 0.18 });
  }

  update(dt, opponent, arenaHalf) {
    // facing toward opponent (only when free)
    if (!this.busy) this.facing = opponent.x > this.x ? 1 : -1;
    const inp = this.input;

    if (this.state === 'hit') {
      this.stun -= dt;
      if (this.stun <= 0) this.toIdle();
    }

    if (!this.busy) {
      if (inp.attack) { this.attack(inp.attack); }
      else if (inp.block) {
        if (this.state !== 'block') { this.state = 'block'; this.blocking = true; this.play('block', { speed: 2.2, fade: 0.06 }); }
      } else {
        const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        if (dir !== 0) {
          const fwd = dir === this.facing;
          this.vx = dir * (fwd ? 1.9 : 1.45);
          if (this.state !== 'walk' || this.walkFwd !== fwd) {
            this.state = 'walk'; this.walkFwd = fwd;
            this.play('walk', { loop: true, speed: fwd ? 1.15 : -0.9, fade: 0.15 });
          }
        } else if (this.state !== 'idle') this.toIdle();
      }
    }
    inp.attack = null;

    // block: hold the guard pose at its peak
    if (this.state === 'block') {
      this.blocking = true;
      const a = this.actions.block;
      if (a.time > 0.42) { a.time = 0.42; a.timeScale = 0; }
      if (!inp.block) { this.blocking = false; this.toIdle(); }
    }

    // physics
    if (this.state !== 'walk') this.vx *= Math.max(0, 1 - 7 * dt);
    this.x += this.vx * dt;
    if (this.state === 'walk' && !(inp.left || inp.right)) this.vx = 0;
    this.x = THREE.MathUtils.clamp(this.x, -arenaHalf, arenaHalf);

    this.mixer.update(dt);
    this.syncTransform(dt);

    this.flash = Math.max(0, this.flash - dt * 4);
    this.bodyMat.emissive.setRGB(this.flash * 1.2, this.flash * 0.15, this.flash * 0.1);
  }

  syncTransform(dt) {
    this.obj.position.x = this.x;
    const target = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    const r = this.obj.rotation.y;
    this.obj.rotation.y = dt === 0 ? target : r + (target - r) * Math.min(1, dt * 14);
    // breathing / bounce on top of the held idle pose
    if (this.state === 'idle') {
      const t = performance.now() / 1000;
      const s = this.bones.mixamorigSpine1, h = this.bones.mixamorigHips;
      if (s) s.rotation.x += Math.sin(t * 3.2 + this.side) * 0.03;
      if (h) h.position.y += Math.sin(t * 6.4 + this.side) * 1.4;
    }
  }

  // world position of a limb (for hit sparks)
  limbPos(name, out) { return this.bones[name].getWorldPosition(out); }
  chestPos(out) { return this.bones.mixamorigSpine2.getWorldPosition(out); }
}
