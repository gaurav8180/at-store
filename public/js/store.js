const CART_KEY = 'ss_cart';
const SAVED_KEY = 'ss_saved';
const MAX_QTY = 99;

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: state stays in memory */
  }
}

export const lineKey = (l) => `${l.id}|${l.size || ''}|${l.color || ''}`;

const cleanLines = (rows) =>
  rows
    .filter((l) => l && typeof l.id === 'string' && Number(l.qty) >= 1)
    .map((l) => ({
      id: l.id,
      size: l.size || '',
      color: l.color || '',
      qty: Math.min(MAX_QTY, Math.floor(Number(l.qty))),
    }));

let lines = cleanLines(read(CART_KEY));
let savedIds = read(SAVED_KEY).filter((id) => typeof id === 'string');
const cartListeners = new Set();
const savedListeners = new Set();

const notify = (set, value) => set.forEach((fn) => fn(value));

function commitCart() {
  write(CART_KEY, lines);
  notify(cartListeners, lines);
}

export const cart = {
  get lines() {
    return lines;
  },
  count: () => lines.reduce((n, l) => n + l.qty, 0),
  add({ id, size = '', color = '', qty = 1 }) {
    const key = lineKey({ id, size, color });
    const existing = lines.find((l) => lineKey(l) === key);
    if (existing) existing.qty = Math.min(MAX_QTY, existing.qty + qty);
    else lines.push({ id, size, color, qty: Math.min(MAX_QTY, qty) });
    commitCart();
  },
  setQty(key, qty) {
    if (qty < 1) return this.remove(key);
    const line = lines.find((l) => lineKey(l) === key);
    if (!line) return;
    line.qty = Math.min(MAX_QTY, qty);
    commitCart();
  },
  remove(key) {
    lines = lines.filter((l) => lineKey(l) !== key);
    commitCart();
  },
  subscribe(fn) {
    cartListeners.add(fn);
    return () => cartListeners.delete(fn);
  },
};

export const saved = {
  has: (id) => savedIds.includes(id),
  count: () => savedIds.length,
  toggle(id) {
    savedIds = savedIds.includes(id) ? savedIds.filter((x) => x !== id) : [...savedIds, id];
    write(SAVED_KEY, savedIds);
    notify(savedListeners, savedIds);
  },
  subscribe(fn) {
    savedListeners.add(fn);
    return () => savedListeners.delete(fn);
  },
};

window.addEventListener('storage', (e) => {
  if (e.key === CART_KEY) {
    lines = cleanLines(read(CART_KEY));
    notify(cartListeners, lines);
  } else if (e.key === SAVED_KEY) {
    savedIds = read(SAVED_KEY).filter((id) => typeof id === 'string');
    notify(savedListeners, savedIds);
  }
});
