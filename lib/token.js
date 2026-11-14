const crypto = require('crypto');

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function createSigner(secret) {
  const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

  function issue(data, ttlSeconds) {
    const payload = b64(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
    return `${payload}.${sign(payload)}`;
  }

  function verify(token) {
    if (typeof token !== 'string') return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return data.exp > Date.now() / 1000 ? data : null;
    } catch {
      return null;
    }
  }

  return { issue, verify };
}

module.exports = { createSigner };
