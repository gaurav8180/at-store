const crypto = require('crypto');

const BADGES = ['New', 'Bestseller', 'Limited', ''];
const MAX_IMAGES = 6;
const DEFAULT_LOW_STOCK = 3;
const ONE_SIZE = 'ONE';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseList(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  const str = String(value).trim();
  if (str.startsWith('[')) {
    try {
      const arr = JSON.parse(str);
      if (Array.isArray(arr)) return arr.map(String).map((s) => s.trim()).filter(Boolean);
    } catch {}
  }
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseObject(value, field) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new HttpError(400, `${field} must be an object`);
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, `${field} must be an object`);
  return value;
}

function parseBool(value, fallback) {
  if (value === undefined) return fallback;
  return value === true || value === 'true' || value === '1' || value === 'on';
}

function parseWholeNumber(value, field, required) {
  if (value === undefined || value === '' || value === null) {
    if (required) throw new HttpError(400, `${field} is required`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${field} must be a non-negative number`);
  return Math.round(n);
}

function stockKeys(sizes) {
  return sizes.length ? sizes : [ONE_SIZE];
}

function shapeStock(sizes, stock) {
  const out = {};
  for (const key of stockKeys(sizes)) {
    const n = Math.round(Number(stock && stock[key]));
    out[key] = Number.isFinite(n) && n > 0 ? n : 0;
  }
  return out;
}

function totalUnits(product) {
  return Object.values(product.stockBySize || {}).reduce((sum, n) => sum + n, 0);
}

function normalize(raw) {
  const sizes = Array.isArray(raw.sizes) ? raw.sizes : [];
  const images = Array.isArray(raw.images) ? raw.images : [];
  const legacyStock = raw.stockBySize
    ? raw.stockBySize
    : Object.fromEntries(stockKeys(sizes).map((k) => [k, raw.inStock === false ? 0 : 10]));
  const product = {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    price: raw.price,
    mrp: raw.mrp ?? null,
    description: raw.description || '',
    sizes,
    colors: Array.isArray(raw.colors) ? raw.colors : [],
    images,
    thumbs: images.map((img, i) => (Array.isArray(raw.thumbs) && raw.thumbs[i]) || img),
    ogImage: raw.ogImage || null,
    badge: raw.badge || '',
    stockBySize: shapeStock(sizes, legacyStock),
    lowStockAt: Number.isInteger(raw.lowStockAt) ? raw.lowStockAt : DEFAULT_LOW_STOCK,
    archived: !!raw.archived,
    featured: !!raw.featured,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt || raw.createdAt,
  };
  product.inStock = !product.archived && totalUnits(product) > 0;
  return product;
}

function newestFirst(a, b) {
  return String(b.createdAt).localeCompare(String(a.createdAt));
}

function isImageUrl(value) {
  return typeof value === 'string' && (/^https?:\/\//i.test(value) || /^\/uploads\/[\w.-]+$/.test(value));
}

function buildImages(body, existing) {
  if (body.images === undefined) return existing ? { images: existing.images, thumbs: existing.thumbs } : { images: [], thumbs: [] };
  if (!Array.isArray(body.images)) throw new HttpError(400, 'images must be an array of URLs');
  const images = body.images.filter(isImageUrl);
  if (images.length !== body.images.length) throw new HttpError(400, 'images must be http(s) URLs or /uploads/ paths');
  if (images.length > MAX_IMAGES) throw new HttpError(400, `You can add up to ${MAX_IMAGES} images`);
  const given = Array.isArray(body.thumbs) ? body.thumbs : [];
  const previous = existing ? Object.fromEntries(existing.images.map((img, i) => [img, existing.thumbs[i]])) : {};
  const thumbs = images.map((img, i) => (isImageUrl(given[i]) ? given[i] : previous[img] || img));
  return { images, thumbs };
}

function buildOgImage(body, existing) {
  if (body.ogImage === undefined) return existing ? existing.ogImage : null;
  if (body.ogImage === null || body.ogImage === '') return null;
  if (!isImageUrl(body.ogImage)) throw new HttpError(400, 'ogImage must be an http(s) URL or /uploads/ path');
  return body.ogImage;
}

function buildProduct(body, existing, categories) {
  const pick = (key, fallback) => (body[key] !== undefined ? body[key] : fallback);

  const name = String(pick('name', existing ? existing.name : '')).trim();
  if (!name) throw new HttpError(400, 'name is required');

  const category = String(pick('category', existing ? existing.category : '')).trim();
  if (!categories.includes(category)) throw new HttpError(400, `category must be one of: ${categories.join(', ')}`);

  const price = parseWholeNumber(pick('price', existing ? existing.price : undefined), 'price', true);
  const mrp = parseWholeNumber(pick('mrp', existing ? existing.mrp : undefined), 'mrp', false);

  const badge = String(pick('badge', existing ? existing.badge : '') ?? '').trim();
  if (!BADGES.includes(badge)) throw new HttpError(400, 'badge must be New, Bestseller, Limited or empty');

  const sizes = body.sizes !== undefined ? parseList(body.sizes) : existing ? existing.sizes : [];
  const stockPatch = body.stockBySize !== undefined ? parseObject(body.stockBySize, 'stockBySize') : {};
  for (const [key, qty] of Object.entries(stockPatch)) {
    const n = Number(qty);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `stockBySize.${key} must be a non-negative number`);
  }

  const lowStockAt = parseWholeNumber(pick('lowStockAt', existing ? existing.lowStockAt : DEFAULT_LOW_STOCK), 'lowStockAt', false);
  const now = new Date().toISOString();

  return normalize({
    id: existing ? existing.id : `p_${crypto.randomBytes(5).toString('hex')}`,
    name,
    category,
    price,
    mrp,
    description: String(pick('description', existing ? existing.description : '') ?? '').trim(),
    sizes,
    colors: body.colors !== undefined ? parseList(body.colors) : existing ? existing.colors : [],
    ...buildImages(body, existing),
    ogImage: buildOgImage(body, existing),
    badge,
    stockBySize: { ...(existing ? existing.stockBySize : {}), ...stockPatch },
    lowStockAt: lowStockAt ?? DEFAULT_LOW_STOCK,
    archived: parseBool(body.archived, existing ? existing.archived : false),
    featured: parseBool(body.featured, existing ? existing.featured : false),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  });
}

const BULK_ACTIONS = {
  outOfStock: (p) => ({ stockBySize: Object.fromEntries(Object.keys(p.stockBySize).map((k) => [k, 0])) }),
  archive: () => ({ archived: true }),
  unarchive: () => ({ archived: false }),
  category: (p, value) => ({ category: value }),
  pricePercent: (p, value) => {
    const pct = Number(value);
    if (!Number.isFinite(pct) || pct <= -100 || pct > 1000) throw new HttpError(400, 'value must be a percentage between -99 and 1000');
    return { price: Math.max(0, Math.round(p.price * (1 + pct / 100))) };
  },
};

function slugify(value) {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function normalizeCategory(raw) {
  return {
    slug: raw.slug,
    name: raw.name,
    emoji: raw.emoji || null,
    sizes: Array.isArray(raw.sizes) ? raw.sizes : [],
    sort: Number.isFinite(raw.sort) ? raw.sort : 0,
    visible: raw.visible !== false,
  };
}

function buildCategory(body, existing, siblings) {
  const name = String(body.name !== undefined ? body.name : existing ? existing.name : '').trim().slice(0, 60);
  if (!name) throw new HttpError(400, 'name is required');
  const slug = existing ? existing.slug : slugify(body.slug || name);
  if (!slug) throw new HttpError(400, 'name must contain letters or numbers');
  if (!existing && siblings.some((c) => c.slug === slug)) throw new HttpError(409, `A category with slug "${slug}" already exists`);
  const sort = body.sort !== undefined ? parseWholeNumber(body.sort, 'sort', true) : existing ? existing.sort : Math.max(-1, ...siblings.map((c) => c.sort)) + 1;
  const emoji = body.emoji !== undefined ? String(body.emoji || '').trim().slice(0, 8) || null : existing ? existing.emoji : null;
  return normalizeCategory({
    slug,
    name,
    emoji,
    sizes: body.sizes !== undefined ? parseList(body.sizes) : existing ? existing.sizes : [],
    sort,
    visible: parseBool(body.visible, existing ? existing.visible : true),
  });
}

const bySort = (a, b) => a.sort - b.sort || a.name.localeCompare(b.name);

module.exports = {
  buildCategory,
  bySort,
  normalizeCategory,
  BULK_ACTIONS,
  HttpError,
  buildProduct,
  newestFirst,
  normalize,
};
