import { collect } from 'async-toolbox/stream'

import { BuildStream } from './build_stream'
import { defaultLogger, Logger } from './logger'
import { Result } from './model'
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

  await collect(results, (result: Result) => {
    options.logger.log([
      result.status,
      result.method.padEnd(4),
      result.url,
      result.parent && result.parent.url,
    ].join(' '))
  })
}

export default Run
