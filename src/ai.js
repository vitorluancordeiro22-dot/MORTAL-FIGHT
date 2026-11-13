import { MOVES } from './fighter.js';

// Simple but lively CPU opponent.
export class AI {
  constructor(me, foe, level = 0.6) { this.me = me; this.foe = foe; this.level = level; this.t = 0; this.plan = 'approach'; this.planT = 0; this.blockT = 0; }
  update(dt) {
    const me = this.me, foe = this.foe, inp = me.input;
    this.t -= dt; this.planT -= dt; this.blockT -= dt;
    const dist = Math.abs(foe.x - me.x), toward = foe.x > me.x ? 1 : -1;
    inp.left = inp.right = false;

    // react to incoming attacks
    if (foe.state === 'attack' && dist < 2.0 && !me.busy && this.blockT <= 0 && Math.random() < this.level * 0.09) this.blockT = 0.5 + Math.random() * 0.4;
    inp.block = this.blockT > 0 && !me.busy;
    if (inp.block) return;

    if (this.planT <= 0) {
      const r = Math.random();
      this.plan = dist > 1.6 ? (r < 0.8 ? 'approach' : 'wait') : (r < 0.62 ? 'fight' : r < 0.82 ? 'retreat' : 'wait');
      this.planT = 0.3 + Math.random() * 0.6;
    }
    if (this.plan === 'approach') { if (dist > 1.1) (toward > 0 ? (inp.right = true) : (inp.left = true)); else this.plan = 'fight'; }
    if (this.plan === 'retreat') (toward > 0 ? (inp.left = true) : (inp.right = true));
    if (this.plan === 'fight' && this.t <= 0 && !me.busy && foe.alive) {
      const opts = Object.keys(MOVES).filter((k) => me.moveInfo[k].reach + 0.3 >= dist);
      if (opts.length) inp.attack = opts[(Math.random() * opts.length) | 0];
      else (toward > 0 ? (inp.right = true) : (inp.left = true));
      this.t = (0.45 + Math.random() * 0.9) / (0.5 + this.level);
    }
  }
}
