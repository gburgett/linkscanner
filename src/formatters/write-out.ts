import { Writable } from 'stream'

import { defaultLogger, Logger } from '../logger'
import { isErrorResult, isRedirectResult, isSkippedResult, Result } from '../model'
import { allParents, mergeRedirectParents } from '../model/helpers'
import { parseUrl } from '../url'
import { assign, Options } from '../util'

export interface WriteOutFormatterOptions {
  logger: Logger
  formatter: string
}

export class WriteOutFormatter extends Writable {

  public static readonly templateRegexp = /[\$\%]{(?<key>[^}]*)}/g
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

    this.validateTemplate()
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
    const {logger} = this.options
    if (isSkippedResult(result)) {
      // ignore
      return
    }

    if (isRedirectResult(result)) {
      // Is there another result in our results list that this one redirects to?
      const location = result.headers && result.headers.Location && parseUrl(result.headers.Location)
      if (location) {
        const redirectedTo = this.results.get(location.toString())
        if (redirectedTo && !isSkippedResult(redirectedTo)) {
          // Make a fake result pointing up to this redirect
          // Aside: I'm impressed that Typescript can infer Result is not a
          // SkippedResult after this line
          result = {
            ...redirectedTo,
            parent: result,
          }
        }
      }
    }

    this.flushed.add(result.url.toString())

    const resultVars: TemplateVariables = {
      url: result.url.toString(),
      url_effective: result.url.toString(),
      http_method: result.method,
      num_redirects: 0,
      response_code: result.status,
      response_code_effective: result.status,
    }

    if (isErrorResult(result)) {
      resultVars.error_reason = result.reason,
      resultVars.error_message = result.error.message || result.error.toString()

      const parents = result.parent && mergeRedirectParents(result.parent)
      if (parents) {
        resultVars.url = parents.url.toString()
        resultVars.num_redirects = parents.numRedirects + 1,
        resultVars.time_total = parents.ms
        resultVars.response_code = parents.status
      }
    } else {
      const total = mergeRedirectParents(result)
      resultVars.url = total.url.toString()
      resultVars.num_redirects = total.numRedirects,
      resultVars.time_total = total.ms
      if (total.parentStatus) { resultVars.response_code = total.parentStatus }
      resultVars.content_type = result.contentType || undefined
    }
    logger.log(this.template(resultVars))
  }

  private template(templateVariables: TemplateVariables) {
    const { formatter } = this.options
    return formatter.replace(WriteOutFormatter.templateRegexp, (_, g) => {
      const value = templateVariables[g as keyof TemplateVariables]
      if (value === undefined || value === null) {
        return ''
      }
      return value.toString()
    })
  }

  private validateTemplate() {
    const {logger, formatter} = this.options
    let matchedOne = false
    let matches: RegExpExecArray | null
    // tslint:disable-next-line: no-conditional-assignment
    while (matches = WriteOutFormatter.templateRegexp.exec(formatter)) {
      matchedOne = true
      if (matches.groups &&
          !templateKeys.includes(matches.groups.key as keyof TemplateVariables)) {
        logger.error(`Warning: Unknown write-out key '${matches[0]}'\n\tmust be one of ${templateKeys}`)
      }
    }
    if (!matchedOne) {
      logger.error(`Warning: write-out format contains no template variables`)
    }
  }
}

interface TemplateVariables {
  response_code?: number,
  response_code_effective?: number,
  url: string,
  url_effective: string,
  num_redirects: number,
  time_total?: number,
  http_method?: string,
  content_type?: string
  error_reason?: string,
  error_message?: string
}

const templateKeys: Array<keyof TemplateVariables> = [
  'content_type',
  'error_message',
  'error_reason',
  'http_method',
  'num_redirects',
  'response_code',
  'response_code_effective',
  'time_total',
  'url',
  'url_effective',
]
