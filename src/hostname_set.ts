import { Limiter, Semaphore } from 'async-toolbox'
import * as crossFetch from 'cross-fetch'
import { Duplex } from 'stream'
import robotsParser, { Robots } from '../vendor/robots-parser'

import { Interval } from 'limiter'
import { FetchInterface } from './fetch_interface'
import { Fetcher } from './fetcher'
import { defaultLogger, Logger } from './logger'
import { Parsers } from './parsers'
import { parseUrl, URL } from './url'
import { assign, Options } from './util'

interface HostnameSetOptions {
  followRedirects: boolean,
  ignoreRobotsFile: boolean
  /** Always executes a GET request even on leaf nodes */
  forceGet: boolean
  userAgent?: string
  logger: Logger
  parsers: Parsers
  fetch: FetchInterface
  maxConcurrency: number | { tokens: number, interval: Interval }
}

export interface Host { hostname: string, protocol: string, port?: string }

export class HostnameSet {
  private _locks = new Map<string, Semaphore>()
  private _streams = new Map<string, Duplex>()
  private _robots = new Map<string, Robots>()
  private readonly _options: HostnameSetOptions

  constructor(public readonly hostnames: Set<string>,
              options?: Options<HostnameSetOptions>) {
    this._options = assign({
      followRedirects: false,
      ignoreRobotsFile: false,
      forceGet: false,
      logger: defaultLogger,
      fetch: crossFetch,
      maxConcurrency: 1,
      parsers: {},
    },
      options)
  }

  public async lockFor(host: Host): Promise<Semaphore> {
    const existing = this._locks.get(hostKey(host))
    if (existing) {
      return existing
    }

    let semaphore: Semaphore | undefined
    if (!this._options.ignoreRobotsFile &&
      !this.hostnames.has(host.hostname)) {
      // For external hosts, check the crawl delay.  For the host we've specified to
      //  check, using the crawl delay would be prohibitive.
      const robots = await this.robotsFor(host)
      const crawlDelay = robots.getCrawlDelay(this._options.userAgent || '*')
      if (crawlDelay) {
        if (crawlDelay >= 5) {
          this._options.logger.error(`Warning: excessive crawl delay of ${crawlDelay}s for ${host.hostname}`)
        }

        semaphore = new Limiter({
          interval: crawlDelay * 1000,
          tokensPerInterval: 1,
        })
      }
    }

    if (!semaphore) {
      const { maxConcurrency } = this._options
      semaphore =
        typeof(maxConcurrency) == 'number' ?
          new Semaphore({
            tokens: maxConcurrency,
          }) :
          new Limiter({
            tokensPerInterval: maxConcurrency.tokens,
            interval: maxConcurrency.interval,
          })
    }

    this._locks.set(hostKey(host), semaphore)
    return semaphore
  }

  public async robotsFor(host: Host): Promise<Robots> {
    const {protocol, hostname, port} = host
    const robotsFile = parseUrl(`${protocol}//${hostname}/robots.txt`)
    if (port) {
      robotsFile.port = port.toString()
    }

    if (this._options.ignoreRobotsFile) {
      return robotsParser(robotsFile.toString(), '')
    }

    return await this.fetchRobotsFile(robotsFile)
  }

  public async streamFor(host: Host): Promise<Duplex> {
    const existing = this._streams.get(hostKey(host))
    if (existing) {
      return existing
    }

    const stream = new Fetcher({
      ...this._options,
      robots: await this.robotsFor(host),
      semaphore: await this.lockFor(host),
    })

    stream.on('end', () => {
      this._streams.delete(hostKey(host))
    })

    return stream
  }

  private fetchRobotsFile = async (robotsFile: URL) => {
    const existing = this._robots.get(robotsFile.toString())
    if (existing) {
      return existing
    }

    const { fetch } = this._options
    let resp: Response | null = null
    try {
      resp = await fetch.fetch(new fetch.Request(robotsFile.toString(), {
        redirect: 'follow',
      }))
    } catch (ex) {
      this._options.logger.error(`Error fetching ${robotsFile}: ${ex}`)
    }

    let robots: Robots
    if (resp && resp.status >= 200 && resp.status < 300) {
      robots = robotsParser(robotsFile.toString(), await resp.text())
    } else {
      robots = robotsParser(robotsFile.toString(), '')
    }

    this._robots.set(robotsFile.toString(), robots)
    return robots
  }
}

function hostKey({hostname, protocol, port}: Host): string {
  return [protocol, hostname, port].join('/')
}
