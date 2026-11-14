const numbers = new Intl.NumberFormat('en-IN');

let categoryList = [];

export const setCategoryList = (rows) => { categoryList = rows; };
export const getCategories = () => categoryList;

export const inr = (n) => `₹${numbers.format(Math.round(Number(n) || 0))}`;
export const percentOff = (p) => (p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0);

export const categoryLabel = (slug) =>
  categoryList.find((c) => c.slug === slug)?.name
  ?? String(slug).replace(/[-_]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
