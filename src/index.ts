import { onceAsync } from 'async-toolbox/events'
import { Readable, Writable } from 'async-toolbox/stream'

import { PassThrough } from 'stream'
import { BuildStream } from './build_stream'
import { ConsoleFormatter } from './formatters/console'
import { TableFormatter } from './formatters/table'
import { defaultLogger, Logger } from './logger'
import { Result } from './model'
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

export interface Args {
  hostnames?: string | string[]
  followRedirects: boolean
  recursive: boolean
  'exclude-external': boolean
  include: string[]

  formatter?: keyof typeof formatters | Writable<Result>
  /** Formatter option: more output */
  verbose: boolean,

  logger: Logger
}

/**
 * Create a Linkscanner run by instantiating this class and calling `await run('https://the-url')`.
 */
class Linkscanner {
  private readonly _options: Args

  constructor(options: Options<Args>) {
    this._options = assign({
      'hostnames': null,
      'followRedirects': false,
      'recursive': false,
      'exclude-external': false,
      'include': [
        'a[href]',
        'link[rel="canonical"]',
      ],
      'verbose': false,
      'logger': defaultLogger,
    }, options)
  }

  /**
   * Runs the link checker over the given URLs, returning a promise which
   * completes when the configured formatter is done writing the last results.
   */
  public run = async (source: string | string[]): Promise<void> => {
    const formatterName = this._options.formatter
    const formatter: Writable<Result> = (
      typeof(formatterName) == 'object' ?
        formatterName
        : formatterName && formatters[formatterName] && formatters[formatterName](this._options)
    ) || defaultFormatter(this._options)

    const sourceStream = loadSource({ source })

    const { source: entryStream, results } = this.buildStream()

    // pipe all the streams together
    sourceStream.pipe(entryStream)
    results.pipe(formatter)

    await onceAsync(formatter, 'finish')
  }

  /**
   * The programmatic interface to the Linkchecker - the returned pair of streams
   * allow you to pipe URLs to the source and pipe the results wherever you'd like.
   * In fact the `run` method uses this internally.
   *
   * @example
   *   const { source, results } = this.buildStream()
   *   toReadable(['https://www.google.com']).pipe(source)
   *   const formatter = new ConsoleFormatter()
   *   results.pipe(formatter)
   *   await onceAsync(formatter, 'finish')
   */
  public buildStream = (): { source: Writable<string>, results: Readable<Result> } => {
    const hostnames = this._options.hostnames ?
      new Set(Array.from(this._options.hostnames)) : undefined

    const source = new PassThrough({
      objectMode: true,
      highWaterMark: 1,
    })
    return {
      source,
      results: BuildStream(source, {
        ...this._options,
        hostnames,
      }),
    }
  }

}

export default Linkscanner
