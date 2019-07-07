import { Limiter, Semaphore, timeout } from 'async-toolbox'
import * as crossFetch from 'cross-fetch'
import robotsParser, { Robots } from 'robots-parser'
import { Duplex } from 'stream'

import { Fetcher, FetchInterface } from './fetcher'
import { defaultLogger, Logger } from './logger'
import { assign, Options } from './util'

interface HostnameSetOptions {
  followRedirects: boolean,
  userAgent?: string
  logger: Logger
  fetch: FetchInterface
}

export class HostnameSet {
  private _locks = new Map<string, Semaphore>()
  private _streams = new Map<string, Duplex>()
  private _robots = new Map<string, Robots>()
  private readonly _options: HostnameSetOptions

  constructor(public readonly hostnames: Set<string>,
              options?: Options<HostnameSetOptions>) {
    this._options = assign({
      followRedirects: false,
      logger: defaultLogger,
      fetch: crossFetch,
    },
      options)
  }

  public async lockFor(hostname: string): Promise<Semaphore> {
    const existing = this._locks.get(hostname)
    if (existing) {
      return existing
    }

    const robots = await this.robotsFor(hostname)
    const crawlDelay = robots.getCrawlDelay(this._options.userAgent || '*')

    const semaphore = crawlDelay ?
      new Limiter({
        interval: crawlDelay * 1000,
        tokensPerInterval: 1,
      }) :
      new Semaphore({ tokens: 1 })

    this._locks.set(hostname, semaphore)
    return semaphore
  }

  public async robotsFor(hostname: string): Promise<Robots> {
    const existing = this._robots.get(hostname)
    if (existing) {
      return existing
    }

    const { fetch } = this._options
    const robotsFile = `http://${hostname}/robots.txt`
    let resp: Response | null = null
    try {
      resp = await timeout(() => fetch.fetch(new fetch.Request(robotsFile, {
        redirect: 'follow',
      })), 10000)
    } catch (ex) {
      this._options.logger.error(`Error fetching robots.txt: ${ex}`)
    }

    let robots: Robots
    if (resp && resp.status >= 200 && resp.status < 300) {
      robots = robotsParser(robotsFile, await resp.text())
    } else {
      robots = robotsParser(robotsFile, '')
    }

    this._robots.set(hostname, robots)
    return robots
  }

  public async streamFor(hostname: string): Promise<Duplex> {
    const existing = this._streams.get(hostname)
    if (existing) {
      return existing
    }

    const stream = new Fetcher({
      ...this._options,
      semaphore: await this.lockFor(hostname),
    })

    stream.on('end', () => {
      this._streams.delete(hostname)
    })

    return stream
  }
}
