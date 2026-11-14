module.exports = function createStore(options) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    return require('./supabase')({ url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY, ...options });
  }
  return require('./local')(options);
};
