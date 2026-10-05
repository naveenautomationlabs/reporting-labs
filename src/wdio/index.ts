/**
 * reportingLabs for WebdriverIO.
 *
 *   // wdio.conf.ts
 *   import ReportingLabsReporter, { reportingLabsComplete } from 'reporting-labs/wdio';
 *
 *   export const config = {
 *     reporters: [[ReportingLabsReporter, { outputFolder: 'reporting-labs' }]],
 *     async onComplete() { await reportingLabsComplete({ outputFolder: 'reporting-labs', title: 'My suite' }); },
 *   };
 */
import ReportingLabsWdioReporter from './reporter';

export { ReportingLabsWdioReporter };
export type { ReportingLabsWdioOptions } from './reporter';
export { reportingLabsComplete } from './finalize';
export type { ReportingLabsCompleteOptions } from './finalize';
export default ReportingLabsWdioReporter;
