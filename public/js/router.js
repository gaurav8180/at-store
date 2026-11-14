let base = '/';

const decode = (v) => { try { return decodeURIComponent(v); } catch { return v; } };

export function productIdFromPath() {
  const m = location.pathname.match(/^\/p\/([^/]+)/);
  return m ? decode(m[1]) : null;
}

export function categoryFromPath() {
  const m = location.pathname.match(/^\/c\/([^/]+)/);
  return m ? decode(m[1]) : null;
}

export const productPath = (id) => `/p/${encodeURIComponent(id)}`;
export const categoryPath = (slug) => (slug && slug !== 'all' && slug !== 'saved' ? `/c/${encodeURIComponent(slug)}` : '/');

export function migrateHash() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m) history.replaceState(null, '', productPath(decode(m[1])));
}

export function setBase(path) {
  base = path;
}

export const pushProduct = (id) => history.pushState({ sheet: true }, '', productPath(id));
export const restoreBase = () => history.replaceState(null, '', base);
export const replaceWithBase = restoreBase;
