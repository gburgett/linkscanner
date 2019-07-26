import { ParallelTransform, Readable } from 'async-toolbox/stream'
import { Interval } from 'limiter'

import { DivergentStreamWrapper } from './divergent_stream_wrapper'
import { EventForwarder } from './event_forwarder'
import { FetchInterface } from './fetch_interface'
import { HostnameSet } from './hostname_set'
import { defaultLogger, Logger } from './logger'
import { Result, SkippedResult, SuccessResult } from './model'
import { handleEOF, Reentry } from './reentry'
import { parseUrls, URL } from './url'
import { assign, Options } from './util'

export interface BuildPipelineOptions {
  hostnames: Set<string>
  followRedirects: boolean
  ignoreRobotsFile: boolean
  recursive: boolean | number
  'exclude-external': boolean
  maxConcurrency: number | { tokens: number, interval: Interval }

  logger: Logger
  fetch?: FetchInterface
}

/**
 * The core of the linkchecker - Builds a pipeline from a readable source of URLs
 */
export function BuildPipeline(
  /** A Readable object mode stream which pushes out a single URL per chunk */
  source: Readable<string>,
  args?: Options<BuildPipelineOptions>,
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
      logger,
    },
  )

  const sourceUrlTracker = new ParallelTransform({
    objectMode: true,
    highWaterMark: 0,
    async transformAsync(url: URL) {
      if (!args || !args.hostnames || args.hostnames.size == 0) {
        // since hostnames not explicitly provided, any sourceUrl in the readable
        // is considered a source hostname for which we'll do a GET
        hostnameSet.hostnames.add(url.hostname)
      }
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
      createStream: (host) => hostnameSet.streamFor(host),
    }))

  // The results come out of the fetcher, piping EOF tokens back to the Reentry
  // so that the Reentry can decide when to end the stream.
  const results = fetcher
    .pipe(handleEOF(reentry))

  new EventForwarder({
    only: ['url', 'fetch', 'response', 'EOS'],
  })
    .from(fetcher)
    .from(reentry)
    .to(results)

  source.on('end', () => {
    // The source is done sending us URLs to check, now it's up to the reentry
    // to tell us when we're finally done.
    logger.debug('end of source')
    results.emit('EOS')
    reentry.tryEnd()
  })

  // Whenever the fetcher generates a URL, we may need to feed it back to the
  // Reentry for recursive fetching.
  fetcher.on('url', onUrl)

  // debugStreams({
  //   source,
  //   reentry,
  //   fetcher,
  //   results,
  // }, logger)

  source.on('data', (url) => {
    // forward source URLs as URL events too, with no parent
    results.emit('url', { url })
  })

  // The CLI or consuming program needs the readable stream of results
  return results

  function onUrl({ url, parent }: { url: URL, parent: SuccessResult }) {
    try {
      if (options['exclude-external'] && (!hostnameSet.hostnames.has(url.hostname))) {
        // only scan URLs matching our known hostnames
        const result: SkippedResult = {
          type: 'skip',
          url,
          parent,
          host: url.hostname,
          leaf: true,
          reason: 'external',
        }
        logger.debug('external', url.toString())
        results.write(result)
        return
      }

      const recursionLimit: number =
        options.recursive === false ? 1 :
          options.recursive === true ? Infinity :
            options.recursive
      if (recursionLimit != Infinity && countParents(parent) > recursionLimit) {
        // Do not recurse any deeper than the recursion limit
        logger.debug('recursive', url.toString(), parent.url.toString())
        return
      }

      const isLeafNode: boolean =
        // external URLs are always leafs
        !hostnameSet.hostnames.has(url.hostname) ||
        recursionLimit != Infinity && countParents(parent) >= recursionLimit
      if (isLeafNode) {
        logger.debug('leaf', url.toString())
      }

      reentry.write({ url, parent, leaf: isLeafNode })
    } catch (ex) {
      logger.error(ex)
    }
  }
}

function countParents(result: Result | undefined): number {
  let i = 0
  while (result) {
    i++
    result = result.parent
  }
  return i
}
