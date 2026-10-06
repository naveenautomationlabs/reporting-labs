import * as fs from 'fs';

/**
 * Meta written as a comment right above a test or describe, so a team can tag tests without calling meta():
 *
 *   /**
 *    * @owner naveen  @priority P0  @jira SHOP-12
 *    * @smoke
 *    *\/
 *   test('places an order', async ({ page }) => { ... });
 *
 * `@key value` pairs become meta; a bare `@word` on a line of tags becomes a tag (so `@P0` / `@critical` still set
 * priority and severity), while a mention inside a sentence ("reported by @naveen") is ignored. Only a comment that
 * starts its own line and touches the test line counts: a file header separated by a blank line does not.
 * JSDoc's own tags (@param, @returns, @ts-ignore...) are ignored.
 */
export interface CommentMeta { meta: Record<string, string>; tags: string[] }

const JSDOC = new Set(['param', 'arg', 'argument', 'returns', 'return', 'type', 'typedef', 'template', 'example', 'see', 'link',
  'throws', 'exception', 'deprecated', 'since', 'callback', 'property', 'prop', 'override', 'private', 'public', 'protected',
  'readonly', 'async', 'function', 'func', 'method', 'class', 'constructor', 'module', 'namespace', 'memberof', 'inheritdoc',
  'default', 'description', 'summary', 'version', 'license', 'file', 'fileoverview', 'internal', 'ignore', 'satisfies', 'jsx',
  'flow', 'format', 'vitest-environment', 'jest-environment']);

const sources = new Map<string, string[] | null>();
function linesOf(file: string): string[] | null {
  if (!sources.has(file)) {
    try { sources.set(file, fs.readFileSync(file, 'utf8').split(/\r?\n/)); } catch { sources.set(file, null); }
  }
  return sources.get(file) ?? null;
}

/** The text of the comment that ends on the line just above `line` (1-based), or ''. */
export function commentAbove(file: string, line: number): string {
  const lines = linesOf(file);
  if (!lines || line < 2) return '';
  let i = line - 2;
  const at = (k: number) => (lines[k] ?? '').trim();
  if (at(i).endsWith('*/')) {
    const end = i;
    while (i >= 0 && !at(i).includes('/*')) i--;
    if (i < 0 || !at(i).startsWith('/*')) return '';   // `foo(); /* x */` belongs to the code, not the test
    return lines.slice(i, end + 1).join('\n')
      .replace(/^\s*\/\*+/, '').replace(/\*+\/\s*$/, '')
      .split('\n').map(l => l.replace(/^\s*\*+ ?/, '')).join('\n');
  }
  if (at(i).startsWith('//')) {
    const out: string[] = [];
    while (i >= 0 && at(i).startsWith('//')) { out.unshift(at(i).replace(/^\/\/+\s?/, '')); i--; }
    return out.join('\n');
  }
  return '';
}

/** `@key value` pairs and bare `@tags` in a comment's text. A value runs to the next ` @key` or the end of the line. */
export function parseCommentMeta(text: string): CommentMeta {
  const meta: Record<string, string> = {};
  const tags: string[] = [];
  for (const line of text.split('\n')) {
    // a bare @word is a tag only on a line of tags (` * @smoke @regression`), never a mention in a sentence
    const tagLine = line.trim().startsWith('@');
    const re = /(?:^|\s)@([A-Za-z][\w.-]*)(?:[ \t]*[:=][ \t]*|[ \t]+(?!@))?(.*?)(?=\s+@[A-Za-z][\w.-]*|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const key = m[1];
      if (JSDOC.has(key.toLowerCase()) || /^(ts-|eslint|jsx|prettier)/i.test(key)) continue;
      // `@owner 'naveen'` / `@feature "Cart and checkout"`: the quotes are not part of the value
      const value = m[2].trim().replace(/^(['"`])(.*)\1$/, '$2').trim();
      if (value) meta[key.toLowerCase()] = value;
      else if (tagLine && !tags.includes('@' + key)) tags.push('@' + key);
    }
  }
  return { meta, tags };
}

/** Comment meta for one location, or empty. */
export function commentMetaAt(file: string, line: number): CommentMeta {
  const text = commentAbove(file, line);
  return text ? parseCommentMeta(text) : { meta: {}, tags: [] };
}

/** Find the line of `it('title'` / `test("title"` / `describe(`title`` in a file (WebdriverIO gives no line). */
export function lineOfTitle(file: string, title: string, kinds = 'it|test|specify|describe|context|suite', after = 0): number {
  const lines = linesOf(file);
  if (!lines || !title) return 0;
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b(?:${kinds})(?:\\.\\w+)*\\s*\\(\\s*(['"\`])${esc}\\1`);
  // search after the enclosing describe's line, so two describes with an it('logs in') each find their own
  for (let i = Math.max(0, after); i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return 0;
}
