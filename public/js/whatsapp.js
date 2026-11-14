import { inr } from './format.js';

let number = '918421524576';
let brand = 'AT';

export function configure(config) {
  if (config?.whatsapp) number = String(config.whatsapp).replace(/\D/g, '');
  if (config?.brand) brand = config.brand;
}

export function displayNumber() {
  if (number.length === 12 && number.startsWith('91')) return `+91 ${number.slice(2, 7)} ${number.slice(7)}`;
  return `+${number}`;
}

export const productUrl = (id) => `${location.origin}/p/${encodeURIComponent(id)}`;

export const shareLink = (product) =>
  `https://wa.me/?text=${encodeURIComponent(`${product.name} ${inr(product.price)} ${productUrl(product.id)}`)}`;

function describe(index, { product, size, color, qty }) {
  const options = [size && `Size: ${size}`, color && `Colour: ${color}`, `Qty: ${qty}`].filter(Boolean).join(' | ');
  const price = qty > 1 ? `${inr(product.price * qty)} (${inr(product.price)} each)` : inr(product.price);
  return [`${index}. ${product.name}`, `   ${options}`, `   ${price}`, `   ${productUrl(product.id)}`].join('\n');
}

export function orderLink(items) {
  const total = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  const text = [
    `Hi ${brand}! I'd like to order:`,
    '',
    items.map((item, i) => describe(i + 1, item)).join('\n\n'),
    '',
    `Total: ${inr(total)}`,
    '',
    'Please confirm availability and delivery details. Thanks!',
  ].join('\n');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export const contactLink = (message = `Hi ${brand}! I have a question.`) =>
  `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
