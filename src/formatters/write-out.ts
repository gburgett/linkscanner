import { Writable } from 'stream'

import { defaultLogger, Logger } from '../logger'
import { isErrorResult, isSkippedResult, isSuccessResult, Result, SuccessResult } from '../model'
import { allParents, findNonRedirectParent, mergeRedirectParents } from '../model/helpers'
import { assign, Options } from '../util'

export interface WriteOutFormatterOptions {
  logger: Logger
  formatter: string
}

export class WriteOutFormatter extends Writable {
  private readonly options: WriteOutFormatterOptions

  private readonly results = new Map<string, Result>()
  private readonly flushed = new Set<string>()

  constructor(options?: Options<WriteOutFormatterOptions>) {
    super({
      objectMode: true,
    })

    const formatter = options && options.formatter
    if (!formatter) {
      throw new Error(`No format string given to WriteOutFormatter!`)
    }

    this.options = assign(
      { logger: defaultLogger },
      options,
      { formatter },
    )
  }

  public _write(result: Result, encoding: any, cb: (error?: Error | null) => void) {
    this.results.set(result.url.toString(), result)

    this._tryFlush(result)

    cb()
  }

  public _final(cb: (error?: Error | null) => void) {
    for (const [url, result] of Array.from(this.results.entries())) {
      if (this.flushed.has(url)) {
        continue
      }

      this._flush(result)
    }

    cb()
  }

  private _tryFlush(result: Result) {
    if (this.flushed.has(result.url.toString())) {
      return
    }

    // We flush all leaf nodes and all non-redirects
    if (result.leaf || ![301, 302, 307].includes(result.status)) {
      this._flush(result)
    }

    // all parents are considered flushed, b/c if we didn't flush a redirect,
    // when we flush it we'll collapse it with all it's parents.
    for (const p of allParents(result)) {
      this.flushed.add(p.url.toString())
    }
  }

  private _flush(result: Result) {
    if (isSkippedResult(result)) {
      // ignore
      return
    }

    this.flushed.add(result.url.toString())

    const resultVars: TemplateVariables = {
      url: result.url.toString(),
      url_effective: result.url.toString(),
      http_method: result.method,
      num_redirects: 0,
    }

    if (isErrorResult(result)) {
      const parents = result.parent && mergeRedirectParents(result.parent)
      if (parents) {
        resultVars.url = parents.url.toString()
        resultVars.num_redirects = parents.numRedirects + 1,
        resultVars.time_total = parents.ms
      }
      resultVars.response_code = result.status
      resultVars.error_reason = result.reason,
      resultVars.error_message = result.error.message || result.error.toString()
    } else {
      const total = mergeRedirectParents(result)
      resultVars.url = total.url.toString()
      resultVars.num_redirects = total.numRedirects,
      resultVars.time_total = total.ms
      resultVars.response_code = result.status
      resultVars.content_type = result.contentType || undefined
    }

    const {logger, formatter} = this.options
    logger.log(template(formatter, resultVars))
  }
}

interface TemplateVariables {
  response_code?: number,
  url: string,
  url_effective: string,
  num_redirects: number,
  time_total?: number,
  http_method?: string,
  content_type?: string
  error_reason?: string,
  error_message?: string
}

function template(templateString: string, templateVariables: TemplateVariables) {
  return templateString.replace(/[\$\%]{([^}]*)}/g, (_, g) => {
    const value = templateVariables[g as keyof TemplateVariables]
    if (value === undefined || value === null) {
      return ''
    }
    return value.toString()
  })
}
