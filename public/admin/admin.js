(() => {
  const TOKEN_KEY = 'at_admin_token';
  const MAX_IMAGES = 6;
  const MAX_INPUT_BYTES = 30 * 1024 * 1024;
  const FULL_MAX_SIDE = 2400;
  const THUMB_MAX_SIDE = 800;
  const KEEP_ORIGINAL_BYTES = 4 * 1024 * 1024;
  const OG_MAX_BYTES = 300 * 1024;
  const DAY = 24 * 60 * 60 * 1000;
  const DEAD_DAYS = 60;
  const STALE_OUT_DAYS = 30;
  const SAVE_DELAY = 700;
  const STATUS_FILTERS = [
    ['all', 'All'], ['in', 'In stock'], ['low', 'Low stock'], ['out', 'Out of stock'], ['archived', 'Archived'], ['dead', 'Dead stock'],
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  };
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ic');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  };
  const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  const num = (n) => Number(n).toLocaleString('en-IN');
  const plural = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;
  const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  const ago = (iso) => {
    const d = daysSince(iso);
    if (!Number.isFinite(d)) return '';
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 45) return `${d}d ago`;
    return `${Math.round(d / 30)}mo ago`;
  };

  const state = {
    token: null,
    view: 'inventory',
    products: [],
    categories: [],
    search: '',
    status: 'all',
    activeStat: null,
    category: '',
    sort: 'updated-desc',
    selected: new Set(),
    editing: null,
    images: [],
    stock: {},
    saving: false,
  };
  const formSizes = [];
  const formColors = [];
  const pendingStock = new Map();

  try { state.token = localStorage.getItem(TOKEN_KEY); } catch {}

  const els = {
    login: $('#login'), app: $('#app'), list: $('#list'), empty: $('#empty'), emptyText: $('#empty-text'),
    summary: $('#summary'), stats: $('#stats'), statsLine: $('#stats-line'), breakdown: $('#cat-breakdown'), filters: $('#filters'),
    search: $('#search'), category: $('#category'), sort: $('#sort'),
    bulk: $('#bulk'), bulkCount: $('#bulk-count'), bulkCategory: $('#bulk-category'), menu: $('#menu'),
    drawer: $('#drawer'), scrim: $('#scrim'), form: $('#product-form'), stockGrid: $('#stock-grid'),
    thumbs: $('#thumbs'), dropzone: $('#dropzone'), fileInput: $('#file-input'), toasts: $('#toasts'),
    formError: $('#form-error'), imageCount: $('#image-count'),
    dialog: $('#dialog'), catList: $('#cat-list'), catAdd: $('#cat-add'),
  };

  class AuthError extends Error {}

  async function api(path, { json, ...options } = {}) {
    const headers = { ...(options.headers || {}) };
    if (state.token) headers['x-admin-token'] = state.token;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(json);
    }
    const res = await fetch(path, { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch {}
    if (res.status === 401 && path !== '/api/login') {
      signOut(true);
      throw new AuthError('Session expired. Please sign in again.');
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const fail = (ex) => { if (!(ex instanceof AuthError)) toast(ex.message, 'error'); };

  function toast(message, type = 'success', action) {
    const node = el('div', { class: `toast ${type}`, role: 'status' }, [icon(type === 'error' ? 'alert' : 'check'), el('span', { text: message })]);
    const dismiss = () => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 300);
    };
    if (action) {
      node.append(el('button', { type: 'button', text: action.label, onclick: () => { dismiss(); action.fn(); } }));
    }
    els.toasts.append(node);
    while (els.toasts.children.length > 3) els.toasts.firstChild.remove();
    setTimeout(dismiss, action ? 6000 : type === 'error' ? 5000 : 2600);
  }

  // ---------- product helpers ----------
  const units = (p) => Object.values(p.stockBySize || {}).reduce((s, n) => s + n, 0);
  const stockStatus = (p) => {
    if (p.archived) return 'archived';
    const values = Object.values(p.stockBySize || {});
    if (!values.some((n) => n > 0)) return 'out';
    return Math.min(...values) <= p.lowStockAt ? 'low' : 'ok';
  };
  const sizeTone = (p, n) => (n <= 0 ? 'out' : n <= p.lowStockAt ? 'low' : '');
  const isDead = (p) => !p.archived && units(p) > 0 && daysSince(p.updatedAt) >= DEAD_DAYS;
  const isStaleOut = (p) => !p.archived && units(p) === 0 && daysSince(p.updatedAt) >= STALE_OUT_DAYS;
  const sizeLabel = (key) => (key === 'ONE' ? 'Qty' : key);
  const catName = (slug) => (state.categories.find((c) => c.slug === slug) || {}).name || slug;
  const findProduct = (id) => state.products.find((p) => p.id === id);

  const MATCH = {
    all: () => true,
    in: (p) => !p.archived && units(p) > 0,
    low: (p) => stockStatus(p) === 'low',
    out: (p) => stockStatus(p) === 'out',
    archived: (p) => p.archived,
    dead: isDead,
  };

  const SORTS = {
    'updated-desc': (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
    name: (a, b) => a.name.localeCompare(b.name),
    'stock-asc': (a, b) => units(a) - units(b),
    'price-asc': (a, b) => a.price - b.price,
  };

  function visible() {
    const q = state.search.trim().toLowerCase();
    return state.products
      .filter((p) => MATCH[state.status](p))
      .filter((p) => !state.category || p.category === state.category)
      .filter((p) => !q || [p.name, catName(p.category), p.badge, p.description, ...p.colors].some((s) => String(s || '').toLowerCase().includes(q)))
      .sort(SORTS[state.sort]);
  }

  // ---------- auth ----------
  function showLogin() {
    els.app.hidden = true;
    els.login.hidden = false;
    $('#login-password').value = '';
    $('#login-password').focus();
  }

  function showApp() {
    els.login.hidden = true;
    els.app.hidden = false;
    Promise.all([loadCategories(), loadProducts()]).catch(fail);
  }

  function signOut(silent) {
    const token = state.token;
    state.token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    if (token && !silent) fetch('/api/logout', { method: 'POST', headers: { 'x-admin-token': token } }).catch(() => {});
    closeDrawer(true);
    closeMenu();
    state.selected.clear();
    renderBulk();
    showLogin();
    if (silent) toast('Session expired. Please sign in again.', 'error');
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.hidden = true;
    const btn = $('#login-form button[type=submit]');
    btn.disabled = true;
    try {
      const { token } = await api('/api/login', { method: 'POST', json: { password: $('#login-password').value } });
      state.token = token;
      try { localStorage.setItem(TOKEN_KEY, token); } catch {}
      showApp();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      $('#login-password').select();
    } finally {
      btn.disabled = false;
    }
  });

  $('#logout').addEventListener('click', () => signOut(false));

  // ---------- views ----------
  function setView(view) {
    state.view = view;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
    $('#inventory-view').hidden = view !== 'inventory';
    $('#categories-view').hidden = view !== 'categories';
    closeMenu();
    renderBulk();
    if (view === 'categories') renderCategories();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));

  // ---------- data ----------
  async function loadProducts() {
    try {
      state.products = await api('/api/admin/products');
      const ids = new Set(state.products.map((p) => p.id));
      for (const id of state.selected) if (!ids.has(id)) state.selected.delete(id);
      render();
    } catch (ex) {
      fail(ex);
    }
  }

  async function loadCategories() {
    try {
      state.categories = await api('/api/admin/categories');
      renderCategoryOptions();
      if (state.view === 'categories') renderCategories();
      render();
    } catch (ex) {
      fail(ex);
    }
  }

  function replaceProduct(updated) {
    const pending = pendingStock.has(updated.id);
    state.products = state.products.map((p) => {
      if (p.id !== updated.id) return p;
      return pending ? { ...updated, stockBySize: p.stockBySize } : updated;
    });
  }

  // ---------- rendering ----------
  function render() {
    renderStats();
    renderFilters();
    renderBreakdown();
    renderList();
    renderBulk();
  }

  function renderStats() {
    const active = state.products.filter((p) => !p.archived);
    const totalUnits = active.reduce((s, p) => s + units(p), 0);
    const value = active.reduce((s, p) => s + units(p) * p.price, 0);
    const out = state.products.filter(MATCH.out).length;
    const low = state.products.filter(MATCH.low).length;
    const archived = state.products.filter(MATCH.archived).length;
    els.summary.textContent = state.products.length
      ? `${plural(active.length, 'live product')}${archived ? `, ${num(archived)} archived` : ''}`
      : 'Nothing here yet';

    const stats = [
      { key: 'products', label: 'Products', value: num(state.products.length), status: 'all' },
      { key: 'units', label: 'Units', value: num(totalUnits), status: 'in' },
      { key: 'out', label: 'Out of stock', value: num(out), status: 'out', tone: out ? 'out' : '' },
      { key: 'low', label: 'Low stock', value: num(low), status: 'low', tone: low ? 'low' : '' },
      { key: 'archived', label: 'Archived', value: num(archived), status: 'archived' },
      { key: 'value', label: 'Stock value', value: inr(value), status: 'in' },
    ];
    const pick = (s) => {
      state.activeStat = state.activeStat === s.key ? null : s.key;
      state.status = state.activeStat ? s.status : 'all';
      render();
    };
    els.stats.replaceChildren(...stats.map((s) => el('button', {
      type: 'button',
      class: `stat${s.tone ? ` tone-${s.tone}` : ''}${state.activeStat === s.key ? ' is-active' : ''}`,
      onclick: () => pick(s),
    }, [el('span', { class: 'label', text: s.label }), el('span', { class: 'value', text: s.value })])));
    const line = [
      [stats[0], `${num(state.products.length)} products`],
      [stats[1], `${num(totalUnits)} units`],
      [stats[2], `${num(out)} out`],
      [stats[3], `${num(low)} low`],
    ];
    els.statsLine.replaceChildren(...line.flatMap(([s, text], i) => [
      i ? ' · ' : '',
      el('button', { type: 'button', class: `${s.tone ? `tone-${s.tone}` : ''}${state.activeStat === s.key ? ' is-active' : ''}`, text, onclick: () => pick(s) }),
    ]));
  }

  function renderFilters() {
    const scoped = state.products.filter((p) => !state.category || p.category === state.category);
    els.filters.replaceChildren(...STATUS_FILTERS.map(([key, label]) => el('button', {
      type: 'button', role: 'tab', class: `seg-btn${state.status === key ? ' is-active' : ''}`, 'aria-selected': String(state.status === key),
      onclick: () => { state.status = key; state.activeStat = null; render(); },
    }, [label, el('span', { class: 'n', text: num(scoped.filter(MATCH[key]).length) })])));
  }

  function renderBreakdown() {
    els.breakdown.replaceChildren(...state.categories.map((c) => {
      const items = state.products.filter((p) => p.category === c.slug && !p.archived);
      return el('button', {
        type: 'button', class: `crumb${state.category === c.slug ? ' is-active' : ''}`,
        onclick: () => { state.category = state.category === c.slug ? '' : c.slug; els.category.value = state.category; render(); },
      }, [el('b', { text: c.name }), `${num(items.length)} · ${plural(items.reduce((s, p) => s + units(p), 0), 'unit')}`]);
    }));
  }

  const reviewBar = el('div', { class: 'review-bar', hidden: true }, [
    el('span', { text: `In stock but untouched for ${DEAD_DAYS}+ days, plus items sold out for ${STALE_OUT_DAYS}+ days.` }),
    el('button', { type: 'button', class: 'btn btn-soft', text: 'Review', onclick: () => openCleanup() }),
  ]);
  els.list.before(reviewBar);

  function renderList() {
    reviewBar.hidden = state.status !== 'dead';
    const items = visible();
    els.list.replaceChildren();
    els.empty.hidden = items.length > 0;
    els.list.hidden = items.length === 0;
    if (!items.length) {
      els.emptyText.textContent = state.products.length ? 'No products match these filters.' : 'No products yet. Add your first one.';
      return;
    }
    const all = el('input', { type: 'checkbox', 'aria-label': 'Select all shown' });
    const chosen = items.filter((p) => state.selected.has(p.id)).length;
    all.checked = chosen > 0 && chosen === items.length;
    all.indeterminate = chosen > 0 && chosen < items.length;
    all.addEventListener('change', () => {
      items.forEach((p) => (all.checked ? state.selected.add(p.id) : state.selected.delete(p.id)));
      renderList();
      renderBulk();
    });
    els.list.append(el('div', { class: 'list-head' }, [
      el('label', { class: 'check' }, [all, el('span')]), el('span'), el('span', { text: 'Product' }),
      el('span', { text: 'Price' }), el('span', { text: 'Stock per size' }), el('span'),
    ]));
    items.forEach((p) => els.list.append(buildRow(p)));
  }

  function buildRow(p) {
    const check = el('input', { type: 'checkbox', 'aria-label': `Select ${p.name}` });
    check.checked = state.selected.has(p.id);
    check.addEventListener('change', () => {
      check.checked ? state.selected.add(p.id) : state.selected.delete(p.id);
      check.closest('.item').classList.toggle('is-selected', check.checked);
      renderBulk();
      const head = $('.list-head input', els.list);
      if (head) {
        const shown = visible();
        const n = shown.filter((x) => state.selected.has(x.id)).length;
        head.checked = n > 0 && n === shown.length;
        head.indeterminate = n > 0 && n < shown.length;
      }
    });

    const thumb = el('img', { class: 'thumb', alt: '', loading: 'lazy', decoding: 'async' });
    if (p.thumbs && p.thumbs[0]) thumb.src = p.thumbs[0];
    else if (p.images[0]) thumb.src = p.images[0];

    const sub = el('span', { class: 'sub' }, [
      el('span', { text: catName(p.category) }),
      el('span', { class: 'mobile-price', text: inr(p.price) }),
      p.archived ? el('span', { class: 'tag', text: 'Archived' }) : null,
      p.badge ? el('span', { class: 'tag tag-badge', text: p.badge }) : null,
      p.featured ? el('span', { class: 'tag tag-violet', text: 'Featured' }) : null,
      isDead(p) ? el('span', { class: 'tag', text: 'Dead stock' }) : null,
      el('span', { text: `Updated ${ago(p.updatedAt)}` }),
    ]);

    const price = el('div', { class: 'price', text: inr(p.price) });
    if (p.mrp && p.mrp > p.price) price.append(el('s', { text: inr(p.mrp) }));

    return el('div', { class: `item${state.selected.has(p.id) ? ' is-selected' : ''}${p.archived ? ' is-archived' : ''}`, 'data-id': p.id }, [
      el('label', { class: 'check' }, [check, el('span')]),
      thumb,
      el('div', { class: 'item-name' }, [el('button', { type: 'button', class: 'n', text: p.name, onclick: () => openDrawer(p) }), sub]),
      price,
      buildStock(p),
      el('div', { class: 'actions' }, [
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit ${p.name}`, title: 'Edit', onclick: () => openDrawer(p) }, [icon('edit')]),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': `More actions for ${p.name}`, 'aria-haspopup': 'menu', onclick: (e) => rowMenu(p.id, e.currentTarget) }, [icon('more')]),
      ]),
    ]);
  }

  function stockPill(p) {
    const status = stockStatus(p);
    const total = units(p);
    const lowSizes = Object.values(p.stockBySize).filter((n) => n <= p.lowStockAt).length;
    const text = { ok: `${num(total)} in stock`, low: `${lowSizes} size${lowSizes === 1 ? '' : 's'} low`, out: 'Out of stock', archived: `Archived · ${num(total)}` }[status];
    return el('span', { class: `pill ${status}`, text });
  }

  function buildStock(p) {
    return el('div', { class: 'stock' }, [
      stockPill(p),
      ...Object.entries(p.stockBySize).map(([key, n]) => {
        const input = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: String(n), 'aria-label': `${p.name} ${sizeLabel(key)} quantity`, 'data-key': key });
        input.addEventListener('input', () => {
          const v = input.value === '' ? null : Math.floor(Number(input.value));
          if (v !== null && Number.isFinite(v) && v >= 0) setQty(p.id, key, v);
        });
        input.addEventListener('blur', () => { input.value = String(findProduct(p.id).stockBySize[key]); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        input.addEventListener('focus', () => input.select());
        const step = (d) => setQty(p.id, key, Math.max(0, findProduct(p.id).stockBySize[key] + d));
        return el('div', { class: `qty ${sizeTone(p, n)}`, 'data-key': key }, [
          el('span', { class: 'lbl', text: sizeLabel(key), title: sizeLabel(key) }),
          el('button', { type: 'button', 'aria-label': `One less ${sizeLabel(key)}`, onclick: () => step(-1) }, [icon('minus')]),
          input,
          el('button', { type: 'button', 'aria-label': `One more ${sizeLabel(key)}`, onclick: () => step(1) }, [icon('plus')]),
        ]);
      }),
    ]);
  }

  function refreshRowStock(id) {
    const p = findProduct(id);
    const row = els.list.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
    if (!p || !row) return;
    const cell = $('.stock', row);
    if (!cell.contains(document.activeElement)) {
      cell.replaceWith(buildStock(p));
      return;
    }
    cell.firstElementChild.replaceWith(stockPill(p));
    $$('.qty', cell).forEach((q) => {
      const n = p.stockBySize[q.dataset.key];
      q.className = `qty ${sizeTone(p, n)}`;
      const input = $('input', q);
      if (input !== document.activeElement) input.value = String(n);
    });
  }

  // ---------- inline stock ----------
  function setQty(id, key, n) {
    const p = findProduct(id);
    if (!p || p.stockBySize[key] === n) {
      refreshRowStock(id);
      return;
    }
    const entry = pendingStock.get(id) || { before: { ...p.stockBySize }, timer: null };
    clearTimeout(entry.timer);
    p.stockBySize = { ...p.stockBySize, [key]: n };
    entry.timer = setTimeout(() => flushStock(id), SAVE_DELAY);
    pendingStock.set(id, entry);
    refreshRowStock(id);
    renderStats();
    renderFilters();
    renderBreakdown();
  }

  async function flushStock(id) {
    const entry = pendingStock.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingStock.delete(id);
    const p = findProduct(id);
    if (!p) return;
    const sent = { ...p.stockBySize };
    if (JSON.stringify(sent) === JSON.stringify(entry.before)) return;
    try {
      const updated = await api(`/api/products/${id}`, { method: 'PUT', json: { stockBySize: sent } });
      replaceProduct(updated);
      refreshRowStock(id);
      toast(`${p.name}: stock saved`, 'success', { label: 'Undo', fn: () => restoreStock(id, entry.before) });
    } catch (ex) {
      const cur = findProduct(id);
      if (cur) cur.stockBySize = entry.before;
      refreshRowStock(id);
      renderStats();
      fail(ex);
    }
  }

  async function restoreStock(id, before) {
    const entry = pendingStock.get(id);
    if (entry) { clearTimeout(entry.timer); pendingStock.delete(id); }
    try {
      replaceProduct(await api(`/api/products/${id}`, { method: 'PUT', json: { stockBySize: before } }));
      render();
      toast('Stock restored');
    } catch (ex) {
      fail(ex);
    }
  }

  window.addEventListener('beforeunload', (e) => {
    if (!pendingStock.size) return;
    for (const id of pendingStock.keys()) flushStock(id);
    e.preventDefault();
  });

  // ---------- quick actions ----------
  async function patchProduct(p, body, message, undoBody) {
    try {
      replaceProduct(await api(`/api/products/${p.id}`, { method: 'PUT', json: body }));
      render();
      toast(message, 'success', undoBody && {
        label: 'Undo',
        fn: async () => {
          try {
            replaceProduct(await api(`/api/products/${p.id}`, { method: 'PUT', json: undoBody }));
            render();
            toast('Undone');
          } catch (ex) { fail(ex); }
        },
      });
    } catch (ex) {
      fail(ex);
    }
  }

  const zeroStock = (p) => Object.fromEntries(Object.keys(p.stockBySize).map((k) => [k, 0]));

  function rowMenu(id, anchor) {
    const p = findProduct(id);
    if (!p) return;
    openMenu(anchor, [
      { label: 'Restock…', icon: 'box', fn: () => restock(p) },
      { label: 'Mark out of stock', icon: 'ban', disabled: units(p) === 0, fn: () => patchProduct(p, { stockBySize: zeroStock(p) }, `${p.name} marked out of stock`, { stockBySize: { ...p.stockBySize } }) },
      p.archived
        ? { label: 'Unarchive', icon: 'archive', fn: () => patchProduct(p, { archived: false }, `${p.name} is back in the shop`, { archived: true }) }
        : { label: 'Archive (hide from shop)', icon: 'archive', fn: () => patchProduct(p, { archived: true }, `${p.name} archived`, { archived: false }) },
      { label: 'Duplicate', icon: 'copy', fn: () => duplicate(p) },
      { label: 'Edit', icon: 'edit', fn: () => openDrawer(p) },
      'hr',
      { label: 'Delete', icon: 'trash', danger: true, fn: () => removeProduct(p) },
    ]);
  }

  async function restock(p) {
    const inputs = {};
    const all = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: '0', 'aria-label': 'Add to every size' });
    const rows = Object.entries(p.stockBySize).map(([key, n]) => {
      inputs[key] = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: '0', 'aria-label': `Add ${sizeLabel(key)}` });
      return el('label', { class: 'restock-row' }, [el('span', { class: 'sz', text: sizeLabel(key) }), el('span', { class: 'now', text: `${n} now` }), el('span', { text: '+' }), inputs[key]]);
    });
    all.addEventListener('input', () => Object.values(inputs).forEach((i) => { i.value = all.value; }));
    const body = Object.keys(inputs).length > 1
      ? [el('label', { class: 'restock-row' }, [el('span', { class: 'sz', text: 'All sizes' }), el('span', { class: 'now' }), el('span', { text: '+' }), all]), ...rows]
      : rows;
    const ok = await dialog({
      title: `Restock ${p.name}`,
      text: 'Units to add on top of what you have.',
      body,
      actions: [{ label: 'Cancel', value: false }, { label: 'Add stock', value: true, kind: 'primary' }],
    });
    if (!ok) return;
    const next = { ...p.stockBySize };
    let added = 0;
    for (const [key, input] of Object.entries(inputs)) {
      const n = Math.max(0, Math.floor(Number(input.value) || 0));
      next[key] += n;
      added += n;
    }
    if (!added) return;
    patchProduct(p, { stockBySize: next }, `Added ${plural(added, 'unit')} to ${p.name}`, { stockBySize: { ...p.stockBySize } });
  }

  async function duplicate(p) {
    try {
      const copy = await api('/api/products', {
        method: 'POST',
        json: {
          name: `${p.name} (copy)`, category: p.category, price: p.price, mrp: p.mrp, description: p.description,
          sizes: p.sizes, colors: p.colors, images: p.images, thumbs: p.thumbs, ogImage: p.ogImage, badge: p.badge,
          lowStockAt: p.lowStockAt, featured: false, archived: false, stockBySize: zeroStock(p),
        },
      });
      state.products.unshift(copy);
      render();
      toast('Duplicated with zero stock. Rename and restock it.');
      openDrawer(copy);
    } catch (ex) {
      fail(ex);
    }
  }

  async function removeProduct(p) {
    const ok = await confirmDialog('Delete product?', `"${p.name}" and its uploaded images will be removed permanently. Archive it instead to just hide it.`);
    if (!ok) return;
    try {
      await api(`/api/products/${p.id}`, { method: 'DELETE' });
      state.products = state.products.filter((x) => x.id !== p.id);
      state.selected.delete(p.id);
      render();
      toast('Product deleted');
    } catch (ex) {
      fail(ex);
    }
  }

  // ---------- menu ----------
  let menuAnchor = null;
  function openMenu(anchor, items) {
    if (menuAnchor === anchor && !els.menu.hidden) { closeMenu(); return; }
    menuAnchor = anchor;
    els.menu.replaceChildren(...items.map((item) => (item === 'hr' ? el('hr') : el('button', {
      type: 'button', role: 'menuitem', class: item.danger ? 'danger' : '', disabled: item.disabled,
      onclick: () => { closeMenu(); item.fn(); },
    }, [icon(item.icon), item.label]))));
    els.menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const m = els.menu.getBoundingClientRect();
    const top = r.bottom + 6 + m.height > window.innerHeight ? Math.max(8, r.top - m.height - 6) : r.bottom + 6;
    els.menu.style.top = `${top}px`;
    els.menu.style.left = `${Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8))}px`;
    $('button:not([disabled])', els.menu)?.focus({ preventScroll: true });
  }
  function closeMenu() {
    els.menu.hidden = true;
    menuAnchor = null;
  }
  document.addEventListener('pointerdown', (e) => {
    if (!els.menu.hidden && !els.menu.contains(e.target) && !(menuAnchor && menuAnchor.contains(e.target))) closeMenu();
  });
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', () => { if (window.innerWidth > 860) closeMenu(); }, { passive: true });

  // ---------- dialog ----------
  let dialogClose = null;
  function dialog({ title, text = '', body = [], actions }) {
    return new Promise((resolve) => {
      $('#dialog-title').textContent = title;
      $('#dialog-text').textContent = text;
      $('#dialog-text').hidden = !text;
      $('#dialog-body').replaceChildren(...body);
      const buttons = actions.map((a) => el('button', {
        type: a.kind === 'primary' || a.kind === 'danger' ? 'submit' : 'button',
        class: `btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost'}`,
        text: a.label,
        'data-value': String(actions.indexOf(a)),
      }));
      $('#dialog-actions').replaceChildren(...buttons);
      const form = $('#dialog-form');
      const previous = document.activeElement;
      const done = (value) => {
        els.dialog.hidden = true;
        form.onsubmit = null;
        els.dialog.onclick = null;
        dialogClose = null;
        if (previous && previous.isConnected) previous.focus({ preventScroll: true });
        resolve(value);
      };
      dialogClose = () => done(null);
      form.onsubmit = (e) => {
        e.preventDefault();
        const idx = e.submitter ? Number(e.submitter.dataset.value) : actions.findIndex((a) => a.kind === 'primary' || a.kind === 'danger');
        done(actions[idx].value);
      };
      buttons.forEach((b, i) => { if (b.type === 'button') b.onclick = () => done(actions[i].value); });
      els.dialog.onclick = (e) => { if (e.target === els.dialog) done(null); };
      els.dialog.hidden = false;
      const first = $('input, select', $('#dialog-body')) || buttons[0];
      first.focus();
    });
  }

  const confirmDialog = (title, text, okLabel = 'Delete') =>
    dialog({ title, text, actions: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, kind: 'danger' }] });

  // ---------- bulk ----------
  function renderBulk() {
    const n = state.selected.size;
    const show = n > 0 && state.view === 'inventory' && !els.app.hidden;
    els.bulk.hidden = !show;
    document.body.classList.toggle('has-bulk', show);
    els.bulkCount.textContent = `${num(n)} selected`;
  }

  async function runBulk(action, value, message) {
    const ids = [...state.selected];
    try {
      const { updated, deleted } = await api('/api/admin/products/bulk', { method: 'POST', json: { ids, action, value } });
      const gone = new Set(deleted);
      const byId = new Map(updated.map((p) => [p.id, p]));
      state.products = state.products.filter((p) => !gone.has(p.id)).map((p) => byId.get(p.id) || p);
      state.selected.clear();
      render();
      toast(message(updated.length + deleted.length));
    } catch (ex) {
      fail(ex);
    }
  }

  async function bulkAction(action) {
    const n = state.selected.size;
    if (!n) return;
    if (action === 'outOfStock') return runBulk(action, null, (c) => `${plural(c, 'product')} marked out of stock`);
    if (action === 'archive') return runBulk(action, null, (c) => `${plural(c, 'product')} archived`);
    if (action === 'unarchive') return runBulk(action, null, (c) => `${plural(c, 'product')} back in the shop`);
    if (action === 'delete') {
      const ok = await confirmDialog(`Delete ${plural(n, 'product')}?`, 'They and their uploaded images will be removed permanently.');
      if (ok) runBulk(action, null, (c) => `${plural(c, 'product')} deleted`);
      return;
    }
    if (action === 'pricePercent') {
      const input = el('input', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: '-10', 'aria-label': 'Percent change', required: true });
      const hint = el('p', { class: 'muted small', text: 'Use a negative number for a discount. Prices round to whole rupees.' });
      const sample = state.products.find((p) => state.selected.has(p.id));
      input.addEventListener('input', () => {
        const pct = Number(input.value);
        hint.textContent = sample && input.value !== '' && Number.isFinite(pct)
          ? `${sample.name}: ${inr(sample.price)} → ${inr(Math.max(0, Math.round(sample.price * (1 + pct / 100))))}`
          : 'Use a negative number for a discount. Prices round to whole rupees.';
      });
      const ok = await dialog({
        title: `Change price of ${plural(n, 'product')}`,
        body: [el('label', { class: 'field' }, [el('span', { text: 'Change by %' }), input]), hint],
        actions: [{ label: 'Cancel', value: false }, { label: 'Apply', value: true, kind: 'primary' }],
      });
      const pct = Number(input.value);
      if (ok && input.value !== '' && Number.isFinite(pct) && pct !== 0) {
        runBulk(action, pct, (c) => `Price ${pct > 0 ? 'raised' : 'cut'} ${Math.abs(pct)}% on ${plural(c, 'product')}`);
      }
    }
  }

  $$('[data-bulk]').forEach((b) => b.addEventListener('click', () => bulkAction(b.dataset.bulk)));
  els.bulkCategory.addEventListener('change', () => {
    const slug = els.bulkCategory.value;
    els.bulkCategory.value = '';
    if (slug) runBulk('category', slug, (c) => `${plural(c, 'product')} moved to ${catName(slug)}`);
  });
  $('#bulk-clear').addEventListener('click', () => { state.selected.clear(); render(); });

  // ---------- dead stock ----------
  async function openCleanup() {
    const candidates = state.products.filter((p) => isDead(p) || isStaleOut(p)).sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
    if (!candidates.length) {
      toast('No dead stock. Everything has moved in the last 60 days.');
      return;
    }
    const checks = new Map();
    const rows = candidates.map((p) => {
      const c = el('input', { type: 'checkbox', 'aria-label': `Include ${p.name}` });
      c.checked = true;
      checks.set(p.id, c);
      const img = el('img', { alt: '', loading: 'lazy' });
      if (p.thumbs[0] || p.images[0]) img.src = p.thumbs[0] || p.images[0];
      const why = isDead(p)
        ? `${plural(units(p), 'unit')} untouched for ${daysSince(p.updatedAt)} days`
        : `Sold out for ${daysSince(p.updatedAt)} days`;
      return el('label', { class: 'cleanup-row' }, [el('span', { class: 'check' }, [c, el('span')]), img, el('span', { class: 'meta' }, [el('b', { text: p.name }), el('span', { text: why })])]);
    });
    const choice = await dialog({
      title: 'Clear dead stock',
      text: `Items in stock but not updated for ${DEAD_DAYS}+ days, and items sold out for ${STALE_OUT_DAYS}+ days.`,
      body: rows,
      actions: [{ label: 'Cancel', value: null }, { label: 'Delete', value: 'delete', kind: 'danger' }, { label: 'Archive', value: 'archive', kind: 'primary' }],
    });
    const ids = [...checks].filter(([, c]) => c.checked).map(([id]) => id);
    if (!choice || !ids.length) return;
    if (choice === 'delete' && !(await confirmDialog(`Delete ${plural(ids.length, 'product')}?`, 'This cannot be undone. Archiving keeps them out of the shop without losing anything.'))) return;
    state.selected = new Set(ids);
    runBulk(choice, null, (c) => `${plural(c, 'product')} ${choice === 'delete' ? 'deleted' : 'archived'}`);
  }

  // ---------- CSV ----------
  $('#export').addEventListener('click', () => {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [['id', 'name', 'category', 'size', 'qty', 'price', 'mrp', 'stock_value', 'low_stock_at', 'status', 'archived', 'updated_at']];
    for (const p of [...state.products].sort(SORTS.name)) {
      for (const [size, qty] of Object.entries(p.stockBySize)) {
        rows.push([p.id, p.name, catName(p.category), size === 'ONE' ? '' : size, qty, p.price, p.mrp ?? '', qty * p.price, p.lowStockAt, stockStatus(p), p.archived, p.updatedAt]);
      }
    }
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `at-inventory-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported ${plural(state.products.length, 'product')}`);
  });

  // ---------- toolbar ----------
  els.search.addEventListener('input', () => { state.search = els.search.value; renderList(); });
  els.category.addEventListener('change', () => { state.category = els.category.value; render(); });
  els.sort.addEventListener('change', () => { state.sort = els.sort.value; renderList(); });

  function renderCategoryOptions() {
    const opts = (first) => [
      ...(first ? [el('option', { value: '', text: first })] : []),
      ...state.categories.map((c) => el('option', { value: c.slug, text: c.visible ? c.name : `${c.name} (hidden)` })),
    ];
    els.category.replaceChildren(...opts('All categories'));
    els.category.value = state.categories.some((c) => c.slug === state.category) ? state.category : '';
    state.category = els.category.value;
    els.bulkCategory.replaceChildren(...opts('Category…'));
    const formSelect = els.form.category;
    const current = formSelect.value;
    formSelect.replaceChildren(...opts(null));
    if (current) formSelect.value = current;
  }

  // ---------- chips ----------
  function makeChips(container, list, onChange = () => {}) {
    const input = $('.chip-input', container);
    const draw = () => {
      $$('.chip', container).forEach((c) => c.remove());
      list.forEach((value, i) => {
        container.insertBefore(el('span', { class: 'chip' }, [
          document.createTextNode(value),
          el('button', { type: 'button', 'aria-label': `Remove ${value}`, onclick: (e) => { e.stopPropagation(); list.splice(i, 1); draw(); onChange(); } }, [icon('x')]),
        ]), input);
      });
    };
    const add = (raw) => {
      let changed = false;
      raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((v) => {
        if (!list.some((x) => x.toLowerCase() === v.toLowerCase())) { list.push(v); changed = true; }
      });
      input.value = '';
      draw();
      if (changed) onChange();
    };
    const set = (values) => { list.splice(0, list.length, ...values); draw(); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); }
      else if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); draw(); onChange(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) add(input.value); });
    input.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (text.includes(',')) { e.preventDefault(); add(text); }
    });
    container.addEventListener('click', (e) => { if (e.target === container) input.focus(); });
    draw();
    return { draw, add, set, flush: () => { if (input.value.trim()) add(input.value); } };
  }

  const sizeChips = makeChips($('#sizes-chips'), formSizes, () => { drawStockGrid(); drawQuickSizes(); });
  const colorChips = makeChips($('#colors-chips'), formColors);

  function drawQuickSizes() {
    const c = state.categories.find((x) => x.slug === els.form.category.value);
    const missing = (c ? c.sizes : []).filter((s) => !formSizes.some((x) => x.toLowerCase() === s.toLowerCase()));
    $('#sizes-quick').replaceChildren(...missing.map((s) => el('button', { type: 'button', text: `+ ${s}`, onclick: () => sizeChips.add(s) })));
  }

  function drawStockGrid() {
    const keys = formSizes.length ? formSizes : ['ONE'];
    els.stockGrid.replaceChildren(...keys.map((key) => {
      const input = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: String(state.stock[key] ?? 0), 'aria-label': `${sizeLabel(key)} quantity` });
      input.addEventListener('input', () => { state.stock[key] = Math.max(0, Math.floor(Number(input.value) || 0)); });
      input.addEventListener('focus', () => input.select());
      return el('label', { class: 'stock-cell' }, [el('span', { text: key === 'ONE' ? 'Quantity' : key }), input]);
    }));
  }

  // ---------- images ----------
  function loadBitmap(blob) {
    return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(blob));
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality));
  }

  async function encode(source, maxSide, quality) {
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const webp = await canvasBlob(canvas, 'image/webp', quality);
    return webp.type === 'image/webp' ? webp : canvasBlob(canvas, 'image/jpeg', quality);
  }

  async function processImage(file) {
    const bitmap = await loadBitmap(file);
    try {
      const encoded = await encode(bitmap, FULL_MAX_SIDE, 0.92);
      const keepOriginal = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
        && file.size <= KEEP_ORIGINAL_BYTES && file.size <= encoded.size
        && Math.max(bitmap.width, bitmap.height) <= FULL_MAX_SIDE;
      return { full: keepOriginal ? file : encoded, thumb: await encode(bitmap, THUMB_MAX_SIDE, 0.85) };
    } finally {
      bitmap.close();
    }
  }

  const AT_PATH = new Path2D('M2 92 L32 6 L52 6 L82 92 L62 92 L42 34.7 L22 92 Z M52 6 H128 V26 H52 Z M92 26 H112 V92 H92 Z');

  async function loadCover(img) {
    if (img.kind === 'file') return loadBitmap(img.processed.full);
    const res = await fetch(img.url, { mode: 'cors' });
    if (!res.ok) throw new Error('Cover image could not be loaded');
    return loadBitmap(await res.blob());
  }

  async function makeOgImage(cover) {
    const source = await loadCover(cover);
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F4F1EA';
    ctx.fillRect(0, 0, 1200, 630);
    const scale = Math.min(1040 / source.width, 560 / source.height);
    const w = source.width * scale;
    const h = source.height * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, (1200 - w) / 2, (630 - h) / 2, w, h);
    source.close();
    ctx.save();
    ctx.translate(1092, 572);
    ctx.scale(0.62, 0.62);
    ctx.fillStyle = '#111111';
    ctx.fill(AT_PATH);
    ctx.fillStyle = '#D9FF3F';
    ctx.fillRect(116, 78, 14, 14);
    ctx.restore();
    let quality = 0.82;
    let blob = await canvasBlob(canvas, 'image/jpeg', quality);
    while (blob.size > OG_MAX_BYTES && quality > 0.5) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, 'image/jpeg', quality);
    }
    return blob;
  }

  function drawImages() {
    els.thumbs.replaceChildren();
    els.imageCount.textContent = state.images.length ? `${state.images.length}/${MAX_IMAGES}` : '';
    state.images.forEach((img, i) => {
      const move = (dir) => {
        const j = i + dir;
        if (j < 0 || j >= state.images.length) return;
        [state.images[i], state.images[j]] = [state.images[j], state.images[i]];
        drawImages();
      };
      els.thumbs.append(el('li', { class: 'tile' }, [
        el('img', { src: img.preview, alt: `Image ${i + 1}` }),
        i === 0 ? el('span', { class: 'cover', text: 'Cover' }) : null,
        img.kind === 'file' ? el('span', { class: 'badge-new', text: 'New' }) : null,
        el('div', { class: 'tile-actions' }, [
          el('button', { type: 'button', 'aria-label': 'Move earlier', disabled: i === 0, onclick: () => move(-1) }, [icon('left')]),
          el('button', { type: 'button', 'aria-label': 'Remove image', onclick: () => {
            if (img.kind === 'file') URL.revokeObjectURL(img.preview);
            state.images.splice(i, 1);
            drawImages();
          } }, [icon('x')]),
          el('button', { type: 'button', 'aria-label': 'Move later', disabled: i === state.images.length - 1, onclick: () => move(1) }, [icon('right')]),
        ]),
      ]));
    });
  }

  function addFiles(fileList) {
    for (const file of fileList) {
      if (state.images.length >= MAX_IMAGES) { toast(`Up to ${MAX_IMAGES} images per product`, 'error'); break; }
      if (!file.type.startsWith('image/')) { toast(`${file.name} is not an image`, 'error'); continue; }
      if (file.size > MAX_INPUT_BYTES) { toast(`${file.name} is over 30MB`, 'error'); continue; }
      const img = { kind: 'file', file, preview: URL.createObjectURL(file) };
      img.ready = processImage(file).then((p) => { img.processed = p; });
      img.ready.catch(() => {});
      state.images.push(img);
    }
    drawImages();
  }

  els.dropzone.addEventListener('click', () => els.fileInput.click());
  els.dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); } });
  els.fileInput.addEventListener('change', () => { addFiles(els.fileInput.files); els.fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => els.dropzone.addEventListener(t, (e) => { e.preventDefault(); els.dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((t) => els.dropzone.addEventListener(t, (e) => { e.preventDefault(); els.dropzone.classList.remove('drag'); }));
  els.dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  // ---------- drawer ----------
  function revokeAll() {
    state.images.forEach((img) => img.kind === 'file' && URL.revokeObjectURL(img.preview));
  }

  let lastCategoryDefaults = [];
  els.form.category.addEventListener('change', () => {
    drawQuickSizes();
    if (state.editing) return;
    const c = state.categories.find((x) => x.slug === els.form.category.value);
    const untouched = formSizes.length === lastCategoryDefaults.length && formSizes.every((s, i) => s === lastCategoryDefaults[i]);
    if (c && untouched) {
      lastCategoryDefaults = [...c.sizes];
      sizeChips.set(c.sizes);
      drawStockGrid();
      drawQuickSizes();
    }
  });

  function openDrawer(product) {
    closeMenu();
    if (product && pendingStock.has(product.id)) flushStock(product.id);
    state.editing = product || null;
    revokeAll();
    const f = els.form;
    f.reset();
    els.formError.hidden = true;
    $$('.invalid', f).forEach((n) => n.classList.remove('invalid'));
    $$('.field-error', f).forEach((n) => n.remove());
    $('#drawer-title').textContent = product ? 'Edit product' : 'Add product';
    $('#save').textContent = product ? 'Save changes' : 'Save product';

    const defaultCat = state.categories.find((c) => c.slug === state.category) || state.categories.find((c) => c.visible) || state.categories[0];
    lastCategoryDefaults = product ? [] : [...(defaultCat ? defaultCat.sizes : [])];
    sizeChips.set(product ? product.sizes : lastCategoryDefaults);
    colorChips.set(product ? product.colors : []);
    state.stock = product ? { ...product.stockBySize } : {};
    state.images = product ? product.images.map((src, i) => ({ kind: 'saved', url: src, thumb: product.thumbs[i] || src, preview: product.thumbs[i] || src })) : [];

    if (product) {
      f.name.value = product.name;
      f.category.value = product.category;
      f.badge.value = product.badge || '';
      f.price.value = product.price;
      f.mrp.value = product.mrp || '';
      f.description.value = product.description || '';
      f.lowStockAt.value = product.lowStockAt;
      f.featured.checked = !!product.featured;
      f.archived.checked = !!product.archived;
    } else if (defaultCat) {
      f.category.value = defaultCat.slug;
    }
    drawStockGrid();
    drawQuickSizes();
    drawImages();
    liveConfirmed = false;
    $('#live-warning').hidden = true;

    els.scrim.hidden = false;
    document.body.classList.add('locked');
    requestAnimationFrame(() => {
      els.scrim.classList.add('show');
      els.drawer.classList.add('open');
      els.drawer.setAttribute('aria-hidden', 'false');
      if (window.innerWidth > 860) f.name.focus({ preventScroll: true });
    });
  }

  function closeDrawer(immediate) {
    if (!els.drawer.classList.contains('open')) return;
    els.drawer.classList.remove('open');
    els.drawer.setAttribute('aria-hidden', 'true');
    els.scrim.classList.remove('show');
    document.body.classList.remove('locked');
    revokeAll();
    state.images = [];
    setTimeout(() => { els.scrim.hidden = true; }, immediate ? 0 : 300);
  }

  $('#add-product').addEventListener('click', () => openDrawer(null));
  $$('[data-close]', els.drawer).forEach((b) => b.addEventListener('click', () => closeDrawer()));
  els.scrim.addEventListener('click', () => closeDrawer());

  function formError(message) {
    els.formError.textContent = message;
    els.formError.hidden = false;
  }

  function fieldError(message, field) {
    field.closest('.field').append(el('p', { class: 'field-error', role: 'alert', text: message }));
    field.classList.add('invalid');
    field.focus();
  }

  let liveConfirmed = false;
  const confirmLive = (hidden) => {
    if (hidden) els.form.archived.checked = true;
    liveConfirmed = true;
    els.form.requestSubmit();
  };
  $('#save-hidden').addEventListener('click', () => confirmLive(true));
  $('#save-anyway').addEventListener('click', () => confirmLive(false));

  async function uploadImages(setStatus) {
    const fresh = state.images.filter((i) => i.kind === 'file' && !i.uploaded);
    const editing = state.editing;
    const cover = state.images[0];
    const coverKey = cover ? cover.url || cover.preview : null;
    const needOg = !!cover && (!editing || !editing.ogImage || coverKey !== editing.images[0] || cover.kind === 'file');

    if (fresh.length) setStatus('Optimising images…');
    for (const img of fresh) {
      try {
        await img.ready;
      } catch {
        throw new Error(`Could not read ${img.file.name}. Try a JPEG or PNG.`);
      }
    }

    let og = null;
    if (needOg) {
      try { og = await makeOgImage(cover); } catch { og = null; }
    }

    const blobs = fresh.flatMap((i) => [i.processed.full, i.processed.thumb]);
    if (og) blobs.push(og);
    let ogUrl = null;
    if (blobs.length) {
      const { uploads } = await api('/api/uploads/sign', {
        method: 'POST',
        json: { files: blobs.map((b, i) => ({ name: `image-${i}`, type: b.type, size: b.size })) },
      });
      let done = 0;
      setStatus(`Uploading 0/${blobs.length}…`);
      await Promise.all(uploads.map(async (u, i) => {
        const res = await fetch(u.uploadUrl, { method: u.method || 'PUT', headers: u.headers, body: blobs[i] });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        setStatus(`Uploading ${++done}/${blobs.length}…`);
      }));
      fresh.forEach((img, k) => { img.uploaded = { url: uploads[2 * k].url, thumb: uploads[2 * k + 1].url }; });
      if (og) ogUrl = uploads[uploads.length - 1].url;
    }

    const result = {
      images: state.images.map((i) => (i.kind === 'file' ? i.uploaded.url : i.url)),
      thumbs: state.images.map((i) => (i.kind === 'file' ? i.uploaded.thumb : i.thumb)),
    };
    if (!cover) result.ogImage = null;
    else if (needOg) result.ogImage = ogUrl;
    return result;
  }

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.saving) return;
    const f = els.form;
    $$('.invalid', f).forEach((n) => n.classList.remove('invalid'));
    $$('.field-error', f).forEach((n) => n.remove());
    els.formError.hidden = true;
    sizeChips.flush();
    colorChips.flush();

    const name = f.name.value.trim();
    if (!name) return fieldError('Give the product a name.', f.name);
    if (!f.category.value) return fieldError('Add a category first (Categories tab).', f.category);
    const price = f.price.value;
    if (price === '' || Number(price) < 0) return fieldError('Enter a valid price.', f.price);
    const mrp = f.mrp.value;
    if (mrp !== '' && Number(mrp) < Number(price)) return fieldError('MRP should be at least the selling price.', f.mrp);

    const keys = formSizes.length ? formSizes : ['ONE'];
    const body = {
      name,
      category: f.category.value,
      badge: f.badge.value,
      price: Number(price),
      mrp: mrp === '' ? null : Number(mrp),
      description: f.description.value.trim(),
      sizes: [...formSizes],
      colors: [...formColors],
      stockBySize: Object.fromEntries(keys.map((k) => [k, state.stock[k] || 0])),
      lowStockAt: Math.max(0, Math.floor(Number(f.lowStockAt.value) || 0)),
      featured: f.featured.checked,
      archived: f.archived.checked,
    };

    const warning = $('#live-warning');
    const noStock = Object.values(body.stockBySize).every((n) => n === 0);
    if (!state.editing && !body.archived && !liveConfirmed && (!state.images.length || noStock)) {
      const what = !state.images.length && noStock ? 'no photo and no stock' : !state.images.length ? 'no photo' : 'no stock';
      $('#live-warning-text').textContent = `This product has ${what}. It will go live in the shop like this.`;
      warning.hidden = false;
      warning.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    liveConfirmed = false;
    warning.hidden = true;

    state.saving = true;
    const save = $('#save');
    save.disabled = true;
    const setStatus = (t) => { save.textContent = t; };
    setStatus('Saving…');
    try {
      Object.assign(body, await uploadImages(setStatus));
      setStatus('Saving…');
      const editing = state.editing;
      const saved = await api(editing ? `/api/products/${editing.id}` : '/api/products', { method: editing ? 'PUT' : 'POST', json: body });
      if (editing) replaceProduct(saved);
      else state.products.unshift(saved);
      closeDrawer();
      render();
      toast(editing ? 'Changes saved' : `${saved.name} added`);
    } catch (ex) {
      if (!(ex instanceof AuthError)) formError(ex.message);
    } finally {
      state.saving = false;
      save.disabled = false;
      save.textContent = state.editing ? 'Save changes' : 'Save product';
    }
  });

  // ---------- categories ----------
  const addSizes = [];
  const addSizeChips = makeChips($('#cat-add-sizes'), addSizes);

  els.catAdd.addEventListener('submit', async (e) => {
    e.preventDefault();
    addSizeChips.flush();
    const input = $('#cat-add-name');
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    try {
      const created = await api('/api/admin/categories', { method: 'POST', json: { name, sizes: addSizes } });
      state.categories.push(created);
      input.value = '';
      addSizeChips.set([]);
      afterCategoryChange();
      toast(`${created.name} added`);
    } catch (ex) {
      fail(ex);
    }
  });

  function afterCategoryChange() {
    state.categories.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    renderCategoryOptions();
    renderCategories();
    render();
  }

  async function updateCategory(c, patch, message) {
    try {
      const updated = await api(`/api/admin/categories/${encodeURIComponent(c.slug)}`, { method: 'PUT', json: patch });
      state.categories = state.categories.map((x) => (x.slug === c.slug ? updated : x));
      afterCategoryChange();
      if (message) toast(message);
    } catch (ex) {
      fail(ex);
      renderCategories();
    }
  }

  async function persistOrder(order) {
    const changed = order.map((c, i) => ({ c, i })).filter(({ c, i }) => c.sort !== i);
    order.forEach((c, i) => { c.sort = i; });
    state.categories = order;
    afterCategoryChange();
    try {
      await Promise.all(changed.map(({ c, i }) => api(`/api/admin/categories/${encodeURIComponent(c.slug)}`, { method: 'PUT', json: { sort: i } })));
      toast('Order saved');
    } catch (ex) {
      fail(ex);
      loadCategories();
    }
  }

  function moveCategory(index, dir) {
    const order = [...state.categories];
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    persistOrder(order);
  }

  async function deleteCategory(c) {
    const using = state.products.filter((p) => p.category === c.slug).length;
    let moveTo = null;
    if (using) {
      const others = state.categories.filter((x) => x.slug !== c.slug);
      if (!others.length) { toast('Add another category to move these products into first.', 'error'); return; }
      const select = el('select', { 'aria-label': 'Move products to' }, others.map((x) => el('option', { value: x.slug, text: x.name })));
      const ok = await dialog({
        title: `Delete ${c.name}?`,
        text: `${plural(using, 'product')} ${using === 1 ? 'uses' : 'use'} this category. Move ${using === 1 ? 'it' : 'them'} to:`,
        body: [select],
        actions: [{ label: 'Cancel', value: false }, { label: 'Move and delete', value: true, kind: 'danger' }],
      });
      if (!ok) return;
      moveTo = select.value;
    } else if (!(await confirmDialog(`Delete ${c.name}?`, 'No products use it. It will disappear from the shop.'))) {
      return;
    }
    try {
      await api(`/api/admin/categories/${encodeURIComponent(c.slug)}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`, { method: 'DELETE' });
      state.categories = state.categories.filter((x) => x.slug !== c.slug);
      if (state.category === c.slug) state.category = '';
      afterCategoryChange();
      if (moveTo) await loadProducts();
      toast(moveTo ? `${c.name} deleted, products moved to ${catName(moveTo)}` : `${c.name} deleted`);
    } catch (ex) {
      fail(ex);
    }
  }

  function renderCategories() {
    const list = state.categories;
    els.catList.replaceChildren(...list.map((c, i) => {
      const count = state.products.filter((p) => p.category === c.slug).length;
      const nameInput = el('input', { value: c.name, maxlength: '60', 'aria-label': `Name of ${c.name}` });
      const commitName = () => {
        const v = nameInput.value.trim();
        if (!v) { nameInput.value = c.name; return; }
        if (v !== c.name) updateCategory(c, { name: v }, `Renamed to ${v}`);
      };
      nameInput.addEventListener('change', commitName);
      nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); } });

      const sizes = [...c.sizes];
      const chips = el('div', { class: 'chips' }, [el('input', { class: 'chip-input', placeholder: sizes.length ? 'Add size' : 'No sizes (one size)', 'aria-label': `Default sizes for ${c.name}` })]);
      makeChips(chips, sizes, () => updateCategory(c, { sizes: [...sizes] }, `${c.name} default sizes saved`));

      const row = el('li', { class: `cat${c.visible ? '' : ' is-hidden'}`, 'data-slug': c.slug }, [
        el('div', { class: 'order' }, [
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move ${c.name} up`, disabled: i === 0, onclick: () => moveCategory(i, -1) }, [icon('up')]),
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move ${c.name} down`, disabled: i === list.length - 1, onclick: () => moveCategory(i, 1) }, [icon('down')]),
        ]),
        el('div', { class: 'cat-name' }, [nameInput]),
        chips,
        el('span', { class: 'cat-count', text: plural(count, 'product') }),
        el('div', { class: 'cat-actions' }, [
          el('button', {
            type: 'button', class: 'icon-btn', title: c.visible ? 'Hide from shop' : 'Show in shop',
            'aria-label': `${c.visible ? 'Hide' : 'Show'} ${c.name}`, 'aria-pressed': String(!c.visible),
            onclick: () => updateCategory(c, { visible: !c.visible }, c.visible ? `${c.name} hidden from the shop` : `${c.name} visible in the shop`),
          }, [icon(c.visible ? 'eye' : 'eye-off')]),
          el('button', { type: 'button', class: 'icon-btn danger', 'aria-label': `Delete ${c.name}`, title: 'Delete', onclick: () => deleteCategory(c) }, [icon('trash')]),
        ]),
      ]);

      return row;
    }));
  }

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.dialog.hidden) { e.preventDefault(); dialogClose && dialogClose(); return; }
      if (!els.menu.hidden) { closeMenu(); return; }
      if (els.drawer.classList.contains('open')) { closeDrawer(); return; }
      if (state.selected.size && state.view === 'inventory') { state.selected.clear(); render(); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || els.app.hidden) return;
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (!els.dialog.hidden || els.drawer.classList.contains('open')) return;
    if (e.key === '/') {
      e.preventDefault();
      setView('inventory');
      els.search.focus();
      els.search.select();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      setView('inventory');
      openDrawer(null);
    }
  });

  if (state.token) showApp();
  else showLogin();
})();
