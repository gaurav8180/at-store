create table if not exists public.categories (
  slug    text primary key check (slug ~ '^[a-z0-9-]+$'),
  name    text not null,
  emoji   text,
  sizes   text[] not null default '{}',
  sort    integer not null default 0,
  visible boolean not null default true
);

insert into public.categories (slug, name, sizes, sort) values
  ('tshirts', 'T-Shirts', array['S', 'M', 'L', 'XL', 'XXL'], 0),
  ('shoes', 'Shoes', array['6', '7', '8', '9', '10', '11'], 1),
  ('accessories', 'Accessories', '{}', 2)
on conflict (slug) do nothing;

create table if not exists public.products (
  id            text primary key,
  name          text not null,
  category      text not null,
  price         integer not null check (price >= 0),
  mrp           integer check (mrp >= 0),
  description   text not null default '',
  sizes         text[] not null default '{}',
  colors        text[] not null default '{}',
  images        text[] not null default '{}',
  thumbs        text[] not null default '{}',
  og_image      text,
  badge         text not null default '',
  stock_by_size jsonb not null default '{}'::jsonb,
  low_stock_at  integer not null default 3,
  archived      boolean not null default false,
  featured      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists products_created_at_idx on public.products (created_at desc);

alter table public.categories enable row level security;
alter table public.products enable row level security;
revoke all on public.categories, public.products from anon, authenticated;
grant select, insert, update, delete on public.categories, public.products to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');
