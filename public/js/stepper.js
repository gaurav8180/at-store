import { h } from './dom.js';
import { icon } from './icons.js';

export function createStepper({ value, min = 1, max = 99, label, onChange }) {
  let current = value;
  let cap = max;
  const out = h('output', { class: 'qty__n', 'aria-live': 'polite' }, String(current));
  const dec = h('button', { type: 'button', 'aria-label': `Decrease ${label}`, 'data-act': 'dec', onclick: () => step(-1) }, icon('minus'));
  const inc = h('button', { type: 'button', 'aria-label': `Increase ${label}`, 'data-act': 'inc', onclick: () => step(1) }, icon('plus'));

  function paint() {
    out.textContent = String(current);
    dec.disabled = current <= min;
    inc.disabled = current >= cap;
  }

  function step(delta) {
    const next = Math.min(cap, Math.max(min, current + delta));
    if (next === current) return;
    current = next;
    paint();
    onChange(current);
  }

  paint();
  const el = h('div', { class: 'qty', role: 'group', 'aria-label': label }, dec, out, inc);
  el.setMax = (n) => { cap = n; current = Math.min(current, cap); paint(); };
  el.setValue = (n) => { current = Math.min(cap, Math.max(min, n)); paint(); };
  return el;
}
