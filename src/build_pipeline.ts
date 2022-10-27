import { ParallelTransform, Readable } from 'async-toolbox/stream'
import { Interval } from 'limiter'
import * as path from 'path'

import { PassThrough } from 'stream'
import { DivergentStreamWrapper } from './divergent_stream_wrapper'
import { EventForwarder } from './event_forwarder'
import { FetchInterface } from './fetch_interface'
import { HostnameSet } from './hostname_set'
import { defaultLogger, Logger } from './logger'
import { Chunk, Result, SkippedResult, SuccessResult } from './model'
import { defaultParsers, extensionToMimeType, findParser, NullParser, Parsers } from './parsers'
import { handleEOF, Reentry } from './reentry'
import { parseUrls, URL } from './url'
import { assign, Options } from './util'

export interface BuildPipelineOptions {
  hostnames: Set<string>
  followRedirects: boolean
  ignoreRobotsFile: boolean
  recursive: boolean | number
  'exclude-external': boolean
  /** Always executes a GET request even on leaf nodes */
  forceGet: boolean
  maxConcurrency: number | { tokens: number, interval: Interval }

  include: string[]
  only: string[]

  logger: Logger
  fetch?: FetchInterface
  parsers: Parsers
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
  } = assign(
    {
      'hostnames': new Set<string>(),
      'logger': defaultLogger,
      'followRedirects': false,
      'recursive': false,
      'exclude-external': false,
      'parsers': {},
    },
    args,
    {
      parsers: assign({}, defaultParsers(args), args && args.parsers),
    },
  )

  const recursionLimit: number =
    options.recursive === false ? 1 :
      options.recursive === true ? Infinity :
        options.recursive

  const hostnameSet = new HostnameSet(
    hostnames,
    {
      ...options,
      logger,
    },
  )

  const urlParser = parseUrls()

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

      const chunk: Chunk = {
        url,
        leaf: isLeafNode({ url }),
      }
      this.push(chunk)
    },
  })

  // The reentry decides when we're actually done, by receiving recursive URLs
  // and pushing EOF chunks into the pipeline
  const reentry = new Reentry({
    logger,
    // it has a high input queue, so that the progress bar can have a better
    // idea of the number of incoming source URLs when we have a big input list.
    highWaterMark: 1024,
  })

  // The fetcher performs the heavy lifting of invoking fetch
  const fetcher = new DivergentStreamWrapper({
    objectMode: true,
    createStream: (host) => hostnameSet.streamFor(host),
  })

  // The results come out of the fetcher, piping EOF tokens back to the Reentry
  // so that the Reentry can decide when to end the stream.
  const eofHandler = handleEOF(reentry)

  const results = new PassThrough({ objectMode: true })

  new EventForwarder({
    only: ['fetch', 'fetchError', 'response', 'EOS'],
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

  sourceUrlTracker.on('data', (chunk) => {
    // forward source URLs as URL events too, with no parent
    results.emit('url', chunk)
  })

  source
    .pipe(urlParser)
    .pipe(sourceUrlTracker)
  // reentry is responsible for ending itself when the EOF handler sends the EOF back
    .pipe(reentry, { end: false })
    .pipe(fetcher)
    .pipe(eofHandler)
    .pipe(results)

  new EventForwarder({
    only: ['error'],
  })
    .from(urlParser)
    .from(sourceUrlTracker)
    .from(reentry)
    .from(fetcher)
    .from(eofHandler)
    .to(results)

  // debugStreams({
  //   source,
  //   urlParser,
  //   sourceUrlTracker,
  //   reentry,
  //   fetcher,
  //   eofHandler,
  //   results,
  // })

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

      if (recursionLimit != Infinity && countParents(parent) > recursionLimit) {
        // Do not recurse any deeper than the recursion limit
        logger.debug('recursive', url.toString(), parent.url.toString())
        return
      }

      const leaf = isLeafNode({url, parent})

      if (leaf) {
        logger.debug('leaf', url.toString())
      }

      // forward this URL cause we're going to check it.
      results.emit('url', { url })
      reentry.write({ url, parent, leaf })
    } catch (ex) {
      logger.error(ex)
    }
  }

  function isLeafNode({ url, parent }: { url: URL, parent?: SuccessResult }): boolean {
    // external URLs are always leafs
    if (!hostnameSet.hostnames.has(url.hostname)) { return true }
    if (recursionLimit != Infinity && countParents(parent) >= recursionLimit) { return true }

    const expectedMimeType: string | undefined = extensionToMimeType[path.extname(url.pathname)]
    if (expectedMimeType) {
      const parser = findParser(options.parsers, expectedMimeType)
      if (parser && parser == NullParser) {
        // HEAD any URL where we wouldn't parse the body for links (i.e. PDF, PNG)
        return true
      }
    }

    return false
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
