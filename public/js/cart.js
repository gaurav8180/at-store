import { $, h } from './dom.js';
import { icon } from './icons.js';
import { inr } from './format.js';
import { image, thumbOf } from './card.js';
import { cart, lineKey } from './store.js';
import { orderLink } from './whatsapp.js';
import { isTopLayer, lockLayer, trapFocus, unlockLayer } from './layers.js';
import { motion } from './motion.js';
import { reducedMotion } from './dom.js';
import { createStepper } from './stepper.js';
import { capFor, lowAt, stockOf } from './stock.js';

export function syncCartBadges() {
  const n = cart.count();
  document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = String(n); });
  document.querySelectorAll('[data-cart-btn]').forEach((el) => {
    el.setAttribute('aria-label', `Open cart, ${n} ${n === 1 ? 'item' : 'items'}`);
  });
}

export function cartTarget() {
  const inSheet = document.querySelector('.sheet:not([hidden]) [data-cart-target]');
  return inSheet?.offsetParent ? inSheet : document.getElementById('cart-open');
}

export function createDrawer(root, { getProduct, onBrowse }) {
  let isOpen = false;
  let returnFocus = null;
  let releaseTrap = null;

  const titleCount = h('span', {});
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close cart', onclick: close }, icon('close'));
  const list = h('ul', { class: 'drawer__list' });
  const foot = h('div', { class: 'drawer__foot' });
  const scrim = h('div', { class: 'drawer__scrim', onclick: close });
  const panel = h('aside', { class: 'drawer__panel', tabindex: '-1' },
    h('header', { class: 'drawer__head' }, h('h2', { class: 'drawer__title', id: 'drawer-title' }, 'Your cart', titleCount), closeBtn),
    list, foot);
  root.append(scrim, panel);

  function status(line, product) {
    if (!product) return { off: true, warn: 'Unavailable', qty: 0 };
    if (!product.inStock) return { off: true, warn: 'Sold out', qty: 0 };
    const stock = stockOf(product, line.size);
    if (stock === 0) return { off: true, warn: 'This size is sold out', qty: 0 };
    const qty = Math.min(line.qty, capFor(product, line.size));
    const warn = Number.isFinite(stock) && (line.qty > stock || stock <= lowAt(product)) ? `Only ${stock} left` : '';
    return { off: false, warn, qty };
  }

  function row(line, product, st) {
    const key = lineKey(line);
    const meta = [line.size, line.color].filter(Boolean).join(' / ');
    return h('li', { class: `cart-line${st.off ? ' is-off' : ''}`, dataset: { key } },
      h('div', { class: 'cart-line__media' }, image(product && thumbOf(product, 0), product?.name || 'Unavailable item', { cls: 'cart-line__img' })),
      h('div', { class: 'cart-line__body' },
        h('p', { class: 'cart-line__name' }, product?.name || 'No longer available'),
        meta ? h('p', { class: 'cart-line__meta micro' }, meta) : null,
        st.warn ? h('p', { class: 'cart-line__warn' }, st.warn) : null,
        st.off ? null : h('div', { class: 'cart-line__row' },
          createStepper({ label: `quantity of ${product.name}`, value: st.qty, max: capFor(product, line.size), onChange: (v) => cart.setQty(key, v) }),
          h('p', { class: 'cart-line__price' }, inr(product.price * st.qty))),
        h('button', { class: 'cart-line__remove', type: 'button', 'data-act': 'remove', onclick: () => cart.remove(key) }, 'Remove')));
  }

  function render() {
    const focused = document.activeElement;
    const keyEl = focused?.closest?.('[data-key]');
    const keep = keyEl && root.contains(focused) ? { key: keyEl.dataset.key, act: focused.dataset.act } : null;

    const rows = cart.lines.map((line) => {
      const product = getProduct(line.id);
      return { line, product, st: status(line, product) };
    });
    const buyable = rows.filter((r) => !r.st.off);
    const total = buyable.reduce((sum, r) => sum + r.product.price * r.st.qty, 0);
    titleCount.textContent = `(${cart.count()})`;

    if (!rows.length) {
      list.replaceChildren(h('li', { class: 'drawer__empty' },
        h('h3', {}, 'Nothing here yet.'),
        h('p', {}, 'Your cart is empty.'),
        h('button', { class: 'btn btn--dark', type: 'button', onclick: () => { close(); onBrowse(); } }, 'Start shopping')));
      foot.hidden = true;
      return;
    }

    list.replaceChildren(...rows.map((r) => row(r.line, r.product, r.st)));
    foot.hidden = false;
    foot.replaceChildren(
      h('div', { class: 'subtotal' }, h('span', { class: 'micro' }, 'Subtotal'), h('strong', {}, inr(total))),
      h('p', { class: 'drawer__note' }, buyable.length < rows.length ? 'Items that are sold out are left out of your order.' : 'Delivery and payment are confirmed with you on WhatsApp.'),
      buyable.length
        ? h('a', {
          class: 'btn btn--primary btn--lg btn--block', target: '_blank', rel: 'noopener',
          href: orderLink(buyable.map((r) => ({ product: r.product, size: r.line.size, color: r.line.color, qty: r.st.qty }))),
        }, icon('whatsapp'), buyable.length === 1 ? 'Order on WhatsApp' : 'Order all on WhatsApp')
        : h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', disabled: true }, 'Nothing to order'),
      h('button', { class: 'btn btn--ghost btn--block', type: 'button', onclick: close }, 'Continue shopping'));

    if (keep) {
      const target = [...list.querySelectorAll('[data-key]')].find((el) => el.dataset.key === keep.key);
      (target?.querySelector(`[data-act="${keep.act}"]:not([disabled])`) ?? target?.querySelector('[data-act="remove"]') ?? closeBtn).focus();
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    returnFocus = document.activeElement;
    render();
    root.hidden = false;
    lockLayer(root);
    releaseTrap = trapFocus(root);
    closeBtn.focus({ preventScroll: true });
    if (!reducedMotion.matches) {
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      panel.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 400, easing: motion.ease });
    }
  }

  async function close() {
    if (!isOpen) return;
    isOpen = false;
    releaseTrap?.();
    if (!reducedMotion.matches) {
      await Promise.all([
        scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: 'forwards' }).finished,
        panel.animate([{ transform: 'none' }, { transform: 'translateX(100%)' }], { duration: 320, easing: 'ease-in', fill: 'forwards' }).finished,
      ]).catch(() => {});
    }
    root.hidden = true;
    unlockLayer(root);
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen && isTopLayer(root)) { e.preventDefault(); close(); }
  });
  cart.subscribe(() => { if (isOpen) render(); });

  return { open, close, render };
}
