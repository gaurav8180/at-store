import { $, $$ } from './dom.js';
import { fetchCategories, fetchConfig, fetchProduct, fetchProducts } from './api.js';
import { cart, saved } from './store.js';
import { configure, contactLink, displayNumber } from './whatsapp.js';
import { getCategories, setCategoryList } from './format.js';
import { motion } from './motion.js';
import { createCatalogue } from './catalogue.js';
import { heroLoading, renderHero } from './hero.js';
import { needsOptions, syncHearts } from './card.js';
import { createSheet } from './sheet.js';
import { cartTarget, createDrawer, syncCartBadges } from './cart.js';
import { categoryFromPath, categoryPath, migrateHash, productIdFromPath, pushProduct, restoreBase, setBase } from './router.js';
import { toast } from './toast.js';

const byId = new Map();
const getProduct = (id) => byId.get(id);
const baseTitle = location.pathname === '/' ? document.title : 'AT';
let pending = { origin: null, opts: {} };
let previousCount = cart.count();

const headerHeight = () => $('.site-header').offsetHeight;

function buildMarquee() {
  const names = getCategories().map((c) => c.name);
  const labels = names.length ? names : ['New drop'];
  const group = () => {
    const el = Object.assign(document.createElement('div'), { className: 'marquee__group' });
    const reps = Math.max(2, Math.ceil(8 / labels.length));
    for (let n = 0; n < reps; n += 1) {
      labels.forEach((label) => {
        el.append(
          Object.assign(document.createElement('span'), { className: 'marquee__item', textContent: label }),
          Object.assign(document.createElement('span'), { className: 'marquee__dot' }),
        );
      });
    }
    return el;
  };
  const track = Object.assign(document.createElement('div'), { className: 'marquee__track' });
  track.append(group(), group());
  $('#marquee').replaceChildren(track);
}

function openProduct(product, originEl, opts = {}) {
  pending = { origin: originEl, opts };
  pushProduct(product.id);
  route();
}

function closeProduct() {
  if (history.state?.sheet) history.back();
  else {
    restoreBase();
    route();
  }
}

async function route() {
  const id = productIdFromPath();
  if (!id) {
    sheet.hide();
    document.title = baseTitle;
    return;
  }
  if (sheet.id === id) return;
  let product = byId.get(id);
  if (!product) product = await fetchProduct(id).catch(() => null);
  if (!product) {
    toast('That piece is no longer available.');
    restoreBase();
    return;
  }
  document.title = `${product.name} — AT`;
  sheet.show(product, pending.origin, pending.opts);
  pending = { origin: null, opts: {} };
}

function quickAdd(product, imgEl) {
  if (needsOptions(product)) {
    openProduct(product, imgEl, { focus: 'size' });
    return;
  }
  cart.add({ id: product.id, size: product.sizes[0] || '', color: product.colors[0] || '', qty: 1 });
  motion.fly(imgEl.currentSrc || imgEl.src, imgEl.getBoundingClientRect(), cartTarget());
  toast(`${product.name} added`, { action: { label: 'View cart', run: () => drawer.open() } });
}

const drawer = createDrawer($('#drawer'), { getProduct, onBrowse: () => scrollToSection('#shop') });
const sheet = createSheet($('#sheet'), { requestClose: closeProduct, openCart: () => drawer.open() });
const catalogue = createCatalogue({
  onOpen: (product, el) => openProduct(product, el),
  onQuickAdd: quickAdd,
  onCategory: (slug) => {
    const path = categoryPath(slug);
    setBase(path);
    if (!sheet.id) history.replaceState(null, '', path);
  },
});

function scrollToSection(hash) {
  if (hash === '#top') {
    motion.scrollToY(0);
    return;
  }
  if (hash === '#shop') {
    const bottom = $('#shop .section-head').getBoundingClientRect().bottom;
    motion.scrollToY(scrollY + bottom - headerHeight());
    return;
  }
  const target = $(hash);
  if (target) motion.scrollToY(scrollY + target.getBoundingClientRect().top - headerHeight());
}

function wireStatic() {
  $('#cart-open').addEventListener('click', () => drawer.open());
  document.addEventListener('click', (e) => {
    const catLink = e.target.closest?.('a[data-cat-link]');
    if (catLink) {
      e.preventDefault();
      catalogue.filterTo(catLink.dataset.catLink);
      scrollToSection('#shop');
      return;
    }
    const link = e.target.closest?.('a[href^="#"]');
    if (!link || link.getAttribute('href') === '#') return;
    e.preventDefault();
    scrollToSection(link.getAttribute('href'));
  });
  window.addEventListener('popstate', route);
  cart.subscribe(() => {
    syncCartBadges();
    const n = cart.count();
    if (n > previousCount) $$('[data-cart-count]').forEach((el) => motion.bump(el));
    previousCount = n;
  });
  saved.subscribe(syncHearts);
}

function paintCategoryLinks() {
  const cats = getCategories();
  $('#hero-cats').textContent = cats.map((c) => c.name).join(' / ');
  $('#footer-cats').replaceChildren(...cats.flatMap((c, i) => {
    const a = Object.assign(document.createElement('a'), { href: `/c/${encodeURIComponent(c.slug)}`, textContent: c.name });
    a.dataset.catLink = c.slug;
    return i ? [document.createElement('br'), a] : [a];
  }));
}

function applyConfig() {
  $$('[data-wa]').forEach((a) => { a.href = contactLink(); });
  $$('[data-wa-number]').forEach((el) => { el.textContent = displayNumber(); });
}

async function loadProducts() {
  catalogue.showLoading();
  try {
    const products = await fetchProducts();
    setCategoryList(await fetchCategories(products));
    byId.clear();
    products.forEach((p) => byId.set(p.id, p));
    catalogue.setCategories();
    catalogue.setProducts(products);
    paintCategoryLinks();
    buildMarquee();
    renderHero(products, { onOpen: (product, el) => openProduct(product, el) });
    drawer.render();
  } catch {
    renderHero([], { onOpen: openProduct });
    catalogue.showError(loadProducts);
  }
}

async function boot() {
  migrateHash();
  motion.init();
  heroLoading();
  syncCartBadges();
  wireStatic();

  const fonts = Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 800))]);
  fetchConfig().then((config) => { configure(config); applyConfig(); });
  const loaded = loadProducts().then(() => fonts);
  await motion.intro(loaded);
  motion.heroIntro();
  const startCategory = categoryFromPath();
  if (startCategory) {
    setBase(categoryPath(startCategory));
    catalogue.filterTo(startCategory, { silent: true });
    setTimeout(() => scrollToSection('#shop'), 200);
  }
  motion.reveal();
  motion.refresh();
  route();
}

boot();
