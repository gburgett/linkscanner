import { Writable } from 'stream'

import { defaultLogger, Logger } from '../logger'
import { Result } from '../model'
import { assign, Options, present } from '../util'

export interface TableFormatterOptions {
  logger: Logger
}

export class TableFormatter extends Writable {
  private readonly options: TableFormatterOptions

  constructor(options?: Options<TableFormatterOptions>) {
    super({
      objectMode: true,
    })

    this.options = assign(
      { logger: defaultLogger },
      options,
    )
  }

  public _write(result: Result, encoding: any, cb: (error?: Error | null) => void) {
    const { logger } = this.options

    logger.log([
      result.status.toFixed(0),
      result.method.padEnd(4),
      result.url.toString(),
      result.parent && result.parent.url.toString(),
    ].filter(present).join(' '))

    cb()
  }
}
