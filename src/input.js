// Keyboard + touch input mapped to two players.
const P1 = { KeyA: 'left', KeyD: 'right', KeyS: 'block', KeyJ: 'punch', KeyU: 'hook', KeyK: 'kick', KeyI: 'high' };
const P2 = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'block', Numpad1: 'punch', Numpad2: 'hook', Numpad3: 'kick', Numpad4: 'high', Digit7: 'punch', Digit8: 'hook', Digit9: 'kick', Digit0: 'high' };
const ATTACKS = ['punch', 'hook', 'kick', 'high'];

export class Input {
  constructor() {
    this.held = [{}, {}];
    this.queued = [null, null];
    this.onKey = null;
    addEventListener('keydown', (e) => {
      if (this.onKey && this.onKey(e)) return;
      for (const [i, map] of [[0, P1], [1, P2]]) {
        const a = map[e.code]; if (!a) continue;
        e.preventDefault();
        if (ATTACKS.includes(a)) { if (!e.repeat) this.queued[i] = a; }
        else this.held[i][a] = true;
      }
    });
    addEventListener('keyup', (e) => {
      for (const [i, map] of [[0, P1], [1, P2]]) { const a = map[e.code]; if (a && !ATTACKS.includes(a)) this.held[i][a] = false; }
    });
    addEventListener('blur', () => { this.held = [{}, {}]; });
    // touch controls for player 1
    const touch = document.getElementById('touch');
    if (matchMedia('(pointer: coarse)').matches) touch.classList.remove('hidden');
    touch.querySelectorAll('button').forEach((b) => {
      const k = b.dataset.k;
      const down = (e) => { e.preventDefault(); b.classList.add('on'); if (ATTACKS.includes(k)) this.queued[0] = k; else this.held[0][k] = true; };
      const up = (e) => { e.preventDefault(); b.classList.remove('on'); if (!ATTACKS.includes(k)) this.held[0][k] = false; };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
    });
  }
  apply(i, fighter) {
    const h = this.held[i], inp = fighter.input;
    inp.left = !!h.left; inp.right = !!h.right; inp.block = !!h.block;
    if (this.queued[i]) { inp.attack = this.queued[i]; this.queued[i] = null; }
  }
}
