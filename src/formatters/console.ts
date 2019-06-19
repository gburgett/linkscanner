import chalk from 'chalk'
import { Writable } from 'stream'

import { defaultLogger, Logger } from '../logger'
import { Result } from '../model'
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
    for (const [url, result] of this.results.entries()) {
      if (this.flushed.has(url)) {
        continue
      }

      this._flush(result,
        result.links.map((link) => {
          const finished = this.results.get(link.toString())
          if (!finished) {
            // create a fake "unfinished" result.
            return {
              method: '',
              links: [],
              ms: 0,
              parent: result,
              status: 0,
              host: link.hostname,
              url: link,
            }
          }

          if (finished.parent === result) {
            return finished
          }
        }).filter(present),
      )
    }

    cb()
  }

  private _tryFlush(result: Result) {
    if (this.flushed.has(result.url.toString())) {
      return
    }

    if (!result.parent || this.flushed.has(result.parent.url.toString())) {
      // we can maybe flush this one cause we flushed the parent.
      const childResults = result.links.map((link) => this.results.get(link.toString()))
        .filter(present)

      // Flush only if all the child links have a result
      if (childResults.length == result.links.length) {
        this._flush(result, childResults)
        childResults.forEach((child) => this._tryFlush(child))
      }
    } else {
      this._tryFlush(result.parent)
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
    const excludedCount = result.links.length - childResults.length
    const brokenResults = childResults.filter((r) => r.status >= 400)

    const lines = [
      colorize(
        `${result.status.toFixed(0).padEnd(3)} ${result.method.padEnd(4)} ${result.url.toString()}`,
        result.status,
      ),
      result.parent && chalk.dim(`\tfound on ${result.parent.url.toString()}`),
      linkCount > 0 &&
        chalk.dim(`\t${linkCount.toFixed(0)} links found. ${excludedCount.toFixed(0)} excluded. `) +
          (brokenResults.length == 0 ? chalk.green(`0 broken.`) : chalk.red(`${brokenResults.length} broken.`)),
    ]
    const resultsToPrint = verbose ? childResults : brokenResults
    lines.push(...resultsToPrint.map((r) =>
      colorize(
        `\t${r.status.toFixed(0).padEnd(3)} ${r.method.padEnd(4)} ${r.url.toString()}`,
        r.status,
      ),
    ))

    logger.log(lines.filter(present).join('\n') + '\n')
  }
}

function colorize(text: string, status: number) {
  if (status == 0) {
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
