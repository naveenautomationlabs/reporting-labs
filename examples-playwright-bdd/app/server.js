// A tiny shop for the playwright-bdd example: login page, product pages and a JSON API. Started by playwright.config.ts.
const http = require('http');
const url = require('url');

const products = Array.from({ length: 300 }, (_, i) => ({
  id: i + 1, name: `Product ${i + 1}`, price: Math.round((5 + (i * 7.3) % 95) * 100) / 100,
  category: ['books', 'games', 'garden', 'kitchen', 'toys', 'tools'][i % 6], stock: (i * 13) % 40,
}));
// known defects, so the run has real failures: wrong price returned for three products
const wrongPrice = new Set([57, 143, 222]);
const coupons = { NONE: 0, SAVE10: 10, WELCOME5: 5, EXPIRED20: 20 };
const users = { asha: 'Asha-Pass-01', ravi: 'Ravi-Pass-02', meera: 'Meera-Pass-03', locked: 'Locked-Pass-04' };

const tokens = new Map();   // token -> user
const orders = new Map();   // id -> order
const page = (title, body) => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const html = (res, code, s) => { res.writeHead(code, { 'content-type': 'text/html' }); res.end(s); };

function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); }); }

http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  let m;
  if ((m = /^\/api\/products\/(\d+)$/.exec(pathname))) {
    const p = products[Number(m[1]) - 1];
    if (!p) return json(res, 404, { error: 'not found' });
    return json(res, 200, { ...p, price: wrongPrice.has(p.id) ? p.price + 1 : p.price });
  }
  if (pathname === '/api/login' && req.method === 'POST') {
    const b = await readBody(req);
    if (b.user === 'locked') return json(res, 423, { error: 'account locked' });
    if (!users[b.user] || users[b.user] !== b.password) return json(res, 401, { error: 'wrong user or password' });
    const token = 'tok-' + b.user + '-' + Math.random().toString(36).slice(2, 12);
    tokens.set(token, b.user);
    return json(res, 200, { token, user: b.user, expiresIn: 3600 });
  }
  if (pathname.startsWith('/api/orders')) {
    const auth = String(req.headers.authorization || '');
    const user = tokens.get(auth.replace(/^Bearer /, ''));
    if (!user) return json(res, 401, { error: 'missing or invalid token' });
    const id = (/^\/api\/orders\/([\w-]+)$/.exec(pathname) || [])[1];
    if (!id && req.method === 'POST') {
      const b = await readBody(req);
      const p = products[Number(b.productId) - 1];
      if (!p) return json(res, 422, { error: 'unknown product', productId: b.productId });
      if (!(b.qty > 0)) return json(res, 422, { error: 'qty must be at least 1' });
      const o = { id: 'ord-' + Math.random().toString(36).slice(2, 10), user, productId: p.id, qty: b.qty, status: 'created', total: Math.round(p.price * b.qty * 100) / 100 };
      orders.set(o.id, o);
      return json(res, 201, o);
    }
    const o = id && orders.get(id);
    if (!o || o.user !== user) return json(res, 404, { error: 'order not found' });
    if (req.method === 'GET') return json(res, 200, o);
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      if (b.qty !== undefined) { o.qty = b.qty; o.total = Math.round(products[o.productId - 1].price * b.qty * 100) / 100; }
      if (b.status) o.status = b.status;
      return json(res, 200, o);
    }
    if (req.method === 'DELETE') {
      // defect SHOP-517: cancelling a big order times out in the inventory service
      if (o.qty >= 9) return json(res, 500, { error: 'inventory service timeout', orderId: o.id });
      orders.delete(o.id);
      res.writeHead(204); return res.end();
    }
    return json(res, 405, { error: 'method not allowed' });
  }
  if (pathname === '/api/search') {
    const q = String(query.q || '').toLowerCase();
    const hits = products.filter(p => p.name.toLowerCase().includes(q) || p.category === q);
    return json(res, 200, { q, count: hits.length, items: hits.slice(0, 20).map(p => p.id) });
  }
  if (pathname === '/api/cart/price' && req.method === 'POST') {
    const b = await readBody(req);
    const p = products[Number(b.productId) - 1];
    if (!p) return json(res, 400, { error: 'unknown product' });
    if (b.coupon === 'EXPIRED20') return json(res, 422, { error: 'coupon expired' });
    const pct = coupons[b.coupon] ?? 0;
    const subtotal = p.price * b.qty;
    const total = Math.round(subtotal * (1 - pct / 100) * (b.currency === 'EUR' ? 0.92 : 1) * 100) / 100;
    return json(res, 200, { subtotal: Math.round(subtotal * 100) / 100, discount: pct, currency: b.currency, total });
  }
  if (pathname === '/login') {
    return html(res, 200, page('Login', `<h1>Sign in</h1><form id="f"><input id="user"><input id="pass" type="password"><button id="go" type="button">Sign in</button></form><p id="msg"></p>
      <script>const U=${JSON.stringify(users)};document.getElementById('go').onclick=()=>{const u=document.getElementById('user').value,p=document.getElementById('pass').value;
      document.getElementById('msg').textContent=u==='locked'?'Account locked':U[u]===p?'Welcome '+u:'Wrong user or password';};</script>`));
  }
  if ((m = /^\/product\/(\d+)$/.exec(pathname))) {
    const p = products[Number(m[1]) - 1];
    if (!p) return html(res, 404, page('Not found', '<h1>Not found</h1>'));
    return html(res, 200, page(p.name, `<h1>${p.name}</h1><p class="price">$${p.price.toFixed(2)}</p><p class="cat">${p.category}</p>
      <button id="add" ${p.stock ? '' : 'disabled'}>Add to cart</button><span id="count">0</span>
      <script>document.getElementById('add').onclick=()=>{const c=document.getElementById('count');c.textContent=String(+c.textContent+1);};</script>`));
  }
  if (pathname === '/checkout') {
    return html(res, 200, page('Checkout', `<h1>Checkout</h1><select id="pay"><option>card</option><option>upi</option><option>paypal</option></select>
      <select id="ship"><option>standard</option><option>express</option><option>pickup</option><option>same-day</option></select>
      <select id="country"><option>IN</option><option>US</option><option>DE</option><option>UK</option></select><button id="place">Place order</button><p id="done"></p>
      <script>document.getElementById('place').onclick=()=>{const s=document.getElementById('ship').value,c=document.getElementById('country').value;
      document.getElementById('done').textContent=(s==='same-day'&&c!=='IN')?'Same-day delivery is not available in '+c:'Order placed';};</script>`));
  }
  if (pathname === '/signup') {
    return html(res, 200, page('Sign up', `<input id="email"><input id="phone"><button id="check">Check</button><p id="err"></p>
      <script>document.getElementById('check').onclick=()=>{const e=document.getElementById('email').value,p=document.getElementById('phone').value;
      const ok=/^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/i.test(e)&&/^\\+?\\d{10,13}$/.test(p);document.getElementById('err').textContent=ok?'valid':'invalid';};</script>`));
  }
  html(res, 404, page('Not found', '<h1>Not found</h1>'));
}).listen(4466, () => console.log('shop on 4466'));
