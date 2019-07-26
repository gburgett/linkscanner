import { onceAsync } from 'async-toolbox/events'
import { Readable, Writable } from 'async-toolbox/stream'
import * as crossFetch from 'cross-fetch'
import { Interval } from 'limiter'
import { PassThrough, Transform, TransformCallback } from 'stream'

import { BuildPipeline as BuildPipeline } from './build_pipeline'
import { EventForwarder } from './event_forwarder'
import { FetchInterface, FetchInterfaceWrapper } from './fetch_interface'
import { ConsoleFormatter, ConsoleFormatterOptions } from './formatters/console'
import { TableFormatter, TableFormatterOptions } from './formatters/table'
import { debugLogger, defaultLogger, Logger } from './logger'
import { Result } from './model'
import { ProgressBar } from './progress_bar'
import { loadSource } from './source'
import { assign, Options } from './util'

const formatters = {
  table: (args: TableFormatterOptions) => new TableFormatter(args),
  console: (args: ConsoleFormatterOptions) => new ConsoleFormatter(args),
}

const defaultFormatter = (args: TableFormatterOptions & ConsoleFormatterOptions) => {
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
  maxConcurrency: 2,
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

    let builder = Linkscanner.build(options)
      .addFormatter(options.formatter)

    if (options.progress) {
      // Attach a progress bar
      builder = builder.progress()
    }

    return builder.get().run(source)
  }

  public static build(opts: Options<LinkscannerOptions>): Builder {
    return Builder.new(opts)
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

  /**
   * Runs the linkscanner over a set of source URLs, returning an array of results.
   * This consumes the linkscanner.
   */
  public async run(source: string | string[]): Promise<void> {
    loadSource({source})
      .pipe(this)

    await onceAsync(this, 'end')
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

// tslint:disable-next-line: max-classes-per-file
class Builder {

  public static new(options: Options<LinkscannerOptions>): Builder {
    const _options = assign({},
      linkscannerDefaults,
      options)

    return new Builder(_options)
  }

  public readonly _formatters: Array<(args: LinkscannerOptions) => Writable<Result>>
  public readonly _progress?: ProgressBar

  private constructor(
    public readonly _options: Readonly<LinkscannerOptions>,
    previousBuilder?: {
      _formatters: Builder['_formatters'],
      _progress?: Builder['_progress'],
    },
  ) {
      this._formatters = previousBuilder ? previousBuilder._formatters : []
      this._progress = previousBuilder && previousBuilder._progress
  }

  /**
   * Adds a formatter to the linkscanner.  Provide a custom formatter, select a
   * formatter by name, or omit the parameter to use the default formatter.
   * @param formatter The formatter to use which will write to the logger.
   */
  public addFormatter(formatter?: keyof typeof formatters | Writable<Result>): Builder {
    let f: ((args: LinkscannerOptions) => Writable<Result>) | undefined = (
      typeof(formatter) == 'object' ?
        () => formatter
          : formatter && formatters[formatter] && formatters[formatter]
    )
    if (!f) {
      f = defaultFormatter
    }

    return new Builder(this._options,
      {
        ...this,
        _formatters: [...this._formatters, f],
      })
  }

  /**
   * Adds a progress bar to the linkscanner.  Note that the progress bar will
   * replace the logger and intercept it, in order to clear and rewrite itself
   * whenever logging takes place.
   */
  public progress(): Builder {
    if (this._progress) {
      return this
    }

    const _progress = new ProgressBar({
      logger: this._options.logger,
    })

    return new Builder({
      ...this._options,
        // the progress bar intercepts logging so as to clear & rewrite after each log line
      logger: _progress,
    }, {
      ...this,
      _progress,
    })
  }

  /**
   * Constructs a linkscanner from the configured options.
   */
  public get(): Linkscanner {
    const linkscanner = new Linkscanner(this._options)
    this._formatters.forEach((f) => {
      return linkscanner.pipe(f(this._options))
    })
    if (this._progress) {
      linkscanner.pipe(this._progress)
    }

    return linkscanner
  }
}
