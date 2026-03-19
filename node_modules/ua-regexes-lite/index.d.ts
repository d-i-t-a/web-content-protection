export interface UserAgentRegex {
  /**
   * Regular expression to match user agent.
   */
  regex: RegExp
  /**
   * caniuse-lite compatible browser family name.
   */
  family: string
  /**
   * Fixed browser version.
   */
  version?: [number, number, number]
  /**
   * Minimum browser version.
   */
  minVersion?: [number, number, number]
  /**
   * Maximum browser version.
   */
  maxVersion?: [number, number, number]
}

export declare const regexes: UserAgentRegex[]
