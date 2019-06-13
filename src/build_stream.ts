import { Readable } from 'async-toolbox/stream'
import { Transform } from 'stream'

import { DivergentStreamWrapper } from './divergent_stream_wrapper'
import { FetchInterface } from './fetcher'
import { HostnameSet } from './hostname_set'
import { defaultLogger, Logger } from './logger'
import { Chunk, Result } from './model'
import { EOF, handleEOF, isEOF, Reentry } from './reentry'
import { parseUrls } from './url'
import { assign, Options } from './util'

export interface BuildStreamOptions {
  hostnames: Set<string>
  followRedirects: boolean
  recursive: boolean
  'exclude-external': boolean

  logger: Logger
  fetch?: FetchInterface
}

/**
 * The core of the linkchecker - Builds a pipeline from a readable source of URLs,
 * @param source
 * @param hostnames
 */
export function BuildStream(
  source: Readable<string>,
  args?: Options<BuildStreamOptions>,
): Readable<Result> {
  const {
    hostnames,
    logger,
    ...options
  } = assign({
    'hostnames': new Set<string>(),
    'logger': defaultLogger,
    'followRedirects': false,
    'recursive': false,
    'exclude-external': false,
  }, args)
  const hostnameSet = new HostnameSet(
    hostnames,
    {
      ...options,
      followRedirects: options.followRedirects,
      logger,
    },
  )
  const reentry = new Reentry()

  const sourceUrls = new Set<URL>()
  const sourceUrlTracker = new Transform({
    objectMode: true,
    transform(url: URL, encoding, done) {
      if (!args || !args.hostnames) {
        // since hostnames not explicitly provided, any sourceUrl in the readable
        // is considered a source hostname for which we'll do a GET
        hostnameSet.hostnames.add(url.hostname)
      }

      sourceUrls.add(url)
      this.push(url)
      done()
    },
  })

  const fetcher = source
    .pipe(parseUrls())
    .pipe(sourceUrlTracker)
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

  source.on('data', (url: URL) => {

  })
  source.on('end', () => {
    reentry.tryEnd()
  })
  fetcher.on('url', ({ url, parent }: { url: URL, parent: URL }) => {
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

    reentry.write({ url, parent })
  })

  return results
}
