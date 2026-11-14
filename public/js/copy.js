import { h } from './dom.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

export const productUrl = (id) => `${location.origin}/p/${encodeURIComponent(id)}`;

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { 'aria-hidden': 'true', readonly: '', style: 'position:fixed;top:0;left:0;opacity:0;pointer-events:none' });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* unavailable */ }
    area.remove();
    return ok;
  }
}

export async function copyProductLink(product) {
  const ok = await copyText(productUrl(product.id));
  toast(ok ? 'Link copied' : 'Could not copy the link');
  return ok;
}

// Briefly swaps a button's content for a check after a successful copy.
export function flashDone(button, original) {
  button.classList.add('is-done');
  button.replaceChildren(...original.done());
  clearTimeout(button._t);
  button._t = setTimeout(() => {
    button.classList.remove('is-done');
    button.replaceChildren(...original.idle());
  }, 1600);
}

export function copyIconButton(product) {
  const idle = () => [icon('link')];
  const btn = h('button', {
    class: 'card__copy', type: 'button', 'aria-label': `Copy link to ${product.name}`, title: 'Copy link',
    onclick: async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (await copyProductLink(product)) flashDone(btn, { idle, done: () => [icon('check')] });
    },
  }, ...idle());
  return btn;
}
