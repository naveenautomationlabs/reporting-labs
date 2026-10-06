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
 * `@key value` pairs become meta; a bare `@word` becomes a tag (so `@P0` / `@critical` still set priority and
 * severity). Only a comment that touches the test line counts: a file header separated by a blank line does not.
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
    if (i < 0) return '';
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
    const re = /(?:^|\s)@([A-Za-z][\w.-]*)(?:[ \t]*[:=][ \t]*|[ \t]+(?!@))?(.*?)(?=\s+@[A-Za-z][\w.-]*|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const key = m[1];
      if (JSDOC.has(key.toLowerCase()) || /^(ts-|eslint|jsx|prettier)/i.test(key)) continue;
      const value = m[2].trim();
      if (value) meta[key.toLowerCase()] = value;
      else if (!tags.includes('@' + key)) tags.push('@' + key);
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
export function lineOfTitle(file: string, title: string, kinds = 'it|test|specify|describe|context|suite'): number {
  const lines = linesOf(file);
  if (!lines || !title) return 0;
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b(?:${kinds})(?:\\.\\w+)*\\s*\\(\\s*(['"\`])${esc}\\1`);
  const i = lines.findIndex(l => re.test(l));
  return i < 0 ? 0 : i + 1;
}
