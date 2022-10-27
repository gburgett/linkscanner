import { Writable } from 'stream'

import { defaultLogger, Logger } from '../logger'
import { isSkippedResult, isSuccessResult, Result } from '../model'
import { mergeRedirectParents } from '../model/helpers'
import { assign, Options, present } from '../util'

export interface TableFormatterOptions {
  logger: Logger
  verbose?: boolean
  compact?: boolean
}

const header = {
  status: 'status',
  method: 'method',
  url: 'url'.padEnd(80),
  contentType: 'contentType'.padEnd('application/json'.length),
  ms: 'ms'.padStart(4),
  parent: 'parent'.padEnd(80),
  error: 'error',
}

export class TableFormatter extends Writable {
  private readonly options: TableFormatterOptions
  private wroteHeader = false

  private readonly columns: Array<keyof typeof header>

  constructor(options?: Options<TableFormatterOptions>) {
    super({
      objectMode: true,
    })

    this.options = assign(
      { logger: defaultLogger },
      options,
    )

    if (this.options.compact) {
      this.columns = ['status', 'method', 'url', 'parent', 'error']
    } else {
      this.columns = ['status', 'method', 'url', 'contentType', 'ms', 'parent', 'error']
    }
  }

  public _write(result: Result, encoding: any, cb: (error?: Error | null) => void) {
    this._format(result)
    cb()
  }

  private _format(result: Result) {
    const { logger, verbose, compact } = this.options
    if (isSkippedResult(result)) {
      return
    }

    if (!verbose) {
      if (isSuccessResult(result)) {
        if (!result.leaf && [301, 302, 307].includes(result.status)) {
          // don't log non-leaf redirects unless verbose
          return
        }

        // "compact" the chain of redirects back up to the parent URL
        result = mergeRedirectParents(result)
      }
    }

    const line = {
      status: result.status && result.status.toFixed(0),
      method: result.method && result.method,
      url: result.url.toString(),
      contentType: 'contentType' in result && result.contentType && result.contentType,
      ms: 'ms' in result && result.ms && result.ms.toFixed(0).padStart(4),
      parent: result.parent && result.parent.url.toString(),
      error: 'error' in result && result.error.toString(),
    }

    let formattedLine = this.columns.map((c) => (line[c] || '').padEnd(header[c].length))
    if (compact) {
      formattedLine = formattedLine.map((col) => col.trim())
    } else {
      if (!this.wroteHeader) {
        const formattedHeader = this.columns.map((c) => header[c])
        logger.log(formattedHeader.join('\t'))
        this.wroteHeader = true
      }
    }

    logger.log(formattedLine.join('\t'))
  }
}
