const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { HttpError } = require('../catalog');

const NAME_RE = /^[a-z0-9-]+\.(jpg|png|webp|gif|avif)$/;

module.exports = function localStore({ root, signer, extFor, maxBytes }) {
  const dataFile = path.join(root, 'data', 'products.json');
  const seedFile = path.join(root, 'data', 'seed.json');
  const categoriesFile = path.join(root, 'data', 'categories.json');
  const categorySeedFile = path.join(root, 'data', 'seed-categories.json');
  const uploadDir = path.join(root, 'uploads');

  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  for (const [file, seed] of [[dataFile, seedFile], [categoriesFile, categorySeedFile]]) {
    if (fs.existsSync(file)) continue;
    if (fs.existsSync(seed)) fs.copyFileSync(seed, file);
    else fs.writeFileSync(file, '[]\n');
  }

  function read(file = dataFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(items, file = dataFile) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2) + '\n');
    fs.renameSync(tmp, file);
  }

  function upsert(file, key, items) {
    const byKey = new Map(items.map((x) => [x[key], x]));
    const current = read(file).map((x) => byKey.get(x[key]) || x);
    const known = new Set(current.map((x) => x[key]));
    for (const x of items) if (!known.has(x[key])) current.push(x);
    write(current, file);
  }

  return {
    driver: 'local',
    async all() {
      return read();
    },
    async saveMany(items) {
      upsert(dataFile, 'id', items);
    },
    async removeMany(ids) {
      const drop = new Set(ids);
      write(read().filter((p) => !drop.has(p.id)));
    },
    async categories() {
      return read(categoriesFile);
    },
    async saveCategories(items) {
      upsert(categoriesFile, 'slug', items);
    },
    async removeCategory(slug) {
      write(read(categoriesFile).filter((c) => c.slug !== slug), categoriesFile);
    },
    ownsUrl(url) {
      return typeof url === 'string' && url.startsWith('/uploads/');
    },
    async deleteObjects(urls) {
      for (const url of urls) fs.unlink(path.join(uploadDir, path.basename(url)), () => {});
    },
    async signUploads(files) {
      return files.map((f) => {
        const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${extFor(f.type)}`;
        const token = signer.issue({ upload: name, type: f.type }, 15 * 60);
        return {
          uploadUrl: `/api/uploads/local/${name}?token=${encodeURIComponent(token)}`,
          method: 'PUT',
          headers: { 'Content-Type': f.type },
          url: `/uploads/${name}`,
        };
      });
    },
    mount(app) {
      app.put(
        '/api/uploads/local/:name',
        express.raw({ type: () => true, limit: maxBytes }),
        (req, res) => {
          const grant = signer.verify(String(req.query.token || ''));
          const { name } = req.params;
          if (!grant || grant.upload !== name || !NAME_RE.test(name)) throw new HttpError(401, 'Invalid or expired upload URL');
          if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Empty upload');
          try {
            fs.writeFileSync(path.join(uploadDir, name), req.body, { flag: 'wx' });
          } catch (e) {
            if (e.code === 'EEXIST') throw new HttpError(409, 'Already uploaded');
            throw e;
          }
          res.json({ ok: true, url: `/uploads/${name}` });
        }
      );
      app.use('/uploads', express.static(uploadDir, { maxAge: '7d', index: false }));
    },
  };
};
