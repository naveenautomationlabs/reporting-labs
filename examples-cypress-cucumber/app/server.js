// A tiny shop: a login page and two API routes, so the example runs offline. Started by cypress.config.js.
const http = require('http');

const page = body => `<!doctype html><html><head><title>Shop</title></head><body>${body}</body></html>`;

function start(port) {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/users')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify([{ id: 1, name: 'Asha', password: 'Demo-Pass-123' }]));
    }
    if (req.url.startsWith('/api/orders')) {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'database unavailable' }));
    }
    if (req.url.startsWith('/login')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(page(`<h1>Login</h1>
        <input id="user" placeholder="user"> <input id="pass" type="password" placeholder="password">
        <button id="go" onclick="document.querySelector('h1').textContent='Welcome'">Sign in</button>
        <label><input id="remember" type="checkbox"> Remember me</label>`));
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(page('<h1>Not found</h1>'));
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

module.exports = { start };
