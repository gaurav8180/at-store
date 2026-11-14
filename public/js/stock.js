const MAX_QTY = 99;

export function stockOf(product, size) {
  const map = product.stockBySize;
  const key = size || 'ONE';
  if (map && Object.hasOwn(map, key)) return Math.max(0, Number(map[key]) || 0);
  return Infinity;
}

export const capFor = (product, size) => Math.min(MAX_QTY, stockOf(product, size));
export const lowAt = (product) => Number(product.lowStockAt) || 3;
