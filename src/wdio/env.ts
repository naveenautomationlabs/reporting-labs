/** Environment-card rows for the WDIO report, reusing the Playwright reporter's CI/git helpers. */
import * as os from 'os';
import { ciLink, gitInfo, ciRunLabel } from '../reporter';
import type { EnvRow } from '../types';

export { ciRunLabel };

export function collectEnv(base: string, extra: Record<string, string> | undefined, browsers: string[], workers: number, metadataBranch?: string): EnvRow[] {
  const env = process.env;
  const rows: EnvRow[] = [];
  rows.push({ k: 'Node', v: process.version });
  rows.push({ k: 'OS', v: `${os.type()} ${os.release()} (${os.arch()})` });
  if (browsers.length) rows.push({ k: 'Browsers', v: browsers.join(', ') });
  if (workers > 1) rows.push({ k: 'Workers', v: String(workers) });
  const ci = ciLink(env);
  if (ci) rows.push({ k: 'CI', v: ci.name, href: ci.url });
  const git = gitInfo(base, env);
  if (git.sha) rows.push({ k: 'Commit', v: `${git.sha.slice(0, 7)}${git.author ? ' · ' + git.author : ''}${git.subject ? ' · ' + git.subject : ''}`, href: git.url });
  if (git.branch && !metadataBranch) rows.push({ k: 'Branch', v: git.branch });
  for (const [k, v] of Object.entries(extra || {})) rows.push({ k, v: String(v), href: /^https?:\/\//.test(String(v)) ? String(v) : undefined });
  return rows;
}
