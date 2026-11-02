/**
 * Automatic API capture. Import once from playwright.config.ts (or reporting-labs.config.ts):
 *
 *   import 'reporting-labs/auto';
 *
 * From then on every call made through Playwright's `request` fixture, `page.request`,
 * `context.request` or `playwright.request.newContext()` lands in the report with method,
 * URL, status, timing, headers and both bodies. No wrapper, no custom `test` import.
 * The reporter masks Authorization/Cookie headers, tokens and secret-looking fields.
 *
 * It also listens to the browser while a test runs and records what the app did wrong: uncaught
 * JavaScript errors, console.error messages and failed network requests (no response, or a 4xx/5xx),
 * each with its time, so the report can show what happened right before a failure.
 *
 * Playwright loads the config in every worker, so the patch runs where the tests run.
 */
import type { ApiCall } from './types';

type AnyRecord = Record<string, any>;
interface ResponseLike { status(): number; headers(): Record<string, string>; url(): string; body(): Promise<Buffer> }
interface ContextLike { fetch(u: unknown, o?: AnyRecord): Promise<ResponseLike>; dispose(): Promise<void> }

const PATCHED = '__reportingLabsApiCapture';
const MAX_BODY = 200 * 1024;
const TEXT_TYPES = /json|text|xml|html|javascript|x-www-form-urlencoded|graphql/i;

function pw(): AnyRecord {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@playwright/test');
}

function currentTest(): { testId: string; retry: number; attach(name: string, o: { body: string; contentType: string }): Promise<void> } | undefined {
  try { return pw().test.info(); } catch { return undefined; }
}

function describeBody(v: unknown): unknown {
  if (v == null) return undefined;
  if (Buffer.isBuffer(v)) return `<binary ${v.length} bytes>`;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } }
  return v;
}

function multipart(mp: AnyRecord): unknown {
  const out: AnyRecord = {};
  const entries: [string, any][] = typeof FormData !== 'undefined' && mp instanceof FormData ? Array.from(mp.entries()) : Object.entries(mp ?? {});
  for (const [k, v] of entries) {
    if (typeof File !== 'undefined' && v instanceof File) out[k] = `<file ${v.name} ${v.size} bytes>`;
    else if (v && typeof v === 'object' && ('buffer' in v || 'name' in v)) out[k] = `<file ${v.name ?? ''}${v.buffer ? ' ' + v.buffer.length + ' bytes' : ''}>`;
    else out[k] = v;
  }
  return out;
}

function requestFrom(urlOrRequest: unknown, options: AnyRecord) {
  const req = urlOrRequest && typeof urlOrRequest === 'object' && typeof (urlOrRequest as any).url === 'function' ? (urlOrRequest as AnyRecord) : undefined;
  const method = String(options.method ?? (req ? req.method() : 'GET')).toUpperCase();
  let url = req ? req.url() : String(urlOrRequest);
  const params = options.params;
  if (params instanceof URLSearchParams) { const q = params.toString(); if (q) url += (url.includes('?') ? '&' : '?') + q; }
  else if (params && typeof params === 'object') {
    const q = Object.entries(params as AnyRecord).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    if (q) url += (url.includes('?') ? '&' : '?') + q;
  }
  const headers: Record<string, string> = { ...(req ? req.headers() : {}), ...(options.headers ?? {}) };
  const hasType = Object.keys(headers).some(h => h.toLowerCase() === 'content-type');
  let body: unknown;
  if (options.data !== undefined) { body = describeBody(options.data); if (!hasType && typeof options.data === 'object' && !Buffer.isBuffer(options.data)) headers['content-type'] = 'application/json'; }
  else if (options.form !== undefined) { body = options.form instanceof URLSearchParams ? Object.fromEntries(options.form) : options.form; if (!hasType) headers['content-type'] = 'application/x-www-form-urlencoded'; }
  else if (options.multipart !== undefined) { body = multipart(options.multipart); if (!hasType) headers['content-type'] = 'multipart/form-data'; }
  else if (req) body = describeBody(req.postData());
  return { method, url, headers, body };
}

async function responseBody(res: ResponseLike): Promise<unknown> {
  const type = res.headers()['content-type'] ?? '';
  const len = Number(res.headers()['content-length'] ?? 0);
  if (type && !TEXT_TYPES.test(type)) return `<${type.split(';')[0]}${len ? ` ${len} bytes` : ''}>`;
  try {
    const buf = await res.body();
    if (buf.length > MAX_BODY) return buf.subarray(0, MAX_BODY).toString('utf8') + `\n… truncated (${buf.length} bytes)`;
    const text = buf.toString('utf8');
    if (!text) return undefined;
    try { return JSON.parse(text); } catch { return text; }
  } catch { return undefined; }
}

async function record(call: ApiCall) {
  const info = currentTest();
  if (!info) return;
  try { await info.attach(`${call.method} ${call.url}`, { body: JSON.stringify(call), contentType: 'application/x-rl-api' }); } catch { /* test already finished */ }
}

/** Patch the shared APIRequestContext prototype (all contexts in this process) once. */
function patchContext(ctx: ContextLike) {
  let proto: AnyRecord | null = Object.getPrototypeOf(ctx);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'fetch')) proto = Object.getPrototypeOf(proto);
  if (!proto || proto[PATCHED]) return;
  const original: ContextLike['fetch'] = proto.fetch;
  proto.fetch = async function patchedFetch(this: ContextLike, urlOrRequest: unknown, options: AnyRecord = {}) {
    if (!currentTest()) return original.call(this, urlOrRequest, options);
    const t0 = Date.now();
    let req: ReturnType<typeof requestFrom> | undefined;
    try { req = requestFrom(urlOrRequest, options); } catch { /* record nothing */ }
    let res: ResponseLike | undefined; let err: unknown;
    try { res = await original.call(this, urlOrRequest, options); } catch (e) { err = e; }
    if (req) {
      const call: ApiCall = { method: req.method, url: res ? res.url() : req.url, duration: Date.now() - t0, requestHeaders: req.headers, requestBody: req.body };
      if (res) { call.status = res.status(); call.responseHeaders = res.headers(); call.responseBody = await responseBody(res); }
      else call.responseBody = 'Request failed: ' + (err instanceof Error ? err.message : String(err)).replace(/\u001b\[[0-9;]*m/g, '');
      await record(call);
    }
    if (err) throw err;
    return res as ResponseLike;
  };
  proto[PATCHED] = true;
}

/* ---------- what the browser saw ---------- */
const WATCHED = '__reportingLabsBrowserEvents';
const MAX_EVENTS = 50;                      // per test attempt: a page that logs an error every frame stays readable
const seen = new Map<string, number>();
const oneLine = (s: unknown, max = 2000) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '').slice(0, max);

/** One browser event, attached to the running test with its time. Nothing while no test runs. */
function note(ev: { kind: 'error' | 'console' | 'request'; text: string; url?: string; method?: string; status?: number; stack?: string }) {
  const info = currentTest();
  if (!info) return;
  const key = info.testId + ':' + info.retry;
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  if (n > MAX_EVENTS) return;
  info.attach('rl:browser', { body: JSON.stringify({ t: Date.now(), ...ev }), contentType: 'application/x-rl-browser' }).catch(() => { /* test already finished */ });
}

/** A recorded page opened. Playwright names the test's videos video.webm, video-1.webm, ... in the order their pages
 *  opened, so the n-th note here is when video n starts: the report can then play a popup's recording in step too. */
const pagesSeen = new Map<string, number>();
function notePage() {
  const info = currentTest();
  if (!info) return;
  const key = info.testId + ':' + info.retry;
  const i = pagesSeen.get(key) ?? 0;
  pagesSeen.set(key, i + 1);
  info.attach('rl:page', { body: JSON.stringify({ i, t: Date.now() }), contentType: 'application/x-rl-page' }).catch(() => { /* test already finished */ });
}

/** Listen to a browser context: uncaught page errors, console.error, and requests that failed or got 4xx/5xx. */
function watchContext(ctx: AnyRecord) {
  if (!ctx || typeof ctx.on !== 'function' || ctx[WATCHED]) return;
  ctx[WATCHED] = true;
  const onPage = (page: AnyRecord) => {
    if (safe(() => page.video())) notePage();
    page.on('pageerror', (err: Error) => note({ kind: 'error', text: oneLine(err?.message || err), stack: oneLine(err?.stack, 4000), url: safe(() => page.url()) }));
    page.on('console', (msg: AnyRecord) => {
      if (msg.type() !== 'error') return;
      // the browser's own note for a request that got 4xx/5xx: the request is already listed
      if (/^Failed to load resource\b/.test(String(msg.text()))) return;
      const loc = safe(() => msg.location()) as AnyRecord | undefined;
      note({ kind: 'console', text: oneLine(msg.text()), url: loc?.url ? `${loc.url}${loc.lineNumber ? ':' + loc.lineNumber : ''}` : undefined });
    });
  };
  try { for (const p of ctx.pages()) onPage(p); } catch { /* no pages yet */ }
  ctx.on('page', onPage);
  ctx.on('requestfailed', (req: AnyRecord) => {
    const why = safe(() => req.failure()?.errorText) as string | undefined;
    if (why && /ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(why)) return;   // navigating away, not an app problem
    note({ kind: 'request', method: req.method(), url: req.url(), text: why || 'Request failed' });
  });
  ctx.on('response', (res: AnyRecord) => {
    const status = res.status();
    if (status < 400 || /\/favicon\.ico(\?|$)/.test(res.url())) return;
    note({ kind: 'request', method: safe(() => res.request().method()) as string, url: res.url(), status, text: safe(() => res.statusText()) as string || '' });
  });
}

function safe<T>(fn: () => T): T | undefined { try { return fn(); } catch { return undefined; } }

/** Wrap `obj[name]` (found on the prototype chain) so `after(result)` sees each resolved return value. */
function wrapAsync(obj: AnyRecord, name: string, after: (result: any) => void) {
  let proto: AnyRecord | null = obj;
  while (proto && !Object.prototype.hasOwnProperty.call(proto, name)) proto = Object.getPrototypeOf(proto);
  if (!proto || typeof proto[name] !== 'function' || proto[name][PATCHED]) return;
  const original = proto[name];
  const wrapped = async function (this: unknown, ...args: unknown[]) {
    const result = await original.apply(this, args);
    try { after(result); } catch { /* never break the caller */ }
    return result;
  };
  (wrapped as AnyRecord)[PATCHED] = true;
  proto[name] = wrapped;
}

/**
 * Hook the places an APIRequestContext can come from, and patch the shared prototype the
 * first time one shows up:
 *   - playwright.request.newContext()        (the `request` fixture, manual contexts)
 *   - browser.newContext() / launchPersistentContext() / connect*()   (page.request, context.request)
 *
 * No context is created here. An earlier version made a throwaway context at import time and
 * disposed it; when that dispose raced with the test runner's tracing bookkeeping the runner
 * tried to start a trace on a closed context and every test failed with
 * "apiRequestContext._wrapApiCall: Target page, context or browser has been closed".
 */
function install() {
  let api: AnyRecord;
  try { api = pw(); } catch { return; }
  const { request, chromium, firefox, webkit } = api;
  if (request && typeof request.newContext === 'function') wrapAsync(request, 'newContext', ctx => patchContext(ctx));
  const onBrowser = (browser: AnyRecord) => {
    if (!browser || typeof browser.newContext !== 'function') return;
    wrapAsync(browser, 'newContext', ctx => { if (ctx?.request) patchContext(ctx.request); watchContext(ctx); });
    try { for (const ctx of browser.contexts()) { if (ctx?.request) patchContext(ctx.request); watchContext(ctx); } } catch { /* not a browser */ }
  };
  for (const bt of [chromium, firefox, webkit]) {
    if (!bt) continue;
    wrapAsync(bt, 'launch', onBrowser);
    wrapAsync(bt, 'connect', onBrowser);
    wrapAsync(bt, 'connectOverCDP', onBrowser);
    wrapAsync(bt, 'launchPersistentContext', ctx => { if (ctx?.request) patchContext(ctx.request); watchContext(ctx); });
  }
}

install();
