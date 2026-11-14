const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const TABLE = 'products';
const BUCKET = 'product-images';

const toRow = (p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  price: p.price,
  mrp: p.mrp,
  description: p.description,
  sizes: p.sizes,
  colors: p.colors,
  images: p.images,
  thumbs: p.thumbs,
  og_image: p.ogImage,
  badge: p.badge,
  stock_by_size: p.stockBySize,
  low_stock_at: p.lowStockAt,
  archived: p.archived,
  featured: p.featured,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
});

const iso = (value) => (value ? new Date(value).toISOString() : value);

const fromRow = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  price: r.price,
  mrp: r.mrp,
  description: r.description,
  sizes: r.sizes,
  colors: r.colors,
  images: r.images,
  thumbs: r.thumbs,
  ogImage: r.og_image,
  badge: r.badge,
  stockBySize: r.stock_by_size,
  lowStockAt: r.low_stock_at,
  archived: r.archived,
  featured: r.featured,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

function check({ data, error }) {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

module.exports = function supabaseStore({ url, key, extFor }) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucket = client.storage.from(BUCKET);
  const publicPrefix = bucket.getPublicUrl('').data.publicUrl.replace(/\/?$/, '/');
  const pathOf = (u) => u.slice(publicPrefix.length);

  return {
    driver: 'supabase',
    async all() {
      return check(await client.from(TABLE).select('*').order('created_at', { ascending: false })).map(fromRow);
    },
    async saveMany(items) {
      if (items.length) check(await client.from(TABLE).upsert(items.map(toRow)));
    },
    async removeMany(ids) {
      if (ids.length) check(await client.from(TABLE).delete().in('id', ids));
    },
    async categories() {
      return check(await client.from('categories').select('slug, name, emoji, sizes, sort, visible'));
    },
    async saveCategories(items) {
      if (items.length) check(await client.from('categories').upsert(items));
    },
    async removeCategory(slug) {
      check(await client.from('categories').delete().eq('slug', slug));
    },
    ownsUrl(u) {
      return typeof u === 'string' && u.startsWith(publicPrefix) && !pathOf(u).includes('..');
    },
    async deleteObjects(urls) {
      const paths = urls.map(pathOf);
      if (paths.length) check(await bucket.remove(paths));
    },
    async signUploads(files) {
      return Promise.all(
        files.map(async (f) => {
          const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${extFor(f.type)}`;
          const { signedUrl } = check(await bucket.createSignedUploadUrl(name));
          return {
            uploadUrl: signedUrl,
            method: 'PUT',
            headers: { 'Content-Type': f.type, 'Cache-Control': 'max-age=31536000' },
            url: bucket.getPublicUrl(name).data.publicUrl,
          };
        })
      );
    },
  };
};
