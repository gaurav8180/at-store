import { $, debounce, h } from './dom.js';
import { categoryLabel, getCategories } from './format.js';
import { saved } from './store.js';
import { createCard } from './card.js';
import { motion } from './motion.js';
import { contactLink } from './whatsapp.js';

const skeleton = () => h('div', { class: 'card', 'aria-hidden': 'true' },
  h('div', { class: 'card__media skel' }),
  h('div', { class: 'card__body' }, h('span', { class: 'skel skel--line' }), h('span', { class: 'skel skel--line skel--short' })));

export function createCatalogue({ onOpen, onQuickAdd, onCategory = () => {} }) {
  const grid = $('#grid');
  const chipsEl = $('#chips');
  const searchEl = $('#search');
  const sortEl = $('#sort');
  const countEl = $('#shop-count');
  const titleEl = $('#shop-title-text');
  const headEl = $('.section-head');
  const stateEl = $('#state');
  const statusEl = $('#shop-status');

  let products = [];
  let category = 'all';
  let query = '';
  let order = 'new';
  let phase = 'loading';
  let retry = null;

  let chips = [];

  function buildChips() {
    const defs = [{ id: 'all', label: 'All' }, ...getCategories().map((c) => ({ id: c.slug, label: c.name })), { id: 'saved', label: 'Saved' }];
    if (!defs.some((d) => d.id === category)) category = 'all';
    chips = defs.map((def) => {
      const n = h('span', { class: 'chip__n' }, '0');
      const el = h('button', {
        class: 'chip', type: 'button', dataset: { cat: def.id }, 'aria-pressed': String(def.id === category),
        onclick: () => setCategory(def.id),
      }, h('span', {}, def.label), n);
      return { def, el, n };
    });
    chipsEl.replaceChildren(...chips.map((c) => c.el));
  }

  buildChips();

  const matches = (p, id) => (id === 'all' ? true : id === 'saved' ? saved.has(p.id) : p.category === id);

  function visible() {
    let list = products.filter((p) => matches(p, category));
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      list = list.filter((p) => {
        const hay = `${p.name} ${categoryLabel(p.category)}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    const time = (p) => Date.parse(p.createdAt) || 0;
    const sorters = { new: (a, b) => time(b) - time(a), low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price };
    return list.sort(sorters[order]);
  }

  function paintChips() {
    if (category === 'saved' && !saved.count()) category = 'all';
    chips.forEach(({ def, el, n }) => {
      n.textContent = String(products.filter((p) => matches(p, def.id)).length);
      el.setAttribute('aria-pressed', String(def.id === category));
      if (def.id === 'saved') el.hidden = !saved.count();
    });
  }

  function showState({ title, text, action }) {
    const kids = [h('h3', { class: 'state__title' }, title), h('p', { class: 'state__text' }, text)];
    if (action?.href) kids.push(h('a', { class: 'btn btn--dark', href: action.href, target: '_blank', rel: 'noopener' }, action.label));
    else if (action) kids.push(h('button', { class: 'btn btn--dark', type: 'button', onclick: action.run }, action.label));
    stateEl.replaceChildren(...kids);
    stateEl.hidden = false;
  }

  function render() {
    grid.setAttribute('aria-busy', String(phase === 'loading'));
    stateEl.hidden = true;
    if (phase === 'loading') {
      grid.replaceChildren(...Array.from({ length: 8 }, skeleton));
      return;
    }
    if (phase === 'error') {
      grid.replaceChildren();
      showState({ title: 'The rack won’t load.', text: 'Check your connection and try again.', action: { label: 'Try again', run: retry } });
      return;
    }
    paintChips();
    const list = visible();
    countEl.textContent = `(${list.length})`;
    titleEl.textContent = query ? `Results for “${query}”` : category === 'all' ? 'All products' : category === 'saved' ? 'Saved' : categoryLabel(category);
    statusEl.textContent = `${list.length} ${list.length === 1 ? 'product' : 'products'} shown`;
    if (!list.length) {
      grid.replaceChildren();
      if (!products.length) {
        showState({ title: 'The rack is empty.', text: 'New pieces land soon. Ask us on WhatsApp what is coming next.', action: { label: 'Ask on WhatsApp', href: contactLink() } });
      } else {
        showState({
          title: query ? `Nothing for “${query}”.` : 'Nothing here yet.',
          text: 'Try another category or clear your search.',
          action: { label: 'Clear filters', run: clearFilters },
        });
      }
      return;
    }
    const before = new Map([...grid.children].filter((c) => c.dataset?.id).map((c) => [c.dataset.id, c.getBoundingClientRect()]));
    const cards = list.map((p) => createCard(p, { onOpen, onQuickAdd }));
    grid.replaceChildren(...cards);
    const fresh = [];
    cards.forEach((card) => {
      const from = before.get(card.dataset.id);
      if (from) motion.flip(card, from, { duration: 350 });
      else fresh.push(card);
    });
    motion.revealCards(fresh);
  }

  function keepInView() {
    const header = document.querySelector('.site-header').offsetHeight;
    const bottom = headEl.getBoundingClientRect().bottom;
    if (bottom < header) window.scrollTo({ top: scrollY + bottom - header, behavior: 'instant' });
  }

  function setCategory(id) {
    category = id;
    onCategory(id);
    render();
    keepInView();
  }

  function clearFilters() {
    category = 'all';
    query = '';
    searchEl.value = '';
    render();
    keepInView();
  }

  searchEl.addEventListener('input', debounce(() => { query = searchEl.value.trim(); render(); }, 180));
  sortEl.addEventListener('change', () => { order = sortEl.value; render(); });
  saved.subscribe(() => { if (phase === 'ready') (category === 'saved' ? render() : paintChips()); });

  render();

  return {
    setProducts(list) { products = list; phase = 'ready'; render(); },
    setCategories() { buildChips(); if (phase === 'ready') render(); },
    showError(fn) { retry = fn; phase = 'error'; render(); },
    showLoading() { phase = 'loading'; render(); },
    filterTo(id, { silent = false } = {}) {
      searchEl.value = '';
      query = '';
      category = chips.some((c) => c.def.id === id) ? id : 'all';
      if (!silent) onCategory(category);
      render();
    },
  };
}
