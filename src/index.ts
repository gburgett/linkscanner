import { Semaphore } from 'async-toolbox'
import { collect, Readable } from 'async-toolbox/stream'

import { Duplex } from 'stream'
import { DivergentStreamWrapper } from './divergent_stream_wrapper'
import { Fetcher } from './fetcher'
import { defaultLogger, Logger } from './logger'
import { Result } from './model'
import { EOF, isEOF, Reentry } from './reentry'
import { loadSource } from './source'
import { parseUrl, parseUrls, URL } from './url'

export interface Args {
  source: string | string[],
  hostnames?: string | string[]
  followRedirects?: boolean

  logger?: Logger
}

async function Run(args: Args): Promise<void> {
  const options = Object.assign({
    logger: defaultLogger,
    followRedirects: false,
  }, args)

  const hostnames = options.hostnames ?
    new Set([...options.hostnames]) :
    new Set([...options.source].map((s) => parseUrl(s).hostname))

  const source = loadSource(options)
    .pipe(parseUrls())

  const results = BuildStream(source, {
    ...options,
    hostnames,
  })

  await collect(results, (result: Result) => {
    options.logger.log(`${result.status}: ${result.method} ${result.url.toString()}`)
  })
}

interface BuildStreamOptions {
  hostnames: Set<string>
  followRedirects: boolean
  logger: Logger
}

/**
 * The core of the linkchecker - Builds a pipeline from a readable source of URLs,
 * @param source
 * @param hostnames
 */
export function BuildStream(
  source: Readable<URL>,
  args?: Partial<BuildStreamOptions>,
): Readable<Result> {
  const {
    hostnames,
    followRedirects,
    logger,
  } = Object.assign({
    hostnames: new Set<string>(),
    followRedirects: false,
    logger: defaultLogger,
  }, args)
  const hostnameSet = new HostnameSet(
    hostnames,
    {
      followRedirects,
      logger,
    },
  )
  const reentry = new Reentry()

  const results = source
    .pipe(reentry, { end: false })
    .pipe(new DivergentStreamWrapper({
      objectMode: true,
      hashChunk: (url: string | EOF) => {
        if (isEOF(url)) {
          // send the EOF to all streams
          return DivergentStreamWrapper.ALL
        }
        return parseUrl(url).hostname
      },
      createStream: (hostname) => hostnameSet.streamFor(hostname),
    }))

  const sourceUrls = new Set<URL>()
  source.on('data', (url: URL) => {
    if (hostnameSet.hostnames.size == 0) {
      // the first written string sets the hostname
      hostnameSet.hostnames.add(url.hostname)
    }

    sourceUrls.add(url)
  })
  results.on('url', ({url, parent}: { url: URL, parent: URL }) => {
    if (!hostnameSet.hostnames.has(url.hostname)) {
      // only scan URLs matching our known hostnames
      return
    }

    if (sourceUrls.has(parent)) {
      // recursively push to the top of the stream
      reentry.push(url)
    }
  })

  return results
}

export default Run

interface HostnameSetOptions {
  followRedirects: boolean,
  logger: Logger
}

class HostnameSet {
  private _locks = new Map<string, Semaphore>()
  private _streams = new Map<string, Duplex>()
  private readonly _options: HostnameSetOptions

  public get hostnames() {
    return this._hostnames
  }

  constructor(private readonly _hostnames: Set<string>,
              readonly options?: Partial<HostnameSetOptions>) {
    this._options = Object.assign({
      followRedirects: false,
      logger: defaultLogger,
    },
    options)
  }

  public lockFor(hostname: string) {
    const existing = this._locks.get(hostname)
    if (existing) {
      return existing
    }

    const semaphore = new Semaphore()
    this._locks.set(hostname, semaphore)
    return semaphore
  }

  public streamFor(hostname: string): Duplex {
    const existing = this._streams.get(hostname)
    if (existing) {
      return existing
    }

    return new Fetcher({
      ...this._options,
      hostnames: this.hostnames,
      semaphore: this.lockFor(hostname),
    })
  }
}
