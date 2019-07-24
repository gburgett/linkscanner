import { onceAsync } from 'async-toolbox/events'
import { Readable, Writable } from 'async-toolbox/stream'
import * as crossFetch from 'cross-fetch'
import { Interval } from 'limiter'
import { PassThrough, Transform, TransformCallback } from 'stream'

import { BuildPipeline as BuildPipeline } from './build_pipeline'
import { EventForwarder } from './event_forwarder'
import { FetchInterface, FetchInterfaceWrapper } from './fetch_interface'
import { ConsoleFormatter } from './formatters/console'
import { TableFormatter } from './formatters/table'
import { debugLogger, defaultLogger, Logger } from './logger'
import { Result } from './model'
import { ProgressBar } from './progress_bar'
import { loadSource } from './source'
import { assign, Options } from './util'

const formatters = {
  table: (args: Args) => new TableFormatter(args),
  console: (args: Args) => new ConsoleFormatter(args),
}

const defaultFormatter = (args: Args) => {
  if (typeof process == 'undefined' || process.stdout.isTTY) {
    // we're in a nodejs process with output attached to a TTY terminal, OR
    // we're in a browser process.
    return new ConsoleFormatter({
      ...args,
    })
  }
  // we're in a nodejs process with stdout redirected to some file or other program
  return new TableFormatter(args)
}

interface LinkscannerOptions {
  hostnames?: string | string[]
  followRedirects: boolean
  recursive: boolean | number
  excludeExternal: boolean
  include: string[]

  /** The maximum simultaneous fetch requests that can be running. */
  maxConcurrency: number | { tokens: number, interval: Interval }
  timeout: number

  headers: string[]
  userAgent?: string

  logger: Logger
}

const linkscannerDefaults: Readonly<LinkscannerOptions> = {
  followRedirects: false,
  recursive: false,
  excludeExternal: false,
  maxConcurrency: 5,
  timeout: 10000,

  headers: [],
  userAgent: undefined,
  include: [
    'a[href]',
    'link[rel="canonical"]',
  ],
  logger: defaultLogger,
}

export interface Args extends LinkscannerOptions {
  formatter?: keyof typeof formatters | Writable<Result>
  /** Formatter option: more output */
  verbose: boolean,

  debug: boolean
  progress: boolean
}

const runDefaults: Readonly<Args> = {
  ...linkscannerDefaults,
  verbose: false,
  debug: false,
  progress: !!(
      typeof process != 'undefined' &&
      process.stderr.isTTY
    ),
}

/**
 * A Linkscanner instance is a Transform stream that wraps the linkscanner pipeline.
 * URLs can be written one at a time (in object mode) to the Linkscanner, and
 * scanned results can be read out.
 */
class Linkscanner extends Transform {

  /**
   * Runs the link checker over the given URLs, returning a promise which
   * completes when the configured formatter is done writing the last results.
   */
  public static async run(source: string | string[], args?: Options<Args>): Promise<void> {
    const options: Args = assign({},
      runDefaults,
      args && ({
        progress: runDefaults.progress && !args.debug,
        logger: args.debug ? debugLogger : defaultLogger,
      }),
      args)

    let progress: ProgressBar | undefined
    if (options.progress) {
      // Attach a progress bar
      progress = new ProgressBar({
        logger: options.logger,
      })
      options.logger = progress
    }

    if (!options.debug) {
      const subLogger = options.logger
      options.logger = {
        error: subLogger.error.bind(subLogger),
        log: subLogger.log.bind(subLogger),
        debug: () => {return},
      }
    }

    const formatterName = options.formatter
    const formatter: Writable<Result> = (
      typeof(formatterName) == 'object' ?
        formatterName
        : formatterName && formatters[formatterName] && formatters[formatterName](options)
    ) || defaultFormatter(options)

    const sourceStream = loadSource({ source })

    const linkscanner = new Linkscanner(options)

    // pipe all the streams together
    const results = sourceStream
      .pipe(linkscanner)
      .pipe(formatter)

    if (progress) {
      linkscanner.pipe(progress)
    }

    await onceAsync(results, 'finish')
  }

  private readonly _options: LinkscannerOptions
  private readonly _source: PassThrough = new PassThrough({
    objectMode: true,
    highWaterMark: 0,
  })
  private readonly _results: Readable<Result>

  constructor(options: Options<LinkscannerOptions>) {
    super({
      readableObjectMode: true,
      writableObjectMode: true,
      highWaterMark: 0,
    })
    this._options = assign({},
      linkscannerDefaults,
      options)

    this._results = this.initPipeline()
  }

  public _transform(chunk: any, encoding: string, cb: TransformCallback): void {
    this._source.write(chunk, encoding, cb)
  }

  public _flush(cb: TransformCallback): void {
    this._results.on('end', () => { cb() })
    this._source.end()
  }

  private initPipeline() {
    const hostnames = this._options.hostnames ?
      new Set(Array.from(this._options.hostnames)) : undefined
    const results = BuildPipeline(this._source, {
      ...this._options,
      fetch: this.fetchInterface(),
      hostnames,
    })

    results.on('data', (transformedChunk) => this.push(transformedChunk))
    results.on('error', (err) => this.emit('error', err))

    new EventForwarder({
      only: ['url', 'fetch', 'response'],
    })
      .from(results)
      .to(this)

    return results
  }

  private fetchInterface(): FetchInterface {
    const fetch: FetchInterface = crossFetch

    const {headers, userAgent, maxConcurrency, timeout} = this._options

    let headerObj = parseHeaders(headers)
    if (userAgent) {
      headerObj = {
        ...headerObj,
        'User-Agent': userAgent,
      }
    }

    return new FetchInterfaceWrapper(fetch, {
      headers: headerObj,
      maxConcurrency,
      timeout,
    })
  }
}

export default Linkscanner

function parseHeaders(headers: string[]): { [key: string]: string } {
  const result: { [key: string]: string } = {}
  for (const header of headers) {
    const [key, ...value] = header.split(':')
    result[key] = value.join(':').trimLeft()
  }
  return result
}
