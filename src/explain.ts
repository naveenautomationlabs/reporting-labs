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
