
export default function robotsParser(url: string, contents: string): Robots;

export interface Robots {
  /**
   * Returns true if crawling the specified URL is allowed for the specified user-agent.
   * This will return undefined if the URL isn't valid for this robots.txt.
   * @param url 
   * @param ua 
   */
  isAllowed(url: string, ua?: string): boolean | undefined

  /**
   * Returns true if crawling the specified URL is not allowed for the specified user-agent.
   * This will return undefined if the URL isn't valid for this robots.txt.
   */
  isDisallowed(url: string, ua?: string): boolean | undefined

  getMatchingLineNumber(url: string, ua?: string): number | undefined

  /**
   * Returns the number of seconds the specified user-agent should wait between requests.
   * Returns undefined if no crawl delay has been specified for this user-agent.
   */
  getCrawlDelay(ua: string): number | undefined

  /**
   * Returns an array of sitemap URLs specified by the sitemap: directive.
   */
  getSitemaps(): string[]

  /**
   * Returns the preferred host name specified by the host: directive or null if there isn't one.
   */
  getPreferredHost(): string | null
}