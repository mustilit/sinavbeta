/**
 * Backend login endpoint testi.
 * Kullanım: Backend çalışırken (port 3000) node scripts/test-login.js
 */
// @ts-nocheck

const url = process.env.API_URL || 'http://localhost:3000';

async function testLogin(email, password) {
  try {
    const res = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('HATA', res.status, data);
      return false;
    }
    if (data.user && data.token) {
      console.log('OK:', data.user.email, 'role:', data.user.role);
      return true;
    }
    console.error('Beklenmeyen yanıt:', data);
    return false;
  } catch (err) {
    console.error('Bağlantı hatası:', err.message);
    console.error('Backend çalışıyor mu?', url);
    return false;
  }
}

(async () => {
  console.log('Test:', url + '/auth/login');
  const ok1 = await testLogin('aday@demo.com', 'demo123');
  const ok2 = await testLogin('educator@demo.com', 'demo123');
  process.exit(ok1 && ok2 ? 0 : 1);
})();
