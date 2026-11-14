const FALLBACK_CONFIG = { brand: 'Luxury Store' };

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

export function normalize(p) {
  return {
    ...p,
    price: Number(p.price) || 0,
    mrp: Number(p.mrp) || 0,
    description: p.description || '',
    sizes: list(p.sizes),
    colors: list(p.colors),
    images: list(p.images),
    thumbs: list(p.thumbs),
    lowStockAt: Number(p.lowStockAt) || 3,
    badge: p.badge || '',
    inStock: p.inStock !== false && !(p.stockBySize && Object.keys(p.stockBySize).length && Object.values(p.stockBySize).every((n) => !Number(n))),
    featured: Boolean(p.featured),
  };
}

export const fetchConfig = () => getJSON('/api/config').catch(() => FALLBACK_CONFIG);
export const fetchProducts = () => getJSON('/api/products').then((rows) => rows.map(normalize));
export const fetchProduct = (id) => getJSON(`/api/products/${encodeURIComponent(id)}`).then(normalize);

export async function fetchCategories(products = []) {
  try {
    const rows = await getJSON('/api/categories');
    if (Array.isArray(rows) && rows.length) {
      return rows.filter((c) => c && c.slug && c.visible !== false).sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0));
    }
  } catch {
    /* derive from products below */
  }
  return [...new Set(products.map((p) => p.category).filter(Boolean))].map((slug) => ({ slug, name: slug }));
}
