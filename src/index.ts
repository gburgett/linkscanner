import { Semaphore } from 'async-toolbox'
import { collect, Readable } from 'async-toolbox/stream'
import { Duplex } from 'stream'

import { DivergentStreamWrapper } from './divergent_stream_wrapper'
import { Fetcher } from './fetcher'
import { defaultLogger, Logger } from './logger'
import { Chunk, Result } from './model'
import { EOF, handleEOF, isEOF, Reentry } from './reentry'
import { loadSource } from './source'
import { parseUrl, parseUrls, URL } from './url'

export interface Args {
  source: string | string[],
  hostnames?: string | string[]
  followRedirects?: boolean
  recursive?: boolean
  'exclude-external'?: boolean

  logger?: Logger
}

async function Run(args: Args): Promise<void> {
  const options = Object.assign({
    logger: defaultLogger,
    followRedirects: false,
  }, args)

  const hostnames = options.hostnames ?
    new Set(Array.from(options.hostnames)) :
    new Set(Array.from(options.source).map((s) => parseUrl(s).hostname))

  const source = loadSource(options)

  const results = BuildStream(source, {
    ...options,
    hostnames,
  })

  await collect(results, (result: Result) => {
    options.logger.log([
      result.status,
      result.method.padEnd(4),
      result.url,
      result.parent,
    ].join(' '))
  })
}

interface BuildStreamOptions {
  hostnames: Set<string>
  followRedirects: boolean
  recursive: boolean
  'exclude-external': boolean

  logger: Logger
}

/**
 * The core of the linkchecker - Builds a pipeline from a readable source of URLs,
 * @param source
 * @param hostnames
 */
export function BuildStream(
  source: Readable<string>,
  args?: Partial<BuildStreamOptions>,
): Readable<Result> {
  const {
    hostnames,
    logger,
    ...options
  } = Object.assign({
    'hostnames': new Set<string>(),
    'logger': defaultLogger,
    'followRedirects': false,
    'recursive': false,
    'exclude-external': false,
  }, args)
  const hostnameSet = new HostnameSet(
    hostnames,
    {
      followRedirects: options.followRedirects,
      logger,
    },
  )
  const reentry = new Reentry()

  const fetcher = source
    .pipe(parseUrls())
    .pipe(reentry, { end: false })
    .pipe(new DivergentStreamWrapper({
      objectMode: true,
      hashChunk: (chunk: Chunk | EOF) => {
        if (isEOF(chunk)) {
          // send the EOF to all streams
          return DivergentStreamWrapper.ALL
        }
        return chunk.url.hostname
      },
      createStream: (hostname) => hostnameSet.streamFor(hostname),
    }))

  const results = fetcher
    .pipe(handleEOF(reentry))

  const sourceUrls = new Set<URL>()
  source.on('data', (url: URL) => {
    if (hostnameSet.hostnames.size == 0) {
      // the first written string sets the hostname
      hostnameSet.hostnames.add(url.hostname)
    }

    sourceUrls.add(url)
  })
  source.on('end', () => {
    reentry.tryEnd()
  })
  fetcher.on('url', ({url, parent}: { url: URL, parent: URL }) => {
    if (options['exclude-external'] && (!hostnameSet.hostnames.has(url.hostname))) {
      // only scan URLs matching our known hostnames
      logger.debug('external', url.toString())
      return
    }

    if (!options.recursive && !sourceUrls.has(parent)) {
      // Do not scan URLs that didn't come straight from one of our source URLs.
      logger.debug('recursive', url.toString(), parent.toString())
      return
    }

    reentry.write({url, parent})
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

  constructor(public readonly hostnames: Set<string>,
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
