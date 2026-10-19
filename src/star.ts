/**
 * At most once a week, on a developer's machine, one line after the report asking for a GitHub star: most people
 * who use the reporter never see the repository. Never in CI. Off with announce: false or REPORTING_LABS_NO_STAR=1.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CI_VARS = ['CI', 'TF_BUILD', 'JENKINS_URL', 'GITLAB_CI', 'BUILDKITE', 'CIRCLECI', 'TEAMCITY_VERSION', 'CODEBUILD_BUILD_ID', 'BITBUCKET_BUILD_NUMBER'];
const WEEK = 7 * 24 * 3600 * 1000;

export const STAR_URL = 'https://github.com/naveenautomationlabs/reporting-labs';

export function starLine(env: NodeJS.ProcessEnv = process.env, mark = path.join(os.tmpdir(), 'reporting-labs-star')): string | undefined {
  if (env.REPORTING_LABS_NO_STAR || CI_VARS.some(k => env[k])) return undefined;
  try { if (Date.now() - fs.statSync(mark).mtimeMs < WEEK) return undefined; } catch { /* never shown on this machine */ }
  // the time it was shown is what keeps it to once a week: if it cannot be kept, stay quiet
  try { fs.writeFileSync(mark, ''); } catch { return undefined; }
  return `  ★ If reportingLabs helps you, a GitHub star helps other testers find it: ${STAR_URL}`;
}
