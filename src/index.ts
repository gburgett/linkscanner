import { onceAsync } from 'async-toolbox/events'
import { Writable } from 'stream'

import { BuildStream } from './build_stream'
import { ConsoleFormatter } from './formatters/console'
import { TableFormatter } from './formatters/table'
import { defaultLogger, Logger } from './logger'
import { loadSource } from './source'
import { parseUrl } from './url'

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
  source: string | string[],
  hostnames?: string | string[]
  followRedirects?: boolean
  recursive?: boolean
  'exclude-external'?: boolean

  formatter?: keyof typeof formatters | Writable
  /** Formatter option: more output */
  verbose?: boolean,

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

  const formatter: Writable = (options.formatter &&
    typeof(options.formatter) == 'string' ?
      formatters[options.formatter] && formatters[options.formatter](options)
      : options.formatter
  ) || defaultFormatter(options)

  const withFormatter = results
    .pipe(formatter)

  await onceAsync(withFormatter, 'finish')
}

export default Run
