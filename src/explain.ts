/**
 * Turns a raw Playwright error message into a short, plain-language explanation.
 * Rule based, no network, no AI. The original message is always kept next to it.
 */

export type ErrorKind =
  | 'not-found' | 'ambiguous' | 'not-visible' | 'blocked' | 'disabled' | 'detached' | 'wrong-element'
  | 'assertion' | 'visual' | 'navigation' | 'network' | 'api' | 'test-timeout' | 'hook-timeout'
  | 'closed' | 'crashed' | 'script' | 'file' | 'thrown';

export interface ErrorExplain {
  kind: ErrorKind;
  /** Short label for a badge, e.g. "Element not found". */
  label: string;
  /** One plain sentence about what happened. */
  summary: string;
  /** What to check first. */
  hint?: string;
  /** The locator involved, when Playwright printed one. */
  locator?: string;
  /** The Playwright call that failed, e.g. locator.click or page.goto. */
  action?: string;
  /** The expect matcher, e.g. toHaveText. */
  matcher?: string;
  timeoutMs?: number;
  url?: string;
}

const LABELS: Record<ErrorKind, string> = {
  'not-found': 'Element not found',
  'ambiguous': 'Selector matches several elements',
  'not-visible': 'Element not visible',
  'blocked': 'Element covered by another element',
  'disabled': 'Element disabled',
  'detached': 'Element disappeared',
  'wrong-element': 'Wrong element type',
  'assertion': 'Assertion failed',
  'visual': 'Screenshot mismatch',
  'navigation': 'Page did not load',
  'network': 'Site unreachable',
  'api': 'API call failed',
  'test-timeout': 'Test timed out',
  'hook-timeout': 'Hook timed out',
  'closed': 'Browser closed early',
  'crashed': 'Browser crashed',
  'script': 'Error in test code',
  'file': 'File not found',
  'thrown': 'Test threw an error',
};

const secs = (ms: number) => (ms >= 1000 ? (ms / 1000).toFixed(ms % 1000 ? 1 : 0) + 's' : ms + 'ms');
const short = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function pick(msg: string, re: RegExp): string | undefined { const m = msg.match(re); return m ? m[1] : undefined; }

export function explainError(raw: string): ErrorExplain | undefined {
  const msg = (raw || '').replace(/\u001b\[[0-9;]*m/g, '').trim();
  if (!msg) return undefined;
  const first = msg.split('\n')[0].trim();
  const out = (kind: ErrorKind, summary: string, hint?: string, extra: Partial<ErrorExplain> = {}): ErrorExplain => ({ kind, label: LABELS[kind], summary, hint, ...extra });

  // Common pieces Playwright prints
  const locator = pick(msg, /(?:waiting for|Locator:\s*|resolved to \d+ elements?:?\s*|locator\(['"]|)(locator\([^\n]*?\))(?:\s|$)/m) ?? pick(msg, /(?:waiting for|Locator:\s*)\s*(getBy\w+\([^\n]*?\)(?:\.\w+\([^\n]*?\))*)/m);
  const timeoutMs = Number(pick(msg, /(?:Timeout|timeout of|Timed out)\s+(\d+)ms/i) ?? 0) || undefined;
  const action = pick(first, /^(?:Error: |TimeoutError: )?([a-zA-Z]+\.[a-zA-Z]+):/);
  const url = pick(msg, /(?:navigating to|at)\s+"?(https?:\/\/[^\s"]+)/);

  // ── Whole-test and hook timeouts ─────────────────────────────────────────
  let m = msg.match(/"(beforeAll|beforeEach|afterAll|afterEach)" hook timeout of (\d+)ms exceeded/);
  if (m) return out('hook-timeout', `The ${m[1]} hook took longer than ${secs(Number(m[2]))}.`, 'Look at what the hook does (login, seeding data, starting a server). Raise the hook timeout only if that work really needs more time.', { timeoutMs: Number(m[2]) });
  m = msg.match(/Test timeout of (\d+)ms exceeded(?: while (?:running|tearing down) "(\w+)" hook)?/);
  if (m) {
    const ms = Number(m[1]);
    if (m[2]) return out('hook-timeout', `The ${m[2]} hook did not finish within the test timeout of ${secs(ms)}.`, 'Check the steps in the hook. A slow login or a waiting call is the usual cause.', { timeoutMs: ms });
    const where = action ? ` It was stuck in ${action}` + (locator ? ` on ${locator}` : '') + '.' : '';
    return out('test-timeout', `The whole test took longer than ${secs(ms)}.${where}`, 'Find the slow step in the Steps list below. Raise timeout in playwright.config.ts only if the flow is really that long.', { timeoutMs: ms, action, locator });
  }

  // ── The browser process died (memory, too many workers): infrastructure, not the app or the test ──
  if (/Target crashed|Page crashed|page has crashed|Renderer process crashed|tab crashed|session deleted because of page crash|chrome not reachable|Browsing context has been discarded/i.test(msg)) return out('crashed', 'The browser crashed while the test was running.', 'Not a bug in the app or the test: the browser process died, usually from memory pressure or too many parallel workers. Re-run it; if it keeps happening, lower workers or give the machine more memory.', { action });

  // ── Cypress (and chai-style assertions): only messages in Cypress's own wording reach these rules ──
  const cy = explainCypress(msg, out);
  if (cy) return cy;

  // ── Strict mode ──────────────────────────────────────────────────────────
  m = msg.match(/strict mode violation: (.+?) resolved to (\d+) elements/s);
  if (m) return out('ambiguous', `${short(m[1].trim())} matched ${m[2]} elements, Playwright needs exactly one.`, 'Make the selector more specific, or pick one with .first(), .nth(i) or a filter such as { hasText }.', { locator: m[1].trim() });

  // ── Assertions (expect) ──────────────────────────────────────────────────
  m = msg.match(/expect\((?:locator|page|received|value)\)\.(\w+)(?:\(\w*\))?/) ?? msg.match(/waiting for expect\((?:locator|page)\)\.(\w+)/);
  if (m || /^Error: expect\(/.test(first) || /^Error: Timed out \d+ms waiting for expect/.test(first)) {
    const matcher = m ? m[1] : undefined;
    const expected = pick(msg, /^Expected(?:[^:\n]{0,40})?:[ \t]*(.+)$/m)?.trim();
    const received = pick(msg, /^Received(?:[^:\n]{0,40})?:[ \t]*(.+)$/m)?.trim();
    const notFound = /element\(s\) not found|locator resolved to 0 elements|not found/i.test(msg) && !/unexpected value/i.test(msg);
    const base: Partial<ErrorExplain> = { matcher, locator, timeoutMs };
    if (matcher === 'toHaveScreenshot' || /Screenshot comparison failed|pixels \(ratio [\d.]+ of all image pixels\) are different/.test(msg)) {
      const px = pick(msg, /(\d+) pixels \(ratio ([\d.]+)/) ;
      return out('visual', px ? `The page looks different from the baseline: ${px} pixels changed.` : 'The page looks different from the baseline screenshot.', 'Open the visual comparison below. If the new look is intended, update the baseline with --update-snapshots.', base);
    }
    if (notFound && locator) return out('not-found', `${locator} was not on the page${timeoutMs ? ' within ' + secs(timeoutMs) : ''}, so ${matcher ?? 'the check'} could not run.`, 'Check the selector, and whether the element is inside an iframe, behind a login, or only shown after a click.', base);
    if (matcher === 'toBeVisible' || (matcher === 'toBeHidden')) {
      const want = matcher === 'toBeVisible' ? 'visible' : 'hidden';
      return out(matcher === 'toBeVisible' ? 'not-visible' : 'assertion', `${locator ?? 'The element'} was expected to be ${want}${timeoutMs ? ' within ' + secs(timeoutMs) : ''} but was ${received ?? (want === 'visible' ? 'hidden' : 'visible')}.`, want === 'visible' ? 'The element may still be loading, be hidden by CSS, or sit inside a closed menu or dialog.' : 'Something kept the element on screen. Check the step that should hide it.', base);
    }
    if (matcher && /^(toHaveURL)$/.test(matcher)) return out('assertion', `The page URL was ${received ?? 'different'}, expected ${expected ?? 'another URL'}.`, 'The navigation may not have happened yet, or it went to a different page (a redirect, a login screen, an error page).', base);
    if (matcher && /^(toHaveCount)$/.test(matcher)) return out('assertion', `${locator ?? 'The selector'} matched ${received ?? 'a different number of'} elements, expected ${expected ?? 'another count'}.`, 'The list may not have finished loading, or the selector also matches other elements.', base);
    if (matcher && /^(toBeEnabled|toBeDisabled|toBeChecked|toBeEditable|toBeFocused|toBeEmpty|toBeAttached|toBeInViewport)$/.test(matcher)) return out('assertion', `${locator ?? 'The element'} was not in the expected state (${matcher.replace(/^toBe/, '').toLowerCase()})${received ? ': it was ' + received : ''}.`, 'Check the step before this one. The element may still be loading or waiting on a previous action.', base);
    if (expected !== undefined && received !== undefined) {
      const what = matcher && /text/i.test(matcher) ? 'text' : matcher && /value/i.test(matcher) ? 'value' : matcher && /attribute/i.test(matcher) ? 'attribute' : matcher && /title/i.test(matcher) ? 'title' : matcher && /class/i.test(matcher) ? 'class' : 'value';
      const who = locator ? locator + ' had the wrong ' + what : 'The ' + what + ' was wrong';
      return out('assertion', `${who}: expected ${short(expected, 80)}, got ${short(received, 80)}.`, /^["']/.test(expected) && /^["']/.test(received) && expected.toLowerCase() === received.toLowerCase() ? 'Only the letter case differs. Use toHaveText with { ignoreCase: true } if that is fine.' : 'Compare expected and received below. A copy change, a data change or a timing issue are the usual causes.', base);
    }
    return out('assertion', `${matcher ? 'expect().' + matcher + '()' : 'An expect()'} did not pass${locator ? ' for ' + locator : ''}.`, 'See the full message below for the expected and received values.', base);
  }

  // ── Navigation and network ───────────────────────────────────────────────
  m = msg.match(/net::(ERR_[A-Z_]+)|NS_ERROR_([A-Z_]+)|Could not connect to server|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|certificate|ERR_CERT/i);
  if (m) {
    const code = (m[1] || m[2] || m[0]).toUpperCase();
    const reason = /REFUSED/.test(code) ? 'nothing is listening on that address' : /NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/.test(code) ? 'the host name could not be resolved' : /CERT/i.test(code) ? 'the TLS certificate was rejected' : /TIMED_OUT|ETIMEDOUT/.test(code) ? 'the connection timed out' : /RESET|ABORTED/.test(code) ? 'the connection was dropped' : 'the connection failed';
    if (action && /^apiRequestContext\./.test(action)) return out('api', `The API request could not be sent: ${reason} (${code}).`, 'Check the base URL and that the API is up. In CI, check that the service started before the tests.', { action, url });
    return out('network', `The browser could not reach ${url ?? 'the site'}: ${reason} (${code}).`, 'Check baseURL, that the app is running, and VPN or proxy settings. In CI, make sure the web server starts before the tests.', { action, url });
  }
  if (action && /^apiRequestContext\./.test(action)) {
    if (/Request timed out|Timeout \d+ms exceeded/.test(msg)) return out('api', `The API request did not answer${timeoutMs ? ' within ' + secs(timeoutMs) : ' in time'}.`, 'The API may be slow or hanging. Check its logs, or raise the request timeout.', { action, url, timeoutMs });
    if (/Request context disposed/.test(msg)) return out('api', 'The API request was made after its request context was closed.', 'Make sure request.dispose() or the end of the test does not run before this call.', { action });
    return out('api', `The API call ${action} failed: ${short(first.replace(/^Error: /, ''))}`, 'See the full message below and the API tab for the request.', { action, url });
  }
  if (action && /^(page|frame)\.(goto|reload|goBack|goForward|waitForURL|waitForLoadState|waitForNavigation)$/.test(action)) {
    if (/Timeout \d+ms exceeded|Navigation timeout/i.test(msg)) return out('navigation', `${url ?? 'The page'} did not finish loading within ${timeoutMs ? secs(timeoutMs) : 'the timeout'}.`, 'The app may be slow, stuck on a request, or redirecting in a loop. Try waitUntil: "domcontentloaded" if the page keeps long-running requests open.', { action, url, timeoutMs });
    if (/interrupted by another navigation/.test(msg)) return out('navigation', 'The page navigated somewhere else while this navigation was in progress.', 'A redirect or a click started another navigation. Wait for the final URL instead.', { action, url });
    return out('navigation', `${action} failed: ${short(first.replace(/^(Error|TimeoutError): /, ''))}`, 'See the full message below.', { action, url });
  }
  if (/Navigation timeout of \d+ms exceeded|page\.waitForNavigation/.test(msg)) return out('navigation', `The page did not finish loading within ${timeoutMs ? secs(timeoutMs) : 'the timeout'}.`, 'The app may be slow or stuck on a request. Check the Network tab in a trace.', { url, timeoutMs });

  // ── Closed / detached ────────────────────────────────────────────────────
  if (/Target page, context or browser has been closed|Target closed|Browser has been closed|Browser closed|browser has disconnected|Page closed|Context closed/i.test(msg)) return out('closed', 'The browser or page was closed before this step could run.', 'A previous step closed it, the test ended early, or the browser crashed. Look at the step just before this one.', { action });
  if (/Execution context was destroyed|most likely because of a navigation/.test(msg)) return out('detached', 'The page navigated away while this step was running.', 'Wait for the navigation to finish (for example await page.waitForURL) before touching the page.', { action, locator });
  if (/not attached to the DOM|element was detached|Element is not attached/i.test(msg)) return out('detached', `${locator ?? 'The element'} was removed from the page while Playwright was using it.`, 'The UI re-rendered the element. Re-locate it after the change, or wait for the update to finish.', { action, locator });

  // ── Action timeouts on a locator: not found / not visible / blocked / disabled ──
  if (action && /Timeout \d+ms exceeded/.test(msg)) {
    const base: Partial<ErrorExplain> = { action, locator, timeoutMs };
    const t = timeoutMs ? ' for ' + secs(timeoutMs) : '';
    if (/intercepts pointer events/.test(msg)) { const by = pick(msg, /\n\s*-?\s*(<[^>]+>)[^\n]*intercepts pointer events/); return out('blocked', `${locator ?? 'The element'} was there, but ${by ? by + ' ' : 'another element '}was covering it, so the ${action.split('.')[1]} never landed.`, 'A modal, cookie banner, toast or loading overlay is on top. Close it first, or wait for it to disappear.', base); }
    if (/element is not visible/.test(msg)) return out('not-visible', `${locator ?? 'The element'} exists but stayed hidden${t}.`, 'It may be inside a closed menu, collapsed section or hidden tab, or hidden by CSS. Open the container first.', base);
    if (/element is not enabled|is disabled/.test(msg)) return out('disabled', `${locator ?? 'The element'} stayed disabled${t}.`, 'A form may be invalid or still loading. Fill the required fields or wait for the button to enable.', base);
    if (/element is outside of the viewport/.test(msg)) return out('not-visible', `${locator ?? 'The element'} was outside the visible area${t}.`, 'Scroll it into view, or check for a fixed layout that keeps it off screen.', base);
    if (/not an? <input>|not an <input>|Element is not an/.test(msg)) return out('wrong-element', `${locator ?? 'The element'} is not the kind of element this action works on.`, 'For example fill() needs an <input> or <textarea>. Check the selector points at the right element.', base);
    if (/waiting for/.test(msg) && !/locator resolved to/.test(msg)) return out('not-found', `${locator ?? 'The element'} was not on the page${timeoutMs ? ' within ' + secs(timeoutMs) : ''}, so ${action} could not run.`, 'Check the selector. The element may be inside an iframe, behind a login, or only shown after another step.', base);
    if (/waiting for element to be visible, enabled and stable/.test(msg)) return out('not-visible', `${locator ?? 'The element'} was found but never became ready (visible, enabled and stable)${timeoutMs ? ' within ' + secs(timeoutMs) : ''}.`, 'The element may be animating, hidden, or disabled. Wait for the animation or the loading state to finish.', base);
    return out('not-found', `${action} did not complete${timeoutMs ? ' within ' + secs(timeoutMs) : ''}${locator ? ' on ' + locator : ''}.`, 'See the call log below for what Playwright was waiting on.', base);
  }
  if (action && /Element is not an? <input>|not an <input>/.test(msg)) return out('wrong-element', `${locator ?? 'The element'} is not the kind of element this action works on.`, 'For example fill() needs an <input> or <textarea>. Check the selector.', { action, locator });
  if (action && /did not find some options|Option .* not found/.test(msg)) return out('assertion', `selectOption could not find the requested option${locator ? ' in ' + locator : ''}.`, 'Check the option value or label. Options may load later than the select element.', { action, locator });

  // ── Files and code errors ────────────────────────────────────────────────
  if (/ENOENT: no such file or directory/.test(msg)) { const f = pick(msg, /open '([^']+)'|'([^']+)'/) ?? pick(msg, /directory, \w+ '([^']+)'/); return out('file', `A file the test needs is missing${f ? ': ' + f : ''}.`, 'Check the path, and that the file is committed or generated before the run (a download, a fixture, a baseline screenshot).'); }
  m = first.match(/^(TypeError|ReferenceError|SyntaxError|RangeError): (.+)$/);
  if (m) {
    const hint = /is not a function/.test(m[2]) ? 'A method is being called on the wrong object, or a helper was not imported.' : /Cannot read propert|of undefined|of null/.test(m[2]) ? 'Something was undefined at that point: an API response, a fixture, a page object field.' : /is not defined/.test(m[2]) ? 'A variable or import is missing.' : /JSON/.test(m[2]) ? 'The response was not valid JSON. It may be an HTML error page.' : 'This is a bug in the test or a helper, not in the app.';
    return out('script', `${m[1]} in the test code: ${short(m[2])}`, hint);
  }
  if (/^Error: (.+)/.test(first) && !/^Error: (locator|page|frame|browser|expect|apiRequestContext)/.test(first)) return out('thrown', short(first.replace(/^Error: /, '')), 'The test (or a helper) threw this error on purpose or via a failed check. The stack trace below points at the line.');
  return out('thrown', short(first), 'See the full message and stack trace below.');
}

type Out = (kind: ErrorKind, summary: string, hint?: string, extra?: Partial<ErrorExplain>) => ErrorExplain;

/** Cypress messages: `Timed out retrying after 4000ms: …`, `cy.click()` failed because …, cy.request / cy.visit /
 *  cy.wait failures, uncaught application errors, and chai assertions (`expected 'a' to equal 'b'`). */
function explainCypress(msg: string, out: Out): ErrorExplain | undefined {
  const body = msg.replace(/^(?:AssertionError|CypressError|Error):\s*/, '');
  const retry = body.match(/^Timed out retrying after (\d+)ms:\s*/);
  const timeoutMs = retry ? Number(retry[1]) : undefined;
  const text = retry ? body.slice(retry[0].length) : body;
  const within = timeoutMs ? ' within ' + secs(timeoutMs) : '';
  const cmd = pick(text, /`?(cy\.\w+)\(\)`?\s+(?:failed|timed out|could not)/);
  const isCy = !!retry || !!cmd || /CypressError|originated from your application code|for your remote page to load|^`?cy\.\w+\(\)/.test(msg);
  const chai = text.match(/^expected ([\s\S]+?) (?:not to|to(?: (not))?) (deeply equal|have length|have text|have value|equal|eql|be|have|include|contain|match|exist)\b\s*([\s\S]*)$/);
  if (!isCy && !chai) return undefined;

  // ── the app threw, not the test ──
  if (/originated from your application code, not from Cypress/.test(msg)) {
    const appErr = pick(msg, /^\s*>\s*(.+)$/m);
    return out('script', `The application threw an uncaught error${appErr ? ': ' + short(appErr, 100) : ''}. Cypress fails the test when the app throws.`, 'Fix the error in the app, or if it is expected, ignore it with Cypress.on(\'uncaught:exception\', () => false) for that test.');
  }
  // ── element lookups ──
  let m = text.match(/Expected to find element: `?([^`\n]+?)`?, but never found it/);
  if (m) return out('not-found', `${m[1]} was not on the page${within}.`, 'Check the selector, and whether the element is inside an iframe, behind a login, or only shown after a click.', { locator: m[1], timeoutMs });
  m = text.match(/Expected to find content: '([^']*)'(?: within the (?:element|selector): ([^\n]+?))?,? but never did/);
  if (m) return out('not-found', `The text "${short(m[1], 60)}" did not appear${m[2] ? ' inside ' + short(m[2].replace(/`/g, ''), 60) : ''}${within}.`, 'Check the expected text (case, spaces) and whether the page finished loading.', { locator: m[2]?.replace(/`/g, ''), timeoutMs });
  m = text.match(/Expected not to find element: `?([^`\n]+?)`?, but it was continuously found/);
  if (m) return out('assertion', `${m[1]} was still on the page${within}, but should have gone.`, 'Something kept it on screen. Check the step that should remove or hide it.', { locator: m[1], timeoutMs });
  m = text.match(/Not enough elements found\. Found '(\d+)', expected '(\d+)'|Too many elements found\. Found '(\d+)', expected '(\d+)'/);
  if (m) return out('assertion', `The selector matched ${m[1] ?? m[3]} elements, expected ${m[2] ?? m[4]}${within}.`, 'The list may not have finished loading, or the selector also matches other elements.', { timeoutMs });
  // ── actions: cy.click() failed because this element … ──
  if (cmd && /failed because/.test(text)) {
    const el = pick(text, /this element:?\s*\n*\s*`?(<[^`\n]+>)`?/) ?? pick(text, /`(<[^`\n]+>)`/);
    const base = { action: cmd, locator: el, timeoutMs };
    if (/is being covered by another element/.test(text)) { const by = pick(text, /covered by another element:?\s*\n*\s*`?(<[^`\n]+>)`?/); return out('blocked', `${cmd}() could not reach ${el ?? 'the element'}: ${by ? short(by, 60) : 'another element'} is on top of it.`, 'A dialog, banner, overlay or spinner is in the way. Close or wait for it first.', base); }
    if (/is not visible/.test(text)) return out('not-visible', `${cmd}() could not use ${el ?? 'the element'} because it is not visible.`, 'It may be hidden by CSS, off screen in a closed menu, or still animating in.', base);
    if (/is disabled/.test(text)) return out('disabled', `${cmd}() could not use ${el ?? 'the element'} because it is disabled.`, 'The form may need another field filled first, or the app is still busy.', base);
    if (/page updated while this command was executing|detached from the DOM/.test(text)) return out('detached', `The element was re-rendered while ${cmd}() was using it.`, 'The UI replaced the element. Query it again after the change, or wait for the update to finish.', base);
    if (/can only be called on|requires a DOM element|requires a valid subject|can only be called on a single element/.test(text)) return out('wrong-element', `${cmd}() was used on something it does not work on.`, 'Check the command before it: the subject may be several elements, or not an element at all.', base);
  }
  // ── cy.request / cy.visit / cy.wait ──
  if (cmd === 'cy.request') {
    const url = pick(text, /failed on:\s*\n+\s*(https?:\/\/\S+)/);
    const st = text.match(/>\s*(\d{3}):\s*([^\n]*)/);
    if (/timed out waiting/.test(text)) return out('api', `The API request${url ? ' to ' + url : ''} did not answer in time.`, 'The API may be slow or hanging. Check its logs, or raise the timeout of cy.request.', { action: cmd, url });
    if (st) return out('api', `The API answered ${st[1]}${st[2] ? ' ' + st[2].trim() : ''}${url ? ' for ' + url : ''}.`, Number(st[1]) >= 500 ? 'A server error: check the API logs for this request.' : 'Check the request (URL, auth, body). If this status is expected, pass failOnStatusCode: false.', { action: cmd, url });
    if (/failed without a response|ECONNREFUSED|ENOTFOUND/.test(text)) return out('network', `The API${url ? ' at ' + url : ''} could not be reached.`, 'Check the URL and that the API is up. In CI, make sure it starts before the tests.', { action: cmd, url });
  }
  if (cmd === 'cy.visit' || /for your remote page to load/.test(text)) {
    const url = pick(text, /failed trying to load:\s*\n+\s*(https?:\/\/\S+)/);
    const st = text.match(/>\s*(\d{3}):\s*([^\n]*)/);
    if (/for your remote page to load/.test(text)) return out('navigation', `The page did not finish loading${pick(text, /waiting `?(\d+)ms`?/) ? ' within ' + secs(Number(pick(text, /waiting `?(\d+)ms`?/))) : ''}.`, 'The app may be slow or stuck on a request. Raise pageLoadTimeout only if the page is really that slow.', { action: 'cy.visit', url });
    if (/failed without a response|ECONNREFUSED|ENOTFOUND|ECONNRESET/.test(text)) return out('network', `The browser could not reach ${url ?? 'the site'}.`, 'Check baseUrl and that the app is running. In CI, make sure the web server starts before the tests.', { action: 'cy.visit', url });
    if (st) return out('navigation', `${url ?? 'The page'} answered ${st[1]}${st[2] ? ' ' + st[2].trim() : ''}.`, 'Check the URL. If this status is expected, pass failOnStatusCode: false to cy.visit.', { action: 'cy.visit', url });
  }
  m = text.match(/`?cy\.wait\(\)`? timed out waiting `?(\d+)ms`? for the \w+ (request|response) to the route: `?([^`\s.]+)`?/);
  if (m) return out('api', `No ${m[2]} for the route "${m[3]}" came within ${secs(Number(m[1]))}.`, m[2] === 'request' ? 'The app never made that call: check the cy.intercept() pattern (method, URL) and that the action triggering it ran.' : 'The call was made but did not answer in time: check the API.', { action: 'cy.wait', timeoutMs: Number(m[1]) });
  if (cmd === 'cy.task' && /failed with the following error/.test(text)) return out('script', `The task ${pick(text, /cy\.task\('([^']+)'/) ?? ''} threw in the Cypress Node process.`.replace('task  ', 'task '), 'See the full message below; the task code lives in setupNodeEvents.', { action: 'cy.task' });

  // ── assertions (chai / should) ──
  if (chai) {
    const [, actual, notAfter, verb, restRaw] = chai;
    const not = notAfter || (/^expected [\s\S]+? not to /.test(text) ? 'not ' : undefined);
    const rest = restRaw.split('\n')[0].replace(/,\s*but[\s\S]*$/, '').replace(/ in the DOM$/, '').trim();
    const butWas = pick(text, /but the (?:text|value) was '([^']*)'/);
    const el = /^'?<[^>]+>'?$/.test(actual.trim()) ? actual.replace(/'/g, '') : undefined;
    const base = { locator: el, timeoutMs };
    if (verb === 'exist') return out(not ? 'assertion' : 'not-found', not ? `${el ?? short(actual, 60)} still existed${within}.` : `${el ?? short(actual, 60)} did not exist${within}.`, not ? 'Something kept it on the page. Check the step that should remove it.' : 'Check the selector and whether the element appears only after another step.', base);
    if (verb === 'be' && /^'?visible'?$/.test(rest) && !not) return out('not-visible', `${el ?? 'The element'} was expected to be visible${within} but was not.`, 'It may still be loading, be hidden by CSS, or sit inside a closed menu or dialog.', base);
    if ((verb === 'have text' || verb === 'have value') && butWas !== undefined) return out('assertion', `${el ?? 'The element'} had the wrong ${verb === 'have text' ? 'text' : 'value'}: expected ${short(rest, 60)}, got '${short(butWas, 60)}'.`, 'Compare expected and received below. A copy change, a data change or a timing issue are the usual causes.', base);
    if (/equal|eql/.test(verb) && !not) return out('assertion', `Expected ${short(rest, 70)}, got ${short(actual, 70)}.`, 'Compare the two values in the full message below.', base);
    if (/include|contain|match/.test(verb)) return out('assertion', `${short(actual, 70)} did ${not ? '' : 'not '}${verb === 'match' ? 'match' : 'contain'} ${short(rest, 70)}${within}.`, /^'https?:/.test(actual) ? 'The page may not have navigated yet, or went somewhere else (a redirect, a login screen, an error page).' : 'Compare the two values in the full message below.', base);
    return out('assertion', `An assertion did not pass: expected ${short(actual, 60)} to ${not ?? ''}${verb} ${short(rest, 60)}${within}.`.replace(/\s+\./, '.'), 'See the full message below.', base);
  }
  return undefined;
}
