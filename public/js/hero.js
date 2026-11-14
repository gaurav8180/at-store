import { $, h } from './dom.js';
import { image, thumbOf } from './card.js';
import { inr } from './format.js';

const skeletonTile = () => h('div', { class: 'tile', 'aria-hidden': 'true' }, h('div', { class: 'tile__img skel' }));

export function heroLoading() {
  $('#hero-feature').replaceChildren(skeletonTile(), skeletonTile(), skeletonTile());
}

export function renderHero(products, { onOpen }) {
  const root = $('#hero-feature');
  const byDate = (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
  const featured = [...products].sort(byDate).sort((a, b) => Number(b.featured) - Number(a.featured));
  const picks = featured.filter((p) => p.images.length).slice(0, 3);

  if (!picks.length) {
    root.replaceChildren(h('div', { class: 'tile tile--empty' },
      h('div', { class: 'tile__img' }, h('p', {}, 'Next drop incoming'))));
    return;
  }

  const tiles = picks.map((p, i) => {
    const img = image(thumbOf(p, 0), p.name, { eager: true });
    return h('a', {
      class: 'tile',
      href: `/p/${encodeURIComponent(p.id)}`,
      onclick: (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        e.preventDefault();
        onOpen(p, img);
      },
    },
    h('div', { class: 'tile__img' }, img),
    h('p', { class: 'tile__cap micro' },
      h('span', {}, String(i + 1).padStart(2, '0')),
      h('span', { class: 'tile__name' }, p.name),
      h('span', { class: 'tile__price' }, inr(p.price))));
  });
  root.replaceChildren(...tiles);
}
