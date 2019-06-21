import { Readable } from 'async-toolbox/stream'
import * as crossFetch from 'cross-fetch'
import { Transform } from 'stream'

import { DivergentStreamWrapper } from './divergent_stream_wrapper'
import { FetchInterface } from './fetcher'
import { HostnameSet } from './hostname_set'
import { defaultLogger, Logger } from './logger'
import { Chunk, Result } from './model'
import { EOF, handleEOF, isEOF, Reentry } from './reentry'
import { parseUrl, parseUrls, URL } from './url'
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
  const reentry = new Reentry({
    logger,
  })

  const sourceUrls = new Set<string>()
  const sourceUrlTracker = new Transform({
    objectMode: true,
    async transform(url: URL, encoding, done) {
      try {

        // always correct the user's typed-in URL if it is redirected.
        const {fetch, Request} = options.fetch || crossFetch
        const resp = await fetch(new Request(url.toString(), {
          redirect: 'follow',
        }))

        if (resp.url) {
          // we probably got redirected and the response URL is different from
          // the source URL
          url = parseUrl(resp.url)
        }

        if (!args || !args.hostnames || args.hostnames.size == 0) {
          // since hostnames not explicitly provided, any sourceUrl in the readable
          // is considered a source hostname for which we'll do a GET
          hostnameSet.hostnames.add(url.hostname)
        }
        sourceUrls.add(url.toString())
        this.push(url)

        done()
      } catch (ex) {
        logger.error('source URL tracking error', ex)
        done(ex)
      }
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

  source.on('end', () => {
    logger.debug('end of source')
    reentry.tryEnd()
  })
  fetcher.on('url', ({ url, parent }: { url: URL, parent: Result }) => {
    if (options['exclude-external'] && (!hostnameSet.hostnames.has(url.hostname))) {
      // only scan URLs matching our known hostnames
      logger.debug('external', url.toString())
      return
    }

    if (!options.recursive && !sourceUrls.has(parent.url.toString())) {
      // Do not scan URLs that didn't come straight from one of our source URLs.
      logger.debug('recursive', url.toString(), parent.url.toString())
      return
    }
    const isLeafNode: boolean =
      // external URLs are always leafs
      !hostnameSet.hostnames.has(url.hostname) ||
      // If not recursive, any URL found on a page is a leaf node
      !options.recursive
    if (isLeafNode) {
      logger.debug('leaf', url.toString())
    }

    reentry.write({ url, parent, leaf: isLeafNode })
  })

  return results
}
