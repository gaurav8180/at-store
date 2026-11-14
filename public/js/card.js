import { $$, h } from './dom.js';
import { icon } from './icons.js';
import { categoryLabel, inr, percentOff } from './format.js';
import { saved } from './store.js';

export const PLACEHOLDER = '/assets/placeholder.svg';

export function image(src, alt, { eager = false, cls = '' } = {}) {
  const img = h('img', {
    class: cls || null,
    src: src || PLACEHOLDER,
    alt,
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    width: 800,
    height: 1000,
  });
  img.addEventListener('error', () => {
    if (!img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER;
  }, { once: true });
  return img;
}

export function priceBlock(p) {
  const off = percentOff(p);
  return h('p', { class: 'price' },
    h('span', { class: 'price__now' }, inr(p.price)),
    off ? h('s', { class: 'price__mrp' }, h('span', { class: 'sr' }, 'MRP '), inr(p.mrp)) : null,
    off ? h('span', { class: 'price__off' }, `${off}% off`) : null);
}

export function heartButton(p, extra = '') {
  return h('button', {
    class: `heart ${extra}`.trim(),
    type: 'button',
    dataset: { id: p.id },
    'aria-pressed': String(saved.has(p.id)),
    'aria-label': `Save ${p.name}`,
    onclick: (e) => {
      e.stopPropagation();
      saved.toggle(p.id);
      if (saved.has(p.id) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        e.currentTarget.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 380 });
      }
    },
  }, icon('heart'));
}

export const syncHearts = () =>
  $$('.heart[data-id]').forEach((b) => b.setAttribute('aria-pressed', String(saved.has(b.dataset.id))));

export const thumbOf = (p, i) => p.thumbs?.[i] || p.images[i];

export const needsOptions = (p) => p.sizes.length > 1 || p.colors.length > 1;

export const badgeEl = (text) =>
  h('span', { class: `badge${/new/i.test(text) ? '' : ' badge--alt'}` }, text);

export function createCard(p, { onOpen, onQuickAdd }) {
  const options = needsOptions(p);
  const primary = image(thumbOf(p, 0), p.name, { cls: 'card__img' });
  const media = h('div', { class: 'card__media' },
    primary,
    p.images[1] ? image(thumbOf(p, 1), '', { cls: 'card__img card__img--alt' }) : null,
    p.badge ? badgeEl(p.badge) : null,
    p.inStock ? null : h('span', { class: 'soldtag' }, 'Sold out'),
    heartButton(p),
    h('button', {
      class: options ? 'card__add card__add--options' : 'card__add',
      type: 'button',
      disabled: !p.inStock,
      'aria-label': options ? `Select size for ${p.name}` : `Add ${p.name} to cart`,
      onclick: () => onQuickAdd(p, primary),
    }, icon('plus'), h('span', {}, options ? 'Select size' : 'Add')));

  const link = h('a', {
    class: 'card__link',
    href: `/p/${encodeURIComponent(p.id)}`,
    onclick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      onOpen(p, primary);
    },
  }, p.name);

  return h('article', { class: `card${p.inStock ? '' : ' is-sold'}`, dataset: { id: p.id } },
    media,
    h('div', { class: 'card__body' },
      h('p', { class: 'card__cat micro' }, categoryLabel(p.category)),
      h('h3', { class: 'card__name' }, link),
      priceBlock(p)));
}
