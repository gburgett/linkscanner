import { Writable } from 'stream'

import chalk, { Chalk } from 'chalk'
import { defaultLogger, Logger } from './logger'
import { Result } from './model'
import { assign, isomorphicPerformance, Options } from './util'

export interface ProgressBarOptions {
  logger: Logger
  /** Width of one line of output terminal.  Undefined to use process.stdout.columns */
  width?: number

  color: boolean | number,
}

interface ProgressBarState {
  checked: Set<string>
  all: Set<string>
  latest?: string
  isRendered: boolean
  start?: number
}

export class ProgressBar extends Writable implements Logger {

  private readonly _options: ProgressBarOptions
  private readonly _chalk: Chalk

  private readonly state: ProgressBarState = {
    checked: new Set<string>(),
    all: new Set<string>(),
    isRendered: false,
  }

  constructor(options?: Options<ProgressBarOptions>) {
    super({
      objectMode: true,
      highWaterMark: 0,
    })
    this._options = assign({
      logger: defaultLogger,
      color: (typeof process != 'undefined' && require('supports-color').stderr.level) || false,
    }, options)

    this._chalk = new chalk.constructor({
      enabled: !!this._options.color,
      level: typeof(this._options.color) == 'boolean' ? 1 : this._options.color,
    })

    this.on('pipe', (resultsStream) => {
      resultsStream.on('url', this._onUrl)
      resultsStream.on('fetch', this._onFetch)
      resultsStream.on('response', this._onResponse)
      this.state.start = isomorphicPerformance.now()
    })
  }

  public _write = (chunk: Result, encoding: string, cb: () => void) => {
    this.state.all.add(chunk.url.toString())
    this.state.checked.add(chunk.url.toString())
    this.render()
    cb()
  }

  public _final(cb: () => void) {
    this.clear()
    cb()
  }

  public render = async () => {
    const {checked, all, latest} = this.state
    const { logger } = this._options
    const width = Math.min(this._options.width || process.stderr.columns || 100, 100)
    const pct = Math.min(1.0, checked.size / all.size)
    const elapsed = this.state.start && isomorphicPerformance.now() - this.state.start

    // tslint:disable-next-line: no-shadowed-variable
    const chalk = this._chalk

    if (!elapsed) {
      // nothing to do
      this.clear()
      return
    }

    const msgParts = [
      `${(elapsed / 1000).toFixed(0).padStart(4)}s `,
      ` ${checked.size.toString().padStart(4)} / ${all.size.toString().padStart(4)}`,
      ` (${Math.floor(pct * 100).toString().padStart(3)}%)`,
    ]

    const barTotalWidth = width - (msgParts.reduce((sum, part) => sum + part.length, 0)) - 2
    const barSize = Math.floor(pct * barTotalWidth)
    msgParts.splice(1, 0,
      `${'\u2588'.repeat(barSize)}${' '.repeat(barTotalWidth - barSize)}|`,
    )

    msgParts[0] = chalk.cyan(msgParts[0])
    msgParts[1] = chalk.green(msgParts[1])
    msgParts[2] = chalk.cyan(msgParts[2])
    msgParts[3] = chalk.cyan(msgParts[3])

    const msg = msgParts.join('')
    // log a cleared blank line
    logger.error('\x1b[2k')
    // clear the current line before writing the msg
    logger.error('\x1b[2K' + msg)
    // write the latest hit line
    logger.error('\x1b[2K' + chalk.dim.cyan((latest || '').substr(0, width)) +
      // go up three lines after
      '\x1b[F\x1b[F\x1b[F')

    this.state.isRendered = true
  }

  public clear() {
    if (!this.state.isRendered) {
      return
    }

    const { logger } = this._options
    logger.error('\x1b[2K\n\x1b[2K\n\x1b[2K\x1b[F\x1b[F\x1b[F')
  }

  public log(message?: any, ...optionalParams: any[]): void {
    this.clear()
    this._options.logger.log(message, ...optionalParams)
    this.render()
  }

  public debug(message?: any, ...optionalParams: any[]): void {
    this.clear()
    this._options.logger.debug(message, ...optionalParams)
    this.render()
  }

  public error(message?: any, ...optionalParams: any[]): void {
    this._options.logger.error('\x1b[2K' + message, ...optionalParams)
    this.render()
  }

  private _onUrl = ({ url }: { url: URL }) => {
    this.state.all.add(url.toString())
    this.render()
  }

  private _onFetch = (req: Request) => {
    this.state.latest = `    ${req.url}`
    this.render()
  }

  private _onResponse = (resp: Response, req: Request) => {
    this.state.latest = `${resp.status} ${resp.url || req.url}`
    this.render()
  }

}
