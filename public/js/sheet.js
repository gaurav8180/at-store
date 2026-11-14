import { h, reducedMotion } from './dom.js';
import { icon } from './icons.js';
import { categoryLabel } from './format.js';
import { badgeEl, heartButton, image, priceBlock } from './card.js';
import { copyProductLink, flashDone, productUrl } from './copy.js';
import { isTopLayer, lockLayer, trapFocus, unlockLayer } from './layers.js';
import { motion } from './motion.js';
import { lowAt, stockOf } from './stock.js';

const isDesktop = () => matchMedia('(min-width: 900px)').matches;

function infoGroup({ label, values, soldOut = () => false }) {
  const chips = values.map((v) => {
    const off = soldOut(v);
    return h('li', { class: `opt opt--info${off ? ' opt--sold' : ''}`, title: off ? 'Sold out' : null },
      v, off ? h('span', { class: 'sr' }, ' (sold out)') : null);
  });
  return h('div', { class: 'opt-group' },
    h('p', { class: 'micro' }, label),
    h('ul', { class: 'opt-group__row', 'aria-label': label }, chips));
}

function buildGallery(p) {
  const sources = p.images.length ? p.images : [null];
  const total = sources.length;
  const slides = sources.map((src, i) =>
    h('div', { class: 'gallery__slide' }, image(src, i === 0 ? p.name : `${p.name}, view ${i + 1}`, { eager: i === 0 })));
  const track = h('div', {
    class: 'gallery__track', tabindex: '0', role: 'group', 'aria-roledescription': 'carousel',
    'aria-label': total > 1 ? 'Product images. Swipe or use arrow keys.' : 'Product image',
  }, slides);
  const counter = h('span', { class: 'gallery__count micro' }, `1 / ${total}`);
  const main = h('div', { class: 'gallery__main' }, track, p.badge ? badgeEl(p.badge) : null);
  let index = 0;
  let thumbs = null;
  let thumbButtons = [];

  const goTo = (i) => {
    const next = Math.min(total - 1, Math.max(0, i));
    track.scrollTo({ left: next * track.clientWidth, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  };
  const setActive = (i) => {
    if (i === index) return;
    index = i;
    counter.textContent = `${i + 1} / ${total}`;
    thumbButtons.forEach((b, n) => (n === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
  };

  if (total > 1) {
    let frame;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setActive(Math.round(track.scrollLeft / track.clientWidth)));
    }, { passive: true });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
    });
    thumbButtons = sources.map((src, i) => h('button', {
      class: 'thumb', type: 'button', 'aria-label': `Show image ${i + 1} of ${total}`,
      'aria-current': i === 0 ? 'true' : null, onclick: () => goTo(i),
    }, image(src, '')));
    thumbs = h('div', { class: 'gallery__thumbs' }, thumbButtons);
    main.append(counter, h('div', { class: 'gallery__nav' },
      h('button', { type: 'button', 'aria-label': 'Previous image', onclick: () => goTo(index - 1) }, icon('prev')),
      h('button', { type: 'button', 'aria-label': 'Next image', onclick: () => goTo(index + 1) }, icon('next'))));
  }

  return { el: h('div', { class: 'gallery' }, main, thumbs), main, thumbs, track };
}

function createShare(p) {
  if (typeof navigator.share !== 'function') return null;
  return h('button', {
    class: 'heart heart--lg share__btn', type: 'button', 'aria-label': `Share ${p.name}`,
    onclick: async () => {
      try {
        await navigator.share({ url: productUrl(p.id) });
      } catch {
        /* dismissed */
      }
    },
  }, icon('share'));
}

export function createSheet(root, { requestClose }) {
  let product = null;
  let ui = null;
  let origin = null;
  let returnFocus = null;
  let releaseTrap = null;
  let closing = false;
  let closeToken = 0;
  let exitAnims = [];

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && product && !closing && isTopLayer(root)) {
      e.preventDefault();
      requestClose();
    }
  });

  function build(p) {
    const gallery = buildGallery(p);
    const total = p.sizes.reduce((n, sz) => n + stockOf(p, sz), 0);
    const hint = h('p', { class: 'pinfo__hint', role: 'status' });
    const low = p.sizes.filter((sz) => stockOf(p, sz) > 0 && stockOf(p, sz) <= lowAt(p));
    if (p.inStock && low.length && Number.isFinite(total)) hint.textContent = low.length === 1 ? `Only ${stockOf(p, low[0])} left in ${low[0]}` : 'Some sizes are running low';

    const sizeGroup = p.sizes.length ? infoGroup({ label: 'Sizes', values: p.sizes, soldOut: (sz) => stockOf(p, sz) === 0 }) : null;
    const colorGroup = p.colors.length ? infoGroup({ label: 'Colours', values: p.colors }) : null;

    const idle = () => [icon('link'), 'Copy link'];
    const copyBtn = h('button', {
      class: 'btn btn--primary btn--lg btn--block', type: 'button',
      onclick: async () => { if (await copyProductLink(p)) flashDone(copyBtn, { idle, done: () => [icon('check'), 'Link copied'] }); },
    }, ...idle());

    const actions = h('div', { class: 'pinfo__actions pinfo__actions--sticky' }, copyBtn);

    const info = h('div', { class: 'pinfo' },
      h('div', { class: 'pinfo__top' }, h('p', { class: 'micro' }, categoryLabel(p.category)), h('div', { class: 'pinfo__tools' }, createShare(p), heartButton(p, 'heart--lg'))),
      h('h2', { class: 'pinfo__title', id: 'sheet-title' }, p.name),
      priceBlock(p),
      p.inStock ? null : h('p', { class: 'pinfo__note' }, 'Sold out right now.'),
      sizeGroup, colorGroup,
      hint, actions,
      p.description ? h('p', { class: 'pinfo__desc' }, p.description) : null);

    const closeBtn = h('button', { class: 'sheet__close', type: 'button', onclick: requestClose }, icon('close'), 'Close');
    const bar = h('div', { class: 'sheet__bar' }, closeBtn, h('p', { class: 'sheet__crumb micro' }, categoryLabel(p.category)));
    const panel = h('div', { class: 'sheet__panel', tabindex: '-1' }, bar, h('div', { class: 'sheet__body' }, gallery.el, info));
    const scrim = h('div', { class: 'sheet__scrim', onclick: () => { if (!isDesktop()) requestClose(); } });

    return { scrim, panel, bar, info, main: gallery.main, thumbs: gallery.thumbs, closeBtn };
  }

  function enter() {
    if (reducedMotion.matches) return;
    ui.scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
    if (!isDesktop()) {
      ui.panel.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 400, easing: motion.ease });
      return;
    }
    const from = origin?.isConnected ? origin.getBoundingClientRect() : null;
    if (from?.width) {
      motion.flip(ui.main, from, { duration: 450 });
      motion.rise([ui.bar, ui.thumbs, ...ui.info.children], { delay: 150, stagger: 30 });
    } else {
      ui.panel.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: motion.ease });
    }
  }

  async function exit() {
    exitAnims = [];
    if (reducedMotion.matches) return;
    const track = (a) => { exitAnims.push(a); return a; };
    const fade = (el, duration, extra = {}) => track(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-in', fill: 'forwards', ...extra }));
    if (!isDesktop()) {
      track(ui.panel.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 300, easing: 'ease-in', fill: 'forwards' }));
      fade(ui.scrim, 300);
    } else {
      const target = origin?.isConnected ? origin.getBoundingClientRect() : null;
      const m = ui.main.getBoundingClientRect();
      const inView = target && target.bottom > 0 && target.top < innerHeight && m.bottom > 0 && m.top < innerHeight;
      if (inView) {
        [ui.bar, ui.thumbs, ui.info].filter(Boolean).forEach((el) => fade(el, 150));
        fade(ui.scrim, 350, { delay: 80 });
        track(motion.flipTo(ui.main, target, { duration: 350 }));
      } else {
        track(ui.panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }));
        fade(ui.scrim, 220);
      }
    }
    await Promise.all(exitAnims.map((a) => a.finished.catch(() => {})));
  }

  function show(p, originEl) {
    origin = originEl;
    if (product) {
      const wasClosing = closing;
      if (wasClosing) {
        closeToken += 1;
        exitAnims.forEach((a) => a.cancel());
        closing = false;
        releaseTrap = trapFocus(root);
      }
      product = p;
      ui = build(p);
      root.replaceChildren(ui.scrim, ui.panel);
      if (wasClosing) enter();
      return;
    }
    product = p;
    returnFocus = document.activeElement;
    ui = build(p);
    root.replaceChildren(ui.scrim, ui.panel);
    root.hidden = false;
    lockLayer(root);
    releaseTrap = trapFocus(root);
    ui.closeBtn.focus({ preventScroll: true });
    enter();
  }

  async function hide() {
    if (!product || closing) return;
    closing = true;
    const token = ++closeToken;
    releaseTrap?.();
    await exit();
    if (token !== closeToken) return;
    root.hidden = true;
    root.replaceChildren();
    product = null;
    ui = null;
    closing = false;
    unlockLayer(root);
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  return { show, hide, get id() { return closing ? null : product?.id ?? null; } };
}
