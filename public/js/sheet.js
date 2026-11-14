import { h, reducedMotion } from './dom.js';
import { icon } from './icons.js';
import { categoryLabel } from './format.js';
import { badgeEl, heartButton, image, priceBlock } from './card.js';
import { cart } from './store.js';
import { contactLink, orderLink, productUrl, shareLink } from './whatsapp.js';
import { isTopLayer, lockLayer, trapFocus, unlockLayer } from './layers.js';
import { motion } from './motion.js';
import { toast } from './toast.js';
import { createStepper } from './stepper.js';
import { cartTarget, syncCartBadges } from './cart.js';
import { capFor, lowAt, stockOf } from './stock.js';

const isDesktop = () => matchMedia('(min-width: 900px)').matches;

function optionGroup({ label, values, get, set, soldOut = () => false }) {
  const id = `opt-${label.toLowerCase()}`;
  const value = h('span', { class: 'opt-group__value' }, get());
  const buttons = values.map((v) => {
    const off = soldOut(v);
    return h('button', {
      class: `opt${off ? ' opt--sold' : ''}`, type: 'button', disabled: off, dataset: { v },
      'aria-pressed': String(get() === v), 'aria-label': off ? `${v}, sold out` : null, title: off ? 'Sold out' : null,
      onclick: (e) => {
        set(v);
        paint();
        if (e.detail) e.currentTarget.blur();
      },
    }, v);
  });
  function paint() {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === get())));
    value.textContent = get();
  }
  const labelEl = h('p', { class: 'micro', id }, label, value);
  const el = h('div', { class: 'opt-group', role: 'group', 'aria-labelledby': id }, labelEl, h('div', { class: 'opt-group__row' }, buttons));
  return { el, labelEl };
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
  const url = productUrl(p.id);
  const wrap = h('div', { class: 'share' });
  let menu = null;

  const closeMenu = () => {
    if (!menu) return;
    const node = menu;
    menu = null;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    if (reducedMotion.matches) { node.hidden = true; return; }
    node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }).finished.catch(() => {}).then(() => { node.hidden = true; });
  };
  const onOutside = (e) => { if (!wrap.contains(e.target)) closeMenu(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); trigger.focus(); } };

  async function copy(button) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0' });
      area.value = url;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.hidden = true;
    }
    button.classList.add('is-done');
    button.replaceChildren(icon('check'), h('span', {}, 'Copied'));
    toast('Link copied');
    setTimeout(closeMenu, 800);
  }

  function openMenu() {
    menu = h('div', { class: 'share__menu', role: 'menu' },
      h('a', { class: 'share__item', role: 'menuitem', href: shareLink(p), target: '_blank', rel: 'noopener', onclick: () => setTimeout(closeMenu, 200) },
        icon('whatsapp'), h('span', {}, 'Share on WhatsApp')),
      h('button', { class: 'share__item', type: 'button', role: 'menuitem', onclick: (e) => copy(e.currentTarget) }, icon('link'), h('span', {}, 'Copy link')));
    wrap.append(menu);
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    if (!reducedMotion.matches) menu.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: motion.ease });
    menu.querySelector('.share__item').focus();
  }

  const canNativeShare = () => typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;

  const trigger = h('button', {
    class: 'heart heart--lg share__btn', type: 'button', 'aria-label': `Share ${p.name}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: async () => {
      if (menu) { closeMenu(); return; }
      if (canNativeShare()) {
        try {
          await navigator.share({ title: `${p.name} | AT`, text: p.name, url });
        } catch {
          /* dismissed */
        }
        return;
      }
      openMenu();
    },
  }, icon('share'));
  wrap.prepend(trigger);
  return wrap;
}

export function createSheet(root, { requestClose, openCart }) {
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
    const state = { size: '', color: p.colors[0] || '', qty: 1 };
    const availableSizes = p.sizes.filter((s) => stockOf(p, s) > 0);
    if (p.sizes.length === 1 && availableSizes.length) state.size = p.sizes[0];

    const gallery = buildGallery(p);
    const sizeError = h('p', { class: 'pinfo__error', role: 'alert' });
    const hint = h('p', { class: 'pinfo__hint', role: 'status' });
    let stepper = null;

    const refresh = () => { wa.href = orderLink([{ product: p, size: state.size, color: state.color, qty: state.qty }]); };

    function updateHint() {
      const stock = stockOf(p, state.size);
      let text = '';
      if (Number.isFinite(stock)) {
        if (stock <= lowAt(p)) text = `Only ${stock} left`;
        else if (state.qty >= stock) text = `Max ${stock} available`;
      }
      hint.textContent = text;
    }

    const sizeGroup = p.sizes.length
      ? optionGroup({
        label: 'Size', values: p.sizes, get: () => state.size, soldOut: (s) => stockOf(p, s) === 0,
        set: (v) => {
          state.size = v;
          sizeError.textContent = '';
          const cap = capFor(p, v);
          state.qty = Math.min(state.qty, cap);
          stepper?.setMax(cap);
          stepper?.setValue(state.qty);
          updateHint();
          refresh();
        },
      })
      : null;
    sizeGroup?.labelEl.after(sizeError);
    const colorGroup = p.colors.length
      ? optionGroup({ label: 'Colour', values: p.colors, get: () => state.color, set: (v) => { state.color = v; refresh(); } })
      : null;

    function validate() {
      if (p.sizes.length && !state.size) {
        sizeError.textContent = 'Pick a size to continue.';
        sizeGroup.el.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        if (!reducedMotion.matches) {
          sizeGroup.el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 260 });
        }
        return false;
      }
      sizeError.textContent = '';
      return true;
    }

    const wa = h('a', {
      class: 'btn btn--primary btn--lg btn--block', href: '#', target: '_blank', rel: 'noopener',
      onclick: (e) => {
        if (!validate()) { e.preventDefault(); return; }
        toast('Opening WhatsApp with your order');
      },
    }, icon('whatsapp'), 'Order on WhatsApp');

    const addBtn = h('button', {
      class: 'btn btn--dark btn--lg btn--block', type: 'button',
      onclick: () => {
        if (!validate()) return;
        cart.add({ id: p.id, size: state.size, color: state.color, qty: state.qty });
        const img = gallery.track.querySelector('img');
        motion.fly(img.currentSrc || img.src, gallery.main.getBoundingClientRect(), cartTarget());
        addBtn.classList.add('is-added');
        addBtn.replaceChildren(icon('check'), 'Added');
        setTimeout(() => { addBtn.classList.remove('is-added'); addBtn.textContent = 'Add to cart'; }, 1500);
        toast(`${state.qty} × ${p.name} added`, { action: { label: 'View cart', run: openCart } });
      },
    }, 'Add to cart');

    const actions = p.inStock
      ? h('div', { class: 'pinfo__actions pinfo__actions--sticky' }, addBtn, wa)
      : h('div', { class: 'pinfo__actions' },
        h('p', { class: 'pinfo__note' }, 'Sold out right now.'),
        h('a', { class: 'btn btn--primary btn--lg btn--block', href: contactLink(`Hi! Is "${p.name}" coming back in stock?`), target: '_blank', rel: 'noopener' }, icon('whatsapp'), 'Ask about restock'));

    stepper = p.inStock ? createStepper({ label: 'quantity', value: 1, max: capFor(p, state.size), onChange: (v) => { state.qty = v; updateHint(); refresh(); } }) : null;

    const info = h('div', { class: 'pinfo' },
      h('div', { class: 'pinfo__top' }, h('p', { class: 'micro' }, categoryLabel(p.category)), h('div', { class: 'pinfo__tools' }, createShare(p), heartButton(p, 'heart--lg'))),
      h('h2', { class: 'pinfo__title', id: 'sheet-title' }, p.name),
      priceBlock(p),
      sizeGroup?.el, colorGroup?.el,
      stepper ? h('div', { class: 'pinfo__qty' }, h('p', { class: 'micro' }, 'Quantity'), stepper) : null,
      hint, actions,
      p.description ? h('p', { class: 'pinfo__desc' }, p.description) : null,
      p.inStock ? h('p', { class: 'pinfo__note' }, 'We confirm stock and delivery on WhatsApp.') : null);

    const closeBtn = h('button', { class: 'sheet__close', type: 'button', onclick: requestClose }, icon('close'), 'Close');
    const cartBtn = h('button', {
      class: 'cart-btn', type: 'button', onclick: openCart, 'data-cart-btn': '', 'data-cart-target': '',
    }, icon('bag'), h('span', { class: 'cart-btn__label' }, 'Cart'), h('span', { class: 'cart-btn__count', 'data-cart-count': '' }, String(cart.count())));
    const bar = h('div', { class: 'sheet__bar' }, closeBtn, h('p', { class: 'sheet__crumb micro' }, categoryLabel(p.category)), cartBtn);
    const panel = h('div', { class: 'sheet__panel', tabindex: '-1' }, bar, h('div', { class: 'sheet__body' }, gallery.el, info));
    const scrim = h('div', { class: 'sheet__scrim', onclick: () => { if (!isDesktop()) requestClose(); } });

    if (stepper) updateHint();
    refresh();
    return { scrim, panel, bar, info, main: gallery.main, thumbs: gallery.thumbs, closeBtn, sizeGroup: sizeGroup?.el ?? null };
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

  function afterEnter(opts) {
    if (opts.focus === 'size' && ui.sizeGroup) {
      setTimeout(() => ui?.sizeGroup?.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' }), 420);
    }
  }

  function show(p, originEl, opts = {}) {
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
      syncCartBadges();
      if (wasClosing) enter();
      afterEnter(opts);
      return;
    }
    product = p;
    returnFocus = document.activeElement;
    ui = build(p);
    root.replaceChildren(ui.scrim, ui.panel);
    root.hidden = false;
    lockLayer(root);
    releaseTrap = trapFocus(root);
    syncCartBadges();
    ui.closeBtn.focus({ preventScroll: true });
    enter();
    afterEnter(opts);
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
