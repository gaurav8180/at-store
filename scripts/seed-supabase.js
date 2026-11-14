const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {}

const createStore = require('../lib/store');
const { normalize, normalizeCategory } = require('../lib/catalog');
const seed = require('../data/seed.json');
const seedCategories = require('../data/seed-categories.json');

async function main() {
  const store = createStore({ extFor: () => '' });
  if (store.driver !== 'supabase') throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first');
  if (!(await store.categories()).length) {
    await store.saveCategories(seedCategories.map(normalizeCategory));
    console.log(`Inserted ${seedCategories.length} categories`);
  }
  const existing = await store.all();
  if (existing.length) {
    console.log(`products already has ${existing.length} rows, nothing to do`);
    return;
  }
  await store.saveMany(seed.map(normalize));
  console.log(`Inserted ${seed.length} seed products`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
