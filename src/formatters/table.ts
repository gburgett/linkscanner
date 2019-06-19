import { Writable } from 'stream'

import { defaultLogger, Logger } from '../logger'
import { Result } from '../model'
import { assign, Options, present } from '../util'

export interface TableFormatterOptions {
  logger: Logger
  verbose?: boolean
}

export class TableFormatter extends Writable {
  private readonly options: TableFormatterOptions
  private wroteHeader = false

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
    const { logger, verbose } = this.options

    const line = [
      result.status.toFixed(0),
      result.method.padEnd(4),
      result.url.toString(),
      result.parent ? result.parent.url.toString() : '',
      result.ms.toFixed(0).padStart(4),
    ]

    if (verbose) {
      if (!this.wroteHeader) {
        const header = [
          'status',
          'method',
          'url'.padEnd(80),
          'parent'.padEnd(80),
          'ms'.padEnd(4),
        ]
        logger.log('| ' + header.join(' | ') + ' |')
        const dividerLine = header.map((h) => h.length).reduce((str, length) => {
          return str + ' ' + '-'.repeat(length) + ' |'
        }, '|')
        logger.log(dividerLine)
        this.wroteHeader = true
      }

      line[0] = line[0].padEnd(6)
      line[1] = line[1].padEnd(6)
      line[2] = line[2].padEnd(80)
      line[3] = line[3].padEnd(80)
      line[4] = line[4].padEnd(4)
      logger.log('| ' + line.join(' | ') + ' |')

    } else {
      logger.log(line.join('\t'))
    }

    cb()
  }
}
