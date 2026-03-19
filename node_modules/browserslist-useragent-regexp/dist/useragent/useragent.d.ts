import type { SemverCompareOptions } from '../semver/index.js';
import type { BrowsersVersions } from '../browsers/types.js';
import type { BrowserRegex } from './types.js';
/**
 * Get useragent regexes for given browsers.
 * @param browsers - Browsers.
 * @param options - Semver compare options.
 * @param targetRegexes - Override default regexes.
 * @returns User agent regexes.
 */
export declare function getRegexesForBrowsers(browsers: BrowsersVersions, options: SemverCompareOptions, targetRegexes?: import("ua-regexes-lite").UserAgentRegex[]): BrowserRegex[];
//# sourceMappingURL=useragent.d.ts.map