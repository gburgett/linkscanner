import { Writable } from 'stream'

import { defaultLogger, Logger } from '../logger'
import { isSkippedResult, Result } from '../model'
import { assign, Options, present } from '../util'

export interface TableFormatterOptions {
  logger: Logger
  verbose?: boolean
}

const header = [
  'status',
  'method',
  'url'.padEnd(80),
  'contentType'.padEnd('application/json'.length),
  'ms'.padStart(4),
  'parent'.padEnd(80),
  'error',
]

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
    this._format(result)
    cb()
  }

  private _format(result: Result) {
    const { logger, verbose } = this.options
    if (isSkippedResult(result)) {
      return
    }

    let line = [
      result.status && result.status.toFixed(0),
      result.method && result.method.padEnd(4),
      result.url.toString().padEnd(80),
      'contentType' in result && result.contentType && result.contentType.toString().padEnd('application/json'.length),
      'ms' in result && result.ms.toFixed(0).padStart(4),
      result.parent && result.parent.url.toString(),
      'error' in result && result.error.toString(),
    ].map((l) => l || '')

    if (verbose) {
      if (!this.wroteHeader) {
        logger.log('| ' + header.join(' | ') + ' |')
        const dividerLine = header.map((h) => h.length).reduce((str, length) => {
          return str + ' ' + '-'.repeat(length) + ' |'
        }, '|')
        logger.log(dividerLine)
        this.wroteHeader = true
      }

      line = line.map((l, i) => l.padEnd(header[i].length))
      logger.log('| ' + line.join(' | ') + ' |')

    } else {
      logger.log(line.join('\t'))
    }
  }
}
