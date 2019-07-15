import { Limiter, Semaphore } from 'async-toolbox'
import * as crossFetch from 'cross-fetch'
import robotsParser, { Robots } from 'robots-parser'
import { Duplex } from 'stream'

import { FetchInterface } from './fetch_interface'
import { Fetcher } from './fetcher'
import { defaultLogger, Logger } from './logger'
import { parseUrl, URL } from './url'
import { assign, Options } from './util'

interface HostnameSetOptions {
  followRedirects: boolean,
  userAgent?: string
  logger: Logger
  fetch: FetchInterface
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
      logger: defaultLogger,
      fetch: crossFetch,
    },
      options)
  }

  public async lockFor(host: Host): Promise<Semaphore> {
    const existing = this._locks.get(hostKey(host))
    if (existing) {
      return existing
    }

    const robots = await this.robotsFor(host)
    const crawlDelay = robots.getCrawlDelay(this._options.userAgent || '*')

    const semaphore = crawlDelay ?
      new Limiter({
        interval: crawlDelay * 1000,
        tokensPerInterval: 1,
      }) :
      new Semaphore({ tokens: 1 })

    this._locks.set(hostKey(host), semaphore)
    return semaphore
  }

  public async robotsFor(host: Host): Promise<Robots> {
    const {protocol, hostname, port} = host
    const robotsFile = parseUrl(`${protocol}//${hostname}/robots.txt`)
    if (port) {
      robotsFile.port = port.toString()
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
      this._options.logger.error(`Error fetching robots.txt: ${ex}`)
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

function exists<T>(value: T | undefined | null): value is T {
  return !!value
}

function hostKey({hostname, protocol, port}: Host): string {
  return [protocol, hostname, port].join('/')
}
