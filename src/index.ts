import { BuildStream } from './build_stream'
import { TableFormatter } from './formatters/table'
import { defaultLogger, Logger } from './logger'
import { loadSource } from './source'
import { parseUrl } from './url'

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

  const formatter = new TableFormatter({
    ...options,
  })

  await results
    .pipe(formatter)
    .onceAsync('finish')
}

export default Run
