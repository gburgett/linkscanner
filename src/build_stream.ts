import { ParallelTransform, Readable } from 'async-toolbox/stream'
import * as crossFetch from 'cross-fetch'

import { DivergentStreamWrapper } from './divergent_stream_wrapper'
import { FetchInterface } from './fetcher'
import { HostnameSet } from './hostname_set'
import { defaultLogger, Logger } from './logger'
import { Chunk, Result } from './model'
import { handleEOF, Reentry } from './reentry'
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
 * The core of the linkchecker - Builds a pipeline from a readable source of URLs
 */
export function BuildStream(
  /** A Readable object mode stream which pushes out a single URL per chunk */
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

  const sourceUrls = new Set<string>()
  const sourceUrlTracker = new ParallelTransform({
    objectMode: true,
    highWaterMark: 0,
    async transformAsync(url: URL) {
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
      logger.debug('source URL', url.toString())
      this.push(url)
    },
  })

  // the source is everything up to the reentry
  source = source
    .pipe(parseUrls())
    .pipe(sourceUrlTracker)

  // The reentry decides when we're actually done, by receiving recursive URLs
  // and pushing EOF chunks into the pipeline
  const reentry = source.pipe(new Reentry({
    logger,
  }), { end: false })

  // The fetcher performs the heavy lifting of invoking fetch
  const fetcher = reentry
    .pipe(new DivergentStreamWrapper({
      objectMode: true,
      hashChunk: (chunk: Chunk) => {
        return chunk.url.hostname
      },
      createStream: (hostname) => hostnameSet.streamFor(hostname),
    }))

  // The results come out of the fetcher, piping EOF tokens back to the Reentry
  // so that the Reentry can decide when to end the stream.
  const results = fetcher
    .pipe(handleEOF(reentry))

  source.on('end', () => {
    // The source is done sending us URLs to check, now it's up to the reentry
    // to tell us when we're finally done.
    logger.debug('end of source')
    reentry.tryEnd()
  })

  // Whenever the fetcher generates a URL, we may need to feed it back to the
  // Reentry for recursive fetching.
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

  // debugStreams({
  //   source,
  //   reentry,
  //   fetcher,
  //   results,
  // })

  // The CLI or consuming program needs the readable stream of results
  return results
}
