import { Writable } from 'stream'

import { defaultLogger, Logger } from '../logger'
import { isErrorResult, isRedirectResult, isSkippedResult, Result } from '../model'
import { allParents, mergeRedirectParents } from '../model/helpers'
import { parseUrl } from '../url'
import { assign, Options } from '../util'

export interface JsonFormatterOptions {
  logger: Logger
  showSkipped?: boolean
}

export class JsonFormatter extends Writable {

  protected readonly options: JsonFormatterOptions

  protected readonly results = new Map<string, Result>()
  protected readonly flushed = new Set<string>()

  constructor(options?: Options<JsonFormatterOptions>) {
    super({
      objectMode: true,
    })

    this.options = assign(
      { logger: defaultLogger },
      options
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

  protected print(row: JsonFormatterRow) {
    this.options.logger.log(JSON.stringify(row, null, 0))
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
    const {logger, showSkipped} = this.options
    if (!showSkipped && isSkippedResult(result)) {
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

    const row: JsonFormatterRow = {
      url: result.url.toString(),
      urlEffective: result.url.toString(),
      host: result.url.host,
      hostEffective: result.url.host,
      parentUrl: result.parent?.url.toString(),
      httpMethod: isSkippedResult(result) ? 'SKIP' : result.method,
      numRedirects: 0,
      responseCode: 'status' in result && result.status || undefined,
      responseCodeEffective: 'status' in result && result.status || undefined,
      contentType: 'contentType' in result && result.contentType || undefined
    }

    if (isErrorResult(result)) {
      row.errorReason = result.reason,
      row.errorMessage = 'error' in result && result.error ? (
        result.error.message || result.error.toString()) :
        undefined
      
    } 

    const merged = mergeRedirectParents(result)
    row.url = merged.url.toString()
    row.numRedirects = merged.numRedirects,
    row.timeTotal = 'ms' in merged && merged.ms || undefined
    if (merged.parentStatus) { row.responseCode = merged.parentStatus }
    if (merged.parent) { row.parentUrl = merged.parent.url.toString() }

    this.print(row)
  }
}

export interface JsonFormatterRow {
  responseCode?: number,
  responseCodeEffective?: number,
  url: string,
  urlEffective: string,
  host: string,
  hostEffective: string,
  parentUrl?: string
  numRedirects: number,
  timeTotal?: number,
  httpMethod?: string,
  contentType?: string
  errorReason?: string,
  errorMessage?: string
}
