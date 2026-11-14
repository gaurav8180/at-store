# Deploy AT for free (Vercel + Supabase)

- **Vercel** hosts the website and admin panel. It's free, always on, has HTTPS, and redeploys on every `git push`.
- **Supabase** stores products, categories and full-quality images. It's free, with a 500 MB database and 1 GB of image storage.

Neither needs a credit card. It takes about 15 minutes.

---

## 0. Run it on your Mac first (optional)

```bash
cd ~/Desktop/stitch-and-sole && npm install && npm start
```

Shop: http://localhost:3000 · Admin: http://localhost:3000/admin (password `atadmin`).
Locally it saves to `data/` and `uploads/`, so it needs no setup.

---

## 1. Put the code on GitHub

Create an **empty** repo on github.com (e.g. `at-store`, no README). Then:

```bash
cd ~/Desktop/stitch-and-sole && git init -b main && git add . && git commit -m "feat: AT catalogue"
```

```bash
git remote add origin git@github.com:<your-username>/at-store.git && git push -u origin main
```

---

## 2. Create the Supabase project (database + images)

1. Go to **supabase.com** → Sign in with GitHub → **New project**.
   Name it `at-store`, set any database password (you won't need it again), and pick the **Mumbai** region. Click **Create**.
2. When it's ready, open **SQL Editor** in the left sidebar, then **New query**. Paste the whole of
   [`supabase/setup.sql`](supabase/setup.sql) and click **Run**.
   This creates the tables, the image bucket and the 3 starting categories.
3. Go to **Project Settings → API** and copy two values:
   - **Project URL**: this is `SUPABASE_URL`
   - **service_role** secret (click reveal): this is `SUPABASE_SERVICE_ROLE_KEY`. Keep it private. It only goes into Vercel.

The shop starts empty, and you add real products from the admin panel.
To load the demo products instead, run this once on your Mac (fill in the two values first):

```bash
cd ~/Desktop/stitch-and-sole && SUPABASE_URL='https://xxxx.supabase.co' SUPABASE_SERVICE_ROLE_KEY='xxxx' npm run seed:supabase
```

---

## 3. Deploy on Vercel

1. Go to **vercel.com** → Sign up with GitHub → **Add New… → Project** → import `at-store`.
2. Leave the build settings as they are. `vercel.json` already configures everything.
3. Open **Environment Variables** and add:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | your admin password |
| `SUPABASE_URL` | from step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 2 |
| `WHATSAPP_NUMBER` | `918421524576` |

4. Click **Deploy**. About a minute later you get `https://at-store-xxxx.vercel.app`.
5. Add one more variable, `SITE_URL` = that URL (no trailing slash), then go to
   **Deployments → ⋯ → Redeploy**. This makes WhatsApp link previews use the correct address.

Open `<your-url>/admin`, log in, and add a product. It shows up on the shop straight away.

---

## 4. Keep Supabase awake (one minute)

A free Supabase project pauses after 7 days without traffic. The repo includes a daily ping that prevents this.
On GitHub, open your repo → **Settings → Secrets and variables → Actions → New repository secret**:
name `SITE_URL`, value your Vercel URL. That's all.

---

## Everyday use

- **Add or edit products and stock:** use `<your-url>/admin`. Changes are live immediately.
- **Change the code:** run `git push` and Vercel redeploys on its own.
- **Change the admin password:** in Vercel, go to Settings → Environment Variables, edit `ADMIN_PASSWORD`, then Redeploy.
- **Use your own domain (optional):** in Vercel, go to Settings → Domains, add it, and follow the DNS steps. Then update `SITE_URL`.
- **WhatsApp preview not updating** after you change a price: WhatsApp caches link previews. New shares
  pick up the change within a few minutes.
