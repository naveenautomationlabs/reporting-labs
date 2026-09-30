const DEFAULT_KEYS = ['password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'api_key', 'api-key', 'authorization', 'auth', 'cookie', 'set-cookie', 'session', 'credential', 'private', 'ssn', 'cvv', 'card'];

/** Values that are secrets on their own, whatever the surrounding text. */
const VALUE_PATTERNS: RegExp[] = [
  /\b(Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+\/=-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,                       // JWT
  /\b(?:sk|pk|rk)[-_](?:live|test)?[-_]?[A-Za-z0-9]{12,}\b/g,                              // Stripe-style keys
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,                                        // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,                                                      // Slack
  /\bAKIA[0-9A-Z]{16}\b/g,                                                                 // AWS access key id
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,                                                           // Google API key
  /\bya29\.[0-9A-Za-z_-]{20,}\b/g,                                                         // Google OAuth token
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,                                                         // GitLab
  /\bnpm_[A-Za-z0-9]{30,}\b/g,                                                             // npm
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,                                       // SendGrid
];

/** 13 to 19 digits, spaces or dashes between groups allowed; masked only when the Luhn check passes. */
const CARD_NUMBER = /(?<![\w.-])\d(?:[ -]?\d){12,18}(?![\w.-])/g;
const luhn = (s: string) => { let sum = 0, dbl = false, digits = 0; for (let i = s.length - 1; i >= 0; i--) { const c = s.charCodeAt(i); if (c < 48 || c > 57) continue; let d = c - 48; digits++; if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; } return digits >= 13 && sum % 10 === 0; };

/** Auth schemes and placeholders that follow a sensitive key but are not the secret. */
const NOT_A_VALUE = new Set(['bearer', 'basic', 'digest', 'token', 'undefined', 'redacted', 'hidden', 'secret', 'password']);

/** Words after "password is ..." that are plainly not a secret. */
const NOT_A_SECRET = new Set(['valid', 'invalid', 'visible', 'hidden', 'required', 'optional', 'missing', 'empty', 'null', 'undefined', 'none',
  'correct', 'incorrect', 'wrong', 'right', 'expired', 'set', 'unset', 'not', 'present', 'absent', 'ok', 'true', 'false', 'masked', 'blank',
  'too', 'the', 'a', 'an', 'same', 'different', 'changed', 'unchanged', 'shown', 'displayed', 'accepted', 'rejected', 'weak', 'strong']);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface MaskerOptions {
  /** Literal values to blank wherever they appear, keyed or not. */
  knownValues?: string[];
  /** Learn the values of PASSWORD / API_TOKEN / *_SECRET environment variables (default true). */
  fromEnv?: boolean;
}

export function makeMasker(extraKeys: string[] = [], opts: MaskerOptions = {}) {
  const keys = [...DEFAULT_KEYS, ...extraKeys.map(k => k.toLowerCase())];
  const isSensitive = (k: string) => { const l = k.toLowerCase(); return keys.some(s => l === s || l.includes(s)); };

  // ---- values already known to be secrets ----
  // Every value the key patterns have masked, the values under sensitive keys in data blocks and API
  // calls, `maskValues`, and sensitive-looking environment variables. Once known, a value is blanked
  // wherever it shows up later, keyed or not: "Logging in as admin / s3cret" is masked because
  // "password=s3cret" (or a PASSWORD env var) came first.
  const learned = new Set<string>();
  let learnedRe: RegExp | null = null, learnedDirty = false;
  const MAX_LEARNED = 500;
  const learn = (value: unknown, minLength = 4) => {
    if (typeof value !== 'string') return;
    let v = value.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v.length < minLength || v.includes('***') || !/[A-Za-z0-9]/.test(v) || learned.size >= MAX_LEARNED) return;
    const word = v.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (NOT_A_SECRET.has(word) || NOT_A_VALUE.has(word)) return;
    if (!learned.has(v)) { learned.add(v); learnedDirty = true; }
  };
  const learnedPattern = () => {
    if (!learnedDirty) return learnedRe;
    const vals = [...learned].sort((a, b) => b.length - a.length);   // longest first
    learnedRe = vals.length ? new RegExp(vals.map(v => /^[A-Za-z0-9_]+$/.test(v) ? `(?<![A-Za-z0-9_])${esc(v)}(?![A-Za-z0-9_])` : esc(v)).join('|'), 'g') : null;
    learnedDirty = false;
    return learnedRe;
  };
  for (const v of opts.knownValues ?? []) learn(v, 4);
  if (opts.fromEnv !== false) {
    // PASSWORD=…, API_TOKEN=…, OAUTH_CLIENT_SECRET=… in the environment: the values a CI job injects are the
    // ones that end up in log lines. Short values are skipped so a plain word is not blanked everywhere.
    try { for (const [k, v] of Object.entries(process.env)) if (isSensitive(k)) learn(v, 6); } catch { /* no env access */ }
  }

  // Key names as they appear in free text: password, X-Api-Key, access_token, userPassword, "password", db.password...
  // `auth`, `otp`, `pin`... are matched as whole words only, so "author" or "pinned" stay untouched.
  const compound = ['password', 'passwort', 'passwd', 'pwd', 'passcode', 'secret', 'token', 'api[ _-]?key', 'cookie', 'credentials?', 'private[ _-]?key', 'access[ _-]?key', 'session[ _-]?id', '(?<![A-Za-z])auth(?![A-Za-z])', ...extraKeys.map(esc)];
  const exact = ['authorization', 'pass', 'pw', 'otp', 'pin', 'cvv', 'ssn'];
  const KEY = `(?:[\\w.-]*?(?:${compound.join('|')})[\\w.-]*|${exact.join('|')})`;
  // key = value | key: value | "key": "value" | key => value | key -> value   (value runs to a delimiter; a closing quote stays)
  const KV = new RegExp(`(["']?)\\b(${KEY})\\b(["']?)(\\s*(?:=>|->|[=:])\\s*)(["']?)([^"'\\s&;,}\\]\\)]+)`, 'gi');
  // password is S3cret | token was abc | password 'S3cret' | with password S3cret@123 (only when the value looks like a secret)
  const SPOKEN_KEYS = ['password', 'passwort', 'passwd', 'pwd', 'pass', 'passcode', 'secret', 'token', 'api[ _-]?key', 'access[ _-]?key', 'otp', 'pin', 'cvv', ...extraKeys.map(esc)];
  // "password is x", "password for user admin is x", "token: x", "the token is: x", "with pwd x"
  const SPOKEN = new RegExp(`\\b(${SPOKEN_KEYS.join('|')})(s?\\b(?:\\s+for\\s+(?:\\S+\\s+){1,3}?(?:[:=]|(?:is|was)\\b)\\s*|\\s*[:=]?\\s*(?:(?:is|was|of|as)\\b\\s*)?[:=]?\\s*)['"]?)((?=[A-Za-z0-9])[^\\s'",;]+)`, 'gi');
  // user:password@host in a URL, curl -u user:password, "credentials admin:x"
  const URL_USERINFO = /(:\/\/[^\s/:@]+:)([^\s@]+)(@)/g;
  const CLI_USER = /((?:^|\s)(?:-u|--user|--username|--credentials?)\s+[^\s:]+:)(\S+)/g;
  const CREDS_PAIR = /\b(credentials?|creds|login)(\s*[:=]?\s+[^\s:'"]+:)([^\s'",;]+)/gi;
  // The value comes first: "Typed s3cret into password field", "Entered x in #password"
  const VALUE_THEN_KEY = /([^\s'"(]+)(\s+(?:into|in|to|for|as)\s+(?:the\s+)?['"#]?[\w-]*?(?:password|passwd|pwd|secret|token|otp|pin)\b)/gi;
  const looksSecret = (v: string) => !/\s/.test(v) && (/\d/.test(v) && v.length >= 4 || /[^A-Za-z0-9]/.test(v) && v.length >= 6 || /[a-z][A-Z]|[A-Z][a-z].*[A-Z]/.test(v) && v.length >= 8);
  // Assertion output: when the text talks about a password/token/secret, the compared values are that secret.
  //   expect(token, 'token should match').toBe('x')  ->  Expected: "x" / Received: "tok_9f8e..."
  const MENTIONS_SECRET = new RegExp(`\\b(?:${SPOKEN_KEYS.join('|')})s?\\b`, 'i');
  const COMPARED = /\b(Expected|Received|Actual|expected|received|actual|got)(\s*[:=]\s*)(["'\u201c]?)([^"'\u201d\s]+)/g;

  const maskStr = (input: string) => {
    let s = input;
    s = s.replace(CARD_NUMBER, m => luhn(m) ? '****' : m);
    for (const re of VALUE_PATTERNS) s = s.replace(re, m => {
      if (/^(Bearer|Basic|Digest|Token)\s/i.test(m)) { const i = m.search(/\s/); learn(m.slice(i).trim()); return m.slice(0, i) + ' ****'; }
      learn(m); return '****';
    });
    s = s.replace(URL_USERINFO, (_m, a, value, b) => { learn(value); return `${a}****${b}`; });
    s = s.replace(CLI_USER, (_m, a, value) => { learn(value); return `${a}****`; });
    s = s.replace(CREDS_PAIR, (_m, a, b, value) => { learn(value); return `${a}${b}****`; });
    s = s.replace(KV, (_m, q1, key, q2, sep, q3, value) => { learn(value); return `${q1}${key}${q2}${sep}${q3}****`; });
    s = s.replace(SPOKEN, (m, key, between, value) => {
      const word = value.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (NOT_A_SECRET.has(word) || value.includes('*')) return m;
      const explicit = /\b(is|was|of|as)\b|['"]$|[:=]\s*$/.test(between);
      if (explicit || looksSecret(value)) { learn(value); return `${key}${between}****`; }
      return m;
    });
    s = s.replace(VALUE_THEN_KEY, (m, value, rest) => {
      const word = value.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (NOT_A_SECRET.has(word) || value.includes('*') || !looksSecret(value)) return m;
      learn(value); return `****${rest}`;
    });
    if (MENTIONS_SECRET.test(s)) s = s.replace(COMPARED, (m, label, sep, q, value) => { if (!looksSecret(value)) return m; learn(value); return `${label}${sep}${q}****`; });
    const known = learnedPattern();
    if (known) s = s.replace(known, '****');
    return s;
  };

  const mask = (v: unknown, key = ''): unknown => {
    if (key && isSensitive(key)) { learn(v); return '****'; }
    if (typeof v === 'string') return maskStr(v);
    if (Array.isArray(v)) return v.map(x => mask(x));
    if (v && typeof v === 'object') { const o: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = mask(x, k); return o; }
    return v;
  };
  return { mask, maskStr, isSensitive, learn };
}

export function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const split = (l: string) => { const out: string[] = []; let cur = '', q = false; for (const c of l) { if (c === '"') q = !q; else if (c === ',' && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(s => s.trim()); };
  const [head, ...body] = lines.map(split);
  return { columns: head ?? [], rows: body };
}
