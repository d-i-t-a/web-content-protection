import type { Browser, BrowserslistRequest } from './types.js';
/**
 * Browsers strings to info objects.
 * @param browsersList - Browsers strings with family and version.
 * @returns Browser info objects.
 */
export declare function parseBrowsersList(browsersList: string[]): Browser[];
/**
 * Request browsers list.
 * @param options - Options to get browsers list.
 * @returns Browser info objects.
 */
export declare function getBrowsersList(options?: BrowserslistRequest): Browser[];
//# sourceMappingURL=browserslist.d.ts.map