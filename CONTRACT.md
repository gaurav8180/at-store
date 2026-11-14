# AT — build contract

Product catalogue for t-shirts, shoes and accessories. No user login.
Visitors browse, open a product, add to a browser cart (localStorage), and order on WhatsApp.
One admin, password-protected, manages products, stock and categories.

Hosting: Vercel (static `public/` + one serverless function for `/api`, `/p/*`, `/c/*`) and Supabase
(Postgres for products and categories, a public Storage bucket for images). Locally, with no Supabase env,
the same app stores everything on disk so `npm start` works with zero setup.

## Stack
- Node 20+, Express. Storage adapter in `lib/store/`: `supabase` driver when `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` are set (server-only key), otherwise `local` (`data/*.json` + `uploads/`).
- Front end: plain HTML/CSS/ES modules, no build step. gsap is vendored as static files under
  `public/vendor/` (same URLs as before). Fonts from Google Fonts or Fontshare.

## Layout
```
server.js               Express app; exports the app, listens only when run directly (PORT, default 3000)
api/index.js            Vercel function entry (re-exports server.js)
vercel.json             /api/*, /p/*, /c/* → function; everything else static from public/
lib/catalog.js          product/category validation and normalisation
lib/store/              storage adapter: local.js, supabase.js
lib/token.js            stateless HMAC tokens
data/seed.json          seed products (tracked)       data/products.json     local live data (gitignored)
data/seed-categories.json seed categories (tracked)   data/categories.json   local live data (gitignored)
uploads/                local-mode images (gitignored except .gitkeep)
supabase/setup.sql      tables, RLS, storage bucket + public read policy
scripts/seed-supabase.js inserts seed categories/products into an empty Supabase project
public/                 storefront: index.html, css/, js/, assets/, vendor/
public/admin/           admin panel: index.html, admin.css, admin.js
```

## Config (env)
- `ADMIN_PASSWORD` default `atadmin`; `TOKEN_SECRET` optional (defaults to the password)
- `WHATSAPP_NUMBER` default `918421524576`; `BRAND` default `AT` (both via GET /api/config)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` switch on the Supabase driver
- `SITE_URL` absolute origin for share links (falls back to the request host)
- `.env` is loaded automatically if present (see `.env.example`).

## Product shape
```json
{
  "id": "p_abc123",
  "name": "Oversized Heavyweight Tee",
  "category": "tshirts",
  "price": 1299,
  "mrp": 1799,
  "description": "string",
  "sizes": ["S","M","L","XL"],
  "colors": ["Black","Bone"],
  "images": ["https://<project>.supabase.co/storage/v1/object/public/product-images/x.webp", "/uploads/y.webp"],
  "thumbs": ["...800px webp aligned with images..."],
  "ogImage": "1200x630 JPEG URL | null",
  "badge": "New | Bestseller | Limited | ''",
  "stockBySize": { "S": 4, "M": 0, "L": 7, "XL": 2 },
  "lowStockAt": 3,
  "archived": false,
  "inStock": true,
  "featured": false,
  "createdAt": "ISO string",
  "updatedAt": "ISO string"
}
```
- Prices are INR, whole rupees. `mrp` optional (show strike-through + % off when > price).
- `stockBySize` keys are exactly `sizes`; a product with no sizes uses the single key `"ONE"`.
  The storefront should disable sizes whose qty is 0.
- `inStock` is derived server-side (total qty > 0 and not archived); it is ignored on input.
- `thumbs` is optional and aligned with `images` (same index; falls back to the image itself).
  Use thumbs for cards/grids and `images` for the product view. The storefront may ignore it.
- Images are processed in the admin's browser before upload: full image capped at 2400px longest side,
  WebP q0.92 (original kept if already smaller and ≤ 4MB); thumbnail 800px WebP.
- Up to 6 images per product.
- Archived products are hidden from the public API but kept for the admin.

## API
- `GET  /api/config` → `{ whatsapp: "918421524576", brand: "AT" }`
- `GET  /api/products` → Product[] newest first, archived excluded
- `GET  /api/products/:id` → Product | 404 (archived → 404)
- `POST /api/login` `{password}` → `{token}` (HMAC-signed, valid 7 days; 401 on bad password)
- Admin routes need header `x-admin-token: <token>`; 401 otherwise. All bodies are JSON.
  - `GET    /api/admin/products` → every Product including archived
  - `POST   /api/uploads/sign` `{files:[{name,type,size}]}` (≤ 13 files = up to 6 images × full + thumb, plus 1 ogImage; JPEG/PNG/WebP/GIF/AVIF, ≤ 8MB each)
    → `{uploads:[{uploadUrl, method:"PUT", headers, url}]}`. The browser PUTs each file body to `uploadUrl`
    with `headers`, then uses `url` in the product. Supabase: signed upload URL into bucket `product-images`;
    local: a short-lived `/api/uploads/local/<name>?token=…` endpoint. Files never pass through the
    function in production (Vercel's 4.5MB request limit).
  - `POST   /api/products` Product fields (`images`/`thumbs`/`ogImage` are URLs from the sign step or any
    http(s) URL; sizes/colors as array, comma string or JSON string) → 201 Product
  - `PUT    /api/products/:id` partial update: only fields present change. `stockBySize` merges by key
    (`{"stockBySize":{"M":3}}` sets just M). `images` replaces the list (order = display order).
  - `DELETE /api/products/:id`
  - `POST   /api/admin/products/bulk` `{ids, action, value}` → `{updated: Product[], deleted: id[]}`;
    actions: `outOfStock`, `archive`, `unarchive`, `delete`, `category` (value = slug),
    `pricePercent` (value = % change, e.g. -10).
  - Storage objects (images, thumbs, ogImage) are deleted when no remaining product references them
    (on delete, bulk delete, or when an update drops them). Duplicated products share files safely.
- Static: everything in `public/` (`/`, `/admin/`, `/assets`, `/vendor/gsap/dist/*`).
  Local mode also serves `/uploads`.

## Storefront behaviour
- Cart in `localStorage` key `ss_cart`: `[{id, size, color, qty}]`. Wishlist optional key `ss_saved`.
- WhatsApp order: `https://wa.me/918421524576?text=<encoded>` — message lists item name, size,
  color, qty, price, product link, and total. Single-product "Order on WhatsApp" and
  cart "Order all on WhatsApp" both use this.

## Categories are dynamic (admin-managed)
- `GET /api/categories` (public) → `[{slug, name, emoji?: null, sizes: ["S","M"...] | [], sort, visible}]` — only visible ones, ordered by `sort`.
- Admin: `GET /api/admin/categories`, `POST /api/admin/categories`, `PUT /api/admin/categories/:slug`, `DELETE /api/admin/categories/:slug` (409 if products still use it unless `?moveTo=<slug>`).
- Seed: tshirts (T-Shirts, S–XXL), shoes (Shoes, UK 6–11), accessories (Accessories, no sizes).
- `Product.category` = a category slug. The storefront builds its filter tabs, hero marquee and nav from `/api/categories` — never hardcode category names.
- A category's `sizes` is the default size set the admin form pre-fills for new products in it.

## Shareable product links with WhatsApp previews (supersedes the hash route)
- Product URLs are real paths: `/p/<id>` (optionally `/p/<id>/<slugified-name>`). Category URLs: `/c/<slug>`.
  Hash URLs `#/p/<id>` still work by redirecting to the path.
- The server handles `GET /p/:id` (and `/c/:slug`) by returning `public/index.html` with per-page meta injected
  into `<head>`: `<title>`, `description`, `og:title` ("<name> — ₹<price> | AT"), `og:description`, `og:image`
  (absolute https URL), `og:image:width/height`, `og:url`, `og:type=product`, `product:price:amount`,
  `product:price:currency=INR`, `twitter:card=summary_large_image`. Unknown id → normal index with brand meta.
  Absolute URLs use `SITE_URL` env, falling back to the request host/proto (x-forwarded-proto aware).
- WhatsApp crawler needs JPEG/PNG under ~300KB: the admin generates an `ogImage` per product in the browser
  (1200×630 JPEG, quality ~0.82, product image centered on the brand off-white with a small AT mark),
  uploaded with the other images. Product gains `ogImage?: string`; fallback is `/assets/brand/og-image.png`.
- Storefront uses the History API for `/p/:id` and `/c/:slug` (back button closes the product sheet).
- WhatsApp order messages include the full `/p/<id>` link for every item so the seller's chat shows the
  product preview card. Product view also has a Share button: Web Share API on mobile, fallback menu with
  "Share on WhatsApp" (`https://wa.me/?text=<name> ₹<price> <link>`) and "Copy link" with a toast.
