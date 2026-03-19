export interface MatchOptions {
    includes?: boolean[];
    excludes?: boolean[];
}
export declare function match(options?: MatchOptions): boolean;
