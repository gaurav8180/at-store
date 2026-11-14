const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {}

const express = require('express');
const { createSigner } = require('./lib/token');
const createStore = require('./lib/store');
const {
  BULK_ACTIONS,
  HttpError,
  buildCategory,
  buildProduct,
  bySort,
  newestFirst,
  normalize,
  normalizeCategory,
} = require('./lib/catalog');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'atadmin';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '918421524576';
const BRAND = process.env.BRAND || 'AT';
const TOKEN_TTL = 7 * 24 * 60 * 60;
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
const OG_FALLBACK = '/assets/brand/og-image.png';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_UPLOADS_PER_REQUEST = 13;

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

const signer = createSigner(process.env.TOKEN_SECRET || ADMIN_PASSWORD);
const store = createStore({
  root: __dirname,
  signer,
  extFor: (type) => MIME_EXT[type],
  maxBytes: MAX_UPLOAD_BYTES,
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function allProducts() {
  return (await store.all()).map(normalize).sort(newestFirst);
}

async function allCategories() {
  return (await store.categories()).map(normalizeCategory).sort(bySort);
}

const slugsOf = async () => (await allCategories()).map((c) => c.slug);

const urlsOf = (products) => products.flatMap((p) => [...p.images, ...p.thumbs, p.ogImage].filter(Boolean));

async function releaseImages(before, remaining) {
  const inUse = new Set(urlsOf(remaining));
  const orphans = [...new Set(urlsOf(before))].filter((u) => !inUse.has(u) && store.ownsUrl(u));
  if (!orphans.length) return;
  try {
    await store.deleteObjects(orphans);
  } catch (e) {
    console.error('Failed to delete images', e);
  }
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

let indexHtml = null;
function readIndex() {
  if (!indexHtml) indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  return indexHtml;
}

function siteOrigin(req) {
  if (SITE_URL) return SITE_URL;
  const proto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  return `${proto}://${req.get('x-forwarded-host') || req.get('host')}`;
}

const absolute = (origin, url) => (/^https?:\/\//i.test(url) ? url : `${origin}${url.startsWith('/') ? '' : '/'}${url}`);

const META_RE = /\s*<title>[\s\S]*?<\/title>|\s*<meta\s+(?:name|property)="(?:description|og:[^"]*|twitter:[^"]*|product:[^"]*)"[^>]*>/gi;

function renderWithMeta(meta) {
  const tags = [`<title>${escapeHtml(meta.title)}</title>`];
  for (const [attr, key, value] of meta.tags) {
    tags.push(`<meta ${attr}="${key}" content="${escapeHtml(value)}">`);
  }
  return readIndex().replace(META_RE, '').replace(/<\/head>/i, `  ${tags.join('\n  ')}\n</head>`);
}

function shareMeta({ title, description, image, url, type, price }) {
  const tags = [
    ['name', 'description', description],
    ['property', 'og:site_name', BRAND],
    ['property', 'og:type', type],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', url],
    ['property', 'og:image', image],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', image],
  ];
  if (price !== undefined) {
    tags.push(['property', 'product:price:amount', String(price)], ['property', 'product:price:currency', 'INR']);
  }
  return { title, tags };
}

const inr = (n) => Number(n).toLocaleString('en-IN');
const summarize = (text, fallback) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  return clean.length > 180 ? `${clean.slice(0, 177).trimEnd()}...` : clean;
};

function sendPage(res, meta) {
  res.set('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  res.type('html').send(meta ? renderWithMeta(meta) : readIndex());
}

function requireAdmin(req, res, next) {
  const grant = signer.verify(req.get('x-admin-token'));
  if (!grant || grant.role !== 'admin') return res.status(401).json({ error: 'Unauthorized' });
  next();
}

const app = express();
app.disable('x-powered-by');
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

if (store.mount) store.mount(app);

app.use(express.json({ limit: '1mb' }));

app.get('/api/config', (req, res) => {
  res.json({ whatsapp: WHATSAPP_NUMBER, brand: BRAND });
});

app.get('/api/products', wrap(async (req, res) => {
  res.json((await allProducts()).filter((p) => !p.archived));
}));

app.get('/api/products/:id', wrap(async (req, res) => {
  const product = (await allProducts()).find((p) => p.id === req.params.id && !p.archived);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
}));

app.get('/api/categories', wrap(async (req, res) => {
  res.json((await allCategories()).filter((c) => c.visible));
}));

app.post('/api/login', (req, res) => {
  const supplied = crypto.createHash('sha256').update(String((req.body && req.body.password) || '')).digest();
  const expected = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Incorrect password' });
  res.json({ token: signer.issue({ role: 'admin' }, TOKEN_TTL) });
});

app.post('/api/logout', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.get('/api/admin/products', requireAdmin, wrap(async (req, res) => {
  res.json(await allProducts());
}));

app.get('/api/admin/categories', requireAdmin, wrap(async (req, res) => {
  res.json(await allCategories());
}));

app.post('/api/admin/categories', requireAdmin, wrap(async (req, res) => {
  const category = buildCategory(req.body || {}, null, await allCategories());
  await store.saveCategories([category]);
  res.status(201).json(category);
}));

app.put('/api/admin/categories/:slug', requireAdmin, wrap(async (req, res) => {
  const categories = await allCategories();
  const existing = categories.find((c) => c.slug === req.params.slug);
  if (!existing) throw new HttpError(404, 'Category not found');
  const updated = buildCategory(req.body || {}, existing, categories);
  await store.saveCategories([updated]);
  res.json(updated);
}));

app.delete('/api/admin/categories/:slug', requireAdmin, wrap(async (req, res) => {
  const { slug } = req.params;
  const categories = await allCategories();
  if (!categories.some((c) => c.slug === slug)) throw new HttpError(404, 'Category not found');
  const moveTo = req.query.moveTo ? String(req.query.moveTo) : null;
  if (moveTo && (moveTo === slug || !categories.some((c) => c.slug === moveTo))) {
    throw new HttpError(400, 'moveTo must be a different existing category');
  }
  const using = (await allProducts()).filter((p) => p.category === slug);
  if (using.length && !moveTo) {
    return res.status(409).json({ error: `${using.length} product(s) still use this category`, count: using.length });
  }
  const slugs = categories.map((c) => c.slug);
  if (using.length) await store.saveMany(using.map((p) => buildProduct({ category: moveTo }, p, slugs)));
  await store.removeCategory(slug);
  res.json({ ok: true, slug, moved: using.length });
}));

app.post('/api/uploads/sign', requireAdmin, wrap(async (req, res) => {
  const files = req.body && req.body.files;
  if (!Array.isArray(files) || !files.length) throw new HttpError(400, 'files must be a non-empty array');
  if (files.length > MAX_UPLOADS_PER_REQUEST) throw new HttpError(400, `Up to ${MAX_UPLOADS_PER_REQUEST} files per request`);
  for (const f of files) {
    if (!f || !MIME_EXT[f.type]) throw new HttpError(400, 'Only JPEG, PNG, WebP, GIF or AVIF images are allowed');
    if (!(Number(f.size) > 0) || f.size > MAX_UPLOAD_BYTES) throw new HttpError(400, 'Each image must be 8MB or smaller');
  }
  res.json({ uploads: await store.signUploads(files) });
}));

app.post('/api/products', requireAdmin, wrap(async (req, res) => {
  const product = buildProduct(req.body || {}, null, await slugsOf());
  await store.saveMany([product]);
  res.status(201).json(product);
}));

app.put('/api/products/:id', requireAdmin, wrap(async (req, res) => {
  const products = await allProducts();
  const existing = products.find((p) => p.id === req.params.id);
  if (!existing) throw new HttpError(404, 'Product not found');
  const updated = buildProduct(req.body || {}, existing, await slugsOf());
  await store.saveMany([updated]);
  await releaseImages([existing], products.map((p) => (p.id === updated.id ? updated : p)));
  res.json(updated);
}));

app.delete('/api/products/:id', requireAdmin, wrap(async (req, res) => {
  const products = await allProducts();
  const removed = products.find((p) => p.id === req.params.id);
  if (!removed) return res.status(404).json({ error: 'Product not found' });
  await store.removeMany([removed.id]);
  await releaseImages([removed], products.filter((p) => p.id !== removed.id));
  res.json({ ok: true, id: removed.id });
}));

app.post('/api/admin/products/bulk', requireAdmin, wrap(async (req, res) => {
  const { ids, action, value } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, 'ids must be a non-empty array');
  if (action !== 'delete' && !BULK_ACTIONS[action]) {
    throw new HttpError(400, `action must be one of: delete, ${Object.keys(BULK_ACTIONS).join(', ')}`);
  }
  const [products, slugs] = await Promise.all([allProducts(), slugsOf()]);
  const wanted = new Set(ids);
  const targets = products.filter((p) => wanted.has(p.id));

  if (action === 'delete') {
    await store.removeMany(targets.map((p) => p.id));
    await releaseImages(targets, products.filter((p) => !wanted.has(p.id)));
    return res.json({ deleted: targets.map((p) => p.id), updated: [] });
  }

  const updated = targets.map((p) => buildProduct(BULK_ACTIONS[action](p, value), p, slugs));
  await store.saveMany(updated);
  res.json({ deleted: [], updated });
}));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.get(['/p/:id', '/p/:id/:slug'], wrap(async (req, res) => {
  const product = (await allProducts()).find((p) => p.id === req.params.id && !p.archived);
  if (!product) return sendPage(res, null);
  const origin = siteOrigin(req);
  const title = `${product.name} — ₹${inr(product.price)} | ${BRAND}`;
  sendPage(res, shareMeta({
    title,
    description: summarize(product.description, `${product.name} by ${BRAND}. Order on WhatsApp.`),
    image: absolute(origin, product.ogImage || OG_FALLBACK),
    url: `${origin}/p/${encodeURIComponent(product.id)}`,
    type: 'product',
    price: product.price,
  }));
}));

app.get('/c/:slug', wrap(async (req, res) => {
  const category = (await allCategories()).find((c) => c.slug === req.params.slug && c.visible);
  if (!category) return sendPage(res, null);
  const origin = siteOrigin(req);
  sendPage(res, shareMeta({
    title: `${category.name} | ${BRAND}`,
    description: `Shop ${category.name} from ${BRAND}. Browse the drop and order on WhatsApp.`,
    image: absolute(origin, OG_FALLBACK),
    url: `${origin}/c/${encodeURIComponent(category.slug)}`,
    type: 'website',
  }));
}));

app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  if (req.accepts('html') && !req.path.startsWith('/admin')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
      if (err) res.status(404).json({ error: 'Not found' });
    });
  }
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Upload too large' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`${BRAND} running on http://${HOST}:${PORT} (${store.driver} storage)`);
  });
}

module.exports = app;
