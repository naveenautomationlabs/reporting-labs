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

/** Words after "password is ..." that are plainly not a secret. */
const NOT_A_SECRET = new Set(['valid', 'invalid', 'visible', 'hidden', 'required', 'optional', 'missing', 'empty', 'null', 'undefined', 'none',
  'correct', 'incorrect', 'wrong', 'right', 'expired', 'set', 'unset', 'not', 'present', 'absent', 'ok', 'true', 'false', 'masked', 'blank',
  'too', 'the', 'a', 'an', 'same', 'different', 'changed', 'unchanged', 'shown', 'displayed', 'accepted', 'rejected', 'weak', 'strong']);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function makeMasker(extraKeys: string[] = []) {
  const keys = [...DEFAULT_KEYS, ...extraKeys.map(k => k.toLowerCase())];
  const isSensitive = (k: string) => { const l = k.toLowerCase(); return keys.some(s => l === s || l.includes(s)); };

  // Key names as they appear in free text: password, X-Api-Key, access_token, userPassword, "password", db.password...
  // `auth`, `otp`, `pin`... are matched as whole words only, so "author" or "pinned" stay untouched.
  const compound = ['password', 'passwd', 'pwd', 'passcode', 'secret', 'token', 'api[_-]?key', 'cookie', 'credentials?', 'private[_-]?key', 'access[_-]?key', 'session[_-]?id', ...extraKeys.map(esc)];
  const exact = ['authorization', 'auth', 'otp', 'pin', 'cvv', 'ssn'];
  const KEY = `(?:[\\w.-]*?(?:${compound.join('|')})[\\w-]*|${exact.join('|')})`;
  // key = value | key: value | "key": "value" | key => value | key -> value   (value runs to a delimiter; a closing quote stays)
  const KV = new RegExp(`(["']?)\\b(${KEY})\\b(["']?)(\\s*(?:=>|->|[=:])\\s*)(["']?)([^"'\\s&;,}\\]\\)]+)`, 'gi');
  // password is S3cret | token was abc | password 'S3cret' | with password S3cret@123 (only when the value looks like a secret)
  const SPOKEN_KEYS = ['password', 'passwd', 'pwd', 'passcode', 'secret', 'token', 'api[ _-]?key', 'access[ _-]?key', 'otp', 'pin', 'cvv', ...extraKeys.map(esc)];
  const SPOKEN = new RegExp(`\\b(${SPOKEN_KEYS.join('|')})(s?\\b\\s+(?:is|was|of|as)?\\s*['"]?)([^\\s'",;]+)`, 'gi');
  const looksSecret = (v: string) => !/\s/.test(v) && (/\d/.test(v) && v.length >= 4 || /[^A-Za-z0-9]/.test(v) && v.length >= 6 || /[a-z][A-Z]|[A-Z][a-z].*[A-Z]/.test(v) && v.length >= 8);
  // Assertion output: when the text talks about a password/token/secret, the compared values are that secret.
  //   expect(token, 'token should match').toBe('x')  ->  Expected: "x" / Received: "tok_9f8e..."
  const MENTIONS_SECRET = new RegExp(`\\b(?:${SPOKEN_KEYS.join('|')})s?\\b`, 'i');
  const COMPARED = /\b(Expected|Received|Actual|expected|received|actual|got)(\s*[:=]\s*)(["'\u201c]?)([^"'\u201d\s]+)/g;

  const maskStr = (input: string) => {
    let s = input;
    for (const re of VALUE_PATTERNS) s = s.replace(re, m => /^(Bearer|Basic|Digest|Token)\s/i.test(m) ? m.split(/\s+/)[0] + ' ****' : '****');
    s = s.replace(KV, (_m, q1, key, q2, sep, q3, _value) => `${q1}${key}${q2}${sep}${q3}****`);
    s = s.replace(SPOKEN, (m, key, between, value) => {
      const word = value.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (NOT_A_SECRET.has(word) || word === '****' || value === '****') return m;
      const explicit = /\b(is|was|of|as)\b|['"]$/.test(between);
      return explicit || looksSecret(value) ? `${key}${between}****` : m;
    });
    if (MENTIONS_SECRET.test(s)) s = s.replace(COMPARED, (m, label, sep, q, value) => looksSecret(value) ? `${label}${sep}${q}****` : m);
    return s;
  };

  const mask = (v: unknown, key = ''): unknown => {
    if (key && isSensitive(key)) return '****';
    if (typeof v === 'string') return maskStr(v);
    if (Array.isArray(v)) return v.map(x => mask(x));
    if (v && typeof v === 'object') { const o: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = mask(x, k); return o; }
    return v;
  };
  return { mask, maskStr, isSensitive };
}

export function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const split = (l: string) => { const out: string[] = []; let cur = '', q = false; for (const c of l) { if (c === '"') q = !q; else if (c === ',' && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(s => s.trim()); };
  const [head, ...body] = lines.map(split);
  return { columns: head ?? [], rows: body };
}
