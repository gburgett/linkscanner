import { stringify } from 'csv-stringify/sync';

import { Options } from '../util'
import { TableFormatter, TableFormatterOptions } from './table'

const header = {
  status: 'status',
  method: 'method',
  url: 'url',
  contentType: 'contentType',
  ms: 'ms',
  parent: 'parent',
  error: 'error',
}

export class CsvFormatter extends TableFormatter {

  constructor(options?: Options<TableFormatterOptions>) {
    super({
      ...options
    })
  }

  protected print(...formattedLine: string[]) {
    const { logger } = this.options

    const stringifiedLine = stringify([
      formattedLine.map((f) => f.trim())
    ])

    if (!this.wroteHeader) {
      const formattedHeader = this.columns.map((c) => header[c])
      logger.log(stringify([formattedHeader]).trimRight())
      this.wroteHeader = true
    }

    logger.log(stringifiedLine.trimRight())
  }
}
