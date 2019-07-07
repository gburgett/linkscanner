import chalk from 'chalk'
import { Writable } from 'stream'

import { defaultLogger, Logger } from '../logger'
import { ErrorResult, isErrorResult, isSkippedResult, isSuccessResult, Result, SkippedResult, SuccessResult } from '../model'
import { assign, Options, present } from '../util'

export interface ConsoleFormatterOptions {
  logger: Logger
  verbose?: boolean
}

export class ConsoleFormatter extends Writable {
  private readonly options: ConsoleFormatterOptions

  private readonly results = new Map<string, Result>()
  private readonly flushed = new Set<string>()

  constructor(options?: Options<ConsoleFormatterOptions>) {
    super({
      objectMode: true,
    })

    this.options = assign(
      { logger: defaultLogger },
      options,
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

      if (isSuccessResult(result)) {
        this._flush(result,
          result.links.map((link) => {
            const finished = this.results.get(link.toString())
            if (!finished) {
              return null
            }

            if (finished.parent === result) {
              return finished
            }
          }).filter(present),
        )
      } else {
        this._flush(result, [])
      }
    }

    cb()
  }

  private _tryFlush(result: Result) {
    if (this.flushed.has(result.url.toString())) {
      return
    }

    if (result.parent && !this.flushed.has(result.parent.url.toString())) {
      this._tryFlush(result.parent)
      return
    }

    // we've flushed the parent, so now if it's a leaf node we can flush it.
    if (result.leaf) {
      this._flush(result, [])
      return
    }

    // we can maybe flush this one cause we flushed the parent.
    const childResults = result.links.map((link) => this.results.get(link.toString()))
      .filter(present)

    // Flush only if all the child links have a result
    if (childResults.length == result.links.length) {
      this._flush(result, childResults)
      childResults.forEach((child) => this._tryFlush(child))
    }
  }

  private _flush(result: Result, childResults: Result[]) {
    const { logger, verbose } = this.options

    this.flushed.add(result.url.toString())
    if (result.leaf) {
      // don't print out any leaf node results.
      return
    }
    if (result.parent && childResults.length == 0) {
      // if it's a non-root node, and it didn't have any links on page, it's already
      // covered by the parent node's printout
      return
    }

    const linkCount = result.links.length
    const successResults = childResults.filter(isSuccessResult)

    // Broken results need to be printed in red
    const brokenResults = childResults.filter<ErrorResult | SuccessResult>(isErrorResult)
      .concat(successResults.filter((r) => r.status >= 400))

    // Redirect results printed in yellow
    const redirectResults = successResults
      .filter((r) => r.status >= 300 && r.status < 400)

    // OK results in green or hidden
    const okResults = successResults
      .filter((r) => r.status < 300)

    // Excluded results not printed but we need the count
    const excludedResults = childResults.filter(isSkippedResult)

    // Unknown results - there was a recorded link but no result object written.
    // Add them to the broken results.
    const unknownResults = result.links.filter((r) =>
      !childResults.find((excluded) =>
        excluded.url.toString() == r.toString()))

    brokenResults.push(...unknownResults.map<ErrorResult>((r) => ({
      url: r,
      method: undefined,
      status: undefined,
      host: r.hostname,
      leaf: true,
      parent: result,
      reason: 'unknown',
      error: new Error(`Unable to find matching result for ${r}`),
    })))

    /*
     * 200 GET https://www.google.com/somewhere
     *    found on https://www.google.com
     *    X links found, Y not checked. Z broken.
     */
    const lines = [
      colorize(
        `${result.status.toFixed(0).padEnd(3)} ${result.method.padEnd(4)} ${result.url.toString()}`,
        result.status,
      ),
      result.parent && chalk.dim(`\tfound on ${result.parent.url.toString()}`),
      linkCount > 0 &&
        chalk.dim(`\t${linkCount.toFixed(0)} links found. ${excludedResults.length.toFixed(0)} not checked. `) +
          (brokenResults.length == 0 ? chalk.green(`0 broken.`) : chalk.red(`${brokenResults.length} broken.`)),
    ]

    /**
     * 404 GET  https://some-broken-link.com
     * 301 HEAD https://some-redirect.com
     */
    const resultsToPrint: Array<ErrorResult | SuccessResult> = brokenResults.concat(redirectResults)
    if (verbose) {
      resultsToPrint.push(...okResults)
    }
    lines.push(...resultsToPrint.map((r) =>
      colorize(
        `\t${r.status ? r.status.toFixed(0).padEnd(3) : '   '} ${r.method && r.method.padEnd(4)} ${r.url.toString()}`,
        r.status,
      ),
    ))

    logger.log(lines.filter(present).join('\n') + '\n')
  }
}

function colorize(text: string, status?: number) {
  if (!status || status == 0) {
    return chalk.red(text)
  }
  if (status < 200) {
    return text
  }
  if (status < 300) {
    return chalk.green(text)
  }
  if (status < 400) {
    return chalk.yellow(text)
  }
  return chalk.red(text)
}
