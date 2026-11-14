const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const stack = [];

export function lockLayer(el) {
  const below = stack.at(-1) ?? document.getElementById('app');
  below.inert = true;
  stack.push(el);
  if (stack.length === 1) document.documentElement.classList.add('is-locked');
}

export function unlockLayer(el) {
  const index = stack.indexOf(el);
  if (index < 0) return;
  stack.splice(index, 1);
  (stack.at(-1) ?? document.getElementById('app')).inert = false;
  if (!stack.length) document.documentElement.classList.remove('is-locked');
}

export const isTopLayer = (el) => stack.at(-1) === el;

export function trapFocus(root) {
  const onKey = (e) => {
    if (e.key !== 'Tab' || !isTopLayer(root)) return;
    const items = [...root.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items.at(-1);
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !root.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !root.contains(active))) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
